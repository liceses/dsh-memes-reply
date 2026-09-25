/**
 * dsh-memes-reply — 贴纸规则（**纯逻辑**，host 与浏览器半边共用）。
 *
 * v2.0 起这里只剩"怎么选一张"：三条规则（off / keyword / every）与确定性哈希。
 * v1.0 的传输件（文本缓冲、llm/stream 观察者、待取位 `AutoBus`）已随"宿主发布 → 客户端轮询"
 * 那条链一起退役 —— 现在贴纸是会话事件的纯函数（见 `derive.ts` 与 `client/node.tsx`）。
 */
import type { AutoMode, StickerTerm } from './types.js';
/** 一次决定的结果。 */
export interface AutoPick {
    entry: StickerTerm;
    reason: 'keyword' | 'every';
    matched: string;
}
/**
 * 关键词模式：在**助手文本里扫已知词汇**，命中最具体（最长）的那个。
 *
 * 注意不能把整段文本当 query 丢给 `searchStickers`：中文长段落会被切成一堆二字组合，
 * 既慢又糊。这里反向扫——157 条 × 每个 8 个词，对 ≤8KB 文本做 includes，
 * 简单、确定、可测；只认长度 ≥2 的词，单字不参与（误命中太多）。
 */
export declare function pickByKeyword(entries: readonly StickerTerm[], text: string, avoid: ReadonlySet<string>): AutoPick | null;
/** 「每 N 轮」模式：确定性挑一张没用过的。 */
export declare function pickEvery(entries: readonly StickerTerm[], sessionId: string, turn: number, avoid: ReadonlySet<string>): AutoPick | null;
/** 规则入口：按模式决定贴不贴。 */
export declare function pickAutoSticker(input: {
    mode: AutoMode;
    everyTurns: number;
    sessionId: string;
    turn: number;
    text: string;
    entries: readonly StickerTerm[];
    avoid: ReadonlySet<string>;
}): AutoPick | null;
