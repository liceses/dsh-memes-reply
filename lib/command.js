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
import { COMMAND_NAME } from './protocol.js';
import { effectiveAssetRoot } from './assets.js';
import { searchStickers } from './search.js';
import { sessionState } from './state.js';
/** 成功结果。 */
function success(text) {
    return { kind: 'success', text };
}
/** 失败结果。 */
function failure(text) {
    return { kind: 'error', text };
}
const USAGE = [
    '用法：',
    '  /fish                   状态与清单',
    '  /fish list [关键词]      过滤清单',
    '  /fish on | off          本会话静音开关',
    '  /fish <id | 关键词>      下一轮指定一张（一次性）',
].join('\n');
/** 构建 `/fish`。 */
export function createFishCommand(deps) {
    return {
        name: COMMAND_NAME,
        description: '大肥鱼贴纸：状态、清单、本会话静音、下一轮指定',
        input: { hint: '[list|on|off|<id|关键词>]' },
        handler: (invocation) => {
            const cfg = deps.config();
            const index = deps.index();
            if (index === undefined) {
                return failure('素材索引还没生成：先跑 `node scripts/fetch-assets.mjs` 取素材（或 `node scripts/import-assets.mjs` 从原图生成）');
            }
            const sessionId = String(invocation.agent.id);
            const state = deps.state.read();
            const session = sessionState(state, sessionId);
            const raw = invocation.rawInput.trim();
            const parts = raw.split(/\s+/).filter((part) => part !== '');
            const head = (parts[0] ?? '').toLowerCase();
            const status = () => [
                `状态：${cfg.enabled ? '总开关开' : '总开关关'} · 规则 ${cfg.autoMode}（每 ${cfg.autoEveryTurns} 轮）· 画质 ${cfg.quality} · 本会话${session.muted === true ? '已静音' : '正常'}`,
                `素材：${index.entries.length} 张 · ${effectiveAssetRoot(cfg)}`,
                session.latch !== undefined && session.latch !== ''
                    ? `下一轮指定：《${index.byId.get(session.latch)?.name ?? session.latch}》`
                    : '',
                session.recent !== undefined && session.recent.length > 0
                    ? `最近用过：${session.recent.slice(0, 5).join('、')}`
                    : '',
            ]
                .filter((line) => line !== '')
                .join('\n');
            const list = (keyword) => {
                const hits = keyword === '' ? undefined : searchStickers(index.entries, keyword, 200);
                const entries = hits === undefined ? index.entries : hits.map((hit) => hit.entry);
                if (entries.length === 0)
                    return failure(`没有匹配「${keyword}」的贴纸`);
                const shown = entries.slice(0, 40);
                const lines = shown.map((entry) => `  ${entry.id.padEnd(26)} ${entry.name}`);
                const more = entries.length > shown.length ? `\n  …共 ${entries.length} 张，用 /fish list <关键词> 收窄` : '';
                return success(`${keyword === '' ? '全部贴纸' : `匹配「${keyword}」`}：${entries.length} 张\n${lines.join('\n')}${more}`);
            };
            if (head === '' || head === 'help')
                return success(`${status()}\n\n${USAGE}`);
            if (head === 'list')
                return list(parts.slice(1).join(' '));
            if (head === 'on' || head === 'off') {
                session.muted = head === 'off';
                deps.state.write(state);
                return success(head === 'off' ? '本会话已静音：之后不会再贴图（历史里的图仍可显示）' : '本会话已恢复贴图');
            }
            // 其余一律当"下一轮指定一张"。
            const entry = index.byId.get(head) ?? searchStickers(index.entries, raw, 1)[0]?.entry;
            if (entry === undefined)
                return failure(`没有找到「${raw}」\n\n${USAGE}`);
            session.latch = entry.id;
            deps.state.write(state);
            return success(`下一轮会贴：《${entry.name}》（${entry.id}）`);
        },
    };
}
//# sourceMappingURL=command.js.map