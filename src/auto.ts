/**
 * dsh-memes-reply — 自动贴纸（B-auto）：**不问模型也能贴**。
 *
 * 分工：
 *  - host 侧观察模型流（`llm/stream` 的 text-delta）攒下这一轮的助手文本，
 *    在 `agent/turn-stopping` 时按规则决定贴不贴、贴哪张；
 *  - 决定结果放进"待取位"，客户端（`conversation.input.dock` 上的一个小卡片）
 *    按 `seq` 轮询取走并渲染。
 *
 * 为什么不用 SSE：贴纸晚 1–3 秒出现完全可接受，而轮询省掉一整套连接管理
 * （心跳、重连、半开检测）。真需要"打字中"那种即时彩蛋时再上 SSE。
 *
 * 三条规则（互斥，取最克制的那条）：
 *  - `off`：不自动贴，只由模型调用工具决定；
 *  - `keyword`：这一轮的话里**整词命中**某个标签/别名才贴（默认）；
 *  - `every`：每 N 轮必贴一张（与语境无关，最确定）。
 *
 * 三道闸门（任一命中就不补）：模型这一轮已经贴过 / 本会话被 `/fish off` 静音 /
 * 命中的贴纸在最近用过列表里（与手动贴纸共享冷却）。
 */

import { AUTO_EVENT_TTL_MS, AUTO_KEYWORD_MIN_TERM_LEN, AUTO_TEXT_BUFFER_MAX } from './config.js'
import type { AutoEvent, AutoMode, StickerEntry } from './types.js'

/** 一次决定的结果。 */
export interface AutoPick {
  entry: StickerEntry
  reason: 'keyword' | 'every'
  matched: string
}

/**
 * 关键词模式：在**助手文本里扫已知词汇**，命中最具体（最长）的那个。
 *
 * 注意不能把整段文本当 query 丢给 `searchStickers`：中文长段落会被切成一堆二字组合，
 * 既慢又糊。这里反向扫——157 条 × 每个 8 个词，对 ≤8KB 文本做 includes，
 * 简单、确定、可测；只认长度 ≥2 的词，单字不参与（误命中太多）。
 */
export function pickByKeyword(
  entries: readonly StickerEntry[],
  text: string,
  avoid: ReadonlySet<string>,
): AutoPick | null {
  const haystack = text.toLowerCase()
  if (haystack.trim() === '') return null

  let best: { entry: StickerEntry; matched: string; score: number } | null = null
  for (const entry of entries) {
    if (avoid.has(entry.id)) continue
    let bestTerm = ''
    for (const raw of [entry.name, ...entry.tags, ...entry.aliases]) {
      const term = raw.trim().toLowerCase()
      if (term.length < AUTO_KEYWORD_MIN_TERM_LEN) continue
      if (!haystack.includes(term)) continue
      if (term.length > bestTerm.length) bestTerm = term
    }
    if (bestTerm === '') continue
    // 词越长越具体；同等长度下"标签命中"优先于"别名命中"。
    const score = bestTerm.length * 10 + (entry.tags.some((tag) => tag.toLowerCase() === bestTerm) ? 5 : 0)
    if (best === null || score > best.score) best = { entry, matched: bestTerm, score }
  }
  return best === null ? null : { entry: best.entry, reason: 'keyword', matched: best.matched }
}

/** 确定性哈希：同一个 (会话, 轮次) 永远选出同一张，便于复现与测试。 */
function hash(text: string): number {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

/** 「每 N 轮」模式：确定性挑一张没用过的。 */
export function pickEvery(
  entries: readonly StickerEntry[],
  sessionId: string,
  turn: number,
  avoid: ReadonlySet<string>,
): AutoPick | null {
  const pool = entries.filter((entry) => !avoid.has(entry.id))
  const candidates = pool.length > 0 ? pool : entries
  if (candidates.length === 0) return null
  const chosen = candidates[hash(`${sessionId}:${turn}`) % candidates.length]
  return chosen === undefined ? null : { entry: chosen, reason: 'every', matched: '' }
}

/** 规则入口：按模式决定贴不贴。 */
export function pickAutoSticker(input: {
  mode: AutoMode
  everyTurns: number
  sessionId: string
  turn: number
  text: string
  entries: readonly StickerEntry[]
  avoid: ReadonlySet<string>
}): AutoPick | null {
  if (input.mode === 'off') return null
  if (input.entries.length === 0) return null
  if (input.mode === 'keyword') return pickByKeyword(input.entries, input.text, input.avoid)
  // 间隔与轮次号都做兜底：宁可按 every 规则贴一张，也不要因为一个坏数字静默不贴
  // （真事故：turn 缺失 → `NaN % 1 !== 0` → every 模式永远不发布，而且完全没有报错）。
  const rawEvery = Math.trunc(Number(input.everyTurns))
  const every = Number.isFinite(rawEvery) && rawEvery >= 1 ? rawEvery : 1
  const rawTurn = Math.trunc(Number(input.turn))
  const turn = Number.isFinite(rawTurn) && rawTurn >= 1 ? rawTurn : 1
  if (turn % every !== 0) return null
  return pickEvery(input.entries, input.sessionId, turn, input.avoid)
}

/** 助手文本缓冲（只为扫关键词，所以有上限）。 */
export interface AutoTextBuffer {
  feed(sessionId: string, text: string): void
  take(sessionId: string): string
  size(): number
}

/** 建缓冲。 */
export function createAutoTextBuffer(): AutoTextBuffer {
  const buffers = new Map<string, string>()
  return {
    feed(sessionId, text) {
      if (text === '') return
      const next = `${buffers.get(sessionId) ?? ''}${text}`
      buffers.set(sessionId, next.length > AUTO_TEXT_BUFFER_MAX ? next.slice(-AUTO_TEXT_BUFFER_MAX) : next)
    },
    take(sessionId) {
      const value = buffers.get(sessionId) ?? ''
      buffers.delete(sessionId)
      return value
    },
    size() {
      return buffers.size
    },
  }
}

/**
 * 包一路模型流：边透传边把助手正文喂给缓冲。
 * 观察者语义 —— 绝不修改、绝不吞 chunk；扫描抛错时退化为纯透传。
 *
 * `onFinalStep` 只在**这一路流没有产生任何工具调用**时被调用一次：那说明这是本轮的
 * 最后一步（正文已完整），此刻就能决策并发布贴纸 —— 比 `agent/turn-stopping` 早，
 * 给客户端"事件先就位、渲染后跟上"留出时间窗。
 */
export async function* tapTextStream<T>(
  buffer: AutoTextBuffer,
  sessionId: string,
  source: AsyncIterable<T>,
  onFinalStep?: () => void,
): AsyncIterable<T> {
  let sawToolCall = false
  for await (const chunk of source) {
    try {
      const typed = chunk as { type?: unknown; text?: unknown; blockType?: unknown; block?: unknown } | null
      if (typed !== null && typeof typed === 'object') {
        if (typed.type === 'text-delta' && typeof typed.text === 'string') {
          buffer.feed(sessionId, typed.text)
        }
        // 三种都算"这一步调了工具"：完整块、流式增量、以及块起止标记。
        if (typed.type === 'tool-call' || typed.type === 'tool-call-delta' || typed.blockType === 'tool-call') {
          sawToolCall = true
        }
        const block = typed.block as { type?: unknown } | undefined
        if (block !== undefined && block.type === 'tool-call') sawToolCall = true
      }
    } catch {
      // 缓冲失败不影响模型流。
    }
    yield chunk
  }
  // 这一步没调工具 → 说明是本轮最后一步，正文已完整，可以提前决策并发布。
  if (!sawToolCall) {
    try {
      onFinalStep?.()
    } catch {
      // 决策失败绝不能影响模型流已经交付的内容。
    }
  }
}

/** 待取位：每个会话只保留最新一条事件，客户端按 seq 取。 */
export interface AutoBus {
  publish(event: Omit<AutoEvent, 'seq'>): AutoEvent
  /** 客户端轮询：`init=true` 时只同步游标、不回事件（避免开页就冒出旧贴纸）。 */
  pending(sessionId: string, since: number, init: boolean): { seq: number; event: AutoEvent | null }
  /** 最近发布的那一条（诊断：回答"贴纸到底是为哪一轮发的"）。 */
  last(): AutoEvent | null
  stats(): { published: number; sessions: number }
  reset(): void
}

/** 建待取位。 */
export function createAutoBus(now: () => number = Date.now): AutoBus {
  let seq = 0
  let published = 0
  let newest: AutoEvent | null = null
  const latest = new Map<string, AutoEvent>()

  return {
    publish(event) {
      seq += 1
      published += 1
      const full: AutoEvent = { ...event, seq }
      latest.set(event.sessionId, full)
      newest = full
      return full
    },
    pending(sessionId, since, init) {
      const event = latest.get(sessionId)
      if (event === undefined) return { seq, event: null }
      const fresh = now() - event.at <= AUTO_EVENT_TTL_MS
      // 客户端游标可能来自**上一个 host 进程**（重启不会让浏览器页面重载，而 seq 会归零）：
      // 那种情况下旧游标 ≥ 新 seq，事件会被永久过滤掉。把"超前"的游标夹回 0。
      const cursor = since > seq ? 0 : since
      if (init || !fresh || event.seq <= cursor) return { seq, event: null }
      return { seq, event }
    },
    last() {
      return newest
    },
    stats() {
      return { published, sessions: latest.size }
    },
    reset() {
      latest.clear()
      newest = null
    },
  }
}
