/**
 * dsh-memes-reply — 设置 schema 与路径常量（host only）。
 *
 * 注意：这个文件 import 了 schemastery，所以**浏览器半边绝不能 import 它**。
 * 纯常量（默认值/字段序）在 `config.ts`，类型在 `types.ts`，client 只用那两个。
 */
import Schema from '@deepseek-ai/schemastery';
import type { Volatile } from '@deepseek-ai/cordis';
import { DEFAULT_CONFIG } from './config.js';
import type { MemesConfig } from './types.js';
export { DEFAULT_CONFIG };
/** 解析 DSH home（与 dsh-home-paths 同规则：先看 DSH_HOME，再退到 ~/.dsh）。 */
export declare function dshHome(): string;
/** 压缩副本的默认目录。 */
export declare function defaultAssetRoot(): string;
/** 插件自有状态文件（本会话静音、形态覆盖、最近用过的贴纸）。 */
export declare function stateFilePath(): string;
/**
 * 插件 Config（schemastery）。
 *
 * ## 0.1.7 起这个 schema 就是设置表单本身
 *
 * 旧版靠 `ctx.settings.register('dsh-memes-reply', MemesSettingsSchema, …)` 注册命名空间；
 * 0.1.7 的 `SettingsForms` **没有 `register()`**，表单改成从插件导出的 **`Config`** 投影，
 * 键是 **profile 条目 id**（本包 = `memes-reply`）。所以：
 *
 * - 导出名必须是 `Config`（第一方 `dsh-client-locale` / `dsh-agent-default-model` 同款）；
 * - 每个字段都要 `.volatile()`，因为 `dsh-settings` 的 `volatileForm()` **只挑
 *   volatile 字段**画进表单；没标的字段仍可读，但只能在 cordis 配置文件里改。
 *
 * ## `.volatile()` 的两条硬规则（照 `schemastery` 源码核对，不是猜的）
 *
 * - `Schema.prototype.extra()` **返回副本**，所以 `.volatile()` 必须**收集返回值**：
 *   一律写成链式 `.default(...).description(...).volatile()`。
 *   写成 `const f = Schema.boolean(); f.volatile()` 会把标记丢掉。
 * - volatile 字段必须落在固定对象路径、且不能嵌套在另一个 volatile 里
 *   （数组元素 / `inner` / 映射键会抛 `volatile fields require a fixed object path`）。
 */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    enabled: Schema<boolean, boolean, "volatile-defined">;
    quality: Schema<"compressed" | "original", "compressed" | "original", "volatile-defined">;
    assetRoot: Schema<string, string, "volatile-defined">;
    originalRoot: Schema<string, string, "volatile-defined">;
    cooldownTurns: Schema<number, number, "volatile-defined">;
    fallback: Schema<string, string, "volatile-defined">;
    autoMode: Schema<"off" | "keyword" | "every" | "jev", "off" | "keyword" | "every" | "jev", "volatile-defined">;
    autoEveryTurns: Schema<number, number, "volatile-defined">;
    jevModel: Schema<string, string, "volatile-defined">;
    jevTimeoutMs: Schema<number, number, "volatile-defined">;
    jevPersona: Schema<string, string, "volatile-defined">;
    jevDebugVisible: Schema<boolean, boolean, "volatile-defined">;
    petVisible: Schema<boolean, boolean, "volatile-defined">;
    petSize: Schema<number, number, "volatile-defined">;
    petCorner: Schema<"br" | "bl" | "tr" | "tl", "br" | "bl" | "tr" | "tl", "volatile-defined">;
    shape: Schema<"circle" | "rounded", "circle" | "rounded", "volatile-defined">;
    radius: Schema<number, number, "volatile-defined">;
    borderWidth: Schema<number, number, "volatile-defined">;
    borderStyle: Schema<"solid" | "dashed" | "none", "solid" | "dashed" | "none", "volatile-defined">;
    borderColor: Schema<string, string, "volatile-defined">;
    bubbleSize: Schema<number, number, "volatile-defined">;
    bubbleRise: Schema<number, number, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: Schema<boolean, boolean, "volatile-defined">;
    quality: Schema<"compressed" | "original", "compressed" | "original", "volatile-defined">;
    assetRoot: Schema<string, string, "volatile-defined">;
    originalRoot: Schema<string, string, "volatile-defined">;
    cooldownTurns: Schema<number, number, "volatile-defined">;
    fallback: Schema<string, string, "volatile-defined">;
    autoMode: Schema<"off" | "keyword" | "every" | "jev", "off" | "keyword" | "every" | "jev", "volatile-defined">;
    autoEveryTurns: Schema<number, number, "volatile-defined">;
    jevModel: Schema<string, string, "volatile-defined">;
    jevTimeoutMs: Schema<number, number, "volatile-defined">;
    jevPersona: Schema<string, string, "volatile-defined">;
    jevDebugVisible: Schema<boolean, boolean, "volatile-defined">;
    petVisible: Schema<boolean, boolean, "volatile-defined">;
    petSize: Schema<number, number, "volatile-defined">;
    petCorner: Schema<"br" | "bl" | "tr" | "tl", "br" | "bl" | "tr" | "tl", "volatile-defined">;
    shape: Schema<"circle" | "rounded", "circle" | "rounded", "volatile-defined">;
    radius: Schema<number, number, "volatile-defined">;
    borderWidth: Schema<number, number, "volatile-defined">;
    borderStyle: Schema<"solid" | "dashed" | "none", "solid" | "dashed" | "none", "volatile-defined">;
    borderColor: Schema<string, string, "volatile-defined">;
    bubbleSize: Schema<number, number, "volatile-defined">;
    bubbleRise: Schema<number, number, "volatile-defined">;
}>>, "plain">;
/**
 * 解析后的配置形状：**每个字段都是活引用**，读值要 `.get()`。
 *
 * volatile 字段在 `Schema.resolve` 里被 `createVolatile()` 包成 `Volatile<T>`，
 * 而 loader 的 `_commitVolatile` 会把新值**提交进同一个引用** —— 插件不重挂就能看到新值。
 */
export type LiveConfig = {
    readonly [K in keyof MemesConfig]: Volatile<MemesConfig[K]>;
};
/**
 * 把活配置解成一份**普通值快照**（每次都取最新值并补默认值）。
 *
 * 这样下游（路由 / 工具 / 命令 / 提示词）完全不必知道自己拿到的是不是 `Volatile`，
 * 与 0.1.5 时代的 `scope.get()` 语义逐字一致。
 *
 * @param live - `apply(ctx, config)` 收到的活配置。
 * @returns 合并了默认值的普通配置。
 */
export declare function resolveLive(live: LiveConfig): MemesConfig;
/** 把设置面板读到的原始值补成完整配置。 */
export declare function resolveConfig(raw: unknown): MemesConfig;
