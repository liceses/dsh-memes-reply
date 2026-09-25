/**
 * dsh-memes-reply — 贴纸层：**会话流里的一个派生节点**（v2.0 主线）。
 *
 * ## 它解决什么
 *
 * v1.0 的贴纸是"宿主发事件 → 客户端轮询取走 → 抢一个尾巴座位渲染"，于是有三宗病：
 * 不会动（渲染的是首帧缩略图）、抢不到座位（`present` 交付卡片占着链首）、刷新即空
 * （绑定只在内存里）。v2.0 改成**会话事件到节点的纯函数**：
 *
 * - 一轮 = 一个节点（`turn/start` 建，`turn/end` 落定）；
 * - 节点状态只由会话事件推出来 → 刷新、滚动、切会话都会**原样重放**；
 * - 渲染完全由我们控（圆贴纸压在气泡右下角、全尺寸动画 WebP、悬停放大、点击看大图）；
 * - 两阶段：生成中是「思考/打字中」，落定后**同一个节点**换成这一轮的最终贴纸
 *   （前一张是结构性地消失，不是被遮住）。
 *
 * ## 几个查出来的硬事实（别再踩）
 *
 * 1. 注册表运行时叫 `ctx.uiConversation.events.register(def)`（部署版 1.5-rc.1；
 *    本仓构建期依赖 rc.8 那时叫 `conversationEvents`，所以不 import 那个包的类型）。
 * 2. 节点自己构造：`{key: context.key, kind, id: context.id, target:'chat', anchorSeq, location, visibility, data}`。
 * 3. 渲染按 `kind` 字符串分发；没有对应条目时官方渲染 "unknown surface" 的 JSON 兜底。
 * 4. **`assistant/live-chunk` 这类瞬时事件不进定义**（实测 `帧=0`）：所以生成中的锚点只能取
 *    最后一个**持久**事件的 seq（`turn/start` / `step/start`），它就在流式正文之前 —— 位置正好。
 * 5. 官方 `TURN_PROCESS_INDEPENDENT_KINDS` 折叠白名单里没有我们；把锚点放在**收尾回复之后**
 *    （`assistant/message` 的 seq + 0.1）就不落在"过程窗口"里，不会被折起来（探针实测 `过程成员=no`）。
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_CONFIG } from '../config.js'
import { modelPickOf } from '../closing.js'
import { finalStickerFor, reasonText, thinkingStickerFor, type ChoiceTerm, type StickerChoice } from '../derive.js'
import { TOOL_NAME } from '../protocol.js'
import type { MemesConfig } from '../types.js'
import { fetchJevPick, fetchSessionState, postDebug, putLatch } from './api.js'
import { resolveVocab } from './vocab.js'

/** 我们的节点 kind（渲染分发按这个字符串）。 */
export const STICKER_NODE_KIND = 'memes-sticker'

/** 客户端构建标记：刷新后从 `/stats` 的 `client-apply` 回执里核对。 */
const NODE_BUILD = 'sticker-node-a'

/** 一轮的状态（全部由会话事件推出来）。 */
interface TurnState {
  turn: number
  /** 生成中的锚点：最后一个持久事件的 seq。 */
  liveAnchor: number
  /** 收尾回复的 seq（落定锚点 = 它 + 0.1）。 */
  closingSeq: number
  /** 收尾正文（keyword 模式扫它）。 */
  text: string
  /** 模型自己点名的 id（`use_sticker` 的 `id` 实参）。 */
  modelId: string | null
  /** 模型给的关键词（`use_sticker` 的 `mood` 实参）。 */
  modelMood: string | null
  /** 回合是否已结束。 */
  closed: boolean
}

/** 交给渲染器的载荷。 */
interface StickerNodeData {
  turn: number
  phase: 'streaming' | 'settled'
  /** 收尾正文（渲染器在客户端做派生）。 */
  text: string
  modelId: string | null
  modelMood: string | null
}

/** 会话事件（只用到我们关心的字段）。 */
interface NodeEvent {
  type: string
  seq: number
  data?: {
    turn?: unknown
    step?: unknown
    name?: unknown
    arguments?: unknown
    message?: { content?: unknown }
  }
}

/** 一个被接受的 match。 */
interface NodeMatch {
  event: NodeEvent
  role: 'start' | 'update'
  location?: unknown
}

/** 引擎交给定义的状态机上下文。 */
interface NodeContext {
  key: string
  id: string
  state?: TurnState
  start?: NodeMatch
  matches: readonly NodeMatch[]
}

/** 运行时的注册表形状（不依赖版本）。 */
interface UiConversationLike {
  events: { register(definition: unknown): () => void }
}

/** 从助手消息里抽出可见正文。 */
function textOfMessage(message: { content?: unknown } | undefined): string {
  const content = message?.content
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    const typed = block as { type?: unknown; text?: unknown } | null
    if (typed !== null && typed.type === 'text' && typeof typed.text === 'string') text += typed.text
  }
  return text
}

/** 造定义：一轮一个节点。 */
function makeStickerDefinition(): unknown {
  const turnOf = (event: NodeEvent): number => Number(event.data?.turn ?? 0)
  return {
    kind: STICKER_NODE_KIND,
    target: 'chat',
    match(event: NodeEvent): { id: string; role: 'start' | 'update' } | null {
      if (event.type === 'turn/start') return { id: String(turnOf(event)), role: 'start' }
      if (
        event.type === 'step/start' ||
        event.type === 'assistant/message' ||
        event.type === 'tool/call' ||
        event.type === 'turn/end'
      ) {
        return { id: String(turnOf(event)), role: 'update' }
      }
      return null
    },
    start(_context: NodeContext, match: NodeMatch): TurnState {
      return {
        turn: turnOf(match.event),
        liveAnchor: Number(match.event.seq),
        closingSeq: 0,
        text: '',
        modelId: null,
        modelMood: null,
        closed: false,
      }
    },
    update(context: NodeContext, match: NodeMatch): TurnState {
      const event = match.event
      const seq = Number(event.seq)
      const state = context.state
      // 引擎重建上下文时 state 可能还没就位：按 start 的语义就地重建，绝不抛。
      if (state === undefined) {
        return {
          turn: turnOf(event),
          liveAnchor: seq,
          closingSeq: 0,
          text: '',
          modelId: null,
          modelMood: null,
          closed: event.type === 'turn/end',
        }
      }
      const next: TurnState = { ...state, liveAnchor: Math.max(state.liveAnchor, seq) }
      if (event.type === 'assistant/message') {
        next.closingSeq = seq
        next.text = textOfMessage(event.data?.message)
        return next
      }
      if (event.type === 'tool/call' && event.data?.name === TOOL_NAME) {
        const pick = modelPickOf(event.data?.arguments)
        if (pick.id !== null) next.modelId = pick.id
        if (pick.mood !== null) next.modelMood = pick.mood
        return next
      }
      if (event.type === 'turn/end') next.closed = true
      return next
    },
    buildViewNode(context: NodeContext): unknown {
      const state = context.state
      if (state === undefined) return null
      const location = context.start?.location ?? context.matches[context.matches.length - 1]?.location
      const anchorSeq = (state.closed && state.closingSeq > 0 ? state.closingSeq : state.liveAnchor) + 0.1
      return {
        key: context.key,
        kind: STICKER_NODE_KIND,
        id: context.id,
        target: 'chat',
        anchorSeq,
        location,
        visibility: 'visible',
        data: {
          turn: state.turn,
          phase: state.closed ? 'settled' : 'streaming',
          text: state.text,
          modelId: state.modelId,
          modelMood: state.modelMood,
        } satisfies StickerNodeData,
      }
    },
  }
}

/** 已经把回执报过的 (key, 阶段)，以及首屏回放的配额。 */
const reported = new Map<string, string>()
const REPLAY_REPORT_LIMIT = 6
let firstSightings = 0

/** 一次性消费 latch：只有"最新的那个已落定回合"能拿走它，避免历史回合把它反复吃掉。 */
let latchConsumedFor = 0

/** 当前视口附近的节点才真正挂 `<img>`（动画 WebP 均值 560KB，长会话里不能全挂）。 */
function useNearViewport(ref: { current: HTMLElement | null }): boolean {
  const [near, setNear] = useState(true)
  useEffect(() => {
    const element = ref.current
    if (element === null || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setNear(entry.isIntersecting)
      },
      { rootMargin: '900px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return near
}

/**
 * 贴纸的渲染单元（一轮一个）。
 *
 * ## 两个座位（`seat`）
 *
 * | 座位 | 槽位 | 负责 |
 * | --- | --- | --- |
 * | `flow` | 自定义节点 `conversation.chat.node`（kind = `memes-sticker`） | **生成中**的占位（思考 / 打字中） |
 * | `turn-tail` | 官方 `conversation.chat.turnTail` | **落定**的最终贴纸 |
 *
 * ## 为什么落定要换座位
 *
 * 官方「工作步骤展示」会把会话流节点算进**过程折叠窗口**（ui-chat 的判定）：
 *
 * ```js
 * processMember = !TURN_PROCESS_INDEPENDENT_KINDS.has(kind)
 *   && anchorSeq >= processStartSeq
 *   && (liveProcess || answerAnchorSeq === null || anchorSeq < answerAnchorSeq)
 * ```
 *
 * 我们的 kind 不在豁免名单里（名单是 `system-prompt / user / steering / turn-trigger /
 * turn-process / turn-error / turn-max-tokens / **turn-tail**`），而且本轮没有"干净收尾回复"时
 * `answerAnchorSeq` 是 `null` —— 那时**所有** `anchorSeq >= processStartSeq` 的节点都算过程成员。
 * 所以往后挪锚点治不好：折叠一收，落定贴纸就跟着工具细节一起被藏起来（用户实测）。
 *
 * 官方的 `turn-tail` 节点 kind **在豁免名单内**，而 `conversation.chat.turnTail` 这个
 * **list** 槽位正是给"回合收尾的功能贡献"准备的（加法型，不会像 keyed 座位那样被抢）。
 * 落定贴纸放那里：既不被折叠，也不和交付卡片打架。
 *
 * 生成中的占位留在 `flow` 里是安全的 —— 那时 `liveProcess` 为真，过程块强制展开，看得见。
 */
export function StickerNodeView({
  scope,
  seat = 'flow',
  ...props
}: {
  scope: SettingsScope<MemesConfig>
  /** 渲染座位；落定的贴纸走 `turn-tail`（见上方说明）。 */
  seat?: 'flow' | 'turn-tail'
  sessionId?: unknown
  node?: { key?: string; anchorSeq?: number; data?: StickerNodeData }
}): ReactElement | null {
  const sessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
  const data = props.node?.data
  const turn = data?.turn ?? 0
  const phase = data?.phase ?? 'settled'

  const [config, setConfig] = useState<MemesConfig>(() => ({ ...DEFAULT_CONFIG, ...(scope.getSnapshot().value ?? {}) }))
  const [entries, setEntries] = useState<ChoiceTerm[]>([])
  const [state, setState] = useState<{ muted: boolean; latch: string | null; sessionLatch: string | null; recent: string[] }>({
    muted: false,
    latch: null,
    sessionLatch: null,
    recent: [],
  })
  /**
   * JEV 结论：`undefined` = 还没问（此期间**不显示任何贴纸**，免得先闪一张随机的），
   * `null` = 问过了但没结论（回落既有规则），字符串 = 这一轮就贴它。
   */
  const [jevPick, setJevPick] = useState<{ id: string | null } | undefined>(undefined)
  const ref = useRef<HTMLDivElement | null>(null)
  const near = useNearViewport(ref)

  // 设置：客户端本来就有官方设置通道，改完即时生效。
  useEffect(() => {
    const read = (): void => setConfig({ ...DEFAULT_CONFIG, ...(scope.getSnapshot().value ?? {}) })
    read()
    return scope.subscribe(read)
  }, [scope])

  // 词表 + 本会话状态（各一次；失败就降级成"这轮没有贴纸"，绝不打断会话）。
  useEffect(() => {
    let alive = true
    void (async () => {
      const vocab = await resolveVocab()
      if (!alive) return
      setEntries(vocab.entries)
      postDebug({ kind: 'sticker-node-vocab', note: `source=${vocab.source} 条目=${vocab.entries.length}` })
    })()
    return () => {
      alive = false
    }
  }, [])
  useEffect(() => {
    let alive = true
    void (async () => {
      const next = await fetchSessionState(sessionId)
      if (!alive || next === undefined) return
      setState({
        muted: next.muted === true,
        latch: next.latch ?? null,
        sessionLatch: next.sessionLatch ?? null,
        recent: Array.isArray(next.recent) ? next.recent : [],
      })
    })()
    return () => {
      alive = false
    }
  }, [sessionId, phase])

  // JEV 模式：落定后问一次宿主（结论由宿主按 (会话,轮次) 缓存，刷新即重放）。
  useEffect(() => {
    if (!config.enabled || state.muted) return
    if (config.autoMode !== 'jev' || phase !== 'settled') return
    let alive = true
    void (async () => {
      const answer = await fetchJevPick({
        sessionId,
        turn,
        text: data?.text ?? '',
      })
      if (!alive) return
      const id = answer?.ok === true && typeof answer.id === 'string' ? answer.id : null
      setJevPick({ id })
      postDebug({
        kind: 'sticker-jev',
        ...(sessionId === '' ? {} : { sessionId }),
        turn,
        ...(id === null ? {} : { id }),
        note:
          answer === undefined
            ? 'host 无响应 → 回落既有规则'
            : answer.ok !== true
              ? `JEV 失败(${answer.error ?? '?'}) → 回落既有规则`
              : `${answer.cached === true ? '缓存重放' : `${answer.ms ?? '?'}ms`} family=${answer.family ?? '?'} ` +
                `p=${typeof answer.probability === 'number' ? answer.probability.toFixed(2) : '?'} ` +
                `${id === null ? '判定本轮不贴' : `选中=${id}`}${answer.note === undefined ? '' : ` (${answer.note})`}`,
      })
    })()
    return () => {
      alive = false
    }
  }, [config.enabled, config.autoMode, state.muted, phase, sessionId, turn, data?.text])

  // 派生：生成中 = 思考/打字占位；落定 = 这一轮的最终贴纸（纯函数，故刷新后一模一样）。
  const choice: StickerChoice | null = useMemo(() => {
    if (!config.enabled || state.muted || entries.length === 0) return null
    if (phase === 'streaming') return thinkingStickerFor(entries, sessionId, turn)
    // JEV 模式还在等结论：宁可先不显示，也不要闪一张随机再换掉。
    if (config.autoMode === 'jev' && jevPick === undefined) return null
    const latch = state.sessionLatch ?? state.latch
    return finalStickerFor({
      entries,
      sessionId,
      turn,
      text: data?.text ?? '',
      modelId: data?.modelId ?? null,
      modelMood: data?.modelMood ?? null,
      jevId: jevPick?.id ?? null,
      mode: config.autoMode,
      everyTurns: config.autoEveryTurns,
      fallbackId: config.fallback,
      latchId: latch,
      avoid: new Set(state.recent),
    })
  }, [config, state, entries, phase, sessionId, turn, data?.text, data?.modelId, data?.modelMood, jevPick])

  // 一次性指定用完即清：只让"最新的那个已落定回合"消费它。
  useEffect(() => {
    if (phase !== 'settled' || choice?.reason !== 'latch') return
    if (latchConsumedFor >= turn) return
    latchConsumedFor = turn
    void putLatch(null)
    postDebug({ kind: 'sticker-latch-consumed', ...(sessionId === '' ? {} : { sessionId }), turn, id: choice.id })
  }, [phase, choice?.reason, choice?.id, turn, sessionId])

  // 观测：每个节点每种阶段报一次（历史回放只抽查前几个，别刷爆环形缓冲）。
  // 去重键必须**带上选中的那张**：词表是异步到的，"先是 null、后选中"这次变化才是证据；
  // 只按 (key, phase) 去重会把真正的结论吞掉（踩过一次）。
  useEffect(() => {
    const key = props.node?.key ?? '?'
    const mark = `${phase}|${choice?.id ?? 'none'}`
    if (reported.get(key) === mark) return
    const firstSight = reported.get(key) === undefined
    reported.set(key, mark)
    if (firstSight) {
      if (firstSightings >= REPLAY_REPORT_LIMIT) return
      firstSightings += 1
    }
    const host = ref.current?.closest('[data-chat-flow-key]') as HTMLElement | null
    const dataset = host?.dataset ?? {}
    const rect = ref.current?.getBoundingClientRect()
    postDebug({
      kind: 'sticker-node',
      ...(sessionId === '' ? {} : { sessionId }),
      turn,
      ...(choice === null ? {} : { id: choice.id }),
      note:
        `build=${NODE_BUILD} phase=${phase} 选中=${choice === null ? '无' : `${choice.id}(${reasonText(choice)})`}` +
        ` anchor=${props.node?.anchorSeq ?? '?'} key=${key}` +
        ` 过程成员=${dataset.turnProcessMember ?? 'no'}` +
        ` rect=${rect === undefined ? '?' : `${Math.round(rect.top)}/${Math.round(rect.height)}`}`,
    })
  }, [phase, choice?.id, sessionId, turn, props.node?.anchorSeq, props.node?.key])

  // 会话流那个座位只负责生成中的占位；落定的最终贴纸交给 turn-tail 座位（见 `seat` 的说明）。
  // 这一行必须在**所有 hook 之后** —— 条件返回排在 hook 前面，会让开关一变换 hook 数量并当场炸。
  if (seat === 'flow' && phase === 'settled') return null
  if (choice === null) return null

  const size = Math.max(40, Math.min(220, config.bubbleSize))
  const streaming = phase === 'streaming'
  const tip = `《${choice.name}》· ${reasonText(choice)} · 点击看大图`
  const radius = config.shape === 'circle' ? '50%' : `${Math.max(0, config.radius)}px`

  return (
    <div
      ref={ref}
      className="dsh-memes-reply-node-row"
      style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -Math.max(0, config.bubbleRise), paddingRight: 6 }}
    >
      <button
        type="button"
        className="dsh-memes-reply-node-fish"
        title={tip}
        aria-label={tip}
        onClick={() => window.open(choice.url, '_blank', 'noopener,noreferrer')}
        style={{
          width: size,
          height: size,
          padding: 0,
          border: config.borderStyle === 'none' || config.borderWidth <= 0 ? 'none' : `${config.borderWidth}px ${config.borderStyle} ${config.borderColor === '' ? 'var(--dsw-alias-border-2, #d0d5dd)' : config.borderColor}`,
          borderRadius: radius,
          background: 'transparent',
          cursor: 'pointer',
          overflow: 'hidden',
          opacity: streaming ? 0.85 : 1,
          transform: streaming ? 'scale(0.92)' : 'none',
          transition: 'transform 120ms ease, opacity 120ms ease',
        }}
      >
        {near ? (
          // 全尺寸动画 WebP（**绝不用 thumb**：那是首帧静图，v1.0 的老毛病）。
          <img
            src={choice.url}
            alt={choice.name}
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget
              postDebug({
                kind: 'sticker-img-loaded',
                ...(sessionId === '' ? {} : { sessionId }),
                turn,
                id: choice.id,
                note: `src=${choice.url} 原始尺寸=${image.naturalWidth}x${image.naturalHeight} 显示=${Math.round(image.clientWidth)}px`,
              })
            }}
            onError={() => {
              postDebug({
                kind: 'sticker-img-error',
                ...(sessionId === '' ? {} : { sessionId }),
                turn,
                id: choice.id,
                note: `src=${choice.url} 加载失败（破图）`,
              })
            }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: radius, display: 'block' }}
          />
        ) : (
          <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: radius }} />
        )}
      </button>
    </div>
  )
}

/**
 * 挂上贴纸层。
 *
 * `ctx.inject(['uiConversation'])` 而**不是**顶层 `inject`：万一某个部署里这个服务不存在，
 * 也不能把本插件整个浏览器半边（含设置面板）带下线。
 *
 * @param ctx - 插件浏览器半边的上下文。
 * @param scope - 设置来源（延迟绑定句柄）。
 * @param insideSession - 额外在**同一个会话 fiber 里**跑的回调。
 *   给同样声明成 `scope: 'session'` 的座位用 —— 那些座位**必须**从会话 fiber 注册，
 *   从根上下文注册会**无声失败**（连一条回执都不会发，因为 `slots.inject` 的回调压根不触发）。
 *   踩过一次：落定贴纸就是这样"注册了但永远不渲染"的。
 */
export function installStickerNode(
  ctx: ClientContext,
  scope: SettingsScope<MemesConfig>,
  insideSession?: (inner: ClientContext) => void,
): void {
  const anyCtx = ctx as unknown as {
    inject(deps: string[], callback: (inner: ClientContext) => void): unknown
  }
  anyCtx.inject(['uiConversation'], (inner: ClientContext) => {
    const ui = (inner as unknown as { uiConversation?: UiConversationLike }).uiConversation
    if (ui === undefined || ui.events === undefined) {
      postDebug({ kind: 'sticker-node-no-service', note: 'uiConversation 不在，贴纸层未装上' })
      return
    }
    let dispose: (() => void) | null = null
    try {
      dispose = ui.events.register(makeStickerDefinition()) as () => void
    } catch (error) {
      const message = (error as { message?: unknown } | null)?.message
      postDebug({
        kind: 'sticker-node-register-failed',
        note: `build=${NODE_BUILD} err=${typeof message === 'string' ? message : String(error)}`,
      })
    }
    if (dispose !== null) inner.effect(() => dispose as () => void, 'dsh-memes-reply: 贴纸节点定义')
    inner.slots.inject('conversation.chat.node', () =>
      inner.slots.register(
        // kind 是我们自己新增的：构建期类型表（ChatNodeDataMap）里没有它，运行时按字符串分发，
        // 所以这里显式收窄掉类型检查 —— 不为一个探针式扩展把整条依赖链抬上去。
        { name: 'conversation.chat.node', key: STICKER_NODE_KIND } as never,
        (props: unknown) => <StickerNodeView scope={scope} {...(props as { node?: never; sessionId?: never })} />,
      ),
    )
    postDebug({ kind: 'sticker-node-installed', note: `build=${NODE_BUILD} kind=${STICKER_NODE_KIND}` })
    insideSession?.(inner)
  })
}
