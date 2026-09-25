/**
 * dsh-memes-reply — 共享类型。
 *
 * 刻意不 import 任何 DSH 运行时对象（也不 import schemastery）：host 与浏览器半边
 * 都只读这一份形状，所以它必须能在两边安全地被打包。
 */

/** 一条贴纸（与 index.json 里的一条对应）。 */
export interface StickerEntry extends StickerTerm {
  /** ASCII 短名，进 URL；形如 `dianzan`、`aixin-1`。 */
  id: string
  /** 中文语义名（由原始文件名派生），显示与检索都用它。 */
  name: string
  /** 压缩副本文件名（相对 assetRoot）。 */
  file: string
  /** 原图文件名（相对 originalRoot）；`quality=original` 时用它。 */
  source: string
  /** 原文件名里的序号（同名多版本才有值）。 */
  seq: number | null
  /** 中文检索词。 */
  tags: string[]
  /** 英文/拼音检索词。 */
  aliases: string[]
  /** 压缩副本字节数。 */
  bytes: number
  /** 压缩副本 sha256（做 ETag）。 */
  sha256: string
  /**
   * 缩略图文件名（相对 `<assetRoot>/thumb`），设置面板的预览墙用它。
   * 没有缩略图（老索引 / 未跑 `--thumbs`）时为 undefined，客户端降级为名字 chip。
   */
  thumb?: string | null
  w: number
  h: number
  frames: number
  fps: number
  durationMs: number
  /** 实际采用的压缩档位，便于复查画质取舍。 */
  encode: Record<string, unknown> | null
}

/**
 * 派生算法（`pickByKeyword` / `pickEvery`）真正需要的字段。
 *
 * 为什么单列一个最小形状：贴纸现在有**两个**调用方 —— host（拿完整索引条目）
 * 与浏览器半边（拿 `/vocab` 的精简词表）。它们只需要这四个字段，算法就不该逼
 * 客户端造一个假的 `StickerEntry`（那会让"派生是同一套逻辑"变成一句空话）。
 */
export interface StickerTerm {
  /** ASCII 短名。 */
  id: string
  /** 中文语义名。 */
  name: string
  /** 中文检索词。 */
  tags: readonly string[]
  /** 英文/拼音检索词。 */
  aliases: readonly string[]
}

/** 设置面板预览墙里的一格。 */
export interface CatalogItem {
  id: string
  name: string
  tags: string[]
  bytes: number
  w: number
  h: number
  frames: number
  fps: number
  durationMs: number
  /** 缩略图绝对 URL；缺缩略图时为 null。 */
  thumb: string | null
  /** 全尺寸动画绝对 URL。 */
  url: string
}

/** 设置面板状态行的数据（`GET /stats` 的子集）。 */
export interface PanelStats {
  ok: boolean
  ready: boolean
  entries: number
  format: string
  index: string
  assetRoot: string
  originalRoot: string
  quality: StickerQuality
  totalBytes: number
  served: number
  miss: number
  denied: number
  lastId: string
  lastAt: number
  /** 当前"下一轮指定"（面板设的全局 latch）；无则 null。 */
  latch: string | null
}


/** index.json 顶层。 */
export interface StickerIndex {
  version: number
  generatedAt?: string
  generator?: string
  /** 原始素材目录（仅记录，运行时不依赖它）。 */
  source?: string
  /** 压缩副本格式：gif | webp。 */
  format?: string
  sticker: StickerEntry[]
}

/** 呈现形态：v2.0 只有一种 —— 会话流里的贴纸节点（`StickerForm` 已随 form 设置一起退役）。 */

/** 画质来源：compressed = 压缩副本；original = 原始素材目录。 */
export type StickerQuality = 'compressed' | 'original'

/**
 * 自动贴纸（B-auto）的触发规则：
 *  - `off`：只在模型调用工具时贴；
 *  - `keyword`：助手这一轮的话里命中情绪词就贴（不问模型）；
 *  - `every`：每 N 轮贴一张（最确定，和语境无关）；
 *  - `jev`：把这轮回复交给 JEV 判断情绪族，族内由代码选一张（最贴语境，且能判"这轮不贴"）。
 *
 * `jev` 的代价：回复正文会被发到 OpenRouter，且每轮多 1 次外部调用（实测 ~1.3 s /
 * $0.00005）。任何失败都静默回落成 `every` 的规则，不影响会话。
 */
export type AutoMode = 'off' | 'keyword' | 'every' | 'jev'

/** 常驻挂件贴在哪一角（拖过之后以拖拽坐标为准）。 */
export type PetCorner = 'br' | 'bl' | 'tr' | 'tl'

/** 贴纸外形。 */
export type StickerShape = 'circle' | 'rounded'

/** 贴纸边框样式。 */
export type StickerBorderStyle = 'solid' | 'dashed' | 'none'

/** 设置面板里的配置（同时也是运行时的解析后配置）。 */
export interface MemesConfig {
  /** 总开关。 */
  enabled: boolean
  /** 画质来源。 */
  quality: StickerQuality
  /** 压缩副本目录；空 = `<DSH_HOME>/memes-reply/assets`。 */
  assetRoot: string
  /** 原始素材目录；`quality=original` 时使用，空 = 回落压缩副本。 */
  originalRoot: string
  /** 同一张贴纸在连续 N 轮内不重复（0 = 关闭）。 */
  cooldownTurns: number
  /**
   * 兜底贴纸 id：关键词一个都匹配不上时用它，保证"总有鱼"。
   * 空串 = 不兜底（返回失败并教模型换词，检索问题不会被掩盖）。
   */
  fallback: string
  /** 自动贴纸模式（不问模型也能贴）。 */
  autoMode: AutoMode
  /** `autoMode=every` 时的间隔轮数。 */
  autoEveryTurns: number
  /** `autoMode=jev` 用的模型（改它等于改决策质量）。 */
  jevModel: string
  /** `autoMode=jev` 的单次超时（ms）；超时/报错一律回落既有规则，不拖住会话。 */
  jevTimeoutMs: number
  /** 给 JEV 的角色/语气说明（留空 = 不给；写在这里等于把这段话也发出去）。 */
  jevPersona: string
  /**
   * JEV 调试漂浮面板总开关（默认关）。
   *
   * 开了之后页面上出现一枚小胶囊，点它展开成面板：能看到**每次真实往返**发出去什么、
   * 收回来什么。纯只读诊断，关了就不渲染、也不轮询。
   */
  jevDebugVisible: boolean
  /** 常驻挂件：页面上一直显示一只大肥鱼。 */
  petVisible: boolean
  /** 常驻挂件边长（px）。 */
  petSize: number
  /** 常驻挂件默认停靠角（拖过之后以拖拽坐标为准）。 */
  petCorner: PetCorner
  /** 贴纸外形（三种贴纸共用）。 */
  shape: StickerShape
  /** 圆角方形时的圆角半径（px）。 */
  radius: number
  /** 边框粗细（px，0 = 无边框）。 */
  borderWidth: number
  /** 边框样式。 */
  borderStyle: StickerBorderStyle
  /** 边框颜色（空 = 跟随主题强调色）。 */
  borderColor: string
  /** 气泡角贴纸边长（px）。 */
  bubbleSize: number
  /** 气泡角贴纸上移量（px，用来压住气泡右下角）。 */
  bubbleRise: number
}

/** 常驻挂件的 UI 状态（拖拽坐标、是否收成小圆点），存在 state.json 里。 */
export interface PetState {
  /** 距右边距（px）。 */
  right?: number
  /** 距底边距（px）。 */
  bottom?: number
  /** 是否收成小圆点。 */
  collapsed?: boolean
  /** 当前显示的贴纸 id（刷新后还是同一张）。 */
  id?: string
}

/**
 * 漂浮面板的 UI 状态（位置 + 是否收起）。
 *
 * 与 `PetState` 分开而不是复用它：`PetState.id` 对调试面板没有意义，
 * 复用会让"这个字段到底写给谁"变成需要推理的事。
 */
export interface FloatPanelState {
  /** 距右边距（px）。 */
  right?: number
  /** 距底边距（px）。 */
  bottom?: number
  /** 是否收起成小胶囊（点它再展开）。 */
  collapsed?: boolean
}

/** 一条诊断轨迹（host 的决策点 + 客户端回执，共用一个环形缓冲）。 */
export interface TraceEntry {
  /** 毫秒时间戳。 */
  at: number
  /** 谁记的：host 决策点，或客户端回执的 kind。 */
  kind: string
  sessionId?: string
  turn?: number
  id?: string
  /** 一句话细节（例如 bail 的原因、selector 的结果）。 */
  note?: string
}

/** 单个会话的可覆盖状态。 */
export interface SessionState {
  /** 本会话静音。 */
  muted?: boolean
  /** 一次性指定：下一轮必须用这张（用完即清）。 */
  latch?: string
  /** 最近用过的贴纸 id（倒序，用于冷却）。 */
  recent?: string[]
}

/** 跨会话的全局状态（设置面板的"下一轮用这张"落在这里）。 */
export interface GlobalState {
  /** 一次性指定：下一次贴纸必须用它（用完即清）。 */
  latch?: string
  /** 常驻挂件的位置与形态。 */
  pet?: PetState
  /** JEV 调试漂浮面板的位置与收起态。 */
  jevDebug?: FloatPanelState
}

/** 插件自有状态文件（`<DSH_HOME>/memes-reply/state.json`）。 */
export interface PluginState {
  version: 1
  sessions: Record<string, SessionState>
  global?: GlobalState
}
