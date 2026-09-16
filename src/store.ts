/**
 * dsh-memes-reply — 贴纸落地仓（浏览器侧，纯模块，可单测）。
 *
 * ## 为什么需要它
 *
 * 贴纸要贴在**每条回复的气泡角**上，而那个座位（`conversation.chat.turnTail`）是**竞争型链**：
 * 它的 `select` 是渲染期调用的**同步纯函数**，只拿得到 `{ turn, seq, openFile }`，既没有
 * `sessionId`，也不能自己发请求。所以拆成两半：常驻的隐形轮询器把事件搬进这里，
 * `select` 同步查这里决定接不接。
 *
 * ## 为什么按 `seq` 绑定，而不是按轮次号
 *
 * 踩过的坑：host 的轮次号来自 `agent/pre-step`（agent 计数器），客户端的来自
 * `TurnLocation.turn`（会话事件计数器）——**实测同一时刻分别是 22 和 20，而且差值会漂移**
 * （2026-09-16 的 trace：`host:publish turn=22` 对 `client:select turn=20 miss`）。
 * 所以"按轮次号对齐"这条路根本不成立，±1 兜底也只是碰运气。
 *
 * 改用 `ownerProps.seq`（该轮 finalNode 的会话序号，**单调递增、跨编号体系稳定**）：
 * 事件到达时记下"已见过的最大 seq"作为**水线**；此后**第一条 seq 越过水线的尾巴节点**
 * 就是这条贴纸要贴的那一轮。既与轮次号无关，也不怕渲染顺序（旧轮次的 seq 在水线以下）。
 */

import type { AutoEvent } from './types.js'

/**
 * 贴纸在客户端仓里的保留时长。
 *
 * 比 host 的投递 TTL（90 秒）长得多：`every` 模式在**轮次开始**就发布，而尾巴节点要等整轮
 * 结束才渲染 —— 一个长回合（多次工具调用）跑十几分钟很正常，贴纸不能在中途过期。
 */
export const STORE_TTL_MS = 30 * 60_000

/** 一条待绑定的贴纸。 */
interface PendingEvent {
  event: AutoEvent
  at: number
  /** 到达时的 seq 水线：只有 seq 更高的尾巴节点才能认领它。 */
  boundary: number
}

/** 贴纸落地仓。 */
export interface StickerStore {
  /** 放一张（后来的覆盖先前的）。 */
  put(event: AutoEvent): void
  /**
   * 这一轮要不要贴、贴哪张；没有返回 null（selector 据此让给别的条目）。
   * @param turn - 客户端的轮次号（仅用于去重，以及"编号恰巧一致"时的快速命中）。
   * @param seq - 该轮 finalNode 的会话序号（单调递增，用于跨编号体系绑定）。
   */
  peek(turn: number, seq: number): AutoEvent | null
  /** 组件挂载时把待绑定的那张认领到本轮（之后本轮稳定返回它）。 */
  claim(turn: number): void
  /** 用户点 ✕：把这一轮收起来。 */
  dismiss(turn: number): void
  /** 订阅变化（给 React 的 useSyncExternalStore 用）。 */
  subscribe(listener: () => void): () => void
  /** 当前有效条目数（诊断）。 */
  size(): number
  /** 清空（测试与调试用）。 */
  reset(): void
}

/** 建仓（时钟可注入，便于测过期）。 */
export function createStickerStore(now: () => number = Date.now): StickerStore {
  let pending: PendingEvent | null = null
  const shown = new Map<number, { event: AutoEvent; at: number }>()
  const dismissed = new Set<number>()
  const listeners = new Set<() => void>()
  /** 已见过的最大 seq（水线来源）。 */
  let maxSeq = 0

  const sweep = (): void => {
    const cutoff = now() - STORE_TTL_MS
    if (pending !== null && pending.at < cutoff) pending = null
    for (const [turn, entry] of shown) {
      if (entry.at < cutoff) shown.delete(turn)
    }
    if (dismissed.size > 128) dismissed.clear()
  }

  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // 一个订阅者出错不影响其它订阅者。
      }
    }
  }

  return {
    put(event) {
      sweep()
      // 水线 = 此刻已见过的最大 seq：晚于它的第一条尾巴就是这条贴纸的主人。
      pending = { event, at: now(), boundary: maxSeq }
      dismissed.delete(event.turn)
      notify()
    },
    peek(turn, seq) {
      sweep()
      if (seq > maxSeq) maxSeq = seq
      if (dismissed.has(turn)) return null
      // 1) 本轮已认领过 → 稳定返回（链每次渲染都会问，必须一直给同一张）
      const claimed = shown.get(turn)
      if (claimed !== undefined) return claimed.event
      // 2) 待绑定的那张
      if (pending !== null) {
        // 2a) 编号恰巧一致 → 直接命中
        if (pending.event.turn === turn) return pending.event
        // 2b) 还没有基线（页面刚加载就收到了事件，一个 seq 都还没见过）→ 用**第一条**渲染的
        //     尾巴当基线，从它之后的第一条开始接手；否则历史上最旧的那一轮会把它抢走。
        if (pending.boundary === 0) {
          pending.boundary = seq
          return null
        }
        // 2c) 越过水线的那一轮 → 命中（与轮次号无关）
        if (seq > pending.boundary) return pending.event
      }
      return null
    },
    claim(turn) {
      if (pending === null) return
      shown.set(turn, { event: pending.event, at: pending.at })
      pending = null
      notify()
    },
    dismiss(turn) {
      shown.delete(turn)
      if (pending !== null && pending.event.turn === turn) pending = null
      dismissed.add(turn)
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    size() {
      sweep()
      return shown.size + (pending === null ? 0 : 1)
    },
    reset() {
      pending = null
      shown.clear()
      dismissed.clear()
      maxSeq = 0
      notify()
    },
  }
}

/** 页面级单例。 */
let instance: StickerStore | null = null

/** 取页面级那一个仓。 */
export function stickerStore(): StickerStore {
  if (instance === null) instance = createStickerStore()
  return instance
}
