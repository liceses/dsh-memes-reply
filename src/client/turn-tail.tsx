/**
 * 落定贴纸的座位：官方「回合收尾」槽位 `conversation.chat.turnTail`。
 *
 * ## 为什么是这里
 *
 * 官方的「工作步骤展示」（选择希望看到多少工具调用细节）会把会话流节点算进**过程折叠窗口**，
 * 而我们的自定义 kind 不在豁免名单里 —— 折叠一收，落定贴纸就跟着工具细节被藏起来。
 * 完整判定与论证写在 `node.tsx` 里 `seat` 的注释上（那里是渲染单元，也是这条改动的源头）。
 *
 * 这个槽位在 0.1.5-rc.1 与 0.1.7-rc.2 上**契约完全一致**（`TurnTailOwnerProps` 与
 * `TurnTailChatData` 逐字相同），所以这一条代码路径两个版本通吃，不需要分支。
 *
 * ## 数据从哪来
 *
 * 槽位的 owner props 只给 `{ turn, seq, openFile }`（外加会话作用域注入的 `sessionId`），
 * **没有正文**。正文在 chat 包写进本轮 turn 数据的 `TurnTailChatData.closing` 里
 * （"本轮最后一个有内容的收尾助手"），用 `turn.data.source('turn-tail')` 订阅着读。
 *
 * ## 复用
 *
 * 渲染单元整体复用 `StickerNodeView`（派生、词表、会话态、JEV、图片、观测全都在里面）。
 * 这里只做两件事：把官方数据翻译成它要的字段，然后合成一个最小 `node` 形状递进去 ——
 * **不复制任何逻辑**。
 */

import { useCallback, useEffect, useSyncExternalStore, type ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
// 0.1.7：客户端插件上下文改用 cordis 的 `Context`（`ClientContext` 已随
// `@deepseek-ai/dsh-client-runtime` 一起消失）；类型别名见 `settings-source.ts`。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SettingsScope } from '../settings-source.js'
import { closingPickOf, closingTextOf, type ClosingAssistantLike } from '../closing.js'
import type { MemesConfig } from '../types.js'
import { postDebug } from './api.js'
import { StickerNodeView } from './node.js'

/** 槽位名（官方 chat 包声明；0.1.5 与 0.1.7 一致）。 */
export const TURN_TAIL_SLOT = 'conversation.chat.turnTail'

/** 本插件在该槽位里的条目 id（list 槽位，一个 id 一个条目）。 */
const ENTRY_ID = 'dsh-memes-reply-sticker'

/** chat 包写进本轮 turn 数据的键。 */
const TURN_TAIL_KEY = 'turn-tail'

/** 排在其他收尾贡献之前，但仍排在官方操作行之后（官方 order 更大）。 */
const ENTRY_ORDER = 20

/**
 * 已经报过"挂载"的座位实例（去重，别把 48 条环形缓冲刷爆）。
 *
 * 为什么这条回执必须**同步**发、不能放 effect：effect 在首渲染成功之后才跑，
 * 而"座位渲染了但当场抛错"这种情况里 effect 永远不会执行 —— 那样我们就分不清
 * "座位根本没渲染"与"渲染了但炸了"。同步回执能分清，这是排查落定贴纸不显示的关键一步。
 */
const MOUNT_REPORTED = new Set<string>()

/** 描述槽位 owner props 的真实形状（`turn` 到底是数字还是数据对象，一眼看出）。 */
function describeTurnSeat(props: TurnTailSeatProps): string {
  const turn = props.turn as { turn?: unknown; data?: { source?: unknown } } | undefined
  const data = turn?.data
  return (
    `props=${Object.keys(props).sort().join(',')}` +
    ` typeof(turn)=${typeof props.turn}` +
    ` typeof(turn.turn)=${typeof turn?.turn}` +
    ` hasData=${data !== undefined && data !== null}` +
    ` hasSource=${typeof data?.source === 'function'}`
  )
}

/** 收尾数据里我们用得到的那部分（官方 `TurnTailChatData`）。 */
interface TurnTailDataLike {
  readonly turn?: number
  readonly seq?: number
  readonly closing?: ClosingAssistantLike | null
}

/** `turn.data.source(key)` 的返回形状（官方 `ConversationLocationDataSource`）。 */
interface DataSourceLike<T> {
  get(): T
  subscribe(listener: () => void): () => void
}

/** 槽位 owner props + 会话作用域注入的 `sessionId`（官方 `PropsRuntime` 会带上它）。 */
interface TurnTailSeatProps {
  turn?: {
    turn?: number
    data?: { source?: (key: string) => DataSourceLike<TurnTailDataLike | undefined> }
  }
  seq?: number
  sessionId?: unknown
}

/**
 * 一轮的落定贴纸。
 *
 * 没有可贴的（规则没选中 / 静音 / 总开关关着）时返回 `null` —— 官方对这个槽位的要求就是
 * "没有内容的条目渲染成 null"。
 */
function StickerTurnTail({
  scope,
  ...props
}: { scope: SettingsScope<MemesConfig> } & TurnTailSeatProps): ReactElement | null {
  const fallbackTurn = typeof props.turn?.turn === 'number' ? props.turn.turn : 0
  const source = props.turn?.data?.source
  const tailSource = typeof source === 'function' ? source(TURN_TAIL_KEY) : undefined

  // 诊断（同步，故意不是 effect）：组件只要被 React 渲染就会留下这一条。
  const mountMark = `${typeof props.turn}:${String((props.turn as { turn?: unknown } | undefined)?.turn ?? props.seq ?? '?')}`
  if (!MOUNT_REPORTED.has(mountMark) && MOUNT_REPORTED.size < 4) {
    MOUNT_REPORTED.add(mountMark)
    postDebug({
      kind: 'sticker-turn-tail-mounted',
      ...(typeof props.sessionId === 'string' && props.sessionId !== '' ? { sessionId: props.sessionId } : {}),
      turn: fallbackTurn,
      note: `seat=turn-tail 组件已渲染 · ${describeTurnSeat(props)} tailSource=${tailSource === undefined ? 'undefined' : 'ok'}`,
    })
  }

  const subscribe = useCallback(
    (listener: () => void): (() => void) => (tailSource === undefined ? () => {} : tailSource.subscribe(listener)),
    [tailSource],
  )
  const read = useCallback((): TurnTailDataLike | undefined => (tailSource === undefined ? undefined : tailSource.get()), [tailSource])
  const tail = useSyncExternalStore(subscribe, read, read)

  const closing = tail?.closing ?? null
  const pick = closingPickOf(closing)
  const text = closingTextOf(closing)

  // 诊断：这个座位到底挂上了没、官方数据到了没。折叠问题的排查全靠这条（只在变化时报）。
  useEffect(() => {
    postDebug({
      kind: 'sticker-turn-tail-render',
      ...(typeof props.sessionId === 'string' && props.sessionId !== '' ? { sessionId: props.sessionId } : {}),
      turn: tail?.turn ?? fallbackTurn,
      ...(pick.id === null ? {} : { id: pick.id }),
      note:
        `seat=turn-tail turn=${tail?.turn ?? fallbackTurn} seq=${tail?.seq ?? props.seq ?? '?'}` +
        ` tail=${tail === undefined ? 'undefined' : 'ok'} closing=${closing === null ? 'null' : 'ok'}` +
        ` text=${text.length}字 pick=${pick.id ?? pick.mood ?? '无'}` +
        ` · ${describeTurnSeat(props)}`,
    })
  }, [tail?.turn, tail?.seq, closing === null, text.length, pick.id, pick.mood, props.sessionId, props.seq, fallbackTurn])

  return (
    <StickerNodeView
      scope={scope}
      seat="turn-tail"
      {...(typeof props.sessionId === 'string' ? { sessionId: props.sessionId } : {})}
      node={{
        // 收尾槽位没有"节点"这个概念，但渲染单元要的正是这几个字段 ——
        // 合成一个最小形状就能整套复用（派生 / 词表 / 会话态 / JEV / 渲染）。
        key: `${TURN_TAIL_KEY}:${fallbackTurn}`,
        anchorSeq: tail?.seq ?? props.seq ?? 0,
        data: {
          turn: tail?.turn ?? fallbackTurn,
          phase: 'settled',
          text,
          modelId: pick.id,
          modelMood: pick.mood,
        },
      }}
    />
  )
}

/**
 * 把落定贴纸挂上官方的回合收尾槽位。
 *
 * 用 `ctx.slots.inject`（等槽位被声明后才注册）而不是直接注册：槽位由官方 chat 包声明，
 * 没装它、或它没起来时，本插件只是少了落定贴纸，不会把整个浏览器半边带下线。
 *
 * @param ctx - 插件浏览器半边的上下文（只用它的 `slots`）。
 * @param scope - 设置来源（延迟绑定句柄，见 `src/settings-source.ts`）。
 */
export function installStickerTurnTail(ctx: Context, scope: SettingsScope<MemesConfig>): void {
  // 刻意用宽松的结构化签名：官方 SlotMap 把 `sessionId` 声明在运行时合并的
  // `SessionStandardProps` 里，静态类型上看不见，硬用会逼出一堆 cast（node.tsx 同样处理）。
  const anyCtx = ctx as unknown as {
    slots: {
      inject(key: string, callback: () => () => void): () => void
      register(options: { name: string; id: string; order: number }, component: unknown): () => void
      entries?: (name: string) => readonly { options?: { id?: string } }[]
    }
  }
  anyCtx.slots.inject(TURN_TAIL_SLOT, () => {
    // 这条能出现，就说明**槽位真的被声明了**（`slots.inject` 的回调只在那一刻触发）——
    // 排查"注册了但永远不渲染"时，先看有没有它。
    postDebug({ kind: 'sticker-turn-tail-slot', note: `槽位已声明 → 注册 ${ENTRY_ID}` })
    // 注册必须有 try/catch：运行时对三种 kind 各有校验（list 要 id / keyed 要 key / chain 要 select），
    // 任一条不满足都会抛；而 inject 的回调里抛错只会进 renderer console —— 宿主看不到，表现为"静默不渲染"。
    try {
      const dispose = anyCtx.slots.register({ name: TURN_TAIL_SLOT, id: ENTRY_ID, order: ENTRY_ORDER }, (props: TurnTailSeatProps) => (
        <StickerTurnTail scope={scope} {...props} />
      ))
      const entries = typeof anyCtx.slots.entries === 'function' ? anyCtx.slots.entries(TURN_TAIL_SLOT) : undefined
      postDebug({
        kind: 'sticker-turn-tail-registered',
        note:
          `register 成功 id=${ENTRY_ID} · slots.entries=${entries === undefined ? '（无此方法）' : `${entries.length} 条`}` +
          `${entries === undefined ? '' : `[${entries.map((e) => e.options?.id ?? '?').join(',')}]`}`,
      })
      return dispose
    } catch (error) {
      postDebug({
        kind: 'sticker-turn-tail-register-failed',
        note: `register 抛错（这座位因此静默失效）：${error instanceof Error ? error.message : String(error)}`,
      })
      return () => {}
    }
  })
  postDebug({
    kind: 'sticker-turn-tail-installed',
    note:
      `slot=${TURN_TAIL_SLOT} id=${ENTRY_ID}（落定贴纸的新座位；旧的自定义节点只留生成中占位）` +
      ` — 若迟迟没有 sticker-turn-tail-slot 回执，说明槽位没被声明（或注册不在会话 fiber 里）`,
  })
}
