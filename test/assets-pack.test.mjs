/**
 * 素材包（代码与素材分离）的测试：ZIP 读写、可复现、zip-slip、CRC，
 * 以及"打包 → 取素材"整链。全部用临时目录，不碰真实 ~/.dsh 与仓库里的清单。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertSafeName, readZip, resolveInside, writeZip } from '../scripts/zip.mjs'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))

/** 造个临时目录。 */
function temp(label) {
  return mkdtempSync(join(tmpdir(), `memes-${label}-`))
}

test('ZIP 往返：文字（会压）与随机字节（压不动）都能原样取回', () => {
  const text = Buffer.from('大肥鱼'.repeat(500), 'utf8')
  const random = Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 37) % 256))
  const zip = writeZip([
    { name: 'index.json', data: text },
    { name: 'thumb/a.webp', data: random },
  ])
  const out = readZip(zip)
  assert.deepEqual(out.map((entry) => entry.name), ['index.json', 'thumb/a.webp'])
  assert.equal(out[0].data.toString('utf8'), text.toString('utf8'))
  assert.equal(Buffer.compare(out[1].data, random), 0)
})

test('ZIP 可复现：同一份输入两次打包字节一致（时间戳固定）', () => {
  const entries = [
    { name: 'a.txt', data: Buffer.from('aaa') },
    { name: 'b/c.txt', data: Buffer.from('bbb') },
  ]
  assert.equal(Buffer.compare(writeZip(entries), writeZip(entries)), 0)
})

test('zip-slip：危险条目名一律拒绝', () => {
  for (const bad of ['../evil.txt', 'a/../../evil.txt', '/abs.txt', 'C:/abs.txt', 'a\\b.txt', '']) {
    assert.throws(() => assertSafeName(bad), `应拒绝：${bad}`)
  }
  const dest = temp('slip')
  assert.throws(() => resolveInside(dest, '../evil.txt'))
  assert.ok(resolveInside(dest, 'thumb/a.webp').startsWith(resolve(dest)))
})

test('zip-slip：把真 ZIP 里的条目名改成 ../ 也会被挡下', () => {
  const zip = writeZip([{ name: 'evil-aa.txt', data: Buffer.from('payload') }])
  // 名字等长替换：CRC 只覆盖数据，所以改完仍是合法 ZIP —— 正是攻击者会做的事
  const name = Buffer.from('evil-aa.txt')
  const evil = Buffer.from('../evil.txt')
  assert.equal(name.length, evil.length)
  let patched = Buffer.from(zip)
  let at = patched.indexOf(name)
  let count = 0
  while (at !== -1) {
    evil.copy(patched, at)
    count++
    at = patched.indexOf(name, at + 1)
  }
  assert.ok(count >= 2, `局部头与中央目录都应被改到，实际 ${count} 处`)
  const out = readZip(patched)
  assert.equal(out[0].name, '../evil.txt')
  assert.throws(() => resolveInside(temp('slip2'), out[0].name), '解包路径必须被拒')
})

test('CRC / 长度：数据被改动时解包会失败', () => {
  const zip = writeZip([{ name: 'a.txt', data: Buffer.from('hello world hello world') }])
  const broken = Buffer.from(zip)
  // 局部头之后就是数据：改一个字节就能触发 CRC 不符
  broken[40] = broken[40] === 0x68 ? 0x69 : 0x68
  assert.throws(() => readZip(broken), /CRC|长度/)
})

test('打包 → 取素材整链（含 index.json 校验与清单 sha256）', () => {
  const fixture = temp('fixture')
  mkdirSync(join(fixture, 'thumb'), { recursive: true })
  writeFileSync(
    join(fixture, 'index.json'),
    JSON.stringify({ version: 1, sticker: [{ id: 'dianzan', name: '点赞' }, { id: 'bug', name: 'Bug' }] }),
  )
  writeFileSync(join(fixture, 'dianzan.webp'), Buffer.from([1, 2, 3, 4, 5]))
  writeFileSync(join(fixture, 'thumb', 'dianzan.webp'), Buffer.from([9, 9]))

  const outZip = join(temp('out'), 'pack.zip')
  const manifest = join(temp('manifest'), 'assets-pack.json')
  const packOut = execFileSync(
    process.execPath,
    [join(ROOT, 'scripts', 'pack-assets.mjs'), '--from', fixture, '--out', outZip, '--manifest', manifest],
    { encoding: 'utf8' },
  )
  assert.match(packOut, /打包 3 个文件/)
  assert.ok(existsSync(outZip))

  const written = read(manifest)
  assert.match(written.sha256, /^[0-9a-f]{64}$/)
  assert.equal(written.files, 3)
  assert.equal(written.stickers, 2)
  assert.match(written.url, /releases\/latest\/download\/memes-assets-v1\.zip$/)

  // 取素材：--from 本地包 + 临时 DSH_HOME
  const home = temp('home')
  const dest = join(home, 'memes-reply', 'assets')
  const fetchArgs = [join(ROOT, 'scripts', 'fetch-assets.mjs'), '--from', outZip, '--dest', dest, '--manifest', manifest]
  const fetchOut = execFileSync(process.execPath, fetchArgs, {
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: home },
  })
  assert.match(fetchOut, /完成：解出 3 个文件、贴纸 2 张/)
  assert.equal(read(join(dest, 'index.json')).sticker.length, 2)
  assert.equal(readFileSync(join(dest, 'thumb', 'dianzan.webp')).length, 2)

  // 已有素材 + 不加 --force → 拒绝覆盖（幂等、不毁数据）
  const again = execFileSync(process.execPath, fetchArgs, {
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: home },
  })
  assert.match(again, /目标目录已有素材/)
})

test('sha256 不符时拒绝解包（防半份坏素材）', () => {
  const fixture = temp('bad-fixture')
  writeFileSync(join(fixture, 'index.json'), JSON.stringify({ sticker: [{ id: 'a' }] }))
  const outZip = join(temp('bad-out'), 'pack.zip')
  const manifest = join(temp('bad-manifest'), 'assets-pack.json')
  execFileSync(process.execPath, [
    join(ROOT, 'scripts', 'pack-assets.mjs'),
    '--from',
    fixture,
    '--out',
    outZip,
    '--manifest',
    manifest,
  ])
  const tampered = read(manifest)
  tampered.sha256 = 'f'.repeat(64)
  writeFileSync(manifest, JSON.stringify(tampered))

  const dest = join(temp('bad-home'), 'memes-reply', 'assets')
  let failed = ''
  try {
    execFileSync(
      process.execPath,
      [join(ROOT, 'scripts', 'fetch-assets.mjs'), '--from', outZip, '--dest', dest, '--manifest', manifest],
      { encoding: 'utf8', stdio: 'pipe' },
    )
  } catch (error) {
    failed = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
  assert.match(failed, /校验失败：sha256 与清单不一致/)
  assert.equal(existsSync(join(dest, 'index.json')), false, '校验没过就不该落任何文件')
})
