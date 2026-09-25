/**
 * dsh-memes-reply �?浏览器半边入口�? *
 * ## v2.0 的形�? *
 * 只做这几件事，都由当�?fiber 持有，停用即净�? *   1. 最外层回执�?这一�?bundle 到底加载了没"）—�?浏览器控制台宿主看不到，
 *      这是唯一可观测的办法（v1.0 §15 的教训）�? *   2. 注入界面样式（面�?+ 常驻挂件）；
 *   3. �?0.1.6a2 插件管理页的 `plugins.bundle.config` 里按本组合包名注册配置面�? *      （侧栏「插件」→「已安装」→「查�?dsh-memes-reply」）�? *   4. �?`shell.overlay` 里注册常驻挂件（"随时能看到大肥鱼"，硬需求）�? *   5. 在同一个座位注�?**JEV 调试漂浮面板**（可开关，默认关；看每次真实往返的请求与响应）�? *   6. 挂上**贴纸�?*：会话流里的派生节点（`node.tsx`）—�?一轮一张�? *      生成中是"思�?打字�?、落定后换成最终贴纸、跟着会话走、刷新即重放�? *
 * v1.0 �?尾巴气泡 / 兜底浮层 / 轮询�?/ 内存落地�?/ 待取位轮�?已整体退役：
 * 它们正是"不会�?+ 不跟会话�?+ 被交付卡片抢座位"的来源�? *
 * v2.1�?.1.6a2 统一插件管理�?rc7 时代�?`settings.plugin.item` 槽位已不存在�? * 配置面板注册改由内置适配�?`src/vendor/dsh-plugin-config-slot.tsx` 承担
 * （该文件头部有新旧对照说明；唯一源在 workspace �?dsh-plugin-config-slot 包里）�? */

import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// `shell.overlay`（常驻挂件的座位）由框架 shell 声明，SlotMap 增强在这里�?import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
// `conversation.input.dock` 等会话座位由会话包声明，它的 SlotMap 增强在那里�?import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// `ctx.settingsScope` 的服务契约（配置面板的读写通道）�?import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { registerBundleConfigPage } from '../vendor/dsh-plugin-config-slot.js'
import { SETTINGS_NS } from '../protocol.js'
import { themeCss } from '../theme.js'
import { DEFAULT_CONFIG } from '../config.js'
import type { MemesConfig } from '../types.js'
import { postDebug } from './api.js'
import { JevDebugPanel } from './jevpanel.js'
import { installStickerNode } from './node.js'
import { SettingsCard } from './panel.js'
import { StickerPet } from './pet.js'
import { createLazyScope } from '../settings-source.js'
import { CSS } from './styles.js'

/** 客户端构建标记：每次改客户端就换一个，刷新后从 `/stats` �?`client-apply` 回执里核对�?*/
export const CLIENT_BUILD = 'lazy-settings-a'

/**
 * 顶层硬依赖�? *
 * **只有 `slots`** —�?它是任何部署都有的基线服务，也是本插件所有座位（面板 / 挂件 /
 * 贴纸�?/ 调试浮层）的必要前提�? *
 * 设置服务**刻意不写在这�?*：它在不�?dsh 版本里叫不同名字，还可能整个不存在，
 * �?顶层 inject 引一个拿不到的服�?会让 loader 永久 pending�?*整个应用打不开**
 * �?026-09-25 �?DSH Desktop 0.1.7-rc.2 上实测：`web boot: 1 entry did not activate`）�? * 改成受限 fiber 里等它，等不到就降级 —�?�?`settings-source.ts` 与下方第 2 步�? */
export const inject = ['slots']

/** 官方客户端设置服务（0.1.5 / 0.1.6 �?`settingsScope`）的形状�?*/
interface SettingsScopeService {
  /** 绑定本插件自己的设置命名空间�?*/
  bind<T>(spec: { namespace: string }): SettingsScope<T>
}

/**
 * `shell.overlay`（全屏浮层）的类型增强�? *
 * 这个座位由框架的 shell 声明，但它的 SlotMap 条目没有随任何客户端包发布，
 * 所以贡献者自己声明一�?—�?`dsh-hmm-wait` 的弹幕层用的就是这个办法�? * 形状必须与座位实际契约一致：**list**、root 作用域、owner 不传任何东西�? */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'shell.overlay': { kind: 'list'; scope: 'root'; owner: Record<string, never> }
  }
}

/** 挂载浏览器半边�?*/
export function apply(ctx: ClientContext): void {
  // 1) 最外层回执�?*先建可观测�?*（v1.0 §15 的教训）�?  //    浏览器控制台宿主看不到，所�?这一�?bundle 到底加载了没、apply 有没有跑"
  //    必须由客户端自己回传；`GET /stats` 就能看到�?  postDebug({ kind: 'client-apply', note: `build=${CLIENT_BUILD}` })

  // 2) 设置来源�?*延迟绑定句柄**（读默认�?�?服务到了自动接上）�?  //    为什么不在顶�?inject 里等它：�?`inject` 上方�?`settings-source.ts`�?  //    为什么用受限 fiber 而不�?`ctx.get()`：服务可能比本插件晚注册�?  //    `get()` 只在当下取一次，会把它判�?不存�?而在老版本上误降级�?  const scope = createLazyScope<MemesConfig>()
  const anyCtx = ctx as unknown as {
    inject(deps: string[], callback: (inner: ClientContext & { settingsScope?: SettingsScopeService }) => void): unknown
  }
  anyCtx.inject(['settingsScope'], (inner) => {
    const service = inner.settingsScope
    if (service === undefined || typeof service.bind !== 'function') return
    const live = service.bind<MemesConfig>({ namespace: SETTINGS_NS })
    inner.effect(() => scope.attach(live), 'dsh-memes-reply: settings attach')
    postDebug({ kind: 'client-settings', note: `build=${CLIENT_BUILD} settings=attached` })
  })

  // 3) 样式：面�?+ 挂件的形�?边框变量（设置驱动，改设置不需要组件重渲染）�?  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = SETTINGS_NS
    const render = (value: unknown): void => {
      style.textContent = `${CSS}\n${themeCss({ ...DEFAULT_CONFIG, ...((value ?? {}) as Partial<MemesConfig>) })}`
    }
    render(scope.getSnapshot().value)
    const unsubscribe = scope.subscribe(() => render(scope.getSnapshot().value))
    document.head.appendChild(style)
    return () => {
      unsubscribe()
      style.remove()
    }
  }, 'dsh-memes-reply: panel styles')

  // 4) 配置面板�?.1.6a2 插件管理页的 `plugins.bundle.config`，键 = 本组合包名�?  registerBundleConfigPage(ctx, {
    bundle: 'dsh-memes-reply',
    summary: '模型按语境在回复里贴一张会动的大肥�?,
    source: scope,
    render: () => <SettingsCard scope={scope} defaultOpen />,
  })

  // 5) 常驻挂件�?随时能看到大肥鱼"）：坐在 frame-wide �?`shell.overlay` 里�?  //    官方对它的定义就�?additive；整�?click-through，条目自�?opt in �?pointer events�?  //    所以我只在鱼身范围内接管事件，不挡下面的界面�?  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'dsh-memes-reply-pet',
        order: 30,
      },
      () => <StickerPet scope={scope} />,
    ),
  )

  // 6) **贴纸层（v2.0 主线�?*：会话流里的派生节点 —�?一轮一个，
  //    生成中是"思�?打字�?，落定后换成这一轮的最终贴纸；跟着会话走、刷新即重放�?  installStickerNode(ctx, scope)

  // 7) JEV 调试漂浮面板（可开关，默认关）：看每次真实往返发出去什么、收回来什么�?  //    与挂件同一个座位，�?*在它之后**（order 31）：默认落点在右上，两者不打架�?  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'dsh-memes-reply-jev-debug',
        order: 31,
      },
      () => <JevDebugPanel scope={scope} />,
    ),
  )
}
