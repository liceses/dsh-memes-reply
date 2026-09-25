/**
 * dsh-memes-reply — JEV 调试漂浮面板（可开关）。
 *
 * 要回答的问题只有一个：**这一轮到底发给 JEV 什么、它回了什么。**
 * 宿主把每次真实往返记在 `/jev-log`（只记真发生过的调用，命中缓存不产生新条目），
 * 这里把它画出来：一枚可拖的小胶囊 ↔ 展开成面板。
 *
 * 座位与挂件同一个 `shell.overlay`（frame-wide、加法型、整层 click-through），
 * 所以只在面板本体范围内接管指针事件，不挡下面的界面。
 *
 * 三条纪律：
 *   1. **只在展开时轮询** —— 收起/关闭就不发请求，别为一个关着的面板每 2.5 秒吵一次宿主；
 *   2. **只读** —— 这里没有任何写操作（不重发、不改族表），排障工具不该能改变被观测的东西；
 *   3. 位置与收起态写回 `state.json`（`/layout` 的 `jevDebug` 槽），刷新后还在。
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_CONFIG } from '../config.js'
import type { FloatPanelState, MemesConfig } from '../types.js'
import { fetchJevLog, fetchLayout, putLayout, type JevExchangeItem, type JevLogResponse } from './api.js'

/** 展开时的轮询间隔：够快看到"刚发的那次"，又不至于把宿主吵醒太频繁。 */
const POLL_MS = 2500

/** 面板最多显示几条。 */
const SHOW_LIMIT = 10

/** 默认落点：右上角，避开挂件（右下）与面板里的刷新按钮。 */
const DEFAULT_POS = { right: 28, bottom: 0, top: 96 }

/** 拖拽判定阈值。 */
const DRAG_SLOP = 4

/** 夹取。 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** 时间戳 → `HH:MM:SS`。 */
function clock(at: number): string {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 一次往返的状态徽章文案与语气。 */
function badgeOf(entry: JevExchangeItem): { text: string; tone: string } {
  if (!entry.ok) return { text: entry.error === '' ? '失败' : entry.error, tone: 'bad' }
  if (!entry.stick) return { text: '判不贴', tone: 'muted' }
  return { text: '成功', tone: 'good' }
}

/** JSON 展示（拿不到就显式说明，不静默空白）。 */
function pretty(value: unknown): string {
  if (value === null || value === undefined) return '（没有）'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '（无法序列化）'
  }
}

/** 一条往返。 */
function Row({ entry }: { entry: JevExchangeItem }): ReactElement {
  const [open, setOpen] = useState(false)
  const badge = badgeOf(entry)
  return (
    <li className="dsh-memes-reply-jev-item">
      <button type="button" className="dsh-memes-reply-jev-head" onClick={() => setOpen((value) => !value)}>
        <span className="dsh-memes-reply-jev-time">{clock(entry.at)}</span>
        <span className={`dsh-memes-reply-jev-badge dsh-memes-reply-jev-badge-${badge.tone}`}>{badge.text}</span>
        <span className="dsh-memes-reply-jev-meta">
          #{entry.turn} · {entry.family} · p={entry.probability.toFixed(2)} · yes={entry.yesProbability.toFixed(2)} ·{' '}
          {entry.ms}ms{entry.costUsd === null ? '' : ` · $${entry.costUsd.toFixed(6)}`}
        </span>
        <span className="dsh-memes-reply-jev-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div className="dsh-memes-reply-jev-body">
          <div className="dsh-memes-reply-jev-label">
            发给 JEV{entry.status === null ? '' : ` · HTTP ${entry.status}`} · 模型 {entry.model}
          </div>
          <pre className="dsh-memes-reply-jev-pre">{pretty(entry.request)}</pre>
          <div className="dsh-memes-reply-jev-label">
            JEV 回{entry.error === '' ? '' : ` · 错误 ${entry.error}`}
            {entry.note === '' ? '' : ` · ${entry.note}`}
          </div>
          <pre className="dsh-memes-reply-jev-pre">{pretty(entry.response)}</pre>
        </div>
      ) : null}
    </li>
  )
}

/** JEV 调试漂浮面板。 */
export function JevDebugPanel({ scope }: { scope: SettingsScope<MemesConfig> }): ReactElement | null {
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => scope.subscribe(listener), [scope]),
    useCallback(() => scope.getSnapshot(), [scope]),
  )
  const config: MemesConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...(snapshot.value ?? {}) }), [snapshot.value])

  const [panel, setPanel] = useState<FloatPanelState>({})
  const [log, setLog] = useState<JevLogResponse | null>(null)
  const [error, setError] = useState('')
  const posRef = useRef<{ right: number; bottom: number } | null>(null)
  const dragRef = useRef<{ x: number; y: number; right: number; bottom: number; moved: boolean } | null>(null)

  const collapsed = panel.collapsed === true

  /** 读回位置（刷新后还在）。 */
  useEffect(() => {
    let alive = true
    void (async () => {
      const saved = (await fetchLayout())?.jevDebug
      if (!alive || saved === undefined) return
      setPanel(saved)
      if (typeof saved.right === 'number' && typeof saved.bottom === 'number') {
        posRef.current = { right: saved.right, bottom: saved.bottom }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /** 只在展开时拉日志（收起即停，别为一个关着的面板一直吵宿主）。 */
  useEffect(() => {
    if (!config.jevDebugVisible || collapsed) return
    let alive = true
    const pull = async (): Promise<void> => {
      const response = await fetchJevLog(SHOW_LIMIT)
      if (!alive) return
      if (response === undefined) {
        setError('取不到日志（宿主路由不可达？）')
        return
      }
      setError('')
      setLog(response)
    }
    void pull()
    const handle = window.setInterval(() => void pull(), POLL_MS)
    return () => {
      alive = false
      window.clearInterval(handle)
    }
  }, [config.jevDebugVisible, collapsed])

  /**
   * 落点样式。
   *
   * 注意它必须待在下面那个 `if (!config.jevDebugVisible) return null` **之前**：
   * hook 不能在条件返回之后调用 —— 开关从关到开会让 hook 数量变化，React 会直接报错
   * （`test/client-bundle.test.mjs` 的"hooks 顺序门禁"盯着这条，实测会红）。
   */
  const style = useMemo(() => {
    if (typeof panel.right === 'number' && typeof panel.bottom === 'number') {
      return { right: panel.right, bottom: panel.bottom }
    }
    return { right: DEFAULT_POS.right, top: DEFAULT_POS.top }
  }, [panel])

  if (!config.jevDebugVisible) return null

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    // 只在标题栏上拖：面板里的按钮/文本要能正常点选。
    const element = event.currentTarget
    element.setPointerCapture?.(event.pointerId)
    const rect = element.getBoundingClientRect()
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom,
      moved: false,
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === null) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return
    drag.moved = true
    const right = clamp(drag.right - dx, 4, Math.max(4, window.innerWidth - 80))
    const bottom = clamp(drag.bottom - dy, 4, Math.max(4, window.innerHeight - 40))
    posRef.current = { right, bottom }
    setPanel((previous) => ({ ...previous, right, bottom }))
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (drag === null || !drag.moved) return
    if (posRef.current !== null) void putLayout({ slot: 'jevDebug', ...posRef.current })
  }

  const setCollapsed = (next: boolean): void => {
    setPanel((previous) => ({ ...previous, collapsed: next }))
    void putLayout({ slot: 'jevDebug', collapsed: next })
  }

  const stats = log?.stats
  const entries = log?.entries ?? []

  if (collapsed) {
    return (
      <div className="dsh-memes-reply-jev-layer">
        <button
          type="button"
          className="dsh-memes-reply-jev-chip"
          style={style}
          title="展开 JEV 调试面板"
          onClick={() => setCollapsed(false)}
        >
          JEV
          {stats === undefined ? '' : ` ${stats.calls}`}
        </button>
      </div>
    )
  }

  return (
    <div className="dsh-memes-reply-jev-layer">
      <div className="dsh-memes-reply-jev-panel" style={style}>
        <div
          className="dsh-memes-reply-jev-title"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          title="拖动可移动"
        >
          <span>JEV 往返</span>
          <span className="dsh-memes-reply-jev-totals">
            {stats === undefined
              ? '（未取到 /jev-log）'
              : `调用 ${stats.calls} · 缓存 ${stats.hits} · 回落 ${stats.fallbacks} · $${stats.costUsd.toFixed(6)}`}
          </span>
          <span className="dsh-memes-reply-jev-actions" onPointerDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="dsh-memes-reply-jev-tool"
              title="立即刷新"
              onClick={() => {
                void (async () => {
                  const response = await fetchJevLog(SHOW_LIMIT)
                  if (response !== undefined) setLog(response)
                })()
              }}
            >
              ⟳
            </button>
            <button
              type="button"
              className="dsh-memes-reply-jev-tool"
              title="收成小胶囊（随时点它再展开）"
              onClick={() => setCollapsed(true)}
            >
              —
            </button>
          </span>
        </div>

        <div className="dsh-memes-reply-jev-hint">
          只记<b>真实</b>调用，命中缓存不产生新条目。展开时每 {POLL_MS / 1000}s 自动刷新。
        </div>

        {error === '' ? null : <div className="dsh-memes-reply-jev-error">{error}</div>}

        {entries.length === 0 ? (
          <div className="dsh-memes-reply-jev-empty">
            还没有真实调用。
            <br />
            把设置里的「自动贴纸」改成 <code>jev</code>，然后随便聊一轮。
          </div>
        ) : (
          <ul className="dsh-memes-reply-jev-list">
            {entries.map((entry) => (
              <Row key={`${entry.at}-${entry.sessionId}-${entry.turn}`} entry={entry} />
            ))}
          </ul>
        )}

        <div className="dsh-memes-reply-jev-hint">
          最多留最近 {log?.capacity ?? SHOW_LIMIT} 次（内存里，不落盘）。请求与响应里的长文本已截断。
        </div>
      </div>
    </div>
  )
}
