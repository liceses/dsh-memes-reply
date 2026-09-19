/**
 * 内置副本 —— 源在 workspace 的 `dsh-plugin-config-slot/src/index.tsx`
 * （dsh 0.1.6a2 统一插件管理下「插件自带配置面板」的注册适配层）。
 * 每个插件仓库自持一份，是为了让仓库能独立 clone + 构建。
 * 不要在这里改功能：改源，然后跑
 *   node dsh-plugin-config-slot/scripts/vendor.mjs
 * 重新生成（加 `--check` 只校验）。
 */
/**
 * dsh-plugin-config-slot — dsh 0.1.6a2 统一插件管理下的「插件自带配置面板」注册适配层。
 *
 * ## 为什么需要这一层
 *
 * 0.1.6a2 把插件管理统一到了新的 Plugins 页面
 * （`@deepseek-ai/dsh-client-ui-plugin-manager`，侧栏「插件」入口；宿主侧是
 * `@deepseek-ai/dsh-plugin-manager`）。插件配置面板不再挂在设置对话框里，
 * 而是改由插件管理页声明的三个槽位承载：
 *
 * | 槽位 | 种类 | 键 | 用途 |
 * | --- | --- | --- | --- |
 * | `plugins.item` | list | `id` + `order` + `label` | **官方**宿主平面配置页，列在「官方」分组 |
 * | `plugins.bundle.config` | keyed | 组合包 npm 包名 | 组合包自己的配置，画在它的页面上（描述与行之间） |
 * | `plugins.row.config` | keyed | `<包名>#<行 id>` | 某一行自己的配置页 |
 *
 * 旧的 `settings.plugin.item`（rc7 时代按 settings 命名空间键控的卡片槽）在
 * 0.1.6a2 已**不存在**。旧写法
 *
 * ```ts
 * ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({ … }, Card))
 * ```
 *
 * 在新机制下槽位永不出现，`inject` 回调永不触发，注册无声消失 —— 于是配置面板
 * 「点了没反应、也不报错、界面空白」。这就是升级后全部失效的根因。
 *
 * 第三方组合包（其 `cordis.patch.yml` 声明了行）对应的是
 * `plugins.bundle.config`：配置画在组合包自己的页面上，打开路径为
 * 侧栏「插件」→「已安装」→「查看 <包名>」。
 *
 * ## 这一层做什么
 *
 * 1. 用 `plugins.bundle.config` + 组合包 npm 包名这一个**正确入口**注册；
 * 2. 按新契约分发 owner props 的 `view`（`summary` = 标题下的一句话简介，
 *    `page` = 带自己保存控件的表单）；
 * 3. 边界：命名空间未由 Host 提供时给出明确提示（而不是空白）；
 *    没有可配置项时给出空态（而不是报错）；配置缺失 / 为空由插件自己的表单
 *    合并默认值（本层不碰字段语义）；
 * 4. 不重写任何插件的表单 —— 表单原样复用，本层只做注册与外壳。
 *
 * 依赖只有 `react`，且作为**构建期依赖被内联**进各插件的浏览器半侧
 * （各插件的 tsdown 客户端构建把非平台模块全部内联），因此运行时不新增依赖，
 * 也不需要被装进 profile。
 */

import { createElement, useCallback, useSyncExternalStore, type ComponentType, type ReactElement, type ReactNode } from 'react'

/** 插件管理页向配置条目索取的两种视图。 */
export interface PluginConfigViewProps {
  /** `summary` 只要一句话简介；`page` 要带自己保存控件的表单。 */
  readonly view: 'summary' | 'page'
}

/**
 * 设置命名空间快照里本层关心的部分，字段一律 `unknown`：本层只做防御性判读
 * （`status === 'unavailable'` / `available === false`），从而同时接受
 * 官方 `SettingsScope`（`status` 三态 + `writable`）与本地快照 store
 * （`available` / `writable`）——包括那些把 `status` 用作别的含义的快照
 * （例如 dsh-auto-proxy 的 `status` 是运行期代理状态）。注意字段必须收 `unknown`
 * 而不是 `string`：后者会与这类快照的 `status` 冲突而不可赋值。
 */
export interface ConfigSourceSnapshot {
  /** 官方 `SettingsScope` 的状态：`loading` / `ready` / `unavailable`。 */
  readonly status?: unknown
  /** 某些本地镜像 store 用的布尔可用位（false = 不可达）。 */
  readonly available?: unknown
  /** Host 文档是否接受写入（本层目前只做展示判断，保留给调用方扩展）。 */
  readonly writable?: unknown
}

/** 只读、可订阅的设置来源。 */
export interface ConfigSource {
  /** 读当前快照（引用需稳定，供 `useSyncExternalStore` 使用）。 */
  getSnapshot(): ConfigSourceSnapshot
  /** 订阅快照替换。 */
  subscribe(listener: () => void): () => void
}

/** 浏览器插件上下文里本层用到的那一小块（`ctx.slots`）。 */
export interface ConfigSlotRegistry {
  /** 等槽位被声明后执行注册回调；返回注销函数。 */
  inject(key: string, callback: () => () => void): () => void
  /**
   * 往已声明的槽位注册一个条目。
   *
   * 这里刻意用宽松签名：各插件为自己的浏览器半侧声明**本地结构化上下文类型**
   * （官方 `Context['slots']` 的重载集合无法被一个无依赖的辅助包导入），
   * 所以这个接缝只需要「两个方向都结构兼容、且可调用」。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(options: any, component: any): () => void
}

/** 本层需要的最小宿主上下文。 */
export interface ConfigSlotHost {
  /** 槽位注册表。 */
  slots: ConfigSlotRegistry
}

/** `registerBundleConfigPage` 的选项。 */
export interface BundleConfigPageOptions {
  /**
   * 组合包的 npm 包名 —— `plugins.bundle.config` 的键。
   * 必须与 Host 清单里的包名逐字相同（例如 `@icelily/dsh-auto-proxy`）。
   */
  readonly bundle: string
  /**
   * 插件自己的表单组件，形状与官方条目组件一致：拿到槽位合成的 props
   * （`view` + 注入面的 `hooks` 被合成成 `useXxx` 选择器钩子 + `actions`）。
   * 配合 {@link BundleConfigPageOptions.inject} 使用。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly component?: ComponentType<any> | undefined
  /**
   * 闭合渲染器：插件自己在闭包里持有表单状态（不需要槽位注入）时用它。
   * 与 `component` 二选一；两者都省略 = 本插件没有可配置项（页面显示空态）。
   */
  readonly render?: ((view: PluginConfigViewProps) => ReactNode) | undefined
  /** 注册进槽位的注入面工厂（沿用官方 `inject` 出口），配合 `component` 使用。 */
  readonly inject?: (() => object) | undefined
  /** `summary` 视图要显示的一句话简介；省略则该视图渲染为空。 */
  readonly summary?: string | undefined
  /** 设置来源；给定时，命名空间不可达会在页面上给出明确提示。 */
  readonly source?: ConfigSource | undefined
  /** 附加在不可达提示后面的排查指引（可选）。 */
  readonly unavailableHint?: string | undefined
  /** 空配置态文案覆盖（默认「该插件没有可配置项。」）。 */
  readonly emptyText?: string | undefined
  /** 不可达文案覆盖（默认对齐官方 copy）。 */
  readonly unavailableText?: string | undefined
}

/** `plugins.bundle.config`：组合包自己的配置页。 */
export const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config'

/** `plugins.row.config`：某一行的配置页（键为 `<包名>#<行 id>`）。 */
export const ROW_CONFIG_SLOT = 'plugins.row.config'

/** 官方 `settings.plugins` 字典里 `unavailable` 的中文文案（保持一致观感）。 */
const DEFAULT_UNAVAILABLE_TEXT = '该插件当前未加载，暂时无法配置。'

/** 空配置态默认文案。 */
const DEFAULT_EMPTY_TEXT = '该插件没有可配置项。'

/** 样式标记，避免重复注入。 */
const STYLE_MARK = 'dsh-plugin-config-slot'

/**
 * 页面外壳样式：只使用官方主题变量，观感与官方插件配置页
 * （`PluginConfigForm.module.css`）一致。
 */
const PAGE_CSS = [
  '.dshpcs-page{display:flex;flex-direction:column}',
  '.dshpcs-page ul{list-style:none;margin:0;padding:0}',
  '.dshpcs-page li{list-style:none}',
  '.dshpcs-notice{color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.9));margin:0 0 12px;font-size:12px;line-height:1.5}',
].join('')

/** 重复注册 / 重复注入的守卫。 */
function injectPageStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_MARK)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = STYLE_MARK
  tag.dataset.pluginCss = STYLE_MARK
  tag.textContent = PAGE_CSS
  document.head.appendChild(tag)
}

/** 读一次来源快照；来源缺失或读取抛错都归入不可达，绝不让面板崩掉。 */
function readSnapshot(source: ConfigSource | undefined): ConfigSourceSnapshot | null {
  if (source === undefined) return null
  try {
    return source.getSnapshot()
  } catch {
    return UNAVAILABLE_SNAPSHOT
  }
}

/** 读取失败时的固定快照引用（`useSyncExternalStore` 要求引用稳定）。 */
const UNAVAILABLE_SNAPSHOT: ConfigSourceSnapshot = Object.freeze({ status: 'unavailable' })

/** 快照是否表示「Host 没有为本页提供这个 settings 命名空间」。 */
function isUnavailable(snapshot: ConfigSourceSnapshot | null): boolean {
  if (snapshot === null) return false
  return snapshot.status === 'unavailable' || snapshot.available === false
}
/** 订阅一个设置来源（`useSyncExternalStore` 的 subscribe/getSnapshot 两侧）。 */
function useConfigSnapshot(source: ConfigSource | undefined): ConfigSourceSnapshot | null {
  const subscribe = useCallback(
    (listener: () => void): (() => void) => (source === undefined ? NOOP : source.subscribe(listener)),
    [source],
  )
  const getSnapshot = useCallback((): ConfigSourceSnapshot | null => readSnapshot(source), [source])
  // 第三参是 SSR 用的服务端读法：条目组件只在浏览器里挂载，但把它给出去可以让
  // 这个组件在 react-dom/server 下也能渲染（本包的回归测试就是这么跑的）。
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** 空订阅函数（来源缺省时）。 */
const NOOP = (): void => {}

/**
 * 把插件的配置表单注册进 0.1.6a2 插件管理页的 `plugins.bundle.config` 槽位。
 *
 * @param host - 插件浏览器半侧的上下文（只用它的 `slots`）。
 * @param options - 组合包包名、表单渲染器、可选的设置来源与注入面。
 * @returns 注销函数（跟随插件 fiber 生命周期调用即可）。
 */
export function registerBundleConfigPage(
  host: ConfigSlotHost,
  options: BundleConfigPageOptions,
): () => void {
  injectPageStyles()

  const emptyText = options.emptyText ?? DEFAULT_EMPTY_TEXT
  const unavailableText = options.unavailableText ?? DEFAULT_UNAVAILABLE_TEXT
  const { bundle, component, render, inject, source, summary, unavailableHint } = options
  const hasBody = component !== undefined || render !== undefined

  /**
   * 条目组件：官方插件管理页会以 `view: 'summary'` 与 `view: 'page'` 各渲染一次。
   * `hooks` 在任何分支之前调用，保证 render 之间 hook 顺序稳定。
   */
  const BundleConfigPage = (props: PluginConfigViewProps & Record<string, unknown>): ReactElement => {
    const snapshot = useConfigSnapshot(source)

    if (props.view === 'summary') {
      return <span>{summary ?? ''}</span>
    }

    return (
      <div className="dshpcs-page" data-plugin-config-page={bundle}>
        {isUnavailable(snapshot) ? (
          <p className="dshpcs-notice" role="status">
            {unavailableText}
            {unavailableHint === undefined ? '' : ` ${unavailableHint}`}
          </p>
        ) : null}
        {!hasBody ? (
          <p className="dshpcs-notice" role="status">
            {emptyText}
          </p>
        ) : component !== undefined ? (
          createElement(component, props)
        ) : (
          render?.(props)
        )}
      </div>
    )
  }

  return host.slots.inject(BUNDLE_CONFIG_SLOT, () =>
    host.slots.register(
      {
        name: BUNDLE_CONFIG_SLOT,
        key: bundle,
        ...(inject === undefined ? {} : { inject }),
      },
      BundleConfigPage,
    ),
  )
}
