/**
 * dsh-memes-reply — HTTP 路由（host）。
 *
 * 一条前缀路由管这些事：
 *   GET/HEAD /api/dsh-memes-reply/sticker/<id>.<ext>   贴纸字节（全尺寸动画）
 *   GET/HEAD /api/dsh-memes-reply/thumb/<id>.<ext>     缩略图字节（设置面板预览墙）
 *   GET      /api/dsh-memes-reply/catalog              素材清单（预览墙数据）
 *   GET      /api/dsh-memes-reply/vocab                全量检索词表（v2.0 客户端派生）
 *   GET      /api/dsh-memes-reply/session-state        会话态（静音/指定/最近用过）
 *   POST     /api/dsh-memes-reply/jev-pick             JEV 按语境选一张（autoMode=jev）
 *   GET/POST /api/dsh-memes-reply/latch                「下一轮用这张」读写
 *   GET      /api/dsh-memes-reply/stats                诊断 / 面板状态行
 *
 * 为什么不让浏览器的 `<img>` 走官方的 `/api/file`：那条通道是 `no-store`、无 Range、
 * 且有连接服务鉴权；自建路由可以给 `immutable` 缓存 + ETag，让几百 KB 的贴纸也只在
 * 首次下载。仅接受回环 Host，且不发任何 CORS 头（与 dsh-showme-html 同款围栏）。
 */

import type { Context } from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { effectiveAssetRoot, loadIndex, resolveStickerFile, resolveThumbFile, type LoadedIndex, type ResolvedSticker } from './assets.js'
import { CATALOG_DEFAULT_LIMIT, CATALOG_MAX_LIMIT } from './config.js'
import {
  createDecisionCache,
  createJevLog,
  decideJev,
  pickInFamily,
} from './jev.js'
import {
  CATALOG_PATH,
  DEBUG_PATH,
  JEV_LOG_PATH,
  JEV_PATH,
  LATCH_PATH,
  MAX_STICKER_BYTES,
  MIME,
  PET_PATH,
  ROUTE_PREFIX,
  SESSION_STATE_PATH,
  STATS_PATH,
  STICKER_ID_RE,
  STICKER_PATH,
  THUMB_PATH,
  VOCAB_PATH,
  extensionOf,
  stickerUrl,
  thumbUrl,
} from './protocol.js'
import { searchStickers } from './search.js'
import { globalLatch, jevDebugState, petState, setGlobalLatch, setJevDebugState, setPetState } from './state.js'
import type { CatalogItem, FloatPanelState, MemesConfig, PetState, PluginState, TraceEntry } from './types.js'

/** 缩略图读取上限（真缩略图只有几十 KB，给足余量即可）。 */
const MAX_THUMB_BYTES = 1024 * 1024

/** POST /latch 的请求体上限。 */
const MAX_LATCH_BODY = 4096

/** POST /jev-pick 的请求体上限（回复正文可能很长，留足余量）。 */
const MAX_JEV_BODY = 256 * 1024

/** 送进 JEV 的回复正文截断长度（按字符；成本与延迟都由它兜住）。 */
const MAX_JEV_REPLY_CHARS = 12000

/** `/jev-log` 不传 limit 时给几条。 */
const JEV_LOG_DEFAULT_LIMIT = 10

/** JEV 计数（诊断用：花了多少、命中多少、回落多少）。 */
export interface JevStats {
  /** 真正打过 OpenRouter 的次数。 */
  calls: number
  /** 命中缓存的次数（刷新重放，没花钱）。 */
  hits: number
  /** 失败回落既有规则的次数。 */
  fallbacks: number
  /** 累计美元成本（OpenRouter 报的）。 */
  costUsd: number
  /** 最近一次耗时（ms）与结论摘要。 */
  lastMs: number
  lastNote: string
}

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
  /** JEV 决策计数。 */
  jev: JevStats
}

/** 建计数器。 */
export function createStats(): StickerStats {
  return {
    served: 0,
    miss: 0,
    denied: 0,
    lastId: '',
    lastAt: 0,
    jev: { calls: 0, hits: 0, fallbacks: 0, costUsd: 0, lastMs: 0, lastNote: '' },
  }
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
  /** 诊断环形缓冲（host 决策 + 客户端回执）。 */
  trace: { push: (entry: Omit<TraceEntry, 'at'> & { at?: number }) => void; list: () => TraceEntry[] }
  /**
   * JEV 决策的可注入点（只给测试用；生产一律走默认实现）。
   *
   * 没有这个口子，`/jev-pick` 这条链就只能靠"起一个真 DSH 再戳一下"来验 ——
   * 而它恰恰是最该被单测钉死的部分（缓存/回落/去重都在这里）。
   */
  jev?: Partial<{
    fetch: typeof globalThis.fetch
    env: NodeJS.ProcessEnv | Record<string, string | undefined>
    credentialsPath: string
    readFile: (path: string) => string
    now: () => number
  }>
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

/**
 * 夹取一个查询参数。
 *
 * **缺席要用 fallback**：`Number(null)` 是 `0`，而 `0` 是个有限数 —— 老写法
 * （只判 `Number.isFinite`）会让 fallback 在这一支上永远不生效，
 * 于是 `clampInt(null, 10, 1, 20)` 返回 `1`：不传 `limit` 的端点会静默只回一条。
 * `/jev-log` 就是这么撞上的（`/catalog` 一直显式传参，所以从没暴露）。
 */
function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const clamp = (value: number): number => Math.min(max, Math.max(min, Math.trunc(value)))
  if (raw === null || raw.trim() === '') return clamp(fallback)
  const value = Number(raw)
  if (!Number.isFinite(value)) return clamp(fallback)
  return clamp(value)
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

  /**
   * JEV 结论缓存（按 `(会话, 轮次)`）。
   *
   * 位置很关键：它必须**活得比一次请求长**（刷新要重放），又必须挂在这个路由实例上
   * （插件停用即随 ctx.effect 一起消失，不留跨生命的脏状态）。
   */
  const jevCache = createDecisionCache(256)

  /**
   * JEV 调试日志（只记**真实往返**，最新 20 条）。
   *
   * 命中缓存不产生新条目：一次刷新会重放好几个回合，记进去只会把真正发生过的事淹掉。
   * 面板要看的正是"这一轮到底发了什么、收回了什么"。
   */
  const jevLog = createJevLog(20)

  /**
   * `<DSH_HOME>/.credentials.yaml` 的路径。
   *
   * 为什么需要这条兜底：本机实测 DSH 把 key 存在这个文件里，但**不注入插件进程的环境变量**
   * （`process.env.OPENROUTER_API_KEY` 是空的）。环境变量仍然优先，文件只是兜底。
   */
  const credentialsPath = (): string => {
    const home = process.env.DSH_HOME
    return join(home !== undefined && home !== '' ? home : join(homedir(), '.dsh'), '.credentials.yaml')
  }

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
      totalBytes,
      served: stats.served,
      miss: stats.miss,
      denied: stats.denied,
      lastId: stats.lastId,
      lastAt: stats.lastAt,
      latch: globalLatch(deps.state.read()),
      /** JEV 决策计数（花了多少 / 命中缓存多少 / 回落多少 / 缓存里存了几条）。 */
      jev: { ...stats.jev, cacheSize: jevCache.size() },
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

      // ---- 检索词表（v2.0：客户端派生的唯一数据源） -------------------------
      if (pathname === `${VOCAB_PATH}` || pathname === `${VOCAB_PATH}/`) {
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
        const origin = deps.origin()
        // 只给派生需要的东西 + 全尺寸动画 URL（**不给 thumb**：v2.0 里贴纸必须是会动的那张）。
        const items = index.entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          tags: entry.tags,
          aliases: entry.aliases,
          url: stickerUrl(origin, entry),
        }))
        sendJson(res, 200, { ok: true, ready: true, total: items.length, items })
        return
      }

      // ---- 会话态（客户端派生时"人按过的开关"仍由宿主说了算） ----------------
      if (pathname === `${SESSION_STATE_PATH}` || pathname === `${SESSION_STATE_PATH}/`) {
        if ((req.method ?? 'GET') !== 'GET') {
          res.writeHead(405, { 'Cache-Control': 'no-store' })
          res.end()
          return
        }
        const sessionId = (url.searchParams.get('sessionId') ?? '').trim()
        const current = deps.state.read()
        const session = sessionId === '' ? undefined : current.sessions[sessionId]
        sendJson(res, 200, {
          ok: true,
          sessionId,
          muted: session?.muted === true,
          latch: globalLatch(current),
          sessionLatch: session?.latch ?? null,
          recent: session?.recent ?? [],
        })
        return
      }

      // ---- JEV 取结论（autoMode=jev：按这一轮语境选一张） -------------------
      if (pathname === JEV_PATH || pathname === `${JEV_PATH}/`) {
        if ((req.method ?? 'GET') !== 'POST') {
          res.writeHead(405, { 'Cache-Control': 'no-store' })
          res.end()
          return
        }
        const raw = await readBody(req, MAX_JEV_BODY)
        if (raw === undefined) {
          sendJson(res, 413, { ok: false, error: 'body too large' })
          return
        }
        let parsedBody: unknown
        try {
          parsedBody = raw === '' ? {} : JSON.parse(raw)
        } catch {
          sendJson(res, 400, { ok: false, error: 'bad json' })
          return
        }
        const input = (parsedBody ?? {}) as { sessionId?: unknown; turn?: unknown; text?: unknown; userText?: unknown }
        const sessionId = typeof input.sessionId === 'string' ? input.sessionId.slice(0, 200) : ''
        // turn 必须是正整数：不用 `Math.trunc` 宽容，因为 1.0/1.5/1.9 会被截成同一个缓存键，
        // 让两个不同轮次共用一张贴纸 —— 静默错配比直接 400 难查得多。
        const turn = typeof input.turn === 'number' && Number.isInteger(input.turn) ? input.turn : 0
        const text = typeof input.text === 'string' ? input.text.slice(0, MAX_JEV_REPLY_CHARS) : ''
        const userText = typeof input.userText === 'string' ? input.userText.slice(0, 4000) : ''
        if (sessionId === '' || turn < 1) {
          sendJson(res, 400, { ok: false, error: 'sessionId and positive integer turn required' })
          return
        }

        const { cfg, index } = context()
        if (index === undefined) {
          sendJson(res, 200, { ok: false, error: 'index missing' })
          return
        }

        /** 缓存命中即返回（刷新重放走这条，不再花钱、也不会换一张）。 */
        const cached = jevCache.get(sessionId, turn)
        if (cached !== undefined) {
          stats.jev.hits += 1
          const entry = cached.ok && cached.stick ? pickInFamily(index.entries, cached.family, new Set(), sessionId, turn) : undefined
          sendJson(res, 200, {
            ok: cached.ok,
            cached: true,
            id: entry?.id ?? null,
            family: cached.family,
            stick: cached.stick,
            probability: cached.probability,
            note: cached.note,
          })
          return
        }

        const recent = deps.state.read().sessions[sessionId]?.recent ?? []
        const decision = await decideJev(
          {
            fetch: deps.jev?.fetch ?? globalThis.fetch,
            readFile: deps.jev?.readFile ?? ((path: string) => readFileSync(path, 'utf8')),
            env: deps.jev?.env ?? process.env,
            credentialsPath: deps.jev?.credentialsPath ?? credentialsPath(),
            now: deps.jev?.now ?? (() => Date.now()),
          },
          { reply: text, userText, recent, persona: cfg.jevPersona },
          { model: cfg.jevModel, timeoutMs: cfg.jevTimeoutMs },
        )
        jevCache.set(sessionId, turn, decision)

        /** 把这次真实往返记进调试日志（成功与失败都记：失败才是最需要看原文的时候）。 */
        jevLog.push({
          sessionId,
          turn,
          model: cfg.jevModel,
          ok: decision.ok,
          family: decision.family,
          stick: decision.stick,
          probability: decision.probability,
          yesProbability: decision.yesProbability,
          costUsd: decision.costUsd,
          ms: decision.ms,
          note: decision.note,
          status: decision.status,
          error: decision.error,
          request: decision.request,
          response: decision.response,
        })

        if (!decision.ok) {
          stats.jev.fallbacks += 1
          stats.jev.lastMs = decision.ms
          stats.jev.lastNote = decision.note
          deps.trace.push({ kind: 'host:jev', sessionId, turn, note: `回落 ${decision.note}` })
          sendJson(res, 200, { ok: false, cached: false, id: null, error: decision.note, ms: decision.ms })
          return
        }

        stats.jev.calls += 1
        if (decision.costUsd !== null) stats.jev.costUsd += decision.costUsd
        stats.jev.lastMs = decision.ms
        stats.jev.lastNote = decision.note

        /** 族内挑一张：JEV 给了情绪族，"具体哪张"由代码定（去重 + 确定性）。 */
        const picked =
          decision.stick
            ? pickInFamily(index.entries, decision.family, new Set(recent), sessionId, turn)
            : undefined
        deps.trace.push({
          kind: 'host:jev',
          sessionId,
          turn,
          ...(picked === undefined ? {} : { id: picked.id }),
          note: `${decision.note} · ${decision.ms}ms${decision.costUsd === null ? '' : ` · $${decision.costUsd.toFixed(6)}`}`,
        })
        sendJson(res, 200, {
          ok: true,
          cached: false,
          id: picked?.id ?? null,
          family: decision.family,
          stick: decision.stick,
          probability: decision.probability,
          ms: decision.ms,
          costUsd: decision.costUsd,
          note: decision.note,
        })
        return
      }

      // ---- JEV 调试日志（漂浮面板读：每次真实往返的请求与响应） ----------------
      if (pathname === JEV_LOG_PATH || pathname === `${JEV_LOG_PATH}/`) {
        if ((req.method ?? 'GET') !== 'GET') {
          res.writeHead(405, { 'Cache-Control': 'no-store' })
          res.end()
          return
        }
        const limit = clampInt(url.searchParams.get('limit'), JEV_LOG_DEFAULT_LIMIT, 1, jevLog.capacity())
        sendJson(res, 200, {
          ok: true,
          capacity: jevLog.capacity(),
          total: jevLog.size(),
          /** 本次真实调用累计（面板头部显示）。 */
          stats: {
            calls: stats.jev.calls,
            hits: stats.jev.hits,
            fallbacks: stats.jev.fallbacks,
            costUsd: stats.jev.costUsd,
            lastMs: stats.jev.lastMs,
            lastNote: stats.jev.lastNote,
          },
          entries: jevLog.list(limit),
          ts: Date.now(),
        })
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

      // ---- 界面落点（常驻挂件 + JEV 调试浮层的拖拽坐标；兜底浮层已随 v2.0 退役） ----
      if (pathname === PET_PATH || pathname === `${PET_PATH}/`) {
        const method = req.method ?? 'GET'
        if (method === 'GET') {
          sendJson(res, 200, {
            ok: true,
            pet: petState(deps.state.read()),
            jevDebug: jevDebugState(deps.state.read()),
          })
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
        const input = (parsedPet ?? {}) as {
          slot?: unknown
          right?: unknown
          bottom?: unknown
          collapsed?: unknown
          id?: unknown
        }
        // 落点坐标：数字 = 记录，null = 清除（复位到默认位置）。
        const coords: { right?: number; bottom?: number } = {}
        for (const key of ['right', 'bottom'] as const) {
          const value = input[key]
          if (value === null) coords[key] = undefined
          else if (typeof value === 'number' && Number.isFinite(value)) {
            coords[key] = clampInt(String(Math.round(value)), 0, 0, 20_000)
          }
        }

        // `slot` 缺省 = pet：老客户端（v2.1 之前）不带这个字段，不能因为新增座位把它弄坏。
        if (input.slot === 'jevDebug') {
          const panelPatch: FloatPanelState = {}
          if (coords.right !== undefined) panelPatch.right = coords.right
          if (coords.bottom !== undefined) panelPatch.bottom = coords.bottom
          if (typeof input.collapsed === 'boolean') panelPatch.collapsed = input.collapsed
          const panelStore = deps.state.read()
          const jevDebug = setJevDebugState(panelStore, panelPatch)
          deps.state.write(panelStore)
          sendJson(res, 200, { ok: true, jevDebug })
          return
        }

        const patch: PetState = {}
        if (coords.right !== undefined) patch.right = coords.right
        if (coords.bottom !== undefined) patch.bottom = coords.bottom
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
        sendJson(res, 503, { ok: false, error: 'index.json 未找到，先跑 `node scripts/fetch-assets.mjs`（或用 `node scripts/import-assets.mjs` 从原图生成）' })
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
