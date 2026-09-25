/**
 * dsh-memes-reply — 贴纸检索（纯函数，可单测）。
 *
 * 157 条素材不值得上向量库：中文语义名 + 标签 + 英文别名已经足够，模型给的关键词
 * 命中率很高，而且结果是**确定性**的（同分按索引顺序），便于测试与复现。
 */
/** 中文查询里几乎不携带语义的句尾助词（「修好了」「收工啦」）。 */
const TRAILING_PARTICLES = /[了的啦呀啊吧嘛哦喔呢哈咯噢嘿着过]+$/u;
/** 夹在词中间的助词（「踩了坑」→「踩坑」）。只在生成额外切分基时用，不改原串。 */
const ANY_PARTICLES = /[了的啦呀啊吧嘛哦喔呢哈咯噢嘿着过]/gu;
/** 是否整串都是汉字（决定要不要做二字切分）。 */
function isCjk(text) {
    return /^[\u3400-\u9fff]+$/u.test(text);
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
export function tokenize(query) {
    const q = query.trim().toLowerCase();
    if (q === '')
        return [];
    const parts = q
        .split(/[\s,，、;；/|+()（）[\]{}"'`<>]+/u)
        .map((s) => s.trim())
        .filter((s) => s !== '');
    const out = new Set([q, ...parts]);
    for (const part of parts) {
        if (!isCjk(part))
            continue;
        const bases = new Set();
        const tailStripped = part.replace(TRAILING_PARTICLES, '');
        if (tailStripped.length >= 2)
            bases.add(tailStripped);
        const compact = part.replace(ANY_PARTICLES, '');
        if (compact.length >= 2)
            bases.add(compact);
        if (part.length >= 3)
            bases.add(part);
        for (const base of bases) {
            out.add(base);
            if (base.length >= 3) {
                for (let i = 0; i + 2 <= base.length; i++)
                    out.add(base.slice(i, i + 2));
            }
            out.add(base.slice(0, 2));
            out.add(base.slice(-2));
        }
    }
    return [...out];
}
/** 单字段匹配打分：完全相等 > 前缀 > 子串 > 反向包含。 */
function fieldScore(field, token) {
    const f = field.toLowerCase();
    if (f === token)
        return 10;
    if (f.startsWith(token))
        return 6;
    if (token.length >= 2 && f.includes(token))
        return 4;
    // 反向包含：查询词里含着字段。中文里很常见——用户说「哭了」「笑死」，
    // 而标签是「哭」「笑」。ASCII 字段要求够长，免得 joke 命中 ok 这种误伤。
    const isCjk = /[\u3400-\u9fff]/.test(f);
    if (token.includes(f) && (isCjk ? f.length >= 1 : f.length >= 3))
        return 3;
    return 0;
}
/** 一条贴纸对一组 token 的得分。 */
export function scoreEntry(entry, tokens) {
    const id = entry.id.toLowerCase();
    let total = 0;
    for (const token of tokens) {
        let best = id === token ? 40 : 0;
        best = Math.max(best, fieldScore(entry.name, token));
        best = Math.max(best, fieldScore(id, token));
        for (const tag of entry.tags)
            best = Math.max(best, fieldScore(tag, token));
        for (const alias of entry.aliases)
            best = Math.max(best, fieldScore(alias, token));
        total += best;
    }
    return total;
}
/**
 * 检索 top-N。
 * @param entries - 候选贴纸（顺序即同分时的优先级）。
 * @param query - 模型/用户给的关键词。
 * @param limit - 最多返回几条候选。
 */
export function searchStickers(entries, query, limit = 5) {
    const tokens = tokenize(query);
    if (tokens.length === 0)
        return [];
    const hits = [];
    for (const entry of entries) {
        const score = scoreEntry(entry, tokens);
        if (score > 0)
            hits.push({ entry, score });
    }
    hits.sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        // 同分时：名字更短的更"正统"（「思考」优先于「思考(认真地)」），
        // 名字等长则保持索引顺序，保证结果确定性。
        return a.entry.name.length - b.entry.name.length;
    });
    return hits.slice(0, Math.max(1, limit));
}
//# sourceMappingURL=search.js.map