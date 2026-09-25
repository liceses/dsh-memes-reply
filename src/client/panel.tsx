/**
 * dsh-memes-reply — 设置面板（官方折叠卡片风格）。
 *
 * 位置：0.1.6a2 插件管理页的 `plugins.bundle.config`
 * （侧栏「插件」→「已安装」→「查看 dsh-memes-reply」，由内置适配层
 * `src/vendor/dsh-plugin-config-slot.tsx` 注册）。
 * 形态对齐原版卡片：标题 + 描述 + 未保存徽章 + chevron → 展开体 → 底部 丢弃/保存。
 * 配置字段走官方 `settingsScope`（草稿→保存，逐字段可"恢复默认"）；状态行、预览墙、
 * 「下一轮用这张」走插件自己的同源路由。
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { CATALOG_DEFAULT_LIMIT, CONFIG_FIELDS, DEFAULT_CONFIG } from '../config.js'
import type {
  AutoMode,
  CatalogItem,
  MemesConfig,
  PanelStats,
  PetCorner,
  StickerBorderStyle,
  StickerQuality,
  StickerShape,
} from '../types.js'
import { fetchCatalog, fetchStats, putLatch, putLayout, type CatalogResponse } from './api.js'

/** 预览墙格数。 */
const WALL_SIZE = CATALOG_DEFAULT_LIMIT

/** 状态行轮询间隔（只在卡片展开时跑）。 */
const STATS_POLL_MS = 12_000

/** 体积显示。 */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 单字段是否被用户覆盖过（PRESENCE 即覆盖，官方 scope 的 user 层语义）。 */
function isOverridden(user: Record<string, unknown>, field: keyof MemesConfig): boolean {
  return Object.prototype.hasOwnProperty.call(user, field)
}

/** 值比较（保存 diff 用）。 */
function same(a: unknown, b: unknown): boolean {
  return Object.is(a, b)
}

/** 一行字段：标签 + 控件 + 可选提示 + 可选"恢复默认"。 */
function Field({
  label,
  hint,
  overridden,
  disabled,
  onReset,
  children,
}: {
  label: string
  hint?: string
  overridden: boolean
  disabled: boolean
  onReset: () => void
  children: ReactNode
}): ReactElement {
  return (
    <div className="dsh-memes-reply-field">
      <label>{label}</label>
      <div className="dsh-memes-reply-field-control">
        {children}
        <button
          type="button"
          className="dsh-memes-reply-reset"
          disabled={disabled || !overridden}
          title={overridden ? '清除这一项的覆盖，回到默认值' : '当前就是默认值'}
          onClick={onReset}
        >
          默认
        </button>
      </div>
      {hint !== undefined ? <p className="dsh-memes-reply-field-hint">{hint}</p> : null}
    </div>
  )
}

/** 设置卡片（`defaultOpen` = 插件管理页把配置画在独立页面上时直接展开）。 */
export function SettingsCard({
  scope,
  defaultOpen = false,
}: {
  scope: SettingsScope<MemesConfig>
  /** 初次挂载是否直接展开（默认收起，保持插件内嵌使用时的原观感）。 */
  defaultOpen?: boolean
}): ReactElement {
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => scope.subscribe(listener), [scope]),
    useCallback(() => scope.getSnapshot(), [scope]),
  )
  const config: MemesConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...(snapshot.value ?? {}) }), [snapshot.value])
  const user = (snapshot.user ?? {}) as Record<string, unknown>
  const writable = snapshot.writable && snapshot.status === 'ready'

  const [open, setOpen] = useState(defaultOpen)
  const [draft, setDraft] = useState<MemesConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const [stats, setStats] = useState<PanelStats | null>(null)
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [wallSeed, setWallSeed] = useState(0)
  const [wallLoading, setWallLoading] = useState(false)
  const [latch, setLatch] = useState<string | null>(null)
  const [latchFailed, setLatchFailed] = useState(false)
  const [preview, setPreview] = useState<CatalogItem | null>(null)

  const current: MemesConfig = draft ?? config
  const dirty = useMemo(
    () => draft !== null && CONFIG_FIELDS.some((field) => !same(current[field], config[field])),
    [draft, current, config],
  )

  const refreshStats = useCallback(async (): Promise<void> => {
    const next = await fetchStats()
    if (next !== undefined) {
      setStats(next)
      setLatch(next.latch)
    }
  }, [])

  const refreshWall = useCallback(async (seed: number): Promise<void> => {
    setWallLoading(true)
    const next = await fetchCatalog(WALL_SIZE, seed)
    setCatalog(next ?? null)
    setWallLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    void refreshStats()
    void refreshWall(wallSeed)
    const handle = window.setInterval(() => void refreshStats(), STATS_POLL_MS)
    return () => window.clearInterval(handle)
  }, [open, refreshStats, wallSeed, refreshWall])

  const edit = (field: keyof MemesConfig, value: unknown): void => {
    setSaveFailed(false)
    setDraft({ ...(draft ?? config), [field]: value } as MemesConfig)
  }

  const save = async (): Promise<void> => {
    if (!dirty || saving) return
    setSaving(true)
    setSaveFailed(false)
    try {
      for (const field of CONFIG_FIELDS) {
        if (!same(current[field], config[field])) await scope.set(field, current[field])
      }
      setDraft(null)
      await refreshStats()
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const discard = (): void => {
    setDraft(null)
    setSaveFailed(false)
  }

  const resetField = async (field: keyof MemesConfig): Promise<void> => {
    setSaveFailed(false)
    const next = { ...(draft ?? config) }
    delete (next as Record<string, unknown>)[field]
    setDraft(next as MemesConfig)
    try {
      await scope.unset(field)
      setDraft(null)
    } catch {
      setSaveFailed(true)
    }
  }

  const select = async (item: CatalogItem): Promise<void> => {
    setLatchFailed(false)
    setPreview(item)
    const next = await putLatch(item.id)
    if (next === undefined) {
      setLatchFailed(true)
      return
    }
    setLatch(next)
  }

  const cancelLatch = async (): Promise<void> => {
    setLatchFailed(false)
    const next = await putLatch(null)
    if (next === undefined) {
      setLatchFailed(true)
      return
    }
    setLatch(next)
    setPreview(null)
  }

  const ready = stats?.ready === true
  const items = catalog?.items ?? []
  const latched = latch === null ? null : (items.find((item) => item.id === latch) ?? null)

  return (
    <li className={open ? 'dsh-memes-reply-card dsh-memes-reply-card-open' : 'dsh-memes-reply-card'}>
      <button
        type="button"
        className="dsh-memes-reply-head"
        aria-expanded={open}
        aria-label={`${open ? '收起' : '展开'}大肥鱼表情包回复设置`}
        onClick={() => setOpen(!open)}
      >
        <span className="dsh-memes-reply-headtext">
          <span className="dsh-memes-reply-name">大肥鱼表情包回复</span>
          <span className="dsh-memes-reply-desc">
            模型按语境在回复里贴一张会动的大肥鱼
            {snapshot.status === 'unavailable' ? '（设置不可达，使用默认值）' : ''}
          </span>
        </span>
        {dirty ? <span className="dsh-memes-reply-pending">未保存</span> : null}
        <span className="dsh-memes-reply-chevron" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className="dsh-memes-reply-body">
          {/* ---- 状态行 ---- */}
          <div className="dsh-memes-reply-status">
            {stats === null ? (
              <span>状态不可达（路由未挂载或服务未启动）</span>
            ) : (
              <>
                {ready ? (
                  <span>
                    素材 <b>{stats.entries}</b> 张 · {stats.format || '未知格式'} · <b>{formatBytes(stats.totalBytes)}</b> · 已服务{' '}
                    <b>{stats.served}</b> 次{stats.miss > 0 ? ` · 未命中 ${stats.miss}` : ''}
                  </span>
                ) : (
                  <span className="dsh-memes-reply-status-error">
                    索引未就绪：先运行 <code>node scripts/fetch-assets.mjs</code>
                  </span>
                )}
                <button type="button" className="dsh-memes-reply-btn" onClick={() => void refreshStats()}>
                  刷新
                </button>
                <span className="dsh-memes-reply-status-path">
                  {stats.index || '（未找到 index.json）'}
                  {stats.originalRoot === '' ? '' : ` · 原图目录 ${stats.originalRoot}`}
                </span>
              </>
            )}
          </div>

          {/* ---- 配置字段 ---- */}
          <div className="dsh-memes-reply-fields">
            <Field
              label="总开关"
              hint="关掉后不再贴图；历史里的图仍能正常显示"
              overridden={isOverridden(user, 'enabled')}
              disabled={!writable}
              onReset={() => void resetField('enabled')}
            >
              <label className="dsh-memes-reply-check">
                <input
                  type="checkbox"
                  checked={current.enabled}
                  disabled={!writable}
                  onChange={(event) => edit('enabled', event.target.checked)}
                />
                <span>{current.enabled ? '已启用' : '已停用'}</span>
              </label>
            </Field>

            <Field
              label="画质来源"
              hint="original 需要填原图目录；找不到文件会静默回落到压缩副本"
              overridden={isOverridden(user, 'quality')}
              disabled={!writable}
              onReset={() => void resetField('quality')}
            >
              <select
                value={current.quality}
                disabled={!writable}
                onChange={(event) => edit('quality', event.target.value as StickerQuality)}
              >
                <option value="compressed">压缩副本（compressed）</option>
                <option value="original">原始素材（original）</option>
              </select>
            </Field>

            <Field
              label="压缩副本目录"
              hint="留空 = <DSH_HOME>/memes-reply/assets"
              overridden={isOverridden(user, 'assetRoot')}
              disabled={!writable}
              onReset={() => void resetField('assetRoot')}
            >
              <input
                type="text"
                value={current.assetRoot}
                placeholder="留空 = 默认目录"
                disabled={!writable}
                onChange={(event) => edit('assetRoot', event.target.value)}
              />
            </Field>

            <Field
              label="原图目录"
              hint="仅 quality=original 时使用"
              overridden={isOverridden(user, 'originalRoot')}
              disabled={!writable}
              onReset={() => void resetField('originalRoot')}
            >
              <input
                type="text"
                value={current.originalRoot}
                placeholder="例如 D:/Pictures/image_ACG/蓝色大肥鱼表情包"
                disabled={!writable}
                onChange={(event) => edit('originalRoot', event.target.value)}
              />
            </Field>

            <Field
              label="冷却轮数"
              hint="同一张贴纸连续 N 轮内不重复；0 = 关闭"
              overridden={isOverridden(user, 'cooldownTurns')}
              disabled={!writable}
              onReset={() => void resetField('cooldownTurns')}
            >
              <input
                type="number"
                min={0}
                max={20}
                value={current.cooldownTurns}
                disabled={!writable}
                onChange={(event) => edit('cooldownTurns', Math.max(0, Math.min(20, Number(event.target.value) || 0)))}
              />
            </Field>

            <Field
              label="兜底贴纸"
              hint="关键词一个都没匹配上时用它，保证总有鱼；留空 = 不兜底（只回一条重试建议）"
              overridden={isOverridden(user, 'fallback')}
              disabled={!writable}
              onReset={() => void resetField('fallback')}
            >
              <input
                type="text"
                value={current.fallback}
                placeholder="例如 dianzan；留空 = 不兜底"
                disabled={!writable}
                onChange={(event) => edit('fallback', event.target.value.trim())}
              />
            </Field>

            <Field
              label="自动贴纸"
              hint="off = 只由模型决定；keyword = 回复命中情绪词就补一张（默认）；every = 每 N 轮必贴，不问模型；jev = 把回复交给 JEV 判情绪族（会把正文发到 OpenRouter，约 1.3s / 每轮 $0.00005）"
              overridden={isOverridden(user, 'autoMode')}
              disabled={!writable}
              onReset={() => void resetField('autoMode')}
            >
              <select
                value={current.autoMode}
                disabled={!writable}
                onChange={(event) => edit('autoMode', event.target.value as AutoMode)}
              >
                <option value="keyword">keyword（命中情绪词）</option>
                <option value="every">every（每 N 轮必贴）</option>
                <option value="jev">jev（按语境判情绪族）</option>
                <option value="off">off（只由模型决定）</option>
              </select>
            </Field>

            <Field
              label="自动间隔轮数"
              hint="仅 autoMode=every 时生效；1 = 每轮都贴"
              overridden={isOverridden(user, 'autoEveryTurns')}
              disabled={!writable}
              onReset={() => void resetField('autoEveryTurns')}
            >
              <input
                type="number"
                min={1}
                max={20}
                value={current.autoEveryTurns}
                disabled={!writable}
                onChange={(event) =>
                  edit('autoEveryTurns', Math.max(1, Math.min(20, Number(event.target.value) || 1)))
                }
              />
            </Field>

            <Field
              label="JEV 模型"
              hint="autoMode=jev 时用的模型；改它等于改决策质量（默认 typesafe/jev-1.13）"
              overridden={isOverridden(user, 'jevModel')}
              disabled={!writable}
              onReset={() => void resetField('jevModel')}
            >
              <input
                value={current.jevModel}
                placeholder="typesafe/jev-1.13"
                disabled={!writable}
                onChange={(event) => edit('jevModel', event.target.value.trim())}
              />
            </Field>

            <Field
              label="JEV 超时（ms）"
              hint="超时或报错一律回落既有规则，贴纸层绝不拖住会话"
              overridden={isOverridden(user, 'jevTimeoutMs')}
              disabled={!writable}
              onReset={() => void resetField('jevTimeoutMs')}
            >
              <input
                type="number"
                min={500}
                max={20000}
                step={500}
                value={current.jevTimeoutMs}
                disabled={!writable}
                onChange={(event) =>
                  edit('jevTimeoutMs', Math.max(500, Math.min(20000, Number(event.target.value) || 4000)))
                }
              />
            </Field>

            <Field
              label="JEV 语气说明"
              hint="可选：告诉 JEV 这个助手的角色/语气（内容也会被发到 OpenRouter）；留空 = 不给"
              overridden={isOverridden(user, 'jevPersona')}
              disabled={!writable}
              onReset={() => void resetField('jevPersona')}
            >
              <input
                value={current.jevPersona}
                placeholder="例如：中文技术助手，语气干脆、偶尔自嘲"
                disabled={!writable}
                onChange={(event) => edit('jevPersona', event.target.value)}
              />
            </Field>

            <Field
              label="JEV 调试浮层"
              hint="开着会在页面右上出现一枚可拖的小胶囊，点开成面板：能看到每次真实往返发给 JEV 的请求与 JEV 回的响应（只读诊断，收起就不轮询）"
              overridden={isOverridden(user, 'jevDebugVisible')}
              disabled={!writable}
              onReset={() => void resetField('jevDebugVisible')}
            >
              <label className="dsh-memes-reply-check">
                <input
                  type="checkbox"
                  checked={current.jevDebugVisible}
                  disabled={!writable}
                  onChange={(event) => edit('jevDebugVisible', event.target.checked)}
                />
                <span>{current.jevDebugVisible ? '显示' : '隐藏'}</span>
              </label>
            </Field>

            <Field
              label="常驻挂件"
              hint="页面上一直显示一只大肥鱼（随时能看到）：点它换一张、拖动可移动、✕ 收成小圆点"
              overridden={isOverridden(user, 'petVisible')}
              disabled={!writable}
              onReset={() => void resetField('petVisible')}
            >
              <label className="dsh-memes-reply-check">
                <input
                  type="checkbox"
                  checked={current.petVisible}
                  disabled={!writable}
                  onChange={(event) => edit('petVisible', event.target.checked)}
                />
                <span>{current.petVisible ? '显示中' : '已隐藏'}</span>
              </label>
            </Field>

            <Field
              label="挂件大小"
              hint="边长（px），建议 96–240"
              overridden={isOverridden(user, 'petSize')}
              disabled={!writable}
              onReset={() => void resetField('petSize')}
            >
              <input
                type="number"
                min={64}
                max={320}
                value={current.petSize}
                disabled={!writable}
                onChange={(event) => edit('petSize', Math.max(64, Math.min(320, Number(event.target.value) || 128)))}
              />
            </Field>

            <Field
              label="挂件停靠角"
              hint="默认停在哪一角；拖动过之后以拖拽坐标为谁"
              overridden={isOverridden(user, 'petCorner')}
              disabled={!writable}
              onReset={() => void resetField('petCorner')}
            >
              <select
                value={current.petCorner}
                disabled={!writable}
                onChange={(event) => edit('petCorner', event.target.value as PetCorner)}
              >
                <option value="br">右下</option>
                <option value="bl">左下</option>
                <option value="tr">右上</option>
                <option value="tl">左上</option>
              </select>
            </Field>
          </div>

          {/* ---- 外观：形状 / 边框 / 尺寸 / 停留 ---- */}
          <div className="dsh-memes-reply-section-title">
            外观
            <span>三种贴纸共用形状与边框；改完立即生效</span>
          </div>
          <div className="dsh-memes-reply-fields">
            <Field
              label="外形"
              hint="圆形 / 圆角方形（挂件、气泡角、兜底三种贴纸共用）"
              overridden={isOverridden(user, 'shape')}
              disabled={!writable}
              onReset={() => void resetField('shape')}
            >
              <select
                value={current.shape}
                disabled={!writable}
                onChange={(event) => edit('shape', event.target.value as StickerShape)}
              >
                <option value="circle">圆形</option>
                <option value="rounded">圆角方形</option>
              </select>
            </Field>

            <Field
              label="圆角半径"
              hint="仅「圆角方形」时生效（px）"
              overridden={isOverridden(user, 'radius')}
              disabled={!writable}
              onReset={() => void resetField('radius')}
            >
              <input
                type="number"
                min={0}
                max={64}
                value={current.radius}
                disabled={!writable}
                onChange={(event) => edit('radius', Math.max(0, Math.min(64, Number(event.target.value) || 0)))}
              />
            </Field>

            <Field
              label="边框粗细"
              hint="px，0 = 无边框"
              overridden={isOverridden(user, 'borderWidth')}
              disabled={!writable}
              onReset={() => void resetField('borderWidth')}
            >
              <input
                type="number"
                min={0}
                max={8}
                value={current.borderWidth}
                disabled={!writable}
                onChange={(event) => edit('borderWidth', Math.max(0, Math.min(8, Number(event.target.value) || 0)))}
              />
            </Field>

            <Field
              label="边框样式"
              hint="实线 / 虚线 / 无"
              overridden={isOverridden(user, 'borderStyle')}
              disabled={!writable}
              onReset={() => void resetField('borderStyle')}
            >
              <select
                value={current.borderStyle}
                disabled={!writable}
                onChange={(event) => edit('borderStyle', event.target.value as StickerBorderStyle)}
              >
                <option value="solid">实线</option>
                <option value="dashed">虚线</option>
                <option value="none">无边框</option>
              </select>
            </Field>

            <Field
              label="边框颜色"
              hint="如 #4c9aff；留空 = 跟随主题强调色"
              overridden={isOverridden(user, 'borderColor')}
              disabled={!writable}
              onReset={() => void resetField('borderColor')}
            >
              <input
                type="text"
                value={current.borderColor}
                placeholder="留空 = 主题色"
                disabled={!writable}
                onChange={(event) => edit('borderColor', event.target.value.trim())}
              />
            </Field>

            <Field
              label="气泡角贴纸大小"
              hint="贴在回复右下角那枚的边长（px）"
              overridden={isOverridden(user, 'bubbleSize')}
              disabled={!writable}
              onReset={() => void resetField('bubbleSize')}
            >
              <input
                type="number"
                min={48}
                max={240}
                value={current.bubbleSize}
                disabled={!writable}
                onChange={(event) => edit('bubbleSize', Math.max(48, Math.min(240, Number(event.target.value) || 96)))}
              />
            </Field>

            <Field
              label="气泡角上移量"
              hint="px，越大越往气泡上压；0 = 贴在气泡下方"
              overridden={isOverridden(user, 'bubbleRise')}
              disabled={!writable}
              onReset={() => void resetField('bubbleRise')}
            >
              <input
                type="number"
                min={0}
                max={120}
                value={current.bubbleRise}
                disabled={!writable}
                onChange={(event) => edit('bubbleRise', Math.max(0, Math.min(120, Number(event.target.value) || 0)))}
              />
            </Field>

          </div>

          {/* ---- 预览墙 ---- */}
          <div className="dsh-memes-reply-section-title">
            素材预览
            <span>{catalog === null ? '' : `共 ${catalog.total} 张 · 点一张＝下一轮贴它`}</span>
          </div>
          {wallLoading && items.length === 0 ? (
            <p className="dsh-memes-reply-empty">正在载入…</p>
          ) : items.length === 0 ? (
            <p className="dsh-memes-reply-empty">没有可预览的素材（检查索引与素材目录）</p>
          ) : (
            <div className="dsh-memes-reply-wall">
              {items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={
                    latch === item.id ? 'dsh-memes-reply-cell dsh-memes-reply-cell-active' : 'dsh-memes-reply-cell'
                  }
                  title={`${item.name} · ${formatBytes(item.bytes)} · ${item.frames} 帧 @ ${item.fps}fps`}
                  onClick={() => void select(item)}
                >
                  {item.thumb === null ? (
                    <span className="dsh-memes-reply-cell-fallback">{item.name}</span>
                  ) : (
                    <img src={item.thumb} alt={item.name} loading="lazy" decoding="async" />
                  )}
                  <span className="dsh-memes-reply-cell-name">{item.name}</span>
                </button>
              ))}
            </div>
          )}

          {preview !== null ? (
            <div className="dsh-memes-reply-preview">
              <img src={preview.url} alt={preview.name} />
              <span>
                《{preview.name}》 · {formatBytes(preview.bytes)} · {preview.frames} 帧 · {(preview.durationMs / 1000).toFixed(2)}s
                <br />
                {latch === preview.id ? '已指定：下一轮会贴这张' : '未指定'}
              </span>
            </div>
          ) : null}

          {latch !== null ? (
            <p className="dsh-memes-reply-preview">
              下一轮指定：<b>{latched?.name ?? latch}</b>
              <button type="button" className="dsh-memes-reply-btn" onClick={() => void cancelLatch()}>
                取消指定
              </button>
            </p>
          ) : null}

          {latchFailed ? <p className="dsh-memes-reply-failed">操作失败：请确认插件路由可用</p> : null}

          {/* ---- 底部操作 ---- */}
          <div className="dsh-memes-reply-footer">
            <button
              type="button"
              className="dsh-memes-reply-btn"
              disabled={wallLoading}
              onClick={() => setWallSeed((seed) => seed + 1)}
            >
              换一批
            </button>
            <span className="dsh-memes-reply-spacer" />
            {saveFailed ? <span className="dsh-memes-reply-failed">保存失败</span> : null}
            <button type="button" className="dsh-memes-reply-btn" disabled={!dirty || saving} onClick={discard}>
              丢弃
            </button>
            <button
              type="button"
              className="dsh-memes-reply-btn dsh-memes-reply-btn-primary"
              disabled={!dirty || saving || !writable}
              onClick={() => void save()}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
