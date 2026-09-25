/**
 * dsh-memes-reply — 极简 ZIP 读写（零依赖）。
 *
 * 为什么自己写：素材包是 87 MB 的发布附件，取素材只用一次；为它拉一个 zip 库
 * （或者依赖系统里的 `tar`/`Compress-Archive`）会让"clone 下来就能跑"这条链
 * 多一个环境依赖。ZIP 的 stored/deflate 两种存法 + 中央目录，规范很短，够用就好。
 *
 * 刻意做的两件事：
 *   1. **固定时间戳**（1980-01-01）→ 同一份素材每次打包字节一致，sha256 可复现；
 *   2. **解包时拒绝危险路径**（绝对路径、`..`、盘符）→ 素材包是下载来的，
 *      必须假定它可能被换掉（zip-slip）。
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { resolve, sep } from 'node:path'

/** CRC32 查表（ZIP 用的就是它）。 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

/** 算 CRC32。 */
export function crc32(buffer) {
  let crc = -1
  for (let i = 0; i < buffer.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

/** ZIP 里合法的条目名（相对、正斜杠、无逃逸）。 */
export function assertSafeName(name) {
  if (typeof name !== 'string' || name === '') throw new Error(`非法条目名：${String(name)}`)
  if (name.includes('\\')) throw new Error(`条目名不能含反斜杠：${name}`)
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new Error(`条目名不能是绝对路径：${name}`)
  for (const segment of name.split('/')) {
    if (segment === '..' || segment === '.') throw new Error(`条目名不能含相对跳转：${name}`)
  }
}

/** 把一个条目名解析成目标路径，并确保它没跑出目标目录。 */
export function resolveInside(dest, name) {
  assertSafeName(name)
  const root = resolve(dest)
  const target = resolve(root, name)
  if (target !== root && !target.startsWith(root + sep)) throw new Error(`条目跑出目标目录：${name}`)
  return target
}

/** 打包条目。 */
export function writeZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    assertSafeName(entry.name)
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
    const deflated = deflateRawSync(raw, { level: 6 })
    // 已经压过的素材（WebP）常常压不动甚至变大 —— 那就存原样。
    const useDeflate = deflated.length < raw.length
    const body = useDeflate ? deflated : raw
    const method = useDeflate ? 8 : 0
    const crc = crc32(raw)

    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10) // time（固定）
    local.writeUInt16LE(33, 12) // date = 1980-01-01
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    name.copy(local, 30)
    locals.push(local, body)

    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(33, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)
    centrals.push(central)

    offset += local.length + body.length
  }

  const centralBuffer = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, centralBuffer, end])
}

/** 解包（返回文件名 → 内容；含 CRC 与长度校验）。 */
export function readZip(buffer) {
  const eocd = (() => {
    const min = Math.max(0, buffer.length - 66_000)
    for (let i = buffer.length - 22; i >= min; i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) return i
    }
    throw new Error('不是 ZIP：找不到中央目录结尾')
  })()

  const total = buffer.readUInt16LE(eocd + 10)
  let cursor = buffer.readUInt32LE(eocd + 16)
  const out = []

  for (let index = 0; index < total; index++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`中央目录第 ${index} 条损坏`)
    const method = buffer.readUInt16LE(cursor + 10)
    const crc = buffer.readUInt32LE(cursor + 16)
    const compressed = buffer.readUInt32LE(cursor + 20)
    const size = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    cursor += 46 + nameLength + extraLength + commentLength

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`局部头损坏：${name}`)
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const body = buffer.subarray(start, start + compressed)

    let data
    if (method === 0) data = Buffer.from(body)
    else if (method === 8) data = inflateRawSync(body)
    else throw new Error(`不支持的压缩方法 ${method}：${name}`)

    if (data.length !== size) throw new Error(`长度不符（${name}）：期望 ${size}，实际 ${data.length}`)
    if (crc32(data) !== crc) throw new Error(`CRC 校验失败：${name}`)
    out.push({ name, data })
  }

  return out
}
