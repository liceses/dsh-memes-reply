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

import { useCallback, useSyncExternalStore, type ReactElement } from 'react'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
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

  const subscribe = useCallback(
    (listener: () => void): (() => void) => (tailSource === undefined ? () => {} : tailSource.subscribe(listener)),
    [tailSource],
  )
  const read = useCallback((): TurnTailDataLike | undefined => (tailSource === undefined ? undefined : tailSource.get()), [tailSource])
  const tail = useSyncExternalStore(subscribe, read, read)

  const closing = tail?.closing ?? null
  const pick = closingPickOf(closing)

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
          text: closingTextOf(closing),
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
export function installStickerTurnTail(ctx: ClientContext, scope: SettingsScope<MemesConfig>): void {
  // 刻意用宽松的结构化签名：官方 SlotMap 把 `sessionId` 声明在运行时合并的
  // `SessionStandardProps` 里，静态类型上看不见，硬用会逼出一堆 cast（node.tsx 同样处理）。
  const anyCtx = ctx as unknown as {
    slots: {
      inject(key: string, callback: () => () => void): () => void
      register(options: { name: string; id: string; order: number }, component: unknown): () => void
    }
  }
  anyCtx.slots.inject(TURN_TAIL_SLOT, () =>
    anyCtx.slots.register({ name: TURN_TAIL_SLOT, id: ENTRY_ID, order: ENTRY_ORDER }, (props: TurnTailSeatProps) => (
      <StickerTurnTail scope={scope} {...props} />
    )),
  )
  postDebug({
    kind: 'sticker-turn-tail-installed',
    note: `slot=${TURN_TAIL_SLOT} id=${ENTRY_ID}（落定贴纸的新座位；旧的自定义节点只留生成中占位）`,
  })
}
