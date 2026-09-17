#!/usr/bin/env node
/**
 * dsh-memes-reply — 生成**客户端兜底词表**（`src/client/vocab-fallback.json`）。
 *
 * ## 为什么需要它
 *
 * v2.0 的贴纸由**客户端派生**，所以浏览器需要一份"id + 名字 + 检索词"的词表。
 * 正路是 `GET /api/dsh-memes-reply/vocab`（宿主读当前索引，权威、可热换素材），
 * 但 host 半区是**启动时装载**的：宿主不重启，新端点就是 404，贴纸层会整层失效。
 *
 * 所以打包时把同一份索引的检索字段**瘦身**进客户端：`/vocab` 可达就用它，
 * 否则用这份兜底。两边的 id/name/tags/aliases 必须一致，`test/vocab-fallback.test.mjs`
 * 盯着这件事（漂移就红）。
 *
 * 只保留派生需要的字段（去掉 sha256/尺寸/帧率/encode），157 条约 25 KB。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SOURCE = join(ROOT, 'assets', 'index.json')
const TARGET = join(ROOT, 'src', 'client', 'vocab-fallback.json')

/** 读盘（失败即失败：构建时缺素材，应该立刻看见，而不是悄悄产出一份空词表）。 */
function main() {
  const index = JSON.parse(readFileSync(SOURCE, 'utf8'))
  const sticker = Array.isArray(index.sticker) ? index.sticker : []
  const items = sticker.map((entry) => ({
    id: String(entry.id),
    name: String(entry.name ?? entry.id),
    tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    aliases: Array.isArray(entry.aliases) ? entry.aliases.map(String) : [],
    file: String(entry.file ?? `${entry.id}.webp`),
  }))
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'assets/index.json',
    total: items.length,
    items,
  }
  writeFileSync(TARGET, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`词表兜底已生成：${items.length} 条 → ${TARGET.replace(`${ROOT}\\`, '').replace(`${ROOT}/`, '')}`)
}

main()
