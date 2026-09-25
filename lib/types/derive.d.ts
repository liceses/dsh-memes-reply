/**
 * dsh-memes-reply — 贴纸派生（host 与浏览器半边**共用同一套纯逻辑**）。
 *
 * v2.0 的架构决定：贴纸不再是"宿主发事件、客户端轮询取走"的推送物，而是
 * **会话事件的纯函数**——同一个 `(会话, 轮次, 收尾正文, 模型工具调用, 宿主开关)`
 * 永远推出同一张。这样刷新即重放，不需要任何持久化绑定（见 docs/需求与方案-v2.0 §3.3）。
 *
 * 本文件刻意不碰 fs / cordis / DOM：两边都能打包（客户端 bundle 的纯净门禁盯着 require）。
 */
import type { AutoMode, StickerTerm } from './types.js';
/**
 * 生成中占位表情的池子。
 *
 * 只用素材里"自带文字语义"的那几张：`sikao`（正在思考）、`dazi`（打字 普通），
 * 以及真人有情绪时的变体。第一个是默认；按 `(会话, 轮次)` 确定性轮换。
 */
export declare const THINKING_IDS: readonly string[];
/** 贴纸出现的原因（诊断与提示文案都用它）。 */
export type StickerReason = 'latch' | 'jev' | 'model' | 'keyword' | 'every' | 'fallback' | 'thinking';
/** 一次派生结果。 */
export interface StickerChoice {
    /** 贴纸 id。 */
    id: string;
    /** 中文语义名（提示文案用）。 */
    name: string;
    /** 全尺寸动画 URL。 */
    url: string;
    reason: StickerReason;
    /** 命中的词（reason=keyword 时）。 */
    matched: string;
}
/** 客户端词表/宿主索引都能提供的形状：检索字段 + 全尺寸 URL。 */
export interface ChoiceTerm extends StickerTerm {
    url: string;
}
/** FNV-1a：与 `auto.ts` 的哈希同款，保证两端"到点了"选同一张。 */
export declare function hashText(text: string): number;
/** 从词表里按 id 取一张。 */
export declare function termOf(entries: readonly ChoiceTerm[], id: string | null | undefined): ChoiceTerm | undefined;
/**
 * 生成中的占位表情：按 `(会话, 轮次)` 确定性轮换。
 *
 * 确定性是刻意的 —— 同一个回合反复渲染（滚动、刷新、重放）必须得到同一张，
 * 否则"刷新即重放"这条需求会被一个随机数毁掉。
 */
export declare function thinkingStickerFor(entries: readonly ChoiceTerm[], sessionId: string, turn: number): StickerChoice | null;
/** 落定那张的派生输入。 */
export interface FinalChoiceInput {
    entries: readonly ChoiceTerm[];
    sessionId: string;
    turn: number;
    /** 这一轮的收尾正文（keyword 模式扫它）。 */
    text: string;
    /** 模型自己点名的 id（`use_sticker` 实参里的 `id`）。 */
    modelId?: string | null;
    /**
     * 宿主问过 JEV 之后定下的 id（`/jev-pick` 的结论，按 (会话,轮次) 缓存过）。
     *
     * 优先级刻意排在 `latch` 之后、模型点名之前：人手动点的最大，其次才是"这轮语境算出的一张"，
     * 再其次才是模型在正文里自己点的。
     */
    jevId?: string | null;
    /** 模型给的关键词（`use_sticker` 实参里的 `mood`）—— 客户端用与宿主同一套检索解出 id。 */
    modelMood?: string | null;
    /** 设置：自动模式与间隔。 */
    mode: AutoMode;
    everyTurns: number;
    /** 兜底贴纸 id（空 = 不兜底）。 */
    fallbackId?: string | null;
    /** 一次性指定（面板/会话指定）；用掉即清——**清除由调用方负责**。 */
    latchId?: string | null;
    /** 最近用过（冷却）。 */
    avoid?: ReadonlySet<string>;
}
/** 一次落定派生：优先级 = 一次性指定 > JEV 结论 > 模型点名（id 或关键词）> 规则（keyword/every）> 兜底。 */
export declare function finalStickerFor(input: FinalChoiceInput): StickerChoice | null;
/** 原因 → 人话（提示文案）。 */
export declare function reasonText(choice: StickerChoice): string;
