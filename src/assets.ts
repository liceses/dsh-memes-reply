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

import type { Context } from '@deepseek-ai/cordis'
import type { FsInfo, FsTarget } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-fs'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultAssetRoot } from './schema.js'
import { thumbFileOf } from './protocol.js'
import type { MemesConfig, StickerEntry, StickerIndex, StickerQuality } from './types.js'

/** 包内兜底素材目录（`lib/../assets`）。 */
export const PACKAGED_ASSET_ROOT: string = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

/** 已加载的索引。 */
export interface LoadedIndex {
  /** 实际生效的索引文件路径。 */
  path: string
  entries: StickerEntry[]
  byId: Map<string, StickerEntry>
  format: string
}

interface CacheEntry extends LoadedIndex {
  mtimeMs: number
}

const cache = new Map<string, CacheEntry>()

/** 生效的压缩副本目录。 */
export function effectiveAssetRoot(cfg: MemesConfig): string {
  return cfg.assetRoot !== '' ? cfg.assetRoot : defaultAssetRoot()
}

/** 索引候选路径（按优先级）。 */
function indexCandidates(cfg: MemesConfig): string[] {
  const roots = [effectiveAssetRoot(cfg), PACKAGED_ASSET_ROOT]
  return [...new Set(roots)].map((root) => join(root, 'index.json'))
}

/**
 * 读取索引（按 mtime 缓存）。索引缺失或解析失败时返回 undefined，调用方据此给出
 * "请先跑导入脚本"的明确提示，而不是抛错。
 */
export function loadIndex(cfg: MemesConfig): LoadedIndex | undefined {
  for (const path of indexCandidates(cfg)) {
    let mtimeMs = 0
    try {
      mtimeMs = statSync(path).mtimeMs
    } catch {
      continue
    }
    const hit = cache.get(path)
    if (hit !== undefined && hit.mtimeMs === mtimeMs) return hit
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as StickerIndex
      const entries = Array.isArray(parsed.sticker) ? parsed.sticker : []
      const loaded: CacheEntry = {
        path,
        mtimeMs,
        entries,
        byId: new Map(entries.map((entry) => [entry.id, entry])),
        format: typeof parsed.format === 'string' ? parsed.format : 'gif',
      }
      cache.set(path, loaded)
      return loaded
    } catch (error) {
      console.error(`[memes-reply] 解析索引失败 ${path}：`, error)
    }
  }
  return undefined
}

/** 解析结果：目标 + 元信息 + 实际用的画质。 */
export interface ResolvedSticker {
  target: FsTarget
  info: FsInfo
  quality: StickerQuality
  /** 人可读的绝对路径（诊断用）。 */
  path: string
}

/**
 * 找到一张贴纸的实际文件。
 * 顺序：原图（仅 quality=original 且配置了 originalRoot）→ assetRoot → 包内 assets。
 */
export async function resolveStickerFile(
  ctx: Context,
  entry: StickerEntry,
  cfg: MemesConfig,
): Promise<ResolvedSticker | undefined> {
  const fs = ctx.get('fs')
  if (fs === undefined) return undefined

  const candidates: Array<{ file: string; quality: StickerQuality; root: string }> = []
  if (cfg.quality === 'original' && cfg.originalRoot !== '') {
    candidates.push({ file: entry.source, quality: 'original', root: cfg.originalRoot })
  }
  const assetRoot = effectiveAssetRoot(cfg)
  candidates.push({ file: entry.file, quality: 'compressed', root: assetRoot })
  if (assetRoot !== PACKAGED_ASSET_ROOT) {
    candidates.push({ file: entry.file, quality: 'compressed', root: PACKAGED_ASSET_ROOT })
  }

  for (const candidate of candidates) {
    const path = join(candidate.root, candidate.file)
    try {
      const target = await fs.resolve(path)
      const info = await fs.stat(target)
      if (info !== undefined && info.type === 'file') {
        return { target, info, quality: candidate.quality, path }
      }
    } catch {
      // 这个候选不可用（越界/权限/不存在）：继续下一个。
    }
  }
  return undefined
}

/**
 * 找到一张贴纸的**缩略图**（设置面板预览墙用）。
 * 顺序：`<assetRoot>/thumb/<thumb>` → 包内 `assets/thumb/<thumb>`。
 * 找不到就返回 undefined —— 面板会降级成名字 chip，而不是破图。
 */
export async function resolveThumbFile(
  ctx: Context,
  entry: StickerEntry,
  cfg: MemesConfig,
): Promise<ResolvedSticker | undefined> {
  const fs = ctx.get('fs')
  if (fs === undefined) return undefined
  const file = thumbFileOf(entry)

  const roots = [join(effectiveAssetRoot(cfg), 'thumb')]
  if (effectiveAssetRoot(cfg) !== PACKAGED_ASSET_ROOT) roots.push(join(PACKAGED_ASSET_ROOT, 'thumb'))

  for (const root of roots) {
    const path = join(root, file)
    try {
      const target = await fs.resolve(path)
      const info = await fs.stat(target)
      if (info !== undefined && info.type === 'file') {
        return { target, info, quality: 'compressed', path }
      }
    } catch {
      // 继续下一个候选。
    }
  }
  return undefined
}
