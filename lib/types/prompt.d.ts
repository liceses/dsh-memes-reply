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
import type { Context } from '@deepseek-ai/cordis';
import type { MemesConfig } from './types.js';
/** 我们的提示段名（唯一，便于将来替换而不是重复）。 */
export declare const HINT_SECTION = "dsh-memes-reply:hint";
/** 提示正文。刻意压到一行：这是"提醒有这个东西"，不是教程。 */
export declare const HINT_TEXT = "\u60C5\u7EEA\u5408\u9002\u65F6\uFF08\u95EE\u9898\u4FEE\u597D\u3001\u8E29\u4E86\u5751\u3001\u5938\u4E00\u53E5\u3001\u4EFB\u52A1\u6536\u5DE5\uFF09\u53EF\u4EE5\u7528 use_sticker \u8D34\u4E00\u5F20\u5927\u80A5\u9C7C\uFF1B\u4E00\u8F6E\u6700\u591A\u4E00\u5F20\uFF0C\u7528\u6237\u8BF4\u4E0D\u8981\u56FE\u65F6\u522B\u8D34\u3002";
/** 从装配上下文里取会话 id；取不到就返回 undefined（不强求）。 */
export declare function sessionIdOf(context: unknown): string | undefined;
/** 提示依赖。 */
export interface PromptHintDeps {
    config: () => MemesConfig;
    /** 本会话是否被 /fish off 静音。 */
    isMuted: (sessionId: string) => boolean;
    /** `use_sticker` 是否真的注册上了（没注册就别提它）。 */
    hasTool: () => boolean;
}
/**
 * 注册提示段。
 * @returns disposer；宿主没挂 systemPrompt 服务时返回 undefined。
 */
export declare function registerPromptHint(ctx: Context, deps: PromptHintDeps): (() => void) | undefined;
