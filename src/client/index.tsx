/**
 * dsh-memes-reply — 浏览器半边入口。
 *
 * 只做这几件事，都由当前 fiber 持有，停用即净：
 *   1. 注入界面样式（`<style data-plugin="dsh-memes-reply">`）；
 *   2. 在 `settings.plugin.item` 里按本插件的 settings 命名空间注册配置卡片
 *      （设置 → 插件 → 可配置）；
 *   3. 在 `conversation.input.dock` 里注册**隐形轮询器**（拿 sessionId、喂落地仓）；
 *   4. 在 `shell.overlay` 里注册常驻挂件（随时能看到大肥鱼）；
 *   5. 在 `conversation.chat.turnTail` 里注册气泡角上的圆贴纸（复刻路径 B 效果图）。
 *
 * 配置字段的读写走官方 `ctx.settingsScope`；状态行/预览墙/「下一轮用这张」/自动贴纸/挂件
 * 走插件自己的同源路由（见 client/api.ts、client/auto.ts）。
 */

import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// `conversation.chat.turnTail`（气泡角贴纸的座位）由 chat 包声明，增强在那里。
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
// `conversation.input.dock` 由会话包声明，它的 SlotMap 增强在那里。
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// `settings.plugin.item` 这个槽位由 settings-plugins 声明，它的 SlotMap 增强在那里。
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { SETTINGS_NS } from '../protocol.js'
import { stickerStore } from '../store.js'
import type { MemesConfig } from '../types.js'
import { traceSelect } from './api.js'
import { StickerBubble } from './bubble.js'
import { SettingsCard } from './panel.js'
import { StickerPet } from './pet.js'
import { StickerPoller } from './poller.js'
import { CSS } from './styles.js'

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
  // 1) 面板样式：挂在当前 fiber 上，停用即移除。
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = SETTINGS_NS
    style.textContent = CSS
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, 'dsh-memes-reply: panel styles')

  // 2) 绑定本插件的设置命名空间（读写都走官方通道，applies: live）。
  const scope: SettingsScope<MemesConfig> = ctx.settingsScope.bind<MemesConfig>({ namespace: SETTINGS_NS })

  // 3) 设置 → 插件 → 可配置 里的一张卡片，key = 命名空间。
  ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register(
      {
        name: 'settings.plugin.item',
        key: SETTINGS_NS,
      },
      () => <SettingsCard scope={scope} />,
    ),
  )

  // 4) 常驻挂件（"随时能看到大肥鱼"）：坐在 frame-wide 的 `shell.overlay` 里。
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

  // 5) 隐形轮询器：把 host 的待取位搬进落地仓。
  //    它坐 dock 只是因为那个座位**常驻且拿得到 sessionId**；它不渲染任何东西 ——
  //    链式座位的 `select` 是同步纯函数，自己发不了请求。
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.dock',
        id: 'dsh-memes-reply-poller',
        order: 40,
      },
      (props) => <StickerPoller sessionId={String(props.sessionId)} />,
    ),
  )

  // 6) 气泡角上的圆贴纸：链式座位 + `priority: 10`。
  //    按 priority 升序尝试 → 排在 `present` 的交付卡片（0）**之后**：有交付卡片的回合
  //    它先渲染、我这里不显示；其余回合我显示。**不顶掉任何官方功能。**
  //    绑定用 `owner.seq`（该轮 finalNode 的会话序号，单调递增）而不是轮次号：
  //    host 的轮次号（agent 计数器）与客户端 `TurnLocation.turn` 实测会差 2 且漂移。
  ctx.slots.inject('conversation.chat.turnTail', () =>
    ctx.slots.register(
      {
        name: 'conversation.chat.turnTail',
        priority: 10,
        select: (owner) => {
          const hit = stickerStore().peek(owner.turn.turn, owner.seq)
          // 判定结果回报给 host（去重）：这是"到底绑上没绑上"唯一的观测点。
          traceSelect(owner.turn.turn, owner.seq, hit !== null, hit?.id)
          return hit
        },
      },
      (props) => (
        <StickerBubble sessionId={String(props.sessionId)} turn={props.turn.turn} matched={props.matched} />
      ),
    ),
  )
}
