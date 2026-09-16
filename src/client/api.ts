/**
 * dsh-memes-reply — 设置面板的数据通道（浏览器侧）。
 *
 * 一律走本插件自己的同源路由（已实测匿名可达），不需要任何私有 RPC：
 *   GET  /stats         状态行
 *   GET  /catalog       预览墙 / 挂件取图
 *   POST /latch         「下一轮用这张」
 *   GET/POST /pet       常驻挂件的位置与形态
 */

import { AUTO_PENDING_PATH, CATALOG_PATH, DEBUG_PATH, LATCH_PATH, PET_PATH, STATS_PATH } from '../protocol.js'
import type { CatalogItem, PanelStats, PetState } from '../types.js'

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

/** /pet 的响应。 */
export interface PetResponse {
  ok: boolean
  pet: PetState
}

/** 读常驻挂件状态（位置、是否收成小圆点、当前那张）。 */
export async function fetchPet(): Promise<PetState | undefined> {
  const response = await getJson<PetResponse>(PET_PATH)
  return response?.pet
}

/** 写常驻挂件状态（只传要改的字段）。 */
export async function putPet(patch: PetState): Promise<PetState | undefined> {
  try {
    const response = await fetch(PET_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as PetResponse | null
    return body?.ok === true ? body.pet : undefined
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
