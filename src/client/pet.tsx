/**
 * dsh-memes-reply — 常驻挂件（"随时能看到大肥鱼"）。
 *
 * 坐在 `shell.overlay`：官方目录把它定义为 *frame-wide floating layer*——**加法型**
 * （`replaceRisk: none`），而且"the layer itself is click-through — entries opt back into
 * pointer events"，所以我只在鱼身范围内接管事件，不会挡住下面的界面。
 *
 * 这也是你原来那只 `鲸鱼娘` 的模型（`~/.dsh/pet.json` 里就是 `display: {visible, size,
 * right, bottom}`）：一枚常驻的、可拖、可换、可收起的圆贴纸，只是这里有 157 张可轮换。
 *
 * 状态：位置 / 是否收成小圆点 / 当前那张都写进 host 的 `state.json`（`/pet` 端点），
 * 刷新页面、换个会话都还在。
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { DEFAULT_CONFIG } from '../config.js'
import type { CatalogItem, MemesConfig, PetCorner, PetState } from '../types.js'
import { fetchCatalog, fetchPet, putPet } from './api.js'

/** 挂件尺寸的夹取范围。 */
const MIN_SIZE = 64
const MAX_SIZE = 320

/** 收起来之后那枚小圆点的边长。 */
const DOT_SIZE = 32

/** 拖拽判定的最小位移：小于它算"点击"（换一张）。 */
const DRAG_SLOP = 4

/** 四角的默认停靠位置（拖过之后以拖拽坐标为准）。 */
const CORNER_STYLE: Record<PetCorner, { right?: number; left?: number; bottom?: number; top?: number }> = {
  br: { right: 28, bottom: 104 },
  bl: { left: 28, bottom: 104 },
  tr: { right: 28, top: 96 },
  tl: { left: 28, top: 96 },
}

/** 夹取。 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/** 常驻挂件。 */
export function StickerPet({ scope }: { scope: SettingsScope<MemesConfig> }): ReactElement | null {
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => scope.subscribe(listener), [scope]),
    useCallback(() => scope.getSnapshot(), [scope]),
  )
  const config: MemesConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...(snapshot.value ?? {}) }), [snapshot.value])

  const [item, setItem] = useState<CatalogItem | null>(null)
  const [pet, setPet] = useState<PetState>({})
  const [hover, setHover] = useState(false)
  const [busy, setBusy] = useState(false)

  /** 拖拽期间的位置镜像（state 更新是异步的，落点要用它）。 */
  const posRef = useRef<{ right: number; bottom: number } | null>(null)
  const dragRef = useRef<{ x: number; y: number; right: number; bottom: number; moved: boolean } | null>(null)

  const size = clamp(config.petSize, MIN_SIZE, MAX_SIZE)

  /** 换一张：优先用记住的那张，否则随机取一批里的头一张。 */
  const shuffle = useCallback(async (preferId?: string): Promise<void> => {
    setBusy(true)
    try {
      const response =
        preferId !== undefined && preferId !== ''
          ? await fetchCatalog(1, 0, preferId)
          : await fetchCatalog(8, Math.floor(Math.random() * 1_000_000))
      const picked = response?.items?.[0]
      if (picked === undefined) return
      setItem(picked)
      void putPet({ id: picked.id })
    } finally {
      setBusy(false)
    }
  }, [])

  // 首次挂载：读回记住的位置/形态/那张图。
  useEffect(() => {
    let alive = true
    void (async () => {
      const saved = await fetchPet()
      if (!alive) return
      if (saved !== undefined) {
        setPet(saved)
        if (typeof saved.right === 'number' && typeof saved.bottom === 'number') {
          posRef.current = { right: saved.right, bottom: saved.bottom }
        }
      }
      await shuffle(saved?.id)
    })()
    return () => {
      alive = false
    }
  }, [shuffle])

  const style = useMemo(() => {
    const base: Record<string, string | number> = {
      width: pet.collapsed === true ? DOT_SIZE : size,
      height: pet.collapsed === true ? DOT_SIZE : size,
    }
    if (typeof pet.right === 'number' && typeof pet.bottom === 'number') {
      base.right = pet.right
      base.bottom = pet.bottom
      return base
    }
    return { ...base, ...CORNER_STYLE[config.petCorner] }
  }, [pet, size, config.petCorner])

  if (!config.petVisible) return null

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
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
    const right = clamp(drag.right - dx, 4, Math.max(4, window.innerWidth - DOT_SIZE - 4))
    const bottom = clamp(drag.bottom - dy, 4, Math.max(4, window.innerHeight - DOT_SIZE - 4))
    posRef.current = { right, bottom }
    setPet((previous) => ({ ...previous, right, bottom }))
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (drag === null) return
    if (!drag.moved) {
      // 点击（不是拖）：收起态点一下展开，展开态点一下换一张。
      if (pet.collapsed === true) {
        setPet((previous) => ({ ...previous, collapsed: false }))
        void putPet({ collapsed: false })
      } else {
        void shuffle()
      }
      return
    }
    if (posRef.current !== null) void putPet(posRef.current)
  }

  const collapse = (collapsed: boolean): void => {
    setPet((previous) => ({ ...previous, collapsed }))
    void putPet({ collapsed })
  }

  return (
    <div className="dsh-memes-reply-pet-layer">
      <div
        className={
          pet.collapsed === true
            ? 'dsh-memes-reply-pet dsh-memes-reply-pet-dot'
            : hover
              ? 'dsh-memes-reply-pet dsh-memes-reply-pet-hover'
              : 'dsh-memes-reply-pet'
        }
        style={style}
        role="button"
        tabIndex={0}
        aria-label={item === null ? '大肥鱼挂件' : `大肥鱼挂件：《${item.name}》· 点击换一张`}
        title={item === null ? '大肥鱼挂件' : `《${item.name}》· 点击换一张 · 拖动可移动`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            void shuffle()
          }
        }}
      >
        {item === null ? (
          <span className="dsh-memes-reply-pet-empty" aria-hidden>
            🐟
          </span>
        ) : (
          <img
            className="dsh-memes-reply-pet-img"
            src={pet.collapsed === true ? (item.thumb ?? item.url) : item.url}
            alt={item.name}
            draggable={false}
          />
        )}

        {pet.collapsed !== true && hover ? (
          <div className="dsh-memes-reply-pet-tools" onPointerDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="dsh-memes-reply-pet-tool"
              disabled={busy}
              title="换一张"
              onClick={() => void shuffle()}
            >
              ✨
            </button>
            <button
              type="button"
              className="dsh-memes-reply-pet-tool"
              title="收成小圆点（随时点它再展开）"
              onClick={() => collapse(true)}
            >
              ✕
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
