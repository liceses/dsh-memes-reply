/**
 * dsh-memes-reply — 隐形轮询器（自动贴纸与"模型挑的那张"的入口）。
 *
 * 它坐在 `conversation.input.dock`（**list** 座位、session 作用域），是客户端里
 * 唯一能稳定拿到 `sessionId` 的常驻位置。它**不渲染任何东西**：只负责把 host 的
 * 待取位搬进 `store.ts`，真正的渲染交给气泡角的贴纸（`bubble.tsx`）。
 *
 * 这样分工的理由：链式座位的 `select` 必须是同步纯函数，没法自己发请求。
 */

import { useEffect } from 'react'
import { stickerStore } from '../store.js'
import { AUTO_POLL_MS, fetchAutoPending } from './auto.js'
import { postDebug } from './api.js'

/** 心跳间隔：够密到能证明"还在轮询"，又不至于把诊断缓冲冲掉。 */
const HEARTBEAT_MS = 15_000

/** 隐形轮询器：渲染 null。 */
export function StickerPoller({ sessionId }: { sessionId: string }): null {
  useEffect(() => {
    let alive = true
    let timer: number | null = null
    let heartbeat: number | null = null
    let since = 0
    let ticks = 0
    const store = stickerStore()

    postDebug({ kind: 'poller-mount', sessionId, note: `poll=${AUTO_POLL_MS}ms` })

    const tick = async (init: boolean): Promise<void> => {
      const response = await fetchAutoPending(sessionId, since, init)
      if (!alive) return
      if (response === undefined) {
        // 请求本身失败（路由不可达/被拒）——这一条很关键，别静默。
        postDebug({ kind: 'poll-failed', sessionId, note: `since=${since}` })
        return
      }
      ticks += 1
      since = response.seq
      if (response.event !== null) {
        store.put(response.event)
        postDebug({
          kind: 'poll-event',
          sessionId,
          turn: response.event.turn,
          id: response.event.id,
          note: `response.turn=${response.event.turn}`,
        })
      }
    }

    // 首轮只同步游标：刷新页面不该把上一次的贴纸再弹一遍。
    void tick(true)
    timer = window.setInterval(() => void tick(false), AUTO_POLL_MS)
    heartbeat = window.setInterval(
      () => postDebug({ kind: 'poll-alive', sessionId, note: `ticks=${ticks} since=${since}` }),
      HEARTBEAT_MS,
    )

    return () => {
      alive = false
      if (timer !== null) window.clearInterval(timer)
      if (heartbeat !== null) window.clearInterval(heartbeat)
    }
  }, [sessionId])

  return null
}
