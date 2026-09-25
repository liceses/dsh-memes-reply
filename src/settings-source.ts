/**
 * 设置来源的**延迟绑定句柄**（本包纯模块；实际只被浏览器半边用）。
 *
 * 放在 `src/` 而不是 `src/client/` 是**刻意的**：`tsconfig.build.json` 只编译 `src/*.ts`
 * （`src/client/**` 由 tsdown 单独打包），放这里才能被 node 直接 require 到、进单元测试。
 * 同类的共享纯模块还有 `theme.ts` / `config.ts` / `derive.ts`。
 *
 * ## 为什么不能直接硬引设置服务
 *
 * 客户端的设置服务**跨版本改过名**，而且**可能整个不存在**：
 *
 * | dsh 版本 | 客户端服务 | 取值方式 |
 * | --- | --- | --- |
 * | 0.1.5-rc.1 / 0.1.6-alpha.2 | `ctx.settingsScope` | `bind({ namespace })` |
 * | 0.1.7-rc.2 | **没有这个名字**（`settingsScope` 在它的 app.asar 里 0 命中） | 改名成 `ctx.configForms`，值由插件管理页当 owner props 传给配置页 |
 *
 * 更要命的是失败形态：顶层 `inject` 里写一个拿不到的服务，cordis 的 loader 会**永久停在
 * `pending (waiting for service: …)`**，浏览器侧报 `web boot: 1 entry did not activate`，
 * **整个应用打不开**（2026-09-25 在 DSH Desktop 0.1.7-rc.2 上实测）。
 *
 * ## 这个句柄怎么解
 *
 * 它**自己就是一个合法的 `SettingsScope`**：
 *   - 没挂上真服务时，快照恒为 `unavailable`，读到的 `value` 是 `undefined`。
 *     各处本来就会回落到 `DEFAULT_CONFIG`（`node.tsx` / `pet.tsx` / `panel.tsx` 都是
 *     `{ ...DEFAULT_CONFIG, ...(value ?? {}) }`），所以**贴纸层与挂件照常工作**，
 *     配置面板显示"设置不可达，使用默认值"。
 *   - `attach(live)` 之后，读与订阅透传给真服务，并主动通知一次订阅者 ——
 *     组件不需要重新注册，界面自己就活了。
 *
 * 这样装配顺序不再是正确性问题：无论服务早到、晚到还是永远不来，插件都能起来。
 */

import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * 未挂载时的固定快照。
 *
 * 必须是**冻结的同一个引用** —— `useSyncExternalStore` 会在每次渲染读快照，
 * 每次都返回新对象会让 React 认定 store 一直在变，从而死循环。
 */
const UNAVAILABLE_SNAPSHOT: SettingsScopeSnapshot<never> = Object.freeze({
  status: 'unavailable',
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
  mode: 'memory',
})

/** 延迟绑定句柄：既是 `SettingsScope`，又能事后挂上真服务。 */
export interface LazySettingsScope<T> extends SettingsScope<T> {
  /**
   * 挂上真正的设置服务。
   *
   * @param live - 官方服务 `bind({ namespace })` 的返回值。
   * @returns 解绑函数（连订阅一起撤掉）；跟随插件 fiber 用 `ctx.effect` 持有。
   */
  attach(live: SettingsScope<T>): () => void
  /** 是否已挂上真服务（诊断用）。 */
  readonly attached: boolean
}

/**
 * 建一个延迟绑定句柄。
 *
 * @returns 一个立刻可用、形如 `SettingsScope` 的句柄。
 */
export function createLazyScope<T>(): LazySettingsScope<T> {
  let live: SettingsScope<T> | null = null
  let detachLive: (() => void) | null = null
  let current: SettingsScopeSnapshot<T> = UNAVAILABLE_SNAPSHOT as SettingsScopeSnapshot<T>
  const listeners = new Set<() => void>()

  const emit = (): void => {
    for (const listener of [...listeners]) listener()
  }

  return {
    get attached(): boolean {
      return live !== null
    },

    getSnapshot(): SettingsScopeSnapshot<T> {
      // 未挂载时返回固定引用；挂载后返回真服务快照的**缓存**（引用随它替换）。
      return live === null ? (UNAVAILABLE_SNAPSHOT as SettingsScopeSnapshot<T>) : current
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    async set(field: string, value: unknown): Promise<void> {
      if (live !== null) await live.set(field, value)
    },

    async unset(field: string): Promise<void> {
      if (live !== null) await live.unset(field)
    },

    attach(next: SettingsScope<T>): () => void {
      // 重复挂载：先把上一次撤干净，避免订阅泄漏。
      detachLive?.()
      live = next
      current = next.getSnapshot()
      detachLive = next.subscribe(() => {
        current = next.getSnapshot()
        emit()
      })
      // 挂载本身也是一次状态变化，必须通知 —— 否则界面会一直停在 unavailable。
      emit()
      return () => {
        detachLive?.()
        detachLive = null
        live = null
        current = UNAVAILABLE_SNAPSHOT as SettingsScopeSnapshot<T>
        emit()
      }
    },
  }
}
