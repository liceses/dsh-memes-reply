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
import { loadIndex, resolveStickerFile } from './assets.js';
import { createFishCommand } from './command.js';
import { ROUTE_PREFIX, SETTINGS_NS } from './protocol.js';
import { registerPromptHint } from './prompt.js';
import { createStats, createStickerRoute } from './route.js';
import { MemesSettingsSchema, resolveConfig, stateFilePath } from './schema.js';
import { loadState, saveState } from './state.js';
import { createTrace } from './trace.js';
import { createStickerTool } from './tool.js';
/** cordis 插件名。 */
export const name = 'memes-reply';
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
export const inject = ['webServer'];
/** 挂载。 */
export function apply(ctx) {
    // 0) 配置来源：**默认值起步**，官方设置服务可用时再升级成持久化配置。
    //    先有可用配置、后接官方通道 —— 顺序上就不会因为设置服务换了形状而整体起不来。
    //    升级后 `config` 被就地替换，而下面所有 `() => config` 的闭包都是**调用时读**，
    //    所以它们自动看到新值，不需要重新注册任何东西。
    let config = resolveConfig(undefined);
    ctx.inject(['settings'], (settingsCtx) => {
        const service = settingsCtx.settings;
        if (service === undefined || typeof service.register !== 'function') {
            ctx.logger?.warn?.('dsh-memes-reply: 本版 dsh 的 settings 服务没有 register()（0.1.7+ 改成从 cordis Config 投影表单）；' +
                '配置面板与持久化暂不可用，插件以默认配置运行');
            return;
        }
        const scope = service.register(SETTINGS_NS, MemesSettingsSchema, { applies: 'live' });
        config = resolveConfig(scope.get());
        settingsCtx.effect(() => scope.watch((next) => {
            config = resolveConfig(next);
        }), 'dsh-memes-reply: settings watch');
        ctx.logger?.info?.('dsh-memes-reply: 设置已接入（官方 settings.register 通道）');
    });
    /** 浏览器实际使用的 origin（从请求 Host 头学到）；没学到就用本机默认值。 */
    let origin = '';
    const originOf = () => (origin !== '' ? origin : `http://127.0.0.1:${ctx.webServer.port}`);
    const stateFile = stateFilePath();
    let cachedState;
    const readState = () => {
        if (cachedState === undefined)
            cachedState = loadState(stateFile);
        return cachedState;
    };
    const writeState = (next) => {
        cachedState = next;
        saveState(stateFile, next);
    };
    const stats = createStats();
    const indexOf = () => loadIndex(config);
    /** 两端共用的诊断轨迹（`/stats` 一次读全）。 */
    const trace = createTrace(48);
    // 1) 贴纸字节路由 + 客户端的两个数据端点
    ctx.effect(() => ctx.webServer.register(createStickerRoute({
        ctx,
        config: () => config,
        stats,
        observeOrigin: (value) => {
            origin = value;
        },
        origin: originOf,
        state: { read: readState, write: writeState },
        trace: { push: (entry) => trace.push(entry), list: () => trace.list() },
    })), 'dsh-memes-reply: sticker route');
    // 2) 模型工具（tools 服务可选：缺了就只保留路由与命令）
    let toolRegistered = false;
    const tools = ctx.get('tools');
    if (tools !== undefined) {
        ctx.effect(() => {
            toolRegistered = true;
            const dispose = tools.register(createStickerTool({
                config: () => config,
                index: indexOf,
                state: { read: readState, write: writeState },
                exists: async (entry) => (await resolveStickerFile(ctx, entry, config)) !== undefined,
            }));
            return () => {
                toolRegistered = false;
                dispose();
            };
        }, 'dsh-memes-reply: use_sticker tool');
    }
    else {
        ctx.logger?.warn?.('dsh-memes-reply: tools 服务缺失，use_sticker 未注册');
    }
    // 3) 系统提示里的一行提示：告诉模型"可以点名一张"，但贴纸本身不再依赖模型
    //    （`autoMode=every` 时每轮都会贴，模型不调用也照样有）。
    ctx.effect(() => registerPromptHint(ctx, {
        config: () => config,
        hasTool: () => toolRegistered,
        isMuted: (sessionId) => readState().sessions[sessionId]?.muted === true,
    }) ?? (() => { }), 'dsh-memes-reply: prompt hint');
    // 4) 斜杠命令
    const commands = ctx.get('commands');
    if (commands !== undefined) {
        ctx.effect(() => commands.register(createFishCommand({ config: () => config, index: indexOf, state: { read: readState, write: writeState } })), 'dsh-memes-reply: /fish command');
    }
    else {
        ctx.logger?.warn?.('dsh-memes-reply: commands 服务缺失，/fish 未注册');
    }
    const index = indexOf();
    ctx.logger?.info?.(`dsh-memes-reply: 路由 ${ROUTE_PREFIX} 已挂载 · 素材 ${index?.entries.length ?? 0} 张` +
        (index === undefined
            ? '（索引缺失：先跑 node scripts/fetch-assets.mjs 取素材，或用 node scripts/import-assets.mjs 从原图生成）'
            : ` · ${index.path}`));
}
//# sourceMappingURL=index.js.map