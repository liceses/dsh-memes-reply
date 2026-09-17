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
import { ROUTE_PREFIX, SETTINGS_NS } from './protocol.js'
import { registerPromptHint } from './prompt.js'
import { createStats, createStickerRoute } from './route.js'
import { MemesSettingsSchema, resolveConfig, stateFilePath } from './schema.js'
import { loadState, saveState } from './state.js'
import { createTrace } from './trace.js'
import { createStickerTool } from './tool.js'
import type { MemesConfig, PluginState } from './types.js'

/** cordis 插件名。 */
export const name = 'memes-reply'

/** 硬依赖：没有 webServer 就没有出图通道，没有 settings 就没有开关。 */
export const inject = ['webServer', 'settings']

/** 挂载。 */
export function apply(ctx: Context): void {
  const scope = ctx.settings.register(SETTINGS_NS, MemesSettingsSchema, { applies: 'live' })
  let config: MemesConfig = resolveConfig(scope.get())
  scope.watch((next) => {
    config = resolveConfig(next)
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
  const indexOf = (): LoadedIndex | undefined => loadIndex(config)
  /** 两端共用的诊断轨迹（`/stats` 一次读全）。 */
  const trace = createTrace(48)

  // 1) 贴纸字节路由 + 客户端的两个数据端点
  ctx.effect(
    () =>
      ctx.webServer.register(
        createStickerRoute({
          ctx,
          config: () => config,
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
          config: () => config,
          index: indexOf,
          state: { read: readState, write: writeState },
          exists: async (entry) => (await resolveStickerFile(ctx, entry, config)) !== undefined,
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
        config: () => config,
        hasTool: () => toolRegistered,
        isMuted: (sessionId) => readState().sessions[sessionId]?.muted === true,
      }) ?? (() => {}),
    'dsh-memes-reply: prompt hint',
  )

  // 4) 斜杠命令
  const commands = ctx.get('commands')
  if (commands !== undefined) {
    ctx.effect(
      () => commands.register(createFishCommand({ config: () => config, index: indexOf, state: { read: readState, write: writeState } })),
      'dsh-memes-reply: /fish command',
    )
  } else {
    ctx.logger?.warn?.('dsh-memes-reply: commands 服务缺失，/fish 未注册')
  }

  const index = indexOf()
  ctx.logger?.info?.(
    `dsh-memes-reply: 路由 ${ROUTE_PREFIX} 已挂载 · 素材 ${index?.entries.length ?? 0} 张` +
      (index === undefined ? '（索引缺失，请先运行 node scripts/import-assets.mjs）' : ` · ${index.path}`),
  )
}
