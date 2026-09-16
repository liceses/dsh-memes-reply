/**
 * dsh-memes-reply — 纯常量配置（host 与浏览器半边共用）。
 *
 * 单独成一个模块的理由：`schema.ts` 里有 schemastery 的 Schema 对象，
 * 浏览器半边**绝不能** import 它（会把 schemastery 打进客户端 bundle）。
 * 所以默认值这类纯数据放这里，`schema.ts` 再 re-export 保持 host 侧 import 不变。
 */

import type { MemesConfig } from './types.js'

/** 配置默认值：`assetRoot` 留空表示"跟随默认目录"，避免把绝对路径写进设置文件。 */
export const DEFAULT_CONFIG: MemesConfig = {
  enabled: true,
  form: 'inline',
  quality: 'compressed',
  assetRoot: '',
  originalRoot: '',
  cooldownTurns: 3,
  fallback: '',
  // 默认就开着，但只走"关键词命中"这条最克制的规则：模型没贴、恰好语境合适时补一张。
  // 要"每 N 轮必有"就把 autoMode 改成 every。
  autoMode: 'keyword',
  autoEveryTurns: 3,
  // 常驻挂件默认开着 —— "随时能看到大肥鱼"是硬需求，不是彩蛋。
  petVisible: true,
  petSize: 128,
  petCorner: 'br',
}

/** 设置面板里字段的顺序（也决定保存 diff 的顺序）。 */
export const CONFIG_FIELDS: Array<keyof MemesConfig> = [
  'enabled',
  'form',
  'quality',
  'assetRoot',
  'originalRoot',
  'cooldownTurns',
  'fallback',
  'autoMode',
  'autoEveryTurns',
  'petVisible',
  'petSize',
  'petCorner',
]

/** 自动贴纸事件在 host 侧的有效期：过期不再补发（避免刷新页面后突然冒出旧贴纸）。 */
export const AUTO_EVENT_TTL_MS = 90_000

/** 关键词模式里可参与命中的最短词长：单字太容易误命中，一律不参与。 */
export const AUTO_KEYWORD_MIN_TERM_LEN = 2

/** llm/stream 文本缓冲上限（只为扫关键词，不需要全文）。 */
export const AUTO_TEXT_BUFFER_MAX = 8_000

/**
 * 匹配失败时回给模型的"保证能命中"的词。
 * 这些词都写在 `scripts/sticker-map.json` 的标签里，并有回归测试盯着——
 * 给模型的建议词必须真的检索得到（这条纪律是被两次真实事故教出来的）。
 */
export const RETRY_WORDS = ['收工', '完成', '开心', '翻车', '点赞']

/** 预览墙默认格数。 */
export const CATALOG_DEFAULT_LIMIT = 12

/** 预览墙最多格数（防止有人手改 query 拉爆）。 */
export const CATALOG_MAX_LIMIT = 48
