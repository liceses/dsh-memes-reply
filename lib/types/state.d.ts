/**
 * dsh-memes-reply — 插件自有状态（`<DSH_HOME>/memes-reply/state.json`）。
 *
 * 只存"人按过开关"的东西：本会话静音、本会话形态覆盖、一次性指定、最近用过的贴纸
 * （冷却用）。损坏 / 缺失一律当空状态处理，绝不因为一个 json 坏掉而让插件起不来。
 * 这是插件自己的数据，用 node:fs 原子写；用户素材的字节一律走 ctx.fs（见 assets.ts）。
 */
import type { FloatPanelState, PetState, PluginState, SessionState } from './types.js';
/** 读状态；任何异常都退化成空状态。 */
export declare function loadState(file: string): PluginState;
/** 空状态。 */
export declare function emptyState(): PluginState;
/** 原子写状态（同目录 tmp + rename）；写失败只记日志，不影响回复。 */
export declare function saveState(file: string, state: PluginState): void;
/** 取（必要时创建）一个会话的槽位。 */
export declare function sessionState(state: PluginState, sessionId: string): SessionState;
/**
 * 设置面板的"下一轮用这张"：写在全局槽位，因此不需要会话 id。
 * 传 null 表示取消。
 */
export declare function setGlobalLatch(state: PluginState, id: string | null): string | null;
/** 读全局指定（无则 null）。 */
export declare function globalLatch(state: PluginState): string | null;
/** 读常驻挂件的 UI 状态（位置、是否收成小圆点、当前那张）。 */
export declare function petState(state: PluginState): PetState;
/** 合并写入常驻挂件状态；字段传 `undefined` 表示清掉。 */
export declare function setPetState(state: PluginState, patch: Partial<PetState>): PetState;
/** 读 JEV 调试漂浮面板的 UI 状态（位置、是否收起）。 */
export declare function jevDebugState(state: PluginState): FloatPanelState;
/** 合并写入 JEV 调试漂浮面板状态；字段传 `undefined` 表示清掉。 */
export declare function setJevDebugState(state: PluginState, patch: Partial<FloatPanelState>): FloatPanelState;
