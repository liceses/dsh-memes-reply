/**
 * 客户端兜底词表（`src/client/vocab-fallback.json`）与素材索引的新鲜度。
 *
 * ## 为什么要有这条测试
 *
 * v2.0 的贴纸由客户端派生，词表是它的输入。正路是 `GET /vocab`（宿主读当前索引），
 * 但宿主没重启时客户端要靠**打包兜底**那份 —— 如果它与 `assets/index.json` 漂移，
 * 就会出现"宿主能贴、浏览器贴不出"或"贴出一张已经不存在的图"这类鬼故事。
 * 所以这里逐字段比对，漂移即红；修复只有一条命令：`npm run build`。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const INDEX = join(ROOT, 'assets', 'index.json')
const FALLBACK = join(ROOT, 'src', 'client', 'vocab-fallback.json')

const read = (file) => JSON.parse(readFileSync(file, 'utf8'))

test('兜底词表与索引逐条一致（id/name/tags/aliases/file）', () => {
  const index = read(INDEX)
  const fallback = read(FALLBACK)
  const entries = Array.isArray(index.sticker) ? index.sticker : []
  const items = Array.isArray(fallback.items) ? fallback.items : []

  assert.equal(fallback.total, entries.length, '条数不一致')
  assert.equal(items.length, entries.length, '条数不一致')

  for (let i = 0; i < entries.length; i++) {
    const source = entries[i]
    const bundled = items[i]
    assert.equal(bundled.id, source.id, `第 ${i} 条 id 不一致`)
    assert.equal(bundled.name, source.name, `${source.id} 名字不一致`)
    assert.deepEqual(bundled.tags, source.tags, `${source.id} tags 不一致`)
    assert.deepEqual(bundled.aliases, source.aliases, `${source.id} aliases 不一致`)
    assert.equal(bundled.file, source.file, `${source.id} file 不一致`)
  }
})

test('兜底词表的生成脚本可重跑（生成的字节与仓库里的完全一致）', () => {
  const before = readFileSync(FALLBACK, 'utf8')
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-client-vocab.mjs')], { encoding: 'utf8' })
  assert.equal(result.status, 0, `生成脚本失败：${result.stdout}${result.stderr}`)
  const after = readFileSync(FALLBACK, 'utf8')
  // generatedAt 每次都变，比对前把它抹掉。
  const strip = (text) => text.replace(/"generatedAt": "[^"]+"/, '"generatedAt": "-"')
  assert.equal(strip(after), strip(before), '兜底词表与索引漂移了：跑 npm run build 重新生成')
})
