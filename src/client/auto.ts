/**
 * dsh-memes-reply — 自动贴纸的数据通道（浏览器侧）。
 *
 * 轮询而不是 SSE：贴纸晚 1–3 秒出现完全可接受，换来的是零连接管理
 * （没有心跳、重连、半开检测）。真要做"打字中"那种即时彩蛋时再上 SSE。
 */

import { AUTO_PENDING_PATH } from '../protocol.js'
import type { AutoMode, AutoEvent } from '../types.js'

/**
 * 轮询间隔：贴纸要贴到气泡角上，事件越早进仓越好（尾巴节点渲染完通常就不再变了）。
 * 800ms 是"够快"和"不折腾"之间的折中；host 侧已在**最后一步的流结束时**就决策，
 * 所以实际抖动通常只有几十到几百毫秒。
 */
export const AUTO_POLL_MS = 800

/** /auto/pending 的响应。 */
export interface AutoPendingResponse {
  ok: boolean
  mode: AutoMode
  /** host 侧当前事件游标。 */
  seq: number
  /** 新事件；没有则 null。 */
  event: AutoEvent | null
}

/**
 * 取一次待取位。
 * @param since - 上次见到的游标。
 * @param init - true 时只同步游标、不要事件（避免开页/刷新就冒出旧贴纸）。
 */
export async function fetchAutoPending(
  sessionId: string,
  since: number,
  init: boolean,
): Promise<AutoPendingResponse | undefined> {
  const query = `sessionId=${encodeURIComponent(sessionId)}&since=${since}${init ? '&init=1' : ''}`
  try {
    const response = await fetch(`${AUTO_PENDING_PATH}?${query}`, { headers: { accept: 'application/json' } })
    if (!response.ok) return undefined
    return (await response.json()) as AutoPendingResponse
  } catch {
    return undefined
  }
}
