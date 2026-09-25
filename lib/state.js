/**
 * dsh-memes-reply — 插件自有状态（`<DSH_HOME>/memes-reply/state.json`）。
 *
 * 只存"人按过开关"的东西：本会话静音、本会话形态覆盖、一次性指定、最近用过的贴纸
 * （冷却用）。损坏 / 缺失一律当空状态处理，绝不因为一个 json 坏掉而让插件起不来。
 * 这是插件自己的数据，用 node:fs 原子写；用户素材的字节一律走 ctx.fs（见 assets.ts）。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
/** 读状态；任何异常都退化成空状态。 */
export function loadState(file) {
    try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'));
        if (parsed === null || typeof parsed !== 'object')
            return emptyState();
        const sessions = parsed.sessions;
        if (sessions === null || typeof sessions !== 'object')
            return emptyState();
        const global = parsed.global;
        return {
            version: 1,
            sessions: sessions,
            global: global !== null && typeof global === 'object' ? global : {},
        };
    }
    catch {
        return emptyState();
    }
}
/** 空状态。 */
export function emptyState() {
    return { version: 1, sessions: {}, global: {} };
}
/** 原子写状态（同目录 tmp + rename）；写失败只记日志，不影响回复。 */
export function saveState(file, state) {
    try {
        mkdirSync(dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
        renameSync(tmp, file);
    }
    catch (error) {
        // 状态丢失只会让用户重按一次开关，不值得让整轮对话失败。
        console.error('[memes-reply] 写状态失败：', error);
    }
}
/** 取（必要时创建）一个会话的槽位。 */
export function sessionState(state, sessionId) {
    const existing = state.sessions[sessionId];
    if (existing !== undefined)
        return existing;
    const fresh = {};
    state.sessions[sessionId] = fresh;
    return fresh;
}
/**
 * 设置面板的"下一轮用这张"：写在全局槽位，因此不需要会话 id。
 * 传 null 表示取消。
 */
export function setGlobalLatch(state, id) {
    const global = state.global ?? {};
    if (id === null || id === '') {
        delete global.latch;
    }
    else {
        global.latch = id;
    }
    state.global = global;
    return global.latch ?? null;
}
/** 读全局指定（无则 null）。 */
export function globalLatch(state) {
    const id = state.global?.latch;
    return id === undefined || id === '' ? null : id;
}
/** 读常驻挂件的 UI 状态（位置、是否收成小圆点、当前那张）。 */
export function petState(state) {
    return state.global?.pet ?? {};
}
/** 合并写入常驻挂件状态；字段传 `undefined` 表示清掉。 */
export function setPetState(state, patch) {
    const global = state.global ?? {};
    const pet = { ...(global.pet ?? {}), ...patch };
    for (const key of Object.keys(pet)) {
        if (pet[key] === undefined)
            delete pet[key];
    }
    global.pet = pet;
    state.global = global;
    return pet;
}
/** 读 JEV 调试漂浮面板的 UI 状态（位置、是否收起）。 */
export function jevDebugState(state) {
    return state.global?.jevDebug ?? {};
}
/** 合并写入 JEV 调试漂浮面板状态；字段传 `undefined` 表示清掉。 */
export function setJevDebugState(state, patch) {
    const global = state.global ?? {};
    const panel = { ...(global.jevDebug ?? {}), ...patch };
    for (const key of Object.keys(panel)) {
        if (panel[key] === undefined)
            delete panel[key];
    }
    global.jevDebug = panel;
    state.global = global;
    return panel;
}
//# sourceMappingURL=state.js.map