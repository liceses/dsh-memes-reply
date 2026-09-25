/**
 * dsh-memes-reply — 诊断环形缓冲（host 与浏览器共用一份实现）。
 *
 * 为什么需要它：气泡贴纸这条链有四个环节（host 决策 → 待取位 → 客户端轮询 → 链式座位渲染），
 * 任何一环静默失败都表现为"什么都没出现"。而浏览器控制台我看不到，
 * 所以两端都把关键动作写进同一个环形缓冲，由 `/stats` 一次性读出。
 */
/** 建环形缓冲（`limit` 条，超出丢最旧的）。 */
export function createTrace(limit = 48, now = Date.now) {
    const ring = [];
    return {
        push(entry) {
            ring.push({ at: entry.at ?? now(), ...entry });
            while (ring.length > limit)
                ring.shift();
        },
        list() {
            return [...ring];
        },
        reset() {
            ring.length = 0;
        },
    };
}
//# sourceMappingURL=trace.js.map