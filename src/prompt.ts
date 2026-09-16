/**
 * dsh-memes-reply — 系统提示里的一行"贴纸可用"提示（host）。
 *
 * 为什么需要它：工具只要注册了就对所有会话可用，但**用不用完全由模型决定**。
 * 实测（扫全部会话日志）显示：装好之后跑过的别的会话，请求里都带着
 * `use_sticker`（ds-tts 连续 6 轮都带着），却**一次都没调用过**——它排在 71 个工具的
 * 目录末尾，模型在正常写代码/查问题的流程里没有理由去动一个"装饰性"工具。
 *
 * 所以这里往系统提示里加**一行**（不是一段）：位置锚在 `TOOLS_SDK` 之前，
 * 也就是所有内置工具说明之后。它只在**工具真的注册了**、**总开关开着**、
 * **本会话没被 /fish off 静音**时才输出；否则输出空串（0 token）。
 *
 * 官方机制：`ctx.systemPrompt.section()`（由 dsh-system-prompt 提供），
 * 返回的 disposer 挂在当前 fiber 上，停用即撤。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { MemesConfig } from './types.js'

/** 我们的提示段名（唯一，便于将来替换而不是重复）。 */
export const HINT_SECTION = 'dsh-memes-reply:hint'

/** 提示正文。刻意压到一行：这是"提醒有这个东西"，不是教程。 */
export const HINT_TEXT =
  '情绪合适时（问题修好、踩了坑、夸一句、任务收工）可以用 use_sticker 贴一张大肥鱼；一轮最多一张，用户说不要图时别贴。'

/** 取不到 `TOOLS_SDK` 锚点时的兜底顺序（= TOOLS_SDK(5000) - 100）。 */
const FALLBACK_ORDER = 4900

/** `systemPrompt.section()` 的最小结构面（避免为类型拉整个包的依赖）。 */
interface PromptSectionRegistrar {
  section(section: { name: string; order: number; text: string | ((context: unknown) => string) }): () => void
  getSectionOrder(name: string): number
}

/** 装配上下文里我们用到的那一个字段（由 dsh-agent-loop 增强进来，基底类型没有）。 */
interface AgentBearingContext {
  agent?: { id?: unknown }
}

/** 从装配上下文里取会话 id；取不到就返回 undefined（不强求）。 */
export function sessionIdOf(context: unknown): string | undefined {
  const id = (context as AgentBearingContext | null | undefined)?.agent?.id
  return id === undefined ? undefined : String(id)
}

/** 提示依赖。 */
export interface PromptHintDeps {
  config: () => MemesConfig
  /** 本会话是否被 /fish off 静音。 */
  isMuted: (sessionId: string) => boolean
  /** `use_sticker` 是否真的注册上了（没注册就别提它）。 */
  hasTool: () => boolean
}

/**
 * 注册提示段。
 * @returns disposer；宿主没挂 systemPrompt 服务时返回 undefined。
 */
export function registerPromptHint(ctx: Context, deps: PromptHintDeps): (() => void) | undefined {
  const prompts = ctx.get('systemPrompt') as PromptSectionRegistrar | undefined
  if (prompts === undefined) return undefined

  let order = FALLBACK_ORDER
  try {
    const anchor = prompts.getSectionOrder('TOOLS_SDK')
    if (typeof anchor === 'number' && Number.isFinite(anchor)) order = anchor - 100
  } catch {
    // 锚点名字变了：退回兜底顺序，不影响功能。
  }

  return prompts.section({
    name: HINT_SECTION,
    order,
    text: (context: unknown): string => {
      if (!deps.hasTool()) return ''
      if (!deps.config().enabled) return ''
      const sessionId = sessionIdOf(context)
      if (sessionId !== undefined && deps.isMuted(sessionId)) return ''
      return HINT_TEXT
    },
  })
}
