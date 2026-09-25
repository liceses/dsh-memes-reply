/**
 * 从「本轮收尾助手」的内容块里取出贴纸派生所需的输入（本包纯模块，可在 node 下单测）。
 *
 * ## 为什么需要它
 *
 * 落定贴纸的座位从"自定义会话流节点"换成了官方的**回合收尾槽位**
 * （`conversation.chat.turnTail`）—— 原因见 `client/node.tsx` 里 `seat` 的说明：
 * 自定义节点会被「工作步骤展示」折进过程块，而 `turn-tail` 在官方的豁免名单里。
 *
 * 换座位之后，插件不再自己从会话事件累积这一轮的状态，而是读官方已经算好的
 * `TurnTailChatData.closing`（**本轮最后一个有内容的收尾助手**）：
 *   - 正文 → 拼接 `kind: 'text'` 的块（keyword 模式扫它）；
 *   - 模型点名 → 找 `name === 'use_sticker'` 的 `kind: 'tool-call'` 块，解它的 `argsRaw`。
 *
 * 放在 `src/` 而不是 `src/client/` 是刻意的：`tsconfig.build.json` 只编译 `src/*.ts`
 * （`src/client/**` 由 tsdown 单独打包），放这里才能被 node 直接 require 到、进单元测试。
 */
/** 助手内容块里我们关心的两种（其余原样忽略）。 */
export type AssistantBlockLike = {
    kind: 'text';
    text: string;
} | {
    kind: 'tool-call';
    callId?: string;
    name: string;
    argsRaw: string;
} | {
    kind: string;
};
/** 收尾助手的最小形状（官方 `FinalAssistantChatData` 的可用子集）。 */
export interface ClosingAssistantLike {
    readonly blocks?: readonly AssistantBlockLike[];
}
/** 从 `use_sticker` 的实参里取 `id` 与 `mood`（实参可能是对象，也可能是 JSON 字符串）。 */
export declare function modelPickOf(argumentsRaw: unknown): {
    id: string | null;
    mood: string | null;
};
/**
 * 取收尾正文：把所有 `kind: 'text'` 的块按顺序拼起来。
 *
 * @param closing - 官方的收尾助手，可能为 `null`（本轮没有干净收尾）。
 * @returns 拼接后的正文；没有就是空串（调用方按"命中不了关键词"处理）。
 */
export declare function closingTextOf(closing: ClosingAssistantLike | null | undefined): string;
/**
 * 取模型点名：找最后一个 `use_sticker` 的 `tool-call` 块，解出 `id` / `mood`。
 *
 * 取**最后一个**是因为一轮里模型可能试过多次；最后一次才是它最终的意思。
 *
 * @param closing - 官方的收尾助手，可能为 `null`。
 * @returns 解析结果；没找到或实参坏了就是 `{ id: null, mood: null }`。
 */
export declare function closingPickOf(closing: ClosingAssistantLike | null | undefined): {
    id: string | null;
    mood: string | null;
};
