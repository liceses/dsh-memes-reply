/**
 * dsh-memes-reply — 诊断环形缓冲（host 与浏览器共用一份实现）。
 *
 * 为什么需要它：气泡贴纸这条链有四个环节（host 决策 → 待取位 → 客户端轮询 → 链式座位渲染），
 * 任何一环静默失败都表现为"什么都没出现"。而浏览器控制台我看不到，
 * 所以两端都把关键动作写进同一个环形缓冲，由 `/stats` 一次性读出。
 */
import type { TraceEntry } from './types.js';
/** 环形缓冲。 */
export interface Trace {
    /** 记一条（`at` 不给就取当前时间）。 */
    push(entry: Omit<TraceEntry, 'at'> & {
        at?: number;
    }): void;
    /** 最近的若干条（时间正序）。 */
    list(): TraceEntry[];
    /** 清空。 */
    reset(): void;
}
/** 建环形缓冲（`limit` 条，超出丢最旧的）。 */
export declare function createTrace(limit?: number, now?: () => number): Trace;
