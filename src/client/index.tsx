/**
 * dsh-memes-reply — 浏览器半边入口。
 *
 * ## v2.0 的形状
 *
 * 只做这几件事，都由当前 fiber 持有，停用即净：
 *   1. 最外层回执（"这一版 bundle 到底加载了没"）—— 浏览器控制台宿主看不到，
 *      这是唯一可观测的办法（v1.0 §15 的教训）；
 *   2. 注入界面样式（面板 + 常驻挂件）；
 *   3. 在 `settings.plugin.item` 里按本插件的 settings 命名空间注册配置卡片；
 *   4. 在 `shell.overlay` 里注册常驻挂件（"随时能看到大肥鱼"，硬需求）；
 *   5. 挂上**贴纸层**：会话流里的派生节点（`node.tsx`）—— 一轮一张、
 *      生成中是"思考/打字中"、落定后换成最终贴纸、跟着会话走、刷新即重放。
 *
 * v1.0 的"尾巴气泡 / 兜底浮层 / 轮询器 / 内存落地仓 / 待取位轮询"已整体退役：
 * 它们正是"不会动 + 不跟会话走 + 被交付卡片抢座位"的来源。
 */

import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// `shell.overlay`（常驻挂件的座位）由框架 shell 声明，SlotMap 增强在这里。
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
// `conversation.input.dock` 等会话座位由会话包声明，它的 SlotMap 增强在那里。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// `settings.plugin.item` 这个槽位由 settings-plugins 声明，它的 SlotMap 增强在那里。
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { SETTINGS_NS } from '../protocol.js'
import { themeCss } from '../theme.js'
import { DEFAULT_CONFIG } from '../config.js'
import type { MemesConfig } from '../types.js'
import { postDebug } from './api.js'
import { installStickerNode } from './node.js'
import { SettingsCard } from './panel.js'
import { StickerPet } from './pet.js'
import { CSS } from './styles.js'

/** 客户端构建标记：每次改客户端就换一个，刷新后从 `/stats` 的 `client-apply` 回执里核对。 */
export const CLIENT_BUILD = 'sticker-node-b'

/** 需要的客户端服务（缺一个就等，不硬撑）。 */
export const inject = ['slots', 'settingsScope']

/**
 * `shell.overlay`（全屏浮层）的类型增强。
 *
 * 这个座位由框架的 shell 声明，但它的 SlotMap 条目没有随任何客户端包发布，
 * 所以贡献者自己声明一份 —— `dsh-hmm-wait` 的弹幕层用的就是这个办法。
 * 形状必须与座位实际契约一致：**list**、root 作用域、owner 不传任何东西。
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'shell.overlay': { kind: 'list'; scope: 'root'; owner: Record<string, never> }
  }
}

/** 挂载浏览器半边。 */
export function apply(ctx: ClientContext): void {
  // 1) 最外层回执：**先建可观测性**（v1.0 §15 的教训）。
  //    浏览器控制台宿主看不到，所以"这一版 bundle 到底加载了没、apply 有没有跑"
  //    必须由客户端自己回传；`GET /stats` 就能看到。
  postDebug({ kind: 'client-apply', note: `build=${CLIENT_BUILD}` })

  // 2) 绑定本插件的设置命名空间（读写都走官方通道，applies: live）。
  const scope: SettingsScope<MemesConfig> = ctx.settingsScope.bind<MemesConfig>({ namespace: SETTINGS_NS })

  // 3) 样式：面板 + 挂件的形状/边框变量（设置驱动，改设置不需要组件重渲染）。
  ctx.effect(() => {
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

  // 4) 设置 → 插件 → 可配置 里的一张卡片，key = 命名空间。
  ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register(
      {
        name: 'settings.plugin.item',
        key: SETTINGS_NS,
      },
      () => <SettingsCard scope={scope} />,
    ),
  )

  // 5) 常驻挂件（"随时能看到大肥鱼"）：坐在 frame-wide 的 `shell.overlay` 里。
  //    官方对它的定义就是 additive；整层 click-through，条目自己 opt in 到 pointer events，
  //    所以我只在鱼身范围内接管事件，不挡下面的界面。
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'dsh-memes-reply-pet',
        order: 30,
      },
      () => <StickerPet scope={scope} />,
    ),
  )

  // 6) **贴纸层（v2.0 主线）**：会话流里的派生节点 —— 一轮一个，
  //    生成中是"思考/打字中"，落定后换成这一轮的最终贴纸；跟着会话走、刷新即重放。
  installStickerNode(ctx, scope)
}
