/**
 * dsh-memes-reply — 客户端词表来源（v2.0 贴纸派生的输入）。
 *
 * 两条来源，优先权威、兜底离线：
 *
 *   1. **`GET /vocab`（首选）**：宿主读**当前**索引（含 `assetRoot` / `originalRoot` 覆盖），
 *      返回全量 id/name/tags/aliases + 全尺寸 URL。素材重导后不必重装插件。
 *   2. **打包兜底（`vocab-fallback.json`）**：宿主半区是启动时装载的，宿主没重启时
 *      `/vocab` 是 404 —— 这时用打包进来的同一份词表，贴纸层照常工作。
 *      两者的检索字段必须一致，`test/vocab-fallback.test.mjs` 盯着漂移。
 *
 * 兜底词表只带 `file`（压缩副本文件名），URL 用**相对路径**拼：浏览器按当前页面 origin
 * 解析，局域网 IP / 反代前缀都不需要宿主再"学习 origin"。
 */

// NodeNext + ESM 要求 JSON 带 import attribute（rolldown/tsdown 也认这个写法）。
import fallback from './vocab-fallback.json' with { type: 'json' }
import { STICKER_PATH, extensionOf } from '../protocol.js'
import type { ChoiceTerm } from '../derive.js'
import { fetchVocab } from './api.js'

/** 兜底词表里的一条。 */
interface FallbackItem {
  id: string
  name: string
  tags: string[]
  aliases: string[]
  file: string
}

/** 打包兜底词表 → 派生用的形状（相对 URL）。 */
export function bundledVocab(): ChoiceTerm[] {
  const items = (fallback as { items?: FallbackItem[] }).items ?? []
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    tags: item.tags,
    aliases: item.aliases,
    url: `${STICKER_PATH}/${item.id}.${extensionOf(item.file)}`,
  }))
}

/** 当前可用的词表：`/vocab` 可达就用它，否则用打包兜底。 */
export async function resolveVocab(): Promise<{ entries: ChoiceTerm[]; source: 'host' | 'bundled' }> {
  const response = await fetchVocab()
  if (response?.ready === true && Array.isArray(response.items) && response.items.length > 0) {
    return { entries: response.items, source: 'host' }
  }
  return { entries: bundledVocab(), source: 'bundled' }
}
