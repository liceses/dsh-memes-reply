/**
 * dsh-memes-reply — 设置 schema 与路径常量（host only）。
 *
 * 注意：这个文件 import 了 schemastery，所以**浏览器半边绝不能 import 它**。
 * 纯常量（默认值/字段序）在 `config.ts`，类型在 `types.ts`，client 只用那两个。
 */

import Schema from '@deepseek-ai/schemastery'
import type { Volatile } from '@deepseek-ai/cordis'
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

/**
 * 插件 Config（schemastery）。
 *
 * ## 0.1.7 起这个 schema 就是设置表单本身
 *
 * 旧版靠 `ctx.settings.register('dsh-memes-reply', MemesSettingsSchema, …)` 注册命名空间；
 * 0.1.7 的 `SettingsForms` **没有 `register()`**，表单改成从插件导出的 **`Config`** 投影，
 * 键是 **profile 条目 id**（本包 = `memes-reply`）。所以：
 *
 * - 导出名必须是 `Config`（第一方 `dsh-client-locale` / `dsh-agent-default-model` 同款）；
 * - 每个字段都要 `.volatile()`，因为 `dsh-settings` 的 `volatileForm()` **只挑
 *   volatile 字段**画进表单；没标的字段仍可读，但只能在 cordis 配置文件里改。
 *
 * ## `.volatile()` 的两条硬规则（照 `schemastery` 源码核对，不是猜的）
 *
 * - `Schema.prototype.extra()` **返回副本**，所以 `.volatile()` 必须**收集返回值**：
 *   一律写成链式 `.default(...).description(...).volatile()`。
 *   写成 `const f = Schema.boolean(); f.volatile()` 会把标记丢掉。
 * - volatile 字段必须落在固定对象路径、且不能嵌套在另一个 volatile 里
 *   （数组元素 / `inner` / 映射键会抛 `volatile fields require a fixed object path`）。
 */
export const Config = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('总开关：关掉后不再贴图').volatile(),
  quality: Schema.union([
    Schema.const('compressed' as const),
    Schema.const('original' as const),
  ])
    .default(DEFAULT_CONFIG.quality)
    .description('画质来源：compressed = 压缩副本；original = 原始素材目录（需填 originalRoot）')
    .volatile(),
  assetRoot: Schema.string()
    .default(DEFAULT_CONFIG.assetRoot)
    .description('压缩副本目录，留空 = <DSH_HOME>/memes-reply/assets')
    .volatile(),
  originalRoot: Schema.string()
    .default(DEFAULT_CONFIG.originalRoot)
    .description('原始素材目录（quality=original 时使用）')
    .volatile(),
  cooldownTurns: Schema.number()
    .default(DEFAULT_CONFIG.cooldownTurns)
    .description('同一张贴纸连续 N 轮内不重复，0 = 关闭')
    .volatile(),
  fallback: Schema.string()
    .default(DEFAULT_CONFIG.fallback)
    .description('兜底贴纸 id：规则一个都没选中时用它，保证总有鱼；留空 = 不兜底')
    .volatile(),
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
    )
    .volatile(),
  autoEveryTurns: Schema.number()
    .default(DEFAULT_CONFIG.autoEveryTurns)
    .description('autoMode=every 时的间隔轮数')
    .volatile(),
  jevModel: Schema.string()
    .default(DEFAULT_CONFIG.jevModel)
    .description('autoMode=jev 用的模型（默认 typesafe/jev-1.13）')
    .volatile(),
  jevTimeoutMs: Schema.number()
    .default(DEFAULT_CONFIG.jevTimeoutMs)
    .description('autoMode=jev 的单次超时（ms）；超时/报错回落既有规则')
    .volatile(),
  jevPersona: Schema.string()
    .default(DEFAULT_CONFIG.jevPersona)
    .description('给 JEV 的角色/语气说明（留空 = 不给；内容会被发到 OpenRouter）')
    .volatile(),
  jevDebugVisible: Schema.boolean()
    .default(DEFAULT_CONFIG.jevDebugVisible)
    .description('JEV 调试漂浮面板：开着会显示一枚可拖的小胶囊，点开能看到每次真实往返的请求与响应（只读诊断）')
    .volatile(),
  petVisible: Schema.boolean()
    .default(DEFAULT_CONFIG.petVisible)
    .description('常驻挂件：页面上一直显示一只大肥鱼（随时能看到）')
    .volatile(),
  petSize: Schema.number().default(DEFAULT_CONFIG.petSize).description('常驻挂件边长（px），建议 96–240').volatile(),
  petCorner: Schema.union([
    Schema.const('br' as const),
    Schema.const('bl' as const),
    Schema.const('tr' as const),
    Schema.const('tl' as const),
  ])
    .default(DEFAULT_CONFIG.petCorner)
    .description('常驻挂件默认停靠角（拖动过之后以拖拽坐标为准）')
    .volatile(),
  shape: Schema.union([Schema.const('circle' as const), Schema.const('rounded' as const)])
    .default(DEFAULT_CONFIG.shape)
    .description('贴纸外形：circle = 圆形；rounded = 圆角方形（贴纸节点与挂件共用）')
    .volatile(),
  radius: Schema.number().default(DEFAULT_CONFIG.radius).description('圆角方形时的圆角半径（px）').volatile(),
  borderWidth: Schema.number().default(DEFAULT_CONFIG.borderWidth).description('边框粗细（px，0 = 无边框）').volatile(),
  borderStyle: Schema.union([
    Schema.const('solid' as const),
    Schema.const('dashed' as const),
    Schema.const('none' as const),
  ])
    .default(DEFAULT_CONFIG.borderStyle)
    .description('边框样式：实线 / 虚线 / 无')
    .volatile(),
  borderColor: Schema.string()
    .default(DEFAULT_CONFIG.borderColor)
    .description('边框颜色（#rrggbb 之类；留空 = 跟随主题强调色）')
    .volatile(),
  bubbleSize: Schema.number()
    .default(DEFAULT_CONFIG.bubbleSize)
    .description('贴纸边长（px）：贴在回复正文下方、与正文左对齐的那一枚')
    .volatile(),
  bubbleRise: Schema.number()
    .default(DEFAULT_CONFIG.bubbleRise)
    .description('贴纸上移量（px）：0 = 紧贴正文下方；正数往上收（会压住正文最后一行）')
    .volatile(),
})

/**
 * 解析后的配置形状：**每个字段都是活引用**，读值要 `.get()`。
 *
 * volatile 字段在 `Schema.resolve` 里被 `createVolatile()` 包成 `Volatile<T>`，
 * 而 loader 的 `_commitVolatile` 会把新值**提交进同一个引用** —— 插件不重挂就能看到新值。
 */
export type LiveConfig = {
  readonly [K in keyof MemesConfig]: Volatile<MemesConfig[K]>
}

/**
 * 把活配置解成一份**普通值快照**（每次都取最新值并补默认值）。
 *
 * 这样下游（路由 / 工具 / 命令 / 提示词）完全不必知道自己拿到的是不是 `Volatile`，
 * 与 0.1.5 时代的 `scope.get()` 语义逐字一致。
 *
 * @param live - `apply(ctx, config)` 收到的活配置。
 * @returns 合并了默认值的普通配置。
 */
export function resolveLive(live: LiveConfig): MemesConfig {
  // `live` 在正常装配下一定存在（cordis 会按导出的 Config 解析后传进来），
  // 但这里仍兜一次底：手动调用 / 未来 loader 行为变化时宁可回落默认值，也不要抛。
  const record = (live ?? {}) as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const field = record[key]
    out[key] =
      field !== null && typeof field === 'object' && typeof (field as { get?: unknown }).get === 'function'
        ? (field as { get(): unknown }).get()
        : field
  }
  return resolveConfig(out)
}

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
