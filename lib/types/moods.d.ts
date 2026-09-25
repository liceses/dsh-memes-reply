/**
 * dsh-memes-reply — 情绪族表（**纯数据**，host 侧使用）。
 *
 * 为什么要有"族"这一层：JEV 对**窄候选集**的判断明显更可靠，实测
 * （`D:\developing\ai\JEV\meme-router`，2026-09-20）：
 *
 * | 问法 | 延迟 | 成本/轮 | 选中项 margin |
 * |---|---|---|---|
 * | 只问 13 族，族内由代码挑 | 1.3 s | $0.00005 | 0.30（族级，语义正确） |
 * | 族 → 具体张（两次调用） | 3.5 s | $0.0001 | 0.72 |
 * | 157 张直选（一次调用） | 1.0 s | $0.00022 | **0.02（糊）** |
 *
 * 结论：**语义判断留在"族"这一层，族内选哪张交回代码**（去重、变化、确定性都由代码保证）。
 * 这正是 JEV 文档的纪律——精确规则与算术用代码，Jev 只做判断。
 *
 * 族成员是**人工整理**的（157 张里 152 张归入 13 族，剩 5 张不收）。
 * 未收录的 id 不会消失：它们仍可被 `keyword` 模式、模型点名、`latch` 选中，
 * 只是不作为 JEV 的候选出现。`test/jev.test.mjs` 有一条回归盯着"表里的 id 必须真实存在"。
 */
/** 一族贴纸。 */
export interface MoodFamily {
    /** JEV choice 的 label（ASCII，稳定，改了这个就是改协议）。 */
    key: string;
    /** 中文族名（提示文案与诊断用）。 */
    label: string;
    /** 给 JEV 看的语义说明（写清"什么语气算这一族"）。 */
    gloss: string;
    /** 族内贴纸 id（必须存在于 index.json）。 */
    members: readonly string[];
}
/**
 * "没有情绪可贴"这一族。
 *
 * 它是**唯一允许 JEV 说"不贴"的出口**：纯技术输出（贴一行日志、贴个表格）时选它，
 * 于是"每轮必有鱼"不再是唯一选项。它不是贴纸，不会出现在族成员里。
 */
export declare const MOOD_BLANK = "blank";
/** 13 个情绪族 + blank。顺序即诊断展示顺序。 */
export declare const MOOD_FAMILIES: readonly MoodFamily[];
/** 按 key 取一族。 */
export declare function familyOf(key: string | null | undefined): MoodFamily | undefined;
/** JEV choice 的 criteria：`{familyKey: gloss}` + blank。 */
export declare function familyCriteria(): Record<string, string>;
/**
 * 所有族成员（去重后），用于回归校验"表里的 id 真实存在"。
 * 同一个 id 被写进两族时这里发现不了，交给测试里的显式查重。
 */
export declare function allFamilyMembers(): string[];
