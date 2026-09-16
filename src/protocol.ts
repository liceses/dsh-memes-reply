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

/** 「下一轮用这张」端点（设置面板写入）。 */
export const LATCH_PATH = `${ROUTE_PREFIX}/latch`

/** 自动贴纸待取位（客户端轮询取走）。 */
export const AUTO_PENDING_PATH = `${ROUTE_PREFIX}/auto/pending`

/** 常驻挂件的位置与形态（客户端读写，落在 state.json）。 */
export const PET_PATH = `${ROUTE_PREFIX}/pet`

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

/** 组装正文里的 markdown 图片片段。alt 留空：流式期间未出图时不至于显示杂字。 */
export function markdownImage(url: string): string {
  return `![](${url})`
}
