/**
 * dsh-memes-reply — 设置 schema 与路径常量（host only）。
 *
 * 注意：这个文件 import 了 schemastery，所以**浏览器半边绝不能 import 它**。
 * 纯常量（默认值/字段序）在 `config.ts`，类型在 `types.ts`，client 只用那两个。
 */

import Schema from '@deepseek-ai/schemastery'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG } from './config.js'
import type { MemesConfig } from './types.js'

export { DEFAULT_CONFIG }

/** 解析 DSH home（与 dsh-home-paths 同规则：先看 DSH_HOME，再退到 ~/.dsh）。 */
export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : join(homedir(), '.dsh')
}

/** 压缩副本的默认目录。 */
export function defaultAssetRoot(): string {
  return join(dshHome(), 'memes-reply', 'assets')
}

/** 插件自有状态文件（本会话静音、形态覆盖、最近用过的贴纸）。 */
export function stateFilePath(): string {
  return join(dshHome(), 'memes-reply', 'state.json')
}

/** 设置面板 schema（schemastery）。 */
export const MemesSettingsSchema = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('总开关：关掉后不再贴图'),
  quality: Schema.union([
    Schema.const('compressed' as const),
    Schema.const('original' as const),
  ])
    .default(DEFAULT_CONFIG.quality)
    .description('画质来源：compressed = 压缩副本；original = 原始素材目录（需填 originalRoot）'),
  assetRoot: Schema.string().default(DEFAULT_CONFIG.assetRoot).description('压缩副本目录，留空 = <DSH_HOME>/memes-reply/assets'),
  originalRoot: Schema.string().default(DEFAULT_CONFIG.originalRoot).description('原始素材目录（quality=original 时使用）'),
  cooldownTurns: Schema.number().default(DEFAULT_CONFIG.cooldownTurns).description('同一张贴纸连续 N 轮内不重复，0 = 关闭'),
  fallback: Schema.string().default(DEFAULT_CONFIG.fallback).description('兜底贴纸 id：规则一个都没选中时用它，保证总有鱼；留空 = 不兜底'),
  autoMode: Schema.union([
    Schema.const('off' as const),
    Schema.const('keyword' as const),
    Schema.const('every' as const),
    Schema.const('jev' as const),
  ])
    .default(DEFAULT_CONFIG.autoMode)
    .description(
      '贴纸规则：off = 只在模型点名时贴；keyword = 回复命中情绪词就贴（默认）；' +
        'every = 每 N 轮必贴一张；jev = 把这轮回复交给 JEV 判情绪族（最贴语境，且能判"这轮不贴"；会把回复正文发到 OpenRouter）',
    ),
  autoEveryTurns: Schema.number().default(DEFAULT_CONFIG.autoEveryTurns).description('autoMode=every 时的间隔轮数'),
  jevModel: Schema.string().default(DEFAULT_CONFIG.jevModel).description('autoMode=jev 用的模型（默认 typesafe/jev-1.13）'),
  jevTimeoutMs: Schema.number().default(DEFAULT_CONFIG.jevTimeoutMs).description('autoMode=jev 的单次超时（ms）；超时/报错回落既有规则'),
  jevPersona: Schema.string().default(DEFAULT_CONFIG.jevPersona).description('给 JEV 的角色/语气说明（留空 = 不给；内容会被发到 OpenRouter）'),
  jevDebugVisible: Schema.boolean()
    .default(DEFAULT_CONFIG.jevDebugVisible)
    .description('JEV 调试漂浮面板：开着会显示一枚可拖的小胶囊，点开能看到每次真实往返的请求与响应（只读诊断）'),
  petVisible: Schema.boolean().default(DEFAULT_CONFIG.petVisible).description('常驻挂件：页面上一直显示一只大肥鱼（随时能看到）'),
  petSize: Schema.number().default(DEFAULT_CONFIG.petSize).description('常驻挂件边长（px），建议 96–240'),
  petCorner: Schema.union([
    Schema.const('br' as const),
    Schema.const('bl' as const),
    Schema.const('tr' as const),
    Schema.const('tl' as const),
  ])
    .default(DEFAULT_CONFIG.petCorner)
    .description('常驻挂件默认停靠角（拖动过之后以拖拽坐标为准）'),
  shape: Schema.union([Schema.const('circle' as const), Schema.const('rounded' as const)])
    .default(DEFAULT_CONFIG.shape)
    .description('贴纸外形：circle = 圆形；rounded = 圆角方形（贴纸节点与挂件共用）'),
  radius: Schema.number().default(DEFAULT_CONFIG.radius).description('圆角方形时的圆角半径（px）'),
  borderWidth: Schema.number().default(DEFAULT_CONFIG.borderWidth).description('边框粗细（px，0 = 无边框）'),
  borderStyle: Schema.union([
    Schema.const('solid' as const),
    Schema.const('dashed' as const),
    Schema.const('none' as const),
  ])
    .default(DEFAULT_CONFIG.borderStyle)
    .description('边框样式：实线 / 虚线 / 无'),
  borderColor: Schema.string().default(DEFAULT_CONFIG.borderColor).description('边框颜色（#rrggbb 之类；留空 = 跟随主题强调色）'),
  bubbleSize: Schema.number().default(DEFAULT_CONFIG.bubbleSize).description('贴纸边长（px，按在回复气泡右下角的那张）'),
  bubbleRise: Schema.number().default(DEFAULT_CONFIG.bubbleRise).description('贴纸上移量（px，压住气泡右下角用）'),
})

/** 把设置面板读到的原始值补成完整配置。 */
export function resolveConfig(raw: unknown): MemesConfig {
  const value = (raw ?? {}) as Partial<MemesConfig>
  return {
    enabled: value.enabled ?? DEFAULT_CONFIG.enabled,
    quality: value.quality ?? DEFAULT_CONFIG.quality,
    assetRoot: value.assetRoot ?? DEFAULT_CONFIG.assetRoot,
    originalRoot: value.originalRoot ?? DEFAULT_CONFIG.originalRoot,
    cooldownTurns: value.cooldownTurns ?? DEFAULT_CONFIG.cooldownTurns,
    fallback: value.fallback ?? DEFAULT_CONFIG.fallback,
    autoMode: value.autoMode ?? DEFAULT_CONFIG.autoMode,
    autoEveryTurns: value.autoEveryTurns ?? DEFAULT_CONFIG.autoEveryTurns,
    jevModel: value.jevModel ?? DEFAULT_CONFIG.jevModel,
    jevTimeoutMs: value.jevTimeoutMs ?? DEFAULT_CONFIG.jevTimeoutMs,
    jevPersona: value.jevPersona ?? DEFAULT_CONFIG.jevPersona,
    jevDebugVisible: value.jevDebugVisible ?? DEFAULT_CONFIG.jevDebugVisible,
    petVisible: value.petVisible ?? DEFAULT_CONFIG.petVisible,
    petSize: value.petSize ?? DEFAULT_CONFIG.petSize,
    petCorner: value.petCorner ?? DEFAULT_CONFIG.petCorner,
    shape: value.shape ?? DEFAULT_CONFIG.shape,
    radius: value.radius ?? DEFAULT_CONFIG.radius,
    borderWidth: value.borderWidth ?? DEFAULT_CONFIG.borderWidth,
    borderStyle: value.borderStyle ?? DEFAULT_CONFIG.borderStyle,
    borderColor: value.borderColor ?? DEFAULT_CONFIG.borderColor,
    bubbleSize: value.bubbleSize ?? DEFAULT_CONFIG.bubbleSize,
    bubbleRise: value.bubbleRise ?? DEFAULT_CONFIG.bubbleRise,
  }
}
