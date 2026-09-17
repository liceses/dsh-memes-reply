/**
 * dsh-memes-reply — 路由与协议常量。
 *
 * 全部放在这里，是为了让 host 与（M2 的）client 用同一份字符串常量，
 * 不出现"两边各自写死一个路径"的漂移。
 */

/** 本插件占用的路由前缀（webServer 前缀路由）。 */
export const ROUTE_PREFIX = '/api/dsh-memes-reply'

/** 贴纸字节端点：`<STICKER_PATH>/<id>.<ext>`。 */
export const STICKER_PATH = `${ROUTE_PREFIX}/sticker`

/** 缩略图端点（设置面板预览墙用）：`<THUMB_PATH>/<id>.<ext>`。 */
export const THUMB_PATH = `${ROUTE_PREFIX}/thumb`

/** 素材清单端点（预览墙数据）。 */
export const CATALOG_PATH = `${ROUTE_PREFIX}/catalog`

/**
 * 检索词表端点（v2.0 客户端派生用）。
 *
 * 与 `/catalog` 的区别：这里是**全量**的精简词表（id/name/tags/aliases + 全尺寸 URL），
 * 一次拉取、只在客户端做关键词扫描用；`/catalog` 是分页+种子的预览墙数据。
 */
export const VOCAB_PATH = `${ROUTE_PREFIX}/vocab`

/**
 * 会话态端点（静音 / 一次性指定 / 最近用过）。
 *
 * v2.0 把"贴哪张"的**算法**搬到了客户端（纯派生、刷新即重放），但"人按过的开关"
 * 仍然由宿主说了算：这个端点就是客户端读那三个字段的唯一入口。
 */
export const SESSION_STATE_PATH = `${ROUTE_PREFIX}/session-state`

/** 「下一轮用这张」端点（设置面板写入）。 */
export const LATCH_PATH = `${ROUTE_PREFIX}/latch`

/** 界面落点（常驻挂件的拖拽坐标，客户端读写，落在 state.json）。 */
export const LAYOUT_PATH = `${ROUTE_PREFIX}/layout`

/** 旧名保留：`/pet` 与 `/layout` 等价（早期版本只服务挂件）。 */
export const PET_PATH = LAYOUT_PATH

/** 诊断端点。 */
export const STATS_PATH = `${ROUTE_PREFIX}/stats`

/**
 * 诊断回执（客户端 → host，只进内存环形缓冲，不落盘）。
 * 存在的理由：浏览器控制台我看不到，而"贴纸到底走到哪一步断的"必须可观测。
 */
export const DEBUG_PATH = `${ROUTE_PREFIX}/debug`

/** 设置命名空间。 */
export const SETTINGS_NS = 'dsh-memes-reply'

/** 模型工具名。 */
export const TOOL_NAME = 'use_sticker'

/** 斜杠命令名（不含前导斜杠）。 */
export const COMMAND_NAME = 'fish'

/** 单张贴纸的读取上限（原图最大 8.4 MB，留足余量）。 */
export const MAX_STICKER_BYTES = 16 * 1024 * 1024

/** id 白名单：小写字母数字与连字符。因为只接受这个形状，路由天然不存在路径穿越。 */
export const STICKER_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

/** 扩展名 → Content-Type。 */
export const MIME: Readonly<Record<string, string>> = {
  gif: 'image/gif',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

/** 从文件名取扩展名（小写，不含点）。 */
export function extensionOf(file: string): string {
  const i = file.lastIndexOf('.')
  return i < 0 ? '' : file.slice(i + 1).toLowerCase()
}

/** 组装一张贴纸的绝对 URL（markdown 图片必须是绝对 http(s) URL 才会被渲染）。 */
export function stickerUrl(origin: string, entry: { id: string; file: string }): string {
  return `${origin}${STICKER_PATH}/${entry.id}.${extensionOf(entry.file)}`
}

/** 缩略图文件名：索引里有就用它，否则按 `<id>.webp` 约定猜。 */
export function thumbFileOf(entry: { id: string; thumb?: string | null }): string {
  return entry.thumb !== undefined && entry.thumb !== null && entry.thumb !== '' ? entry.thumb : `${entry.id}.webp`
}

/** 组装一张缩略图的绝对 URL。 */
export function thumbUrl(origin: string, entry: { id: string; thumb?: string | null }): string {
  return `${origin}${THUMB_PATH}/${thumbFileOf(entry)}`
}
