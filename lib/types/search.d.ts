/**
 * dsh-memes-reply — 贴纸检索（纯函数，可单测）。
 *
 * 157 条素材不值得上向量库：中文语义名 + 标签 + 英文别名已经足够，模型给的关键词
 * 命中率很高，而且结果是**确定性**的（同分按索引顺序），便于测试与复现。
 */
import type { StickerTerm } from './types.js';
/** 一次命中的结果（`T` 保留调用方的完整条目类型：索引条目与客户端词表都能直接用）。 */
export interface SearchHit<T extends StickerTerm = StickerTerm> {
    entry: T;
    score: number;
}
/**
 * 把查询切成 token。
 *
 * 为什么需要中文字 token：模型会把 `mood` 传成**语境短语**（真实现场：
 * `"mood":"扒源码收工"`）。整串在 128 条关键词表里必然找不到，但它的**尾二字
 * 「收工」**是有意义的。所以对每个中文片段额外生成几个"切分基"：
 *   1. 剥掉句尾助词的形式（修好了 → 修好）；
 *   2. 去掉所有助词的形式（踩了坑 → 踩坑）；
 *   3. 原片段本身（长度 ≥3 时）。
 * 每个基再补上所有相邻二字组合与首/尾二字（句意通常落在尾巴上）。
 *
 * 短查询（≤2 字）行为**完全不变**——「点赞」「哭」这类精确查询不能被弄糊。
 */
export declare function tokenize(query: string): string[];
/** 一条贴纸对一组 token 的得分。 */
export declare function scoreEntry(entry: StickerTerm, tokens: readonly string[]): number;
/**
 * 检索 top-N。
 * @param entries - 候选贴纸（顺序即同分时的优先级）。
 * @param query - 模型/用户给的关键词。
 * @param limit - 最多返回几条候选。
 */
export declare function searchStickers<T extends StickerTerm>(entries: readonly T[], query: string, limit?: number): SearchHit<T>[];
