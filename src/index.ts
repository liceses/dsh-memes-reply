/**
 * dsh-memes-reply — host 插件入口。
 *
 * 装配四样东西，全部由 effect 持有，停用即净：
 *   1. 贴纸字节路由（`/api/dsh-memes-reply/...`，回环限定，immutable + ETag）
 *   2. 模型工具 `use_sticker`（唯一收口：选图、每轮限额、形态分支）
 *   3. 斜杠命令 `/fish`（状态、清单、静音、一次性指定）
 *   4. 设置命名空间 `dsh-memes-reply`（总开关、形态、画质、素材目录、冷却）
 *
 * 另外挂两个 host 事件的观察者，用来把"当前是第几轮"记进每轮限额账本
 * （`agent/pre-step` 是 waterfall，必须原样返回 next()）。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import { loadIndex, resolveStickerFile, type LoadedIndex } from './assets.js'
import { createAutoBus, createAutoTextBuffer, pickAutoSticker, tapTextStream } from './auto.js'
import { createFishCommand } from './command.js'
import { ROUTE_PREFIX, SETTINGS_NS, stickerUrl, thumbUrl } from './protocol.js'
import { registerPromptHint } from './prompt.js'
import { createStats, createStickerRoute } from './route.js'
import { MemesSettingsSchema, resolveConfig, stateFilePath } from './schema.js'
import { loadState, saveState, sessionState } from './state.js'
import { createTrace } from './trace.js'
import { createStickerTool } from './tool.js'
import { createTurnTracker } from './turn.js'
import type { MemesConfig, PluginState, StickerEntry, AutoEvent } from './types.js'

/** cordis 插件名。 */
export const name = 'memes-reply'

/** `agent/pre-step` / `agent/turn-stopping` 的 payload 形状（只用得到的两个字段）。 */
interface TurnEventPayload {
  agent: { id: unknown }
  turn: number
}

/** 硬依赖：没有 webServer 就没有出图通道，没有 settings 就没有开关。 */
export const inject = ['webServer', 'settings']

/** 挂载。 */
export function apply(ctx: Context): void {
  const scope = ctx.settings.register(SETTINGS_NS, MemesSettingsSchema, { applies: 'live' })
  let config: MemesConfig = resolveConfig(scope.get())
  /** 配置变化时要跑的回调（自动贴纸的挂/卸需要它，所以在此登记而不是各处 watch）。 */
  const onConfigChange: Array<(next: MemesConfig) => void> = []
  scope.watch((next) => {
    config = resolveConfig(next)
    for (const listener of onConfigChange) {
      try {
        listener(config)
      } catch {
        // 配置观察者绝不打断设置写入。
      }
    }
  })

  /** 浏览器实际使用的 origin（从请求 Host 头学到）；没学到就用本机默认值。 */
  let origin = ''
  const originOf = (): string => (origin !== '' ? origin : `http://127.0.0.1:${ctx.webServer.port}`)

  const stateFile = stateFilePath()
  let cachedState: PluginState | undefined
  const readState = (): PluginState => {
    if (cachedState === undefined) cachedState = loadState(stateFile)
    return cachedState
  }
  const writeState = (next: PluginState): void => {
    cachedState = next
    saveState(stateFile, next)
  }

  const tracker = createTurnTracker()
  const stats = createStats()
  const indexOf = (): LoadedIndex | undefined => loadIndex(config)

  // 自动贴纸（B-auto）的两块状态：这一轮的助手文本缓冲 + 待客户端取走的事件位。
  const autoText = createAutoTextBuffer()
  const autoBus = createAutoBus()
  /** 每个会话"最近已经贴过的那一轮"：让多步流与兜底路径都幂等。 */
  const autoDecided = new Map<string, number>()
  /** 两端共用的诊断轨迹（`/stats` 一次读全）。 */
  const trace = createTrace(48)

  /** 把一张贴纸放进待取位（客户端 dock 会取走并显示）。 */
  const publishSticker = (
    sessionId: string,
    turn: number,
    entry: StickerEntry,
    reason: AutoEvent['reason'],
    matched: string,
  ): AutoEvent => {
    const origin = originOf()
    return autoBus.publish({
      sessionId,
      turn,
      id: entry.id,
      name: entry.name,
      url: stickerUrl(origin, entry),
      thumb: typeof entry.thumb === 'string' && entry.thumb !== '' ? thumbUrl(origin, entry) : null,
      reason,
      matched,
      at: Date.now(),
    })
  }

  /** 一轮结束时的自动贴纸决策（对同一轮**幂等**：多步流的每一步、以及 turn-stopping 兜底都会调它）。 */
  const decideAuto = (sessionId: string, turn: number): void => {
    const text = autoText.take(sessionId)
    const cfg = config
    if (!cfg.enabled) return trace.push({ kind: 'host:bail', sessionId, turn, note: '总开关关着' })
    if (cfg.autoMode === 'off') return trace.push({ kind: 'host:bail', sessionId, turn, note: 'autoMode=off' })
    // 这一轮已经有贴纸了（自动发过，或模型自己贴过）→ 不补第二张。
    if (autoDecided.get(sessionId) === turn) {
      return trace.push({ kind: 'host:bail', sessionId, turn, note: '本轮已贴过' })
    }
    const state = readState()
    const session = sessionState(state, sessionId)
    if (session.muted === true) return trace.push({ kind: 'host:bail', sessionId, turn, note: '会话静音' })
    if (tracker.usedInCurrentTurn(sessionId)) {
      return trace.push({ kind: 'host:bail', sessionId, turn, note: '模型本轮已贴' })
    }
    const index = indexOf()
    if (index === undefined) return trace.push({ kind: 'host:bail', sessionId, turn, note: '索引缺失' })
    const avoid = new Set(session.recent ?? [])
    const picked = pickAutoSticker({
      mode: cfg.autoMode,
      everyTurns: cfg.autoEveryTurns,
      sessionId,
      turn,
      text,
      entries: index.entries,
      avoid,
    })
    if (picked === null) {
      return trace.push({
        kind: 'host:bail',
        sessionId,
        turn,
        note: `没选中（mode=${cfg.autoMode} every=${cfg.autoEveryTurns} 文本长度=${text.length}）`,
      })
    }
    autoDecided.set(sessionId, turn)
    const event = publishSticker(sessionId, turn, picked.entry, picked.reason, picked.matched)
    // 与手动贴纸共享冷却。
    session.recent = [picked.entry.id, ...(session.recent ?? []).filter((id) => id !== picked.entry.id)].slice(0, 12)
    writeState(state)
    trace.push({ kind: 'host:publish', sessionId, turn, id: event.id, note: `reason=${event.reason}` })
    ctx.logger?.info?.(
      `dsh-memes-reply: 自动贴纸 ${event.id}（turn=${turn} ${event.reason}${event.matched === '' ? '' : ` 命中「${event.matched}」`}）`,
    )
  }

  // 1) 贴纸字节路由
  ctx.effect(
    () =>
      ctx.webServer.register(
        createStickerRoute({
          ctx,
          config: () => config,
          stats,
          observeOrigin: (value) => {
            origin = value
          },
          origin: originOf,
          state: { read: readState, write: writeState },
          auto: {
            pending: (sessionId, since, init) => autoBus.pending(sessionId, since, init),
            last: () => autoBus.last(),
          },
          trace: { push: (entry) => trace.push(entry), list: () => trace.list() },
        }),
      ),
    'dsh-memes-reply: sticker route',
  )

  // 2) 模型工具（tools 服务可选：缺了就只保留路由与命令）
  let toolRegistered = false
  const tools = ctx.get('tools')
  if (tools !== undefined) {
    ctx.effect(() => {
      toolRegistered = true
      const dispose = tools.register(
        createStickerTool({
          config: () => config,
          index: indexOf,
          tracker,
          state: { read: readState, write: writeState },
          origin: originOf,
          exists: async (entry) => (await resolveStickerFile(ctx, entry, config)) !== undefined,
          // 形态 sticker：模型挑的那张也走贴纸层（客户端渲染），正文里一个字都不写。
          toDock: (entry, sessionId) => {
            const turn = tracker.turnOf(sessionId) ?? 0
            // 记进"这一轮已有贴纸"，免得自动路径同轮再补一张。
            autoDecided.set(sessionId, turn)
            publishSticker(sessionId, turn, entry, 'model', '')
          },
        }),
      )
      return () => {
        toolRegistered = false
        dispose()
      }
    }, 'dsh-memes-reply: use_sticker tool')
  } else {
    ctx.logger?.warn?.('dsh-memes-reply: tools 服务缺失，use_sticker 未注册')
  }

  // 2b) 系统提示里的一行提示：工具可用 ≠ 模型会用（实测别的会话一次都没调用过）。
  //     只在"工具注册了 + 总开关开 + 本会话没静音"时输出，其余情况输出空串。
  ctx.effect(
    () =>
      registerPromptHint(ctx, {
        config: () => config,
        hasTool: () => toolRegistered,
        isMuted: (sessionId) => readState().sessions[sessionId]?.muted === true,
      }) ?? (() => {}),
    'dsh-memes-reply: prompt hint',
  )

  // 3) 斜杠命令
  const commands = ctx.get('commands')
  if (commands !== undefined) {
    ctx.effect(
      () => commands.register(createFishCommand({ config: () => config, index: indexOf, state: { read: readState, write: writeState } })),
      'dsh-memes-reply: /fish command',
    )
  } else {
    ctx.logger?.warn?.('dsh-memes-reply: commands 服务缺失，/fish 未注册')
  }

  // 4) 轮次边界 → 每轮限额账本（纯观察者；waterfall 必须返回 next()）
  //
  // `agent/pre-step` 与 `agent/turn-stopping` 是在 dsh-agent 里声明的 scoped 事件。
  // 这里不为了两个类型把 dsh-agent 拉成依赖：运行时 ctx.on 接受任意事件名，
  // 参数形状按 catalog 的签名在这里就地声明。
  const bus = ctx as unknown as {
    on(name: 'agent/pre-step', listener: (payload: TurnEventPayload, next: () => unknown) => unknown): () => void
    on(name: 'agent/turn-stopping', listener: (payload: TurnEventPayload) => unknown): () => void
  }
  bus.on('agent/pre-step', (payload, next) => {
    try {
      const sessionId = String(payload.agent.id)
      tracker.setTurn(sessionId, payload.turn)
      // `every` 模式**不需要正文**，所以不必等到流结束 —— 这里就发布，让事件必然早于
      // "轮次结束时的尾巴节点渲染"进入客户端的落地仓。
      // 真事故：等流结束才发布时，链式 `select` 在渲染那一刻仓里还是空的，而轮询每 800ms
      // 才拉一次 → 约 94% 的回合必然 miss，且之后不会再重渲染。
      if (config.enabled && config.autoMode === 'every') {
        trace.push({ kind: 'host:early-decide', sessionId, turn: payload.turn })
        decideAuto(sessionId, payload.turn)
      }
    } catch {
      // 观察者绝不打断模型循环。
    }
    return next()
  })
  bus.on('agent/turn-stopping', (payload) => {
    try {
      const sessionId = String(payload.agent.id)
      trace.push({ kind: 'host:turn-stopping', sessionId, turn: payload.turn })
      tracker.closeTurn(sessionId, payload.turn)
      decideAuto(sessionId, payload.turn)
    } catch {
      // 同上。
    }
  })

  // 5) 自动贴纸的输入：观察模型流里的助手正文（纯观察者，绝不吞 chunk）。
  //    与 dsh-hmm-wait 同一套做法：按配置动态挂/卸，autoMode=off 时完全不碰模型流。
  let disposeTap: (() => void) | null = null
  const installTap = (): void => {
    if (disposeTap !== null) return
    trace.push({ kind: 'host:tap-installed' })
    disposeTap = ctx.on('llm/stream', (options, next) => {
      const stream = next()
      if (config.autoMode === 'off') return stream
      const sessionId = (options as { sessionId?: unknown } | undefined)?.sessionId
      if (typeof sessionId !== 'string' || sessionId === '') {
        trace.push({ kind: 'host:tap-no-session' })
        return stream
      }
      // 流结束时若这一步没调工具，说明是最后一步 → 立刻决策（早于 turn-stopping）。
      return tapTextStream(autoText, sessionId, stream, () => {
        const turn = tracker.turnOf(sessionId)
        trace.push({ kind: 'host:final-step', sessionId, ...(turn === undefined ? {} : { turn }) })
        decideAuto(sessionId, turn ?? 0)
      })
    })
  }
  const uninstallTap = (): void => {
    if (disposeTap !== null) {
      disposeTap()
      disposeTap = null
    }
  }
  if (config.autoMode !== 'off') installTap()
  onConfigChange.push((next) => {
    if (next.autoMode === 'off') uninstallTap()
    else installTap()
  })

  const index = indexOf()
  ctx.logger?.info?.(
    `dsh-memes-reply: 路由 ${ROUTE_PREFIX} 已挂载 · 素材 ${index?.entries.length ?? 0} 张` +
      (index === undefined ? '（索引缺失，请先运行 node scripts/import-assets.mjs）' : ` · ${index.path}`),
  )
}
