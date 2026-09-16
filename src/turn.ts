/**
 * dsh-memes-reply — 「每轮最多一张」的账本。
 *
 * 硬性上限必须在工具层强制，不能指望模型自觉。当前 turn 号来自 host 事件
 * （`agent/pre-step` 的 payload.turn），turn 关闭来自 `agent/turn-stopping`。
 * 如果某个流程没观测到 turn（子代理、PTC 等），退化成"距上次使用的一分钟窗口"，
 * 保证不会在同一轮里连贴两张。
 */

/** 没有 turn 信息时的兜底窗口。 */
export const FALLBACK_WINDOW_MS = 60_000

interface SessionRecord {
  /** 最近观测到的 turn 号；未观测到则 undefined。 */
  turn: number | undefined
  /** 该 turn 内是否已经用过贴纸。 */
  used: boolean
  /** 观测到的 turn 总数（诊断）。 */
  observed: number
  /** 最近一次使用时间戳。 */
  lastUsedAt: number
}

/** 每轮限额账本。 */
export interface TurnTracker {
  /** 观测到某会话进入某个 turn。 */
  setTurn(sessionId: string, turn: number): void
  /** 观测到某会话的 turn 关闭。 */
  closeTurn(sessionId: string, turn: number): void
  /** 当前 turn 号（未观测到则为 undefined）。 */
  turnOf(sessionId: string): number | undefined
  /** 本轮是否已用过（仅在观测到 turn 时有意义）。 */
  usedInCurrentTurn(sessionId: string): boolean
  /** 记一次使用。 */
  markUsed(sessionId: string): void
  /** 最近一次使用时间戳（0 = 从未）。 */
  lastUsedAt(sessionId: string): number
  /** 诊断快照。 */
  stats(): { sessions: number; turnsObserved: number }
}

/** 建账本。 */
export function createTurnTracker(): TurnTracker {
  const sessions = new Map<string, SessionRecord>()

  const ensure = (sessionId: string): SessionRecord => {
    const existing = sessions.get(sessionId)
    if (existing !== undefined) return existing
    const fresh: SessionRecord = { turn: undefined, used: false, observed: 0, lastUsedAt: 0 }
    sessions.set(sessionId, fresh)
    return fresh
  }

  return {
    setTurn(sessionId, turn) {
      const record = ensure(sessionId)
      if (record.turn !== turn) {
        record.turn = turn
        record.used = false
        record.observed += 1
      }
    },
    closeTurn(sessionId, turn) {
      const record = sessions.get(sessionId)
      if (record !== undefined && record.turn === turn) record.turn = turn
    },
    turnOf(sessionId) {
      return sessions.get(sessionId)?.turn
    },
    usedInCurrentTurn(sessionId) {
      return sessions.get(sessionId)?.used === true
    },
    markUsed(sessionId) {
      const record = ensure(sessionId)
      record.used = true
      record.lastUsedAt = Date.now()
    },
    lastUsedAt(sessionId) {
      return sessions.get(sessionId)?.lastUsedAt ?? 0
    },
    stats() {
      let observed = 0
      for (const record of sessions.values()) observed += record.observed
      return { sessions: sessions.size, turnsObserved: observed }
    },
  }
}
