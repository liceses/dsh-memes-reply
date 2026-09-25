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
  quality: 'compressed',
  assetRoot: '',
  originalRoot: '',
  cooldownTurns: 3,
  fallback: '',
  // 默认就开着，但只走"关键词命中"这条最克制的规则：回复里恰好语境合适时贴一张。
  // 要"每 N 轮必有"就把 autoMode 改成 every。
  autoMode: 'keyword',
  autoEveryTurns: 3,
  // JEV 模式（autoMode='jev'）的三项：模型、超时、可选语气说明。
  jevModel: 'typesafe/jev-1.13',
  jevTimeoutMs: 4000,
  jevPersona: '',
  // 调试漂浮面板默认**关**：它是排障工具，不是常驻装饰。
  jevDebugVisible: false,
  // 常驻挂件默认开着 —— "随时能看到大肥鱼"是硬需求，不是彩蛋。
  petVisible: true,
  petSize: 128,
  petCorner: 'br',
  // 外观：贴纸节点与挂件共用形状与边框。
  shape: 'circle',
  radius: 18,
  borderWidth: 2,
  borderStyle: 'solid',
  borderColor: '',
  bubbleSize: 96,
  bubbleRise: 40,
}

/** 设置面板里字段的顺序（也决定保存 diff 的顺序）。 */
export const CONFIG_FIELDS: Array<keyof MemesConfig> = [
  'enabled',
  'quality',
  'assetRoot',
  'originalRoot',
  'cooldownTurns',
  'fallback',
  'autoMode',
  'autoEveryTurns',
  'jevModel',
  'jevTimeoutMs',
  'jevPersona',
  'jevDebugVisible',
  'petVisible',
  'petSize',
  'petCorner',
  'shape',
  'radius',
  'borderWidth',
  'borderStyle',
  'borderColor',
  'bubbleSize',
  'bubbleRise',
]

/** 关键词模式里可参与命中的最短词长：单字太容易误命中，一律不参与。 */
export const AUTO_KEYWORD_MIN_TERM_LEN = 2

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
