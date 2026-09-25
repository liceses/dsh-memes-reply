/**
 * dsh-memes-reply — 设置 schema 与路径常量（host only）。
 *
 * 注意：这个文件 import 了 schemastery，所以**浏览器半边绝不能 import 它**。
 * 纯常量（默认值/字段序）在 `config.ts`，类型在 `types.ts`，client 只用那两个。
 */
import Schema from '@deepseek-ai/schemastery';
import { DEFAULT_CONFIG } from './config.js';
import type { MemesConfig } from './types.js';
export { DEFAULT_CONFIG };
/** 解析 DSH home（与 dsh-home-paths 同规则：先看 DSH_HOME，再退到 ~/.dsh）。 */
export declare function dshHome(): string;
/** 压缩副本的默认目录。 */
export declare function defaultAssetRoot(): string;
/** 插件自有状态文件（本会话静音、形态覆盖、最近用过的贴纸）。 */
export declare function stateFilePath(): string;
/** 设置面板 schema（schemastery）。 */
export declare const MemesSettingsSchema: Schema<Schemastery.ObjectS<{
    enabled: Schema<boolean, boolean>;
    quality: Schema<"compressed" | "original", "compressed" | "original">;
    assetRoot: Schema<string, string>;
    originalRoot: Schema<string, string>;
    cooldownTurns: Schema<number, number>;
    fallback: Schema<string, string>;
    autoMode: Schema<"off" | "keyword" | "every" | "jev", "off" | "keyword" | "every" | "jev">;
    autoEveryTurns: Schema<number, number>;
    jevModel: Schema<string, string>;
    jevTimeoutMs: Schema<number, number>;
    jevPersona: Schema<string, string>;
    jevDebugVisible: Schema<boolean, boolean>;
    petVisible: Schema<boolean, boolean>;
    petSize: Schema<number, number>;
    petCorner: Schema<"br" | "bl" | "tr" | "tl", "br" | "bl" | "tr" | "tl">;
    shape: Schema<"circle" | "rounded", "circle" | "rounded">;
    radius: Schema<number, number>;
    borderWidth: Schema<number, number>;
    borderStyle: Schema<"solid" | "dashed" | "none", "solid" | "dashed" | "none">;
    borderColor: Schema<string, string>;
    bubbleSize: Schema<number, number>;
    bubbleRise: Schema<number, number>;
}>, Schemastery.ObjectT<{
    enabled: Schema<boolean, boolean>;
    quality: Schema<"compressed" | "original", "compressed" | "original">;
    assetRoot: Schema<string, string>;
    originalRoot: Schema<string, string>;
    cooldownTurns: Schema<number, number>;
    fallback: Schema<string, string>;
    autoMode: Schema<"off" | "keyword" | "every" | "jev", "off" | "keyword" | "every" | "jev">;
    autoEveryTurns: Schema<number, number>;
    jevModel: Schema<string, string>;
    jevTimeoutMs: Schema<number, number>;
    jevPersona: Schema<string, string>;
    jevDebugVisible: Schema<boolean, boolean>;
    petVisible: Schema<boolean, boolean>;
    petSize: Schema<number, number>;
    petCorner: Schema<"br" | "bl" | "tr" | "tl", "br" | "bl" | "tr" | "tl">;
    shape: Schema<"circle" | "rounded", "circle" | "rounded">;
    radius: Schema<number, number>;
    borderWidth: Schema<number, number>;
    borderStyle: Schema<"solid" | "dashed" | "none", "solid" | "dashed" | "none">;
    borderColor: Schema<string, string>;
    bubbleSize: Schema<number, number>;
    bubbleRise: Schema<number, number>;
}>>;
/** 把设置面板读到的原始值补成完整配置。 */
export declare function resolveConfig(raw: unknown): MemesConfig;
