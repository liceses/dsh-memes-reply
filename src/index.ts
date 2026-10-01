/**
 * dsh-memes-reply — host 插件入口。
 *
 * ## v2.0 的分工（和 v1.0 最大的区别）
 *
 * 贴纸的**决定**搬到了浏览器半边（会话事件的纯函数，见 `client/node.tsx` 与 `derive.ts`）：
 * 宿主不再"发布事件 → 等客户端轮询取走"，那条链（`llm/stream` 观察者、待取位、每轮账本、
 * 轮末刷新）连同它带来的一堆竞态一起退役了。
 *
 * 宿主现在只做四件事：
 *   1. 贴纸字节路由（`/api/dsh-memes-reply/...`，回环限定，immutable + ETag）
 *   2. 客户端派生的**数据与开关**：`/vocab`（词表）、`/session-state`（静音/指定/冷却）
 *   3. 模型工具 `use_sticker`（模型可以点名要哪张；渲染仍由贴纸层负责）
 *   4. 斜杠命令 `/fish` 与设置命名空间 `dsh-memes-reply`
 *
 * 全部由 `ctx.effect` 持有，停用即净。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import { loadIndex, resolveStickerFile, type LoadedIndex } from './assets.js'
import { createFishCommand } from './command.js'
import { ROUTE_PREFIX } from './protocol.js'
import { registerPromptHint } from './prompt.js'
import { createStats, createStickerRoute } from './route.js'
import { Config, resolveLive, stateFilePath, type LiveConfig } from './schema.js'
import { loadState, saveState } from './state.js'
import { createTrace } from './trace.js'
import { createStickerTool } from './tool.js'
import type { MemesConfig, PluginState } from './types.js'

/** cordis 插件名。 */
export const name = 'memes-reply'

/**
 * 硬依赖：没有 webServer 就没有出图通道。
 *
 * `settings` **刻意不写在这里** —— 它的形状跨版本变过，而且可能整个不存在：
 *
 * | dsh 版本 | 宿主设置服务 |
 * | --- | --- |
 * | 0.1.5-rc.1 / 0.1.6-alpha.2 | `settings.register(ns, schema, { applies })` → `get()` / `watch()` |
 * | **0.1.7-rc.2** | **没有 `register()`**：`SettingsForms` 改成从插件自己的 cordis `Config` 投影表单（`describe` / `update` / `replace` / `mutate`），`ns` 是 profile 条目 id，持久化也从 `settings.yaml` 搬到了 profile patch |
 *
 * 硬引它的后果实测过两次：写进 `inject` 会让条目 pending（整个 profile 启动失败），
 * 直接调 `ctx.settings.register()` 会让 `apply` 抛
 * `TypeError: ctx.settings.register is not a function`、条目激活不了。
 * 所以改成受限 fiber 里"能接就接"。
 */
export const inject = ['webServer']

/** 导出给 loader 的插件 Config（0.1.7 的设置表单就是从这里投影出来的）。 */
export { Config }
export type { LiveConfig }

/**
 * 挂载。
 *
 * @param ctx - 宿主插件上下文（webServer）。
 * @param live - 解析后的活配置：**每个字段都是 `Volatile` 引用，读值要 `.get()`**。
 *   由 loader 从导出的 {@link Config} + profile 条目里的 `config:` 解析而来。
 */
export function apply(ctx: Context, live: LiveConfig): void {
  // 0) 配置读取：**每次现读**（volatile 引用是活的，改设置不重挂插件）。
  //    `resolveLive` 顺手合并默认值，所以下游拿到的永远是一份完整的普通配置。
  const readConfig = (): MemesConfig => resolveLive(live)

  // 0b) 本插件自带设置页 → 声明「不要自动生成页面」。
  //     放在受限 fiber 里：Settings 服务晚到、被替换、或整个不存在时插件照样能起。
  ctx.inject(['settings'], (settingsCtx) => {
    const service = (settingsCtx as unknown as { settings?: { configure?: unknown } }).settings
    if (service === undefined || typeof service.configure !== 'function') {
      // 形状对不上就照常跑默认配置 —— 路由 / 工具 / 命令一个都不能少。
      ctx.logger?.warn?.('dsh-memes-reply: settings 服务没有 configure()，配置页策略未登记（插件照常运行）')
      return
    }
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'dsh-memes-reply: settings presentation',
    )
    ctx.logger?.info?.('dsh-memes-reply: 设置已接入（0.1.7 SettingsForms + 插件 Config 投影）')
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

  const stats = createStats()
  const indexOf = (): LoadedIndex | undefined => loadIndex(readConfig())
  /** 两端共用的诊断轨迹（`/stats` 一次读全）。 */
  const trace = createTrace(48)

  // 1) 贴纸字节路由 + 客户端的两个数据端点
  ctx.effect(
    () =>
      ctx.webServer.register(
        createStickerRoute({
          ctx,
          config: readConfig,
          stats,
          observeOrigin: (value) => {
            origin = value
          },
          origin: originOf,
          state: { read: readState, write: writeState },
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
          config: readConfig,
          index: indexOf,
          state: { read: readState, write: writeState },
          exists: async (entry) => (await resolveStickerFile(ctx, entry, readConfig())) !== undefined,
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

  // 3) 系统提示里的一行提示：告诉模型"可以点名一张"，但贴纸本身不再依赖模型
  //    （`autoMode=every` 时每轮都会贴，模型不调用也照样有）。
  ctx.effect(
    () =>
      registerPromptHint(ctx, {
        config: readConfig,
        hasTool: () => toolRegistered,
        isMuted: (sessionId) => readState().sessions[sessionId]?.muted === true,
      }) ?? (() => {}),
    'dsh-memes-reply: prompt hint',
  )

  // 4) 斜杠命令
  const commands = ctx.get('commands')
  if (commands !== undefined) {
    ctx.effect(
      () => commands.register(createFishCommand({ config: readConfig, index: indexOf, state: { read: readState, write: writeState } })),
      'dsh-memes-reply: /fish command',
    )
  } else {
    ctx.logger?.warn?.('dsh-memes-reply: commands 服务缺失，/fish 未注册')
  }

  const index = indexOf()
  ctx.logger?.info?.(
    `dsh-memes-reply: 路由 ${ROUTE_PREFIX} 已挂载 · 素材 ${index?.entries.length ?? 0} 张` +
      (index === undefined
        ? '（索引缺失：先跑 node scripts/fetch-assets.mjs 取素材，或用 node scripts/import-assets.mjs 从原图生成）'
        : ` · ${index.path}`),
  )
}
