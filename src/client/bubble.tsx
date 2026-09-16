/**
 * dsh-memes-reply — 气泡角上的圆贴纸（复刻路径 B 效果图）。
 *
 * 座位：`conversation.chat.turnTail`（**链式**、session 作用域）。
 *
 * 两条关键事实（都实测查过）：
 *  1. 链式条目按 **`priority` 升序**尝试，第一个非空者独占渲染 —— 所以本条目用
 *     `priority: 10` 排在 `present` 的交付卡片（0）**之后**：有交付卡片的回合它先渲染、
 *     我这里不显示；其余回合我显示。**不顶掉任何官方功能**，代价只是"那一回合少一张贴纸"。
 *  2. `data-actions-reveal=hover` 的 CSS 只命中 `.actions`（图标行）容器；尾巴链的内容是
 *     它的**兄弟节点**，不受悬停显隐影响 —— 所以历史回复里的贴纸**一直可见**。
 *     （这也是当初否掉 `conversation.chat.assistant-actions` 的原因：贴纸在那里会跟着
 *     图标行一起被 hover 隐藏，只有最新一条看得见。）
 *
 * 渲染：右对齐 + 负上边距，让圆压在助手气泡右下角；悬停放大、点击看大图、✕ 收起这一张。
 */

import { useEffect, useState, type ReactElement } from 'react'
import { stickerStore } from '../store.js'
import type { AutoEvent } from '../types.js'
import { postDebug } from './api.js'

/** 依据（模型挑的 / 关键词命中 / 到点了）的人话说明。 */
function reasonText(event: AutoEvent): string {
  if (event.reason === 'model') return '模型挑的'
  if (event.reason === 'keyword' && event.matched !== '') return `命中「${event.matched}」`
  return '到点了'
}

/** 气泡角贴纸。 */
export function StickerBubble({
  sessionId,
  turn,
  matched,
}: {
  sessionId: string
  turn: number
  matched: AutoEvent
}): ReactElement | null {
  const [hidden, setHidden] = useState(false)

  // 挂载即"认领"到本轮：之后本轮稳定返回它，别的轮次再也借不走。
  // 只在会话对得上时认领 —— 否则会把这张从正确的会话手里抢走。
  useEffect(() => {
    postDebug({ kind: 'bubble-mount', sessionId, turn, id: matched.id, note: `event.turn=${matched.turn}` })
    if (matched.sessionId === sessionId) stickerStore().claim(turn)
  }, [matched, sessionId, turn])

  // selector 用 turn+seq 双重判定（拿不到 sessionId），这里再核对一次会话，避免跨会话误判。
  if (hidden || matched.sessionId !== sessionId) return null

  const tip = `《${matched.name}》· ${reasonText(matched)} · 点击看大图`

  return (
    <div className="dsh-memes-reply-bubble">
      <button
        type="button"
        className="dsh-memes-reply-bubble-fish"
        title={tip}
        aria-label={tip}
        onClick={() => window.open(matched.url, '_blank', 'noopener,noreferrer')}
      >
        <img src={matched.thumb ?? matched.url} alt={matched.name} draggable={false} />
      </button>
      <button
        type="button"
        className="dsh-memes-reply-bubble-close"
        title="收起这一张"
        aria-label="收起这一张"
        onClick={() => {
          stickerStore().dismiss(turn)
          setHidden(true)
        }}
      >
        ✕
      </button>
    </div>
  )
}
