/**
 * 缩略图体检：设置面板预览墙靠它，产物必须"小、静、在索引里"。
 *
 * 只读磁盘与索引，不调 ffmpeg —— 所以没有 ffmpeg 的机器也能跑（没有缩略图时跳过）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 找到实际生效的索引。 */
function locate() {
  const home = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh')
  for (const path of [join(home, 'memes-reply', 'assets', 'index.json'), join(process.cwd(), 'assets', 'index.json')]) {
    if (existsSync(path)) return path
  }
  return undefined
}

/** 走一遍 RIFF 块，返回是否动画与（能解析时的）尺寸。 */
function readWebp(buffer) {
  if (buffer.length < 16) return { animated: false, width: null, height: null }
  if (buffer.subarray(0, 4).toString('latin1') !== 'RIFF') return { animated: false, width: null, height: null }
  if (buffer.subarray(8, 12).toString('latin1') !== 'WEBP') return { animated: false, width: null, height: null }

  let offset = 12
  let animated = false
  let width = null
  let height = null
  while (offset + 8 <= buffer.length) {
    const fourcc = buffer.subarray(offset, offset + 4).toString('latin1')
    const size = buffer.readUInt32LE(offset + 4)
    const body = offset + 8
    if (fourcc === 'ANIM' || fourcc === 'ANMF') animated = true
    if (fourcc === 'VP8X' && body + 10 <= buffer.length) {
      width = 1 + (buffer[body + 4] | (buffer[body + 5] << 8) | (buffer[body + 6] << 16))
      height = 1 + (buffer[body + 7] | (buffer[body + 8] << 8) | (buffer[body + 9] << 16))
    }
    if (fourcc === 'VP8 ' && body + 10 <= buffer.length && width === null) {
      // 简单有损帧：3 字节起始码 + 16 位宽高（各 14 位有效）
      width = buffer.readUInt16LE(body + 6) & 0x3fff
      height = buffer.readUInt16LE(body + 8) & 0x3fff
    }
    if (fourcc === 'VP8L' && body + 5 <= buffer.length && width === null) {
      const bits = buffer.readUInt32LE(body + 1)
      width = (bits & 0x3fff) + 1
      height = ((bits >> 14) & 0x3fff) + 1
    }
    offset = body + size + (size % 2) // 块按偶数字节对齐
  }
  return { animated, width, height }
}

test('缩略图：在索引里、文件存在、是静态 WebP 且足够小', () => {
  const index = locate()
  if (index === undefined) {
    console.log('（跳过）没有 index.json')
    return
  }
  const parsed = JSON.parse(readFileSync(index, 'utf8'))
  const root = dirname(index)
  const entries = parsed.sticker
  const withThumb = entries.filter((entry) => typeof entry.thumb === 'string' && entry.thumb !== '')
  if (withThumb.length === 0) {
    console.log('（跳过）索引里没有 thumb 字段，先运行 node scripts/import-assets.mjs --thumbs')
    return
  }

  let total = 0
  for (const entry of withThumb) {
    const file = join(root, 'thumb', entry.thumb)
    assert.ok(existsSync(file), `${entry.id} 的缩略图不存在：${entry.thumb}`)
    const buffer = readFileSync(file)
    total += buffer.length
    assert.equal(buffer.subarray(0, 4).toString('latin1'), 'RIFF', `${entry.id} 缩略图不是 RIFF`)
    assert.equal(buffer.subarray(8, 12).toString('latin1'), 'WEBP', `${entry.id} 缩略图不是 WebP`)
    const info = readWebp(buffer)
    assert.equal(info.animated, false, `${entry.id} 缩略图不该是动画（预览墙只要首帧静态图）`)
    assert.ok(buffer.length <= 40 * 1024, `${entry.id} 缩略图过大：${buffer.length} 字节`)
    if (info.width !== null) assert.ok(info.width <= 160, `${entry.id} 缩略图宽度 ${info.width} > 160`)
  }
  const avg = Math.round(total / withThumb.length / 1024)
  console.log(`缩略图体检通过：${withThumb.length} 张，合计 ${Math.round(total / 1024)} KB，均值 ${avg} KB`)
  assert.ok(avg <= 20, `缩略图均值 ${avg} KB 偏大（预览墙要一次拉十几张）`)
})
