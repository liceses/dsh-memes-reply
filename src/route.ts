/**
 * dsh-memes-reply — HTTP 路由（host）。
 *
 * 一条前缀路由管五件事：
 *   GET/HEAD /api/dsh-memes-reply/sticker/<id>.<ext>   贴纸字节（全尺寸动画）
 *   GET/HEAD /api/dsh-memes-reply/thumb/<id>.<ext>     缩略图字节（设置面板预览墙）
 *   GET      /api/dsh-memes-reply/catalog              素材清单（预览墙数据）
 *   GET/POST /api/dsh-memes-reply/latch                「下一轮用这张」读写
 *   GET      /api/dsh-memes-reply/stats                诊断 / 面板状态行
 *
 * 为什么不让浏览器的 `<img>` 走官方的 `/api/file`：那条通道是 `no-store`、无 Range、
 * 且有连接服务鉴权；自建路由可以给 `immutable` 缓存 + ETag，让几百 KB 的贴纸也只在
 * 首次下载。仅接受回环 Host，且不发任何 CORS 头（与 dsh-showme-html 同款围栏）。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { effectiveAssetRoot, loadIndex, resolveStickerFile, resolveThumbFile, type LoadedIndex, type ResolvedSticker } from './assets.js'
import { CATALOG_DEFAULT_LIMIT, CATALOG_MAX_LIMIT } from './config.js'
import {
  AUTO_PENDING_PATH,
  CATALOG_PATH,
  DEBUG_PATH,
  LATCH_PATH,
  MAX_STICKER_BYTES,
  MIME,
  PET_PATH,
  ROUTE_PREFIX,
  STATS_PATH,
  STICKER_ID_RE,
  STICKER_PATH,
  THUMB_PATH,
  extensionOf,
  stickerUrl,
  thumbUrl,
} from './protocol.js'
import { searchStickers } from './search.js'
import { globalLatch, petState, setGlobalLatch, setPetState } from './state.js'
import type { CatalogItem, MemesConfig, PetState, PluginState, TraceEntry } from './types.js'

/** 缩略图读取上限（真缩略图只有几十 KB，给足余量即可）。 */
const MAX_THUMB_BYTES = 1024 * 1024

/** POST /latch 的请求体上限。 */
const MAX_LATCH_BODY = 4096

/** 运行计数（诊断端点用）。 */
export interface StickerStats {
  /** 成功返回的贴纸字节数。 */
  served: number
  /** 未命中（未知 id / 文件缺失 / 索引缺失）。 */
  miss: number
  /** 被回环围栏挡掉的请求。 */
  denied: number
  /** 最近一次成功服务的 id。 */
  lastId: string
  /** 最近一次成功服务的时间戳。 */
  lastAt: number
}

/** 建计数器。 */
export function createStats(): StickerStats {
  return { served: 0, miss: 0, denied: 0, lastId: '', lastAt: 0 }
}

/** 路由依赖。 */
export interface RouteDeps {
  ctx: Context
  /** 当前配置（每次请求重新读，设置面板改完即时生效）。 */
  config: () => MemesConfig
  stats: StickerStats
  /** 浏览器当前使用的 origin（用于把绝对 URL 拼好交给面板）。 */
  origin: () => string
  /** 从请求 Host 头学习真实 origin。 */
  observeOrigin: (origin: string) => void
  /** 插件自有状态（面板的"下一轮用这张"写这里）。 */
  state: { read: () => PluginState; write: (next: PluginState) => void }
  /** 自动贴纸待取位（客户端轮询取走）与最近一条（诊断）。 */
  auto: {
    pending: (sessionId: string, since: number, init: boolean) => { seq: number; event: unknown }
    last: () => unknown
  }
  /** 诊断环形缓冲（host 决策 + 客户端回执）。 */
  trace: { push: (entry: Omit<TraceEntry, 'at'> & { at?: number }) => void; list: () => TraceEntry[] }
}

/** 只服务回环请求：远程主机打不到，DNS rebinding 也进不来。 */
function isLoopback(req: IncomingMessage): boolean {
  const host = String(req.headers.host ?? '')
  const name = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0]
  return name === '127.0.0.1' || name === 'localhost' || name === '::1'
}

/** 统一 JSON 响应（诊断与错误都用它，正文里永远不会出现 HTML）。 */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(body)),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/** 确定性洗牌：同 seed 同结果，`换一批` 只是把 seed 加一。 */
function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  let state = (Math.floor(seed) * 2654435761) >>> 0
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const a = out[i]
    const b = out[j]
    out[i] = b
    out[j] = a
  }
  return out
}

/** 夹取一个查询参数。 */
function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/** 读一个小请求体（超限直接掐掉）。 */
async function readBody(req: IncomingMessage, limit: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      raw += chunk
      if (raw.length > limit) {
        req.destroy()
        resolve(undefined)
      }
    })
    req.on('end', () => resolve(raw))
    req.on('error', () => resolve(undefined))
  })
}

/** 发送一份图片字节（带 ETag / immutable / 304）。等写完才 resolve，便于测试与诊断。 */
async function sendBytes(
  req: IncomingMessage,
  res: ServerResponse,
  resolved: ResolvedSticker,
  etag: string,
  file: string,
  maxBytes: number,
  onServed: () => void,
  ctx: Context,
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': MIME[extensionOf(file)] ?? 'application/octet-stream',
    ETag: etag,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  }

  if (String(req.headers['if-none-match'] ?? '') === etag) {
    res.writeHead(304, headers)
    res.end()
    return
  }

  try {
    const bytes = await ctx.get('fs')!.readBytes(resolved.target, undefined, maxBytes)
    headers['Content-Length'] = String(bytes.byteLength)
    res.writeHead(200, headers)
    onServed()
    if ((req.method ?? 'GET') === 'HEAD') res.end()
    else res.end(bytes)
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String((error as { message?: string })?.message ?? error) })
  }
}

/** 构建这一条前缀路由。 */
export function createStickerRoute(deps: RouteDeps): WebRoute {
  const { ctx, config, stats } = deps

  /** 索引 + 配置一次性取好（每个分支都要）。 */
  const context = (): { cfg: MemesConfig; index: LoadedIndex | undefined } => {
    const cfg = config()
    return { cfg, index: loadIndex(cfg) }
  }

  /** 状态行数据（面板与诊断共用）。 */
  const statsPayload = (): Record<string, unknown> => {
    const { cfg, index } = context()
    const totalBytes = index === undefined ? 0 : index.entries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0)
    return {
      ok: true,
      ready: index !== undefined,
      entries: index?.entries.length ?? 0,
      index: index?.path ?? '',
      format: index?.format ?? '',
      assetRoot: effectiveAssetRoot(cfg),
      originalRoot: cfg.originalRoot,
      quality: cfg.quality,
      form: cfg.form,
      totalBytes,
      served: stats.served,
      miss: stats.miss,
      denied: stats.denied,
      lastId: stats.lastId,
      lastAt: stats.lastAt,
      latch: globalLatch(deps.state.read()),
      /** 最近发布的自动贴纸（诊断："贴纸到底是为哪一轮发的"）。 */
      autoLast: deps.auto.last(),
      /** 两端共用的诊断轨迹（最新 48 条）。 */
      trace: deps.trace.list(),
      ts: Date.now(),
    }
  }

  return {
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      if (!isLoopback(req)) {
        stats.denied += 1
        sendJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
        return
      }
      const observed = String(req.headers.host ?? '')
      if (observed !== '') deps.observeOrigin(`http://${observed}`)

      let url: URL
      try {
        url = new URL(String(req.url ?? '/'), 'http://127.0.0.1')
      } catch {
        sendJson(res, 400, { ok: false, error: 'bad request url' })
        return
      }
      const pathname = url.pathname

      // ---- 诊断 / 面板状态行 ----------------------------------------------
      if (pathname === STATS_PATH || pathname === `${STATS_PATH}/`) {
        sendJson(res, 200, statsPayload())
        return
      }

      // ---- 素材清单（预览墙） ---------------------------------------------
      if (pathname === `${CATALOG_PATH}` || pathname === `${CATALOG_PATH}/`) {
        if ((req.method ?? 'GET') !== 'GET') {
          res.writeHead(405, { 'Cache-Control': 'no-store' })
          res.end()
          return
        }
        const { index } = context()
        if (index === undefined) {
          sendJson(res, 200, { ok: true, ready: false, total: 0, items: [] })
          return
        }
        const limit = clampInt(url.searchParams.get('limit'), CATALOG_DEFAULT_LIMIT, 1, CATALOG_MAX_LIMIT)
        const seed = clampInt(url.searchParams.get('seed'), 0, 0, 1_000_000)
        const query = (url.searchParams.get('q') ?? '').trim()
        const pool =
          query === ''
            ? seededShuffle(index.entries, seed)
            : searchStickers(index.entries, query, CATALOG_MAX_LIMIT).map((hit) => hit.entry)
        const selected = pool.slice(0, limit)
        const origin = deps.origin()
        const items: CatalogItem[] = []
        for (const entry of selected) {
          const thumb = await resolveThumbFile(ctx, entry, config())
          items.push({
            id: entry.id,
            name: entry.name,
            tags: entry.tags,
            bytes: entry.bytes,
            w: entry.w,
            h: entry.h,
            frames: entry.frames,
            fps: entry.fps,
            durationMs: entry.durationMs,
            thumb: thumb === undefined ? null : thumbUrl(origin, entry),
            url: stickerUrl(origin, entry),
          })
        }
        sendJson(res, 200, { ok: true, ready: true, total: pool.length, items })
        return
      }

      // ---- 诊断回执（客户端把关键动作回传，进内存环形缓冲） -------------------
      if (pathname === DEBUG_PATH || pathname === `${DEBUG_PATH}/`) {
        if ((req.method ?? 'GET') !== 'POST') {
          res.writeHead(405, { 'Cache-Control': 'no-store' })
          res.end()
          return
        }
        const rawTrace = await readBody(req, MAX_LATCH_BODY)
        if (rawTrace === undefined) {
          sendJson(res, 400, { ok: false, error: 'body too large' })
          return
        }
        let parsedTrace: unknown
        try {
          parsedTrace = rawTrace === '' ? {} : JSON.parse(rawTrace)
        } catch {
          sendJson(res, 400, { ok: false, error: 'bad json' })
          return
        }
        const entry = (parsedTrace ?? {}) as Record<string, unknown>
        const kind = typeof entry.kind === 'string' ? entry.kind.slice(0, 48) : ''
        if (kind === '') {
          sendJson(res, 400, { ok: false, error: 'kind required' })
          return
        }
        deps.trace.push({
          kind: `client:${kind}`,
          ...(typeof entry.sessionId === 'string' ? { sessionId: entry.sessionId.slice(0, 200) } : {}),
          ...(typeof entry.turn === 'number' && Number.isFinite(entry.turn) ? { turn: entry.turn } : {}),
          ...(typeof entry.id === 'string' ? { id: entry.id.slice(0, 64) } : {}),
          ...(typeof entry.note === 'string' ? { note: entry.note.slice(0, 200) } : {}),
        })
        sendJson(res, 200, { ok: true })
        return
      }

      // ---- 常驻挂件的位置与形态 ---------------------------------------------
      if (pathname === PET_PATH || pathname === `${PET_PATH}/`) {
        const method = req.method ?? 'GET'
        if (method === 'GET') {
          sendJson(res, 200, { ok: true, pet: petState(deps.state.read()) })
          return
        }
        if (method !== 'POST') {
          res.writeHead(405, { 'Cache-Control': 'no-store' })
          res.end()
          return
        }
        if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
          sendJson(res, 400, { ok: false, error: 'expected application/json' })
          return
        }
        const rawPet = await readBody(req, MAX_LATCH_BODY)
        if (rawPet === undefined) {
          sendJson(res, 400, { ok: false, error: 'body too large' })
          return
        }
        let parsedPet: unknown
        try {
          parsedPet = rawPet === '' ? {} : JSON.parse(rawPet)
        } catch {
          sendJson(res, 400, { ok: false, error: 'bad json' })
          return
        }
        const input = (parsedPet ?? {}) as { right?: unknown; bottom?: unknown; collapsed?: unknown; id?: unknown }
        const patch: PetState = {}
        for (const key of ['right', 'bottom'] as const) {
          const value = input[key]
          if (typeof value === 'number' && Number.isFinite(value)) {
            patch[key] = clampInt(String(Math.round(value)), 0, 0, 20_000)
          }
        }
        if (typeof input.collapsed === 'boolean') patch.collapsed = input.collapsed
        if (input.id === null || input.id === '') {
          patch.id = undefined
        } else if (typeof input.id === 'string') {
          if (!STICKER_ID_RE.test(input.id)) {
            sendJson(res, 400, { ok: false, error: 'bad sticker id' })
            return
          }
          const { index: petIndex } = context()
          if (petIndex !== undefined && !petIndex.byId.has(input.id)) {
            sendJson(res, 400, { ok: false, error: `unknown sticker: ${input.id}` })
            return
          }
          patch.id = input.id
        }
        const petStore = deps.state.read()
        const pet = setPetState(petStore, patch)
        deps.state.write(petStore)
        sendJson(res, 200, { ok: true, pet })
        return
      }

      // ---- 自动贴纸待取位（客户端轮询） -------------------------------------
      if (pathname === AUTO_PENDING_PATH || pathname === `${AUTO_PENDING_PATH}/`) {
        if ((req.method ?? 'GET') !== 'GET') {
          res.writeHead(405, { 'Cache-Control': 'no-store' })
          res.end()
          return
        }
        const sessionId = (url.searchParams.get('sessionId') ?? '').trim()
        if (sessionId === '' || sessionId.length > 200) {
          sendJson(res, 400, { ok: false, error: 'sessionId required' })
          return
        }
        const since = clampInt(url.searchParams.get('since'), 0, 0, Number.MAX_SAFE_INTEGER)
        const init = url.searchParams.get('init') === '1'
        const result = deps.auto.pending(sessionId, since, init)
        sendJson(res, 200, { ok: true, mode: config().autoMode, seq: result.seq, event: result.event })
        return
      }

      // ---- 「下一轮用这张」 ------------------------------------------------
      if (pathname === `${LATCH_PATH}` || pathname === `${LATCH_PATH}/`) {
        const method = req.method ?? 'GET'
        if (method === 'GET') {
          sendJson(res, 200, { ok: true, latch: globalLatch(deps.state.read()) })
          return
        }
        if (method !== 'POST') {
          res.writeHead(405, { 'Cache-Control': 'no-store' })
          res.end()
          return
        }
        if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
          sendJson(res, 400, { ok: false, error: 'expected application/json' })
          return
        }
        const raw = await readBody(req, MAX_LATCH_BODY)
        if (raw === undefined) {
          sendJson(res, 400, { ok: false, error: 'body too large' })
          return
        }
        let parsed: unknown
        try {
          parsed = raw === '' ? {} : JSON.parse(raw)
        } catch {
          sendJson(res, 400, { ok: false, error: 'bad json' })
          return
        }
        const wanted = (parsed as { id?: unknown } | null)?.id
        const state = deps.state.read()
        if (wanted === null || wanted === '') {
          const latch = setGlobalLatch(state, null)
          deps.state.write(state)
          sendJson(res, 200, { ok: true, latch })
          return
        }
        if (typeof wanted !== 'string' || !STICKER_ID_RE.test(wanted)) {
          sendJson(res, 400, { ok: false, error: 'bad sticker id' })
          return
        }
        const { index } = context()
        if (index === undefined || !index.byId.has(wanted)) {
          sendJson(res, 400, { ok: false, error: `unknown sticker: ${wanted}` })
          return
        }
        const latch = setGlobalLatch(state, wanted)
        deps.state.write(state)
        sendJson(res, 200, { ok: true, latch })
        return
      }

      // ---- 图片字节（全尺寸 / 缩略图） -------------------------------------
      const isThumb = pathname.startsWith(`${THUMB_PATH}/`)
      if (!isThumb && !pathname.startsWith(`${STICKER_PATH}/`)) {
        sendJson(res, 404, { ok: false, error: `unknown memes-reply route: ${pathname}` })
        return
      }
      const method = req.method ?? 'GET'
      if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'Cache-Control': 'no-store' })
        res.end()
        return
      }

      const base = isThumb ? THUMB_PATH : STICKER_PATH
      const tail = pathname.slice(base.length + 1)
      const id = tail.replace(/\.[a-z0-9]+$/i, '')
      if (!STICKER_ID_RE.test(id)) {
        stats.miss += 1
        sendJson(res, 404, { ok: false, error: 'bad sticker id' })
        return
      }

      const { cfg, index } = context()
      if (index === undefined) {
        stats.miss += 1
        sendJson(res, 503, { ok: false, error: 'index.json 未找到，请先跑 `node scripts/import-assets.mjs`' })
        return
      }
      const entry = index.byId.get(id)
      if (entry === undefined) {
        stats.miss += 1
        sendJson(res, 404, { ok: false, error: `unknown sticker: ${id}` })
        return
      }

      if (isThumb) {
        const thumb = await resolveThumbFile(ctx, entry, cfg)
        if (thumb === undefined) {
          stats.miss += 1
          sendJson(res, 404, { ok: false, error: `thumb missing: ${id}（跑 node scripts/import-assets.mjs --thumbs）` })
          return
        }
        const ext = extensionOf(thumb.path)
        const etag = `"t${thumb.info.size ?? 0}-${String(thumb.info.version).slice(0, 16)}"`
        await sendBytes(req, res, thumb, etag, `x.${ext}`, MAX_THUMB_BYTES, () => {}, ctx)
        return
      }

      const resolved = await resolveStickerFile(ctx, entry, cfg)
      if (resolved === undefined) {
        stats.miss += 1
        sendJson(res, 404, { ok: false, error: `sticker file missing: ${id}` })
        return
      }
      const ext = extensionOf(entry.file)
      const etag =
        resolved.quality === 'compressed' && entry.sha256 !== ''
          ? `"${entry.sha256.slice(0, 32)}"`
          : `"o${resolved.info.size ?? 0}-${String(resolved.info.version).slice(0, 16)}"`
      await sendBytes(
        req,
        res,
        resolved,
        etag,
        entry.file,
        MAX_STICKER_BYTES,
        () => {
          stats.served += 1
          stats.lastId = id
          stats.lastAt = Date.now()
        },
        ctx,
      )
    },
  }
}
