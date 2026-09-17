/**
 * dsh-memes-reply — 设置面板与贴纸层的数据通道（浏览器侧）。
 *
 * 一律走本插件自己的同源路由（已实测匿名可达），不需要任何私有 RPC：
 *   GET  /stats           状态行
 *   GET  /catalog         预览墙 / 挂件取图
 *   GET  /vocab           全量检索词表（v2.0 客户端派生）
 *   GET  /session-state   会话态（静音 / 一次性指定 / 最近用过）
 *   POST /latch           「下一轮用这张」
 *   GET/POST /pet         常驻挂件的位置与形态
 */

import {
  CATALOG_PATH,
  DEBUG_PATH,
  LATCH_PATH,
  LAYOUT_PATH,
  SESSION_STATE_PATH,
  STATS_PATH,
  VOCAB_PATH,
} from '../protocol.js'
import type { CatalogItem, PanelStats, PetState } from '../types.js'
import type { ChoiceTerm } from '../derive.js'

/** /catalog 的响应。 */
export interface CatalogResponse {
  ok: boolean
  ready: boolean
  total: number
  items: CatalogItem[]
}

/** 一个同源 JSON GET；失败返回 undefined（面板降级显示，不抛）。 */
async function getJson<T>(path: string): Promise<T | undefined> {
  try {
    const response = await fetch(path, { headers: { accept: 'application/json' } })
    if (!response.ok) return undefined
    return (await response.json()) as T
  } catch {
    return undefined
  }
}

/** 状态行数据。 */
export function fetchStats(): Promise<PanelStats | undefined> {
  return getJson<PanelStats>(STATS_PATH)
}

/** 预览墙数据；`q` 非空时按关键词过滤。 */
export function fetchCatalog(limit: number, seed: number, q = ''): Promise<CatalogResponse | undefined> {
  const query = q === '' ? '' : `&q=${encodeURIComponent(q)}`
  return getJson<CatalogResponse>(`${CATALOG_PATH}?limit=${limit}&seed=${seed}${query}`)
}

/** /vocab 的响应（v2.0：客户端派生的词表）。 */
export interface VocabResponse {
  ok: boolean
  ready: boolean
  total: number
  items: ChoiceTerm[]
}

/** /session-state 的响应（客户端派生里"人按过的开关"）。 */
export interface SessionStateResponse {
  ok: boolean
  sessionId: string
  /** 本会话静音（`/fish off`）。 */
  muted: boolean
  /** 面板的全局一次性指定。 */
  latch: string | null
  /** 本会话的一次性指定。 */
  sessionLatch: string | null
  /** 最近用过的贴纸 id（倒序，冷却用）。 */
  recent: string[]
}

/**
 * 全量检索词表（v2.0 客户端派生的唯一数据源）。
 *
 * 一次拉取、进程内缓存：词表只在重跑导入脚本时变，没必要每个回合都问一次。
 */
let vocabPromise: Promise<VocabResponse | undefined> | null = null

/** 取词表（带进程内缓存；失败返回 undefined，调用方降级）。 */
export function fetchVocab(): Promise<VocabResponse | undefined> {
  if (vocabPromise === null) {
    vocabPromise = getJson<VocabResponse>(VOCAB_PATH).then((response) => {
      // 失败的缓存没有意义：下次渲染重试。
      if (response === undefined || response.ready !== true) vocabPromise = null
      return response
    })
  }
  return vocabPromise
}

/** 取一个会话的状态（静音/指定/冷却）；失败返回 undefined。 */
export function fetchSessionState(sessionId: string): Promise<SessionStateResponse | undefined> {
  if (sessionId === '') return Promise.resolve(undefined)
  return getJson<SessionStateResponse>(`${SESSION_STATE_PATH}?sessionId=${encodeURIComponent(sessionId)}`)
}

/**
 * 设/清「下一轮用这张」。
 * @returns 生效后的 latch（null = 已清空）；失败返回 undefined。
 */
export async function putLatch(id: string | null): Promise<string | null | undefined> {
  try {
    const response = await fetch(LATCH_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as { ok?: boolean; latch?: string | null } | null
    if (body?.ok !== true) return undefined
    return body.latch ?? null
  } catch {
    return undefined
  }
}

/** 界面落点：挂件 + 兜底贴纸。 */
export interface LayoutResponse {
  ok: boolean
  pet?: PetState
  fallback?: { right?: number; bottom?: number }
}

/** 落点写入：`slot` 决定改哪一个；坐标传 `null` 表示复位。 */
export interface LayoutPatch {
  slot?: 'pet' | 'fallback'
  right?: number | null
  bottom?: number | null
  collapsed?: boolean
  id?: string | null
}

/** 读落点（挂件位置/收起态/当前那张 + 兜底贴纸位置）。 */
export async function fetchLayout(): Promise<LayoutResponse | undefined> {
  return getJson<LayoutResponse>(LAYOUT_PATH)
}

/** 写落点（只传要改的字段）。 */
export async function putLayout(patch: LayoutPatch): Promise<LayoutResponse | undefined> {
  try {
    const response = await fetch(LAYOUT_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as LayoutResponse | null
    return body?.ok === true ? body : undefined
  } catch {
    return undefined
  }
}

/**
 * 诊断回执：把客户端的关键动作回传 host（进内存环形缓冲，`/stats` 可读）。
 * 浏览器控制台开发者看不到，所以这条通道是"气泡为什么没出来"唯一可观测的办法。
 * 一律 fire-and-forget，失败静默 —— 诊断绝不能影响功能。
 */
export function postDebug(entry: {
  kind: string
  sessionId?: string
  turn?: number
  id?: string
  note?: string
}): void {
  try {
    void fetch(DEBUG_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // 忽略
  }
}

/** 同一个 (turn, 结果) 只上报一次，别把环形缓冲冲掉。 */
const selectLogged = new Map<number, string>()

/** 上报一次链式选择器的判定（去重；带 seq 便于核对水线）。 */
export function traceSelect(turn: number, seq: number, hit: boolean, id?: string): void {
  const mark = hit ? `hit:${id ?? ''}` : 'miss'
  if (selectLogged.get(turn) === mark) return
  selectLogged.set(turn, mark)
  if (selectLogged.size > 64) selectLogged.clear()
  postDebug({ kind: 'select', turn, ...(hit && id !== undefined ? { id } : {}), note: `${mark} seq=${seq}` })
}
