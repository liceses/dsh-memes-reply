/**
 * dsh-memes-reply — HTTP 路由（host）。
 *
 * 一条前缀路由管这些事：
 *   GET/HEAD /api/dsh-memes-reply/sticker/<id>.<ext>   贴纸字节（全尺寸动画）
 *   GET/HEAD /api/dsh-memes-reply/thumb/<id>.<ext>     缩略图字节（设置面板预览墙）
 *   GET      /api/dsh-memes-reply/catalog              素材清单（预览墙数据）
 *   GET      /api/dsh-memes-reply/vocab                全量检索词表（v2.0 客户端派生）
 *   GET      /api/dsh-memes-reply/session-state        会话态（静音/指定/最近用过）
 *   POST     /api/dsh-memes-reply/jev-pick             JEV 按语境选一张（autoMode=jev）
 *   GET/POST /api/dsh-memes-reply/latch                「下一轮用这张」读写
 *   GET      /api/dsh-memes-reply/stats                诊断 / 面板状态行
 *
 * 为什么不让浏览器的 `<img>` 走官方的 `/api/file`：那条通道是 `no-store`、无 Range、
 * 且有连接服务鉴权；自建路由可以给 `immutable` 缓存 + ETag，让几百 KB 的贴纸也只在
 * 首次下载。仅接受回环 Host，且不发任何 CORS 头（与 dsh-showme-html 同款围栏）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { MemesConfig, PluginState, TraceEntry } from './types.js';
/** JEV 计数（诊断用：花了多少、命中多少、回落多少）。 */
export interface JevStats {
    /** 真正打过 OpenRouter 的次数。 */
    calls: number;
    /** 命中缓存的次数（刷新重放，没花钱）。 */
    hits: number;
    /** 失败回落既有规则的次数。 */
    fallbacks: number;
    /** 累计美元成本（OpenRouter 报的）。 */
    costUsd: number;
    /** 最近一次耗时（ms）与结论摘要。 */
    lastMs: number;
    lastNote: string;
}
/** 运行计数（诊断端点用）。 */
export interface StickerStats {
    /** 成功返回的贴纸字节数。 */
    served: number;
    /** 未命中（未知 id / 文件缺失 / 索引缺失）。 */
    miss: number;
    /** 被回环围栏挡掉的请求。 */
    denied: number;
    /** 最近一次成功服务的 id。 */
    lastId: string;
    /** 最近一次成功服务的时间戳。 */
    lastAt: number;
    /** JEV 决策计数。 */
    jev: JevStats;
}
/** 建计数器。 */
export declare function createStats(): StickerStats;
/** 路由依赖。 */
export interface RouteDeps {
    ctx: Context;
    /** 当前配置（每次请求重新读，设置面板改完即时生效）。 */
    config: () => MemesConfig;
    stats: StickerStats;
    /** 浏览器当前使用的 origin（用于把绝对 URL 拼好交给面板）。 */
    origin: () => string;
    /** 从请求 Host 头学习真实 origin。 */
    observeOrigin: (origin: string) => void;
    /** 插件自有状态（面板的"下一轮用这张"写这里）。 */
    state: {
        read: () => PluginState;
        write: (next: PluginState) => void;
    };
    /** 诊断环形缓冲（host 决策 + 客户端回执）。 */
    trace: {
        push: (entry: Omit<TraceEntry, 'at'> & {
            at?: number;
        }) => void;
        list: () => TraceEntry[];
    };
    /**
     * JEV 决策的可注入点（只给测试用；生产一律走默认实现）。
     *
     * 没有这个口子，`/jev-pick` 这条链就只能靠"起一个真 DSH 再戳一下"来验 ——
     * 而它恰恰是最该被单测钉死的部分（缓存/回落/去重都在这里）。
     */
    jev?: Partial<{
        fetch: typeof globalThis.fetch;
        env: NodeJS.ProcessEnv | Record<string, string | undefined>;
        credentialsPath: string;
        readFile: (path: string) => string;
        now: () => number;
    }>;
}
/** 构建这一条前缀路由。 */
export declare function createStickerRoute(deps: RouteDeps): WebRoute;
