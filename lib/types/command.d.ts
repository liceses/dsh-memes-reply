/**
 * dsh-memes-reply — 斜杠命令 `/fish`。
 *
 * 命令结果**不进模型历史**（dsh-commands 的语义），所以它最适合干这些"人按的开关"：
 *   /fish                     看状态与清单
 *   /fish list [关键词]        过滤清单
 *   /fish on | off            本会话静音开关
 *   /fish <id | 关键词>        给下一轮指定一张（一次性）
 *
 * v2.0 变更：`/fish mode inline|sticker` 随 `form` 设置一起退役 —— 贴纸只有一种形态
 * （会话流里的派生节点，见 `client/node.tsx`），静音与指定仍由宿主状态说了算，
 * 客户端经 `/session-state` 读取。
 */
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
import type { LoadedIndex } from './assets.js';
import type { MemesConfig, PluginState } from './types.js';
/** 命令依赖。 */
export interface CommandDeps {
    config: () => MemesConfig;
    index: () => LoadedIndex | undefined;
    state: {
        read: () => PluginState;
        write: (state: PluginState) => void;
    };
}
/** 构建 `/fish`。 */
export declare function createFishCommand(deps: CommandDeps): CommandDefinition;
