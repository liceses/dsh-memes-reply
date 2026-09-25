/**
 * dsh-memes-reply — 素材索引加载与文件解析。
 *
 * 两条根：
 *  - `assetRoot`（默认 `<DSH_HOME>/memes-reply/assets`）——导入脚本产出的压缩副本；
 *  - `PACKAGED_ASSET_ROOT`（包内 `assets/`）——随包分发的兜底，assetRoot 缺失时用它。
 * `quality=original` 时优先去 `originalRoot` 找原图，找不到**静默回落**压缩副本，
 * 绝不让正文出现破图。
 *
 * 索引/状态用 node:fs（插件自有数据）；**贴纸字节一律走 ctx.fs**，让沙箱策略保持有效。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { FsInfo, FsTarget } from '@deepseek-ai/dsh-fs';
import type { MemesConfig, StickerEntry, StickerQuality } from './types.js';
/** 包内兜底素材目录（`lib/../assets`）。 */
export declare const PACKAGED_ASSET_ROOT: string;
/** 已加载的索引。 */
export interface LoadedIndex {
    /** 实际生效的索引文件路径。 */
    path: string;
    entries: StickerEntry[];
    byId: Map<string, StickerEntry>;
    format: string;
}
/** 生效的压缩副本目录。 */
export declare function effectiveAssetRoot(cfg: MemesConfig): string;
/**
 * 读取索引（按 mtime 缓存）。索引缺失或解析失败时返回 undefined，调用方据此给出
 * "请先跑导入脚本"的明确提示，而不是抛错。
 */
export declare function loadIndex(cfg: MemesConfig): LoadedIndex | undefined;
/** 解析结果：目标 + 元信息 + 实际用的画质。 */
export interface ResolvedSticker {
    target: FsTarget;
    info: FsInfo;
    quality: StickerQuality;
    /** 人可读的绝对路径（诊断用）。 */
    path: string;
}
/**
 * 找到一张贴纸的实际文件。
 * 顺序：原图（仅 quality=original 且配置了 originalRoot）→ assetRoot → 包内 assets。
 */
export declare function resolveStickerFile(ctx: Context, entry: StickerEntry, cfg: MemesConfig): Promise<ResolvedSticker | undefined>;
/**
 * 找到一张贴纸的**缩略图**（设置面板预览墙用）。
 * 顺序：`<assetRoot>/thumb/<thumb>` → 包内 `assets/thumb/<thumb>`。
 * 找不到就返回 undefined —— 面板会降级成名字 chip，而不是破图。
 */
export declare function resolveThumbFile(ctx: Context, entry: StickerEntry, cfg: MemesConfig): Promise<ResolvedSticker | undefined>;
