/**
 * dsh-memes-reply — 贴纸规则（**纯逻辑**，host 与浏览器半边共用）。
 *
 * v2.0 起这里只剩"怎么选一张"：三条规则（off / keyword / every）与确定性哈希。
 * v1.0 的传输件（文本缓冲、llm/stream 观察者、待取位 `AutoBus`）已随"宿主发布 → 客户端轮询"
 * 那条链一起退役 —— 现在贴纸是会话事件的纯函数（见 `derive.ts` 与 `client/node.tsx`）。
 */

import { AUTO_KEYWORD_MIN_TERM_LEN } from './config.js'
import type { AutoMode, StickerTerm } from './types.js'

/** 一次决定的结果。 */
export interface AutoPick {
  entry: StickerTerm
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
  entries: readonly StickerTerm[],
  text: string,
  avoid: ReadonlySet<string>,
): AutoPick | null {
  const haystack = text.toLowerCase()
  if (haystack.trim() === '') return null

  let best: { entry: StickerTerm; matched: string; score: number } | null = null
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
  entries: readonly StickerTerm[],
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
  entries: readonly StickerTerm[]
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
