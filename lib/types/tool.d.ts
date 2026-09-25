/**
 * dsh-memes-reply — 模型工具 `use_sticker`（v2.0）。
 *
 * ## v2.0 里它是干什么的
 *
 * 贴纸**不再由这个工具渲染**：渲染是浏览器半边的会话流节点（`client/node.tsx`），
 * 它从会话日志里读这一次工具调用的实参（`id` 或 `mood`）来决定"模型挑的那张"。
 * 所以这个工具的职责收窄成三件：
 *   1. 校验模型的点名（id 存在、文件真的读得到），失败时给**可执行**的重试建议；
 *   2. 维护"人按过的开关"：会话静音、一次性指定（latch）、最近用过（冷却）；
 *   3. 回一句人话，告诉模型"已选定，不要再调用"。
 *
 * 每轮最多一张由**结构**保证：一轮只有一个节点、只认最后一次点名 —— 不再需要账本。
 */
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { StickerEntry, MemesConfig, PluginState } from './types.js';
import type { LoadedIndex } from './assets.js';
/** 工具返回值（同时是 output.schema 的形状）。 */
export interface StickerToolValue {
    ok: boolean;
    id?: string;
    name?: string;
    reason?: string;
    candidates?: string[];
    /** true = 关键词没匹配上，用了设置里的兜底贴纸。 */
    fallback?: boolean;
}
/** 工具依赖。 */
export interface ToolDeps {
    config: () => MemesConfig;
    index: () => LoadedIndex | undefined;
    state: {
        read: () => PluginState;
        write: (state: PluginState) => void;
    };
    /** 贴纸文件是否真实可读（决定能不能选定）。 */
    exists: (entry: StickerEntry) => Promise<boolean>;
}
/** 构建工具定义（host 侧注册）。 */
export declare function createStickerTool(deps: ToolDeps): ToolDefinition;
