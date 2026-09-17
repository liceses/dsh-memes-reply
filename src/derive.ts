/**
 * dsh-memes-reply — 贴纸派生（host 与浏览器半边**共用同一套纯逻辑**）。
 *
 * v2.0 的架构决定：贴纸不再是"宿主发事件、客户端轮询取走"的推送物，而是
 * **会话事件的纯函数**——同一个 `(会话, 轮次, 收尾正文, 模型工具调用, 宿主开关)`
 * 永远推出同一张。这样刷新即重放，不需要任何持久化绑定（见 docs/需求与方案-v2.0 §3.3）。
 *
 * 本文件刻意不碰 fs / cordis / DOM：两边都能打包（客户端 bundle 的纯净门禁盯着 require）。
 */

import { pickAutoSticker } from './auto.js'
import { searchStickers } from './search.js'
import type { AutoMode, StickerTerm } from './types.js'

/**
 * 生成中占位表情的池子。
 *
 * 只用素材里"自带文字语义"的那几张：`sikao`（正在思考）、`dazi`（打字 普通），
 * 以及真人有情绪时的变体。第一个是默认；按 `(会话, 轮次)` 确定性轮换。
 */
export const THINKING_IDS: readonly string[] = ['sikao', 'dazi', 'sikao-renzhen', 'dazi-shengqi', 'sikao-zixin']

/** 贴纸出现的原因（诊断与提示文案都用它）。 */
export type StickerReason = 'latch' | 'model' | 'keyword' | 'every' | 'fallback' | 'thinking'

/** 一次派生结果。 */
export interface StickerChoice {
  /** 贴纸 id。 */
  id: string
  /** 中文语义名（提示文案用）。 */
  name: string
  /** 全尺寸动画 URL。 */
  url: string
  reason: StickerReason
  /** 命中的词（reason=keyword 时）。 */
  matched: string
}

/** 客户端词表/宿主索引都能提供的形状：检索字段 + 全尺寸 URL。 */
export interface ChoiceTerm extends StickerTerm {
  url: string
}

/** FNV-1a：与 `auto.ts` 的哈希同款，保证两端"到点了"选同一张。 */
export function hashText(text: string): number {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

/** 从词表里按 id 取一张。 */
export function termOf(entries: readonly ChoiceTerm[], id: string | null | undefined): ChoiceTerm | undefined {
  if (id === null || id === undefined || id === '') return undefined
  return entries.find((entry) => entry.id === id)
}

/**
 * 生成中的占位表情：按 `(会话, 轮次)` 确定性轮换。
 *
 * 确定性是刻意的 —— 同一个回合反复渲染（滚动、刷新、重放）必须得到同一张，
 * 否则"刷新即重放"这条需求会被一个随机数毁掉。
 */
export function thinkingStickerFor(
  entries: readonly ChoiceTerm[],
  sessionId: string,
  turn: number,
): StickerChoice | null {
  const pool = THINKING_IDS.map((id) => termOf(entries, id)).filter((entry): entry is ChoiceTerm => entry !== undefined)
  const candidates = pool.length > 0 ? pool : entries
  if (candidates.length === 0) return null
  const chosen = candidates[hashText(`${sessionId}:thinking:${turn}`) % candidates.length]
  if (chosen === undefined) return null
  return { id: chosen.id, name: chosen.name, url: chosen.url, reason: 'thinking', matched: '' }
}

/** 落定那张的派生输入。 */
export interface FinalChoiceInput {
  entries: readonly ChoiceTerm[]
  sessionId: string
  turn: number
  /** 这一轮的收尾正文（keyword 模式扫它）。 */
  text: string
  /** 模型自己点名的 id（`use_sticker` 实参里的 `id`）。 */
  modelId?: string | null
  /** 模型给的关键词（`use_sticker` 实参里的 `mood`）—— 客户端用与宿主同一套检索解出 id。 */
  modelMood?: string | null
  /** 设置：自动模式与间隔。 */
  mode: AutoMode
  everyTurns: number
  /** 兜底贴纸 id（空 = 不兜底）。 */
  fallbackId?: string | null
  /** 一次性指定（面板/会话指定）；用掉即清——**清除由调用方负责**。 */
  latchId?: string | null
  /** 最近用过（冷却）。 */
  avoid?: ReadonlySet<string>
}

/** 一次落定派生：优先级 = 一次性指定 > 模型点名（id 或关键词）> 规则（keyword/every）> 兜底。 */
export function finalStickerFor(input: FinalChoiceInput): StickerChoice | null {
  const latched = termOf(input.entries, input.latchId)
  if (latched !== undefined) {
    return { id: latched.id, name: latched.name, url: latched.url, reason: 'latch', matched: '' }
  }
  const modeled = termOf(input.entries, input.modelId)
  if (modeled !== undefined) {
    return { id: modeled.id, name: modeled.name, url: modeled.url, reason: 'model', matched: '' }
  }
  // 模型只给了关键词：用与宿主工具**同一套**检索解出 id（同一份词表、同一个算法 → 结论一致）。
  const mood = (input.modelMood ?? '').trim()
  if (mood !== '') {
    const hit = searchStickers(input.entries, mood, 1)[0]
    if (hit !== undefined) {
      return { id: hit.entry.id, name: hit.entry.name, url: hit.entry.url, reason: 'model', matched: mood }
    }
  }
  const picked = pickAutoSticker({
    mode: input.mode,
    everyTurns: input.everyTurns,
    sessionId: input.sessionId,
    turn: input.turn,
    text: input.text,
    entries: input.entries,
    avoid: input.avoid ?? new Set<string>(),
  })
  if (picked !== null) {
    const entry = termOf(input.entries, picked.entry.id)
    if (entry !== undefined) {
      return { id: entry.id, name: entry.name, url: entry.url, reason: picked.reason, matched: picked.matched }
    }
  }
  const fallback = termOf(input.entries, input.fallbackId)
  if (fallback !== undefined) {
    return { id: fallback.id, name: fallback.name, url: fallback.url, reason: 'fallback', matched: '' }
  }
  return null
}

/** 原因 → 人话（提示文案）。 */
export function reasonText(choice: StickerChoice): string {
  switch (choice.reason) {
    case 'latch':
      return '你点的那张'
    case 'model':
      return choice.matched === '' ? '模型挑的' : `模型点名「${choice.matched}」`
    case 'keyword':
      return choice.matched === '' ? '命中语境' : `命中「${choice.matched}」`
    case 'every':
      return '到点了'
    case 'fallback':
      return '兜底那张'
    case 'thinking':
      return '生成中'
  }
}
