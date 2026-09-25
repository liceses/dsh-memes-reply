/**
 * dsh-memes-reply — JEV 决策客户端（**host only**）。
 *
 * 为什么这个必须在 host 侧：浏览器半边只打包纯逻辑（`scripts/check-client-purity.mjs`
 * 盯着 require），而且 **API key 绝不能进客户端 bundle**。所以"读全文 → 问 JEV"发生在
 * 宿主，客户端只通过 `/jev-pick` 取结论。
 *
 * ## 为什么不是"让 JEV 直接挑 157 张里的一张"
 *
 * 实测（`D:\developing\ai\JEV\meme-router`，2026-09-20，真实 API）：
 *   - 157 张直选：延迟 1.0 s，但 `all-good-1 0.29` vs `qingzhu 0.27`，**margin 0.02 —— 糊**
 *   - 13 族判定：延迟 1.3 s，`celebrate 0.61` vs `bug 0.31`，**语义正确**
 * 所以这里问的是"**哪一族**"，"族内哪一张"由 `pickInFamily` 用确定性哈希选，
 * 顺带把冷却（`avoid`）与变化都放在代码里 —— 精确规则不进模型，这是 JEV 自己的纪律。
 *
 * ## 非确定性 ≠ 可以乱飘
 *
 * JEV 每次调用结果可能不同，而插件的硬需求是"同一个 (会话, 轮次) 刷新后一模一样"。
 * 所以结论按 `${sessionId}:${turn}` 缓存（`createDecisionCache`），客户端刷新只是重放缓存。
 *
 * 隐私：开 `autoMode='jev'` 意味着**助手这一轮的回复正文会被发到 OpenRouter**。
 * 这是该模式的代价，写在这里而不是埋在代码里。
 */
import type { StickerTerm } from './types.js';
/** OpenRouter 的 Decisions 端点（**不是** /api/v1/chat/completions）。 */
export declare const JEV_URL = "https://openrouter.ai/api/alpha/decisions";
/** 默认模型；改它等于改决策质量，所以留在配置里可覆盖。 */
export declare const JEV_DEFAULT_MODEL = "typesafe/jev-1.13";
/** 读 key 的环境变量名。 */
export declare const JEV_KEY_ENV = "OPENROUTER_API_KEY";
/** 默认超时：贴纸是"锦上添花"，绝不能拖住会话。超了就当没这回事。 */
export declare const JEV_DEFAULT_TIMEOUT_MS = 4000;
/** 一次决策的结果。 */
export interface JevDecision {
    /** 是否成功拿到可用结论（false = 调用方走既有规则兜底）。 */
    ok: boolean;
    /** 选中的族 key；`blank` 表示"这轮不贴"。 */
    family: string;
    /** 是否值得贴（noul 的 yes 概率 >= 0.5 且族不是 blank）。 */
    stick: boolean;
    /** 选中族的概率（0–1）。 */
    probability: number;
    /** `stick` 那个是非题的 yes 概率（0–1）；失败时为 0。 */
    yesProbability: number;
    /** 这一次的美元成本（OpenRouter 给就记，没给就是 null）。 */
    costUsd: number | null;
    /** 耗时（ms）。 */
    ms: number;
    /** 一句话诊断（进 trace）。 */
    note: string;
    /** HTTP 状态码；**没发出去**（无 key / 未发起）时为 null。 */
    status: number | null;
    /** 失败原文（成功时空串）。与 `note` 分开：`note` 是给人看的一句话，这里是原始错误。 */
    error: string;
    /** 实际发出去的请求体（长字符串已截断，见 `capped`）—— 调试面板用它。 */
    request: unknown;
    /** 实际收到的响应体（长字符串已截断）；没有响应时为 null。 */
    response: unknown;
}
/**
 * 按上限裁剪一个任意值（纯函数，可单测）。
 *
 * 为什么必须有：调试面板要显示"发给 JEV 的原文"，而回复正文最长 12k 字符、
 * 响应带十几个 label 的概率表。全量留着会让决策缓存（256 条）变成几 MB 常驻内存，
 * 面板渲染也会卡。裁到 1.2k 字符（足够看清发了什么）并**显式标注截断**，
 * 比悄悄丢内容诚实。
 */
export declare function capped(value: unknown, options?: {
    maxString?: number;
    maxItems?: number;
    depth?: number;
}, depth?: number): unknown;
/**
 * 调试日志的一条：**一次真实往返**。
 *
 * 只记真实发生过的调用 —— 命中缓存不产生新条目（否则每次刷新渲染都会刷屏，
 * 而"这一轮走了缓存"已经由 `/stats` 的 `jev.cached` 与本条的 `note` 表达）。
 */
export interface JevExchange {
    /** 发起时刻（ms）。 */
    at: number;
    sessionId: string;
    turn: number;
    model: string;
    ok: boolean;
    family: string;
    stick: boolean;
    probability: number;
    yesProbability: number;
    costUsd: number | null;
    ms: number;
    note: string;
    status: number | null;
    error: string;
    request: unknown;
    response: unknown;
}
/** 调试日志（环形缓冲）。 */
export interface JevLog {
    /** 记一条（`at` 不给就取当前时间）。 */
    push(entry: Omit<JevExchange, 'at'> & {
        at?: number;
    }): void;
    /** 最近的若干条，**最新的在前**（面板就按这个顺序读）。 */
    list(limit?: number): JevExchange[];
    size(): number;
    capacity(): number;
    reset(): void;
}
/** 建调试日志（`limit` 条，超出丢最旧的）。 */
export declare function createJevLog(limit?: number, now?: () => number): JevLog;
/**
 * 从 credentials 文件正文里取 key（纯函数，可单测）。
 *
 * 为什么要有这条兜底路径：DSH 把 key 存在 `<DSH_HOME>/.credentials.yaml`，
 * 但**不一定注入到插件进程的环境变量**里（本机实测：env 里没有，文件里有）。
 * 只做正则取值，不解析 YAML —— 不为了一个 key 把 yaml 依赖拖进插件。
 */
export declare function keyFromCredentials(text: string, envName?: string): string;
/** 读 key 需要的注入点（默认实现见 `loadJevKey`）。 */
export interface KeyDeps {
    env: NodeJS.ProcessEnv | Record<string, string | undefined>;
    /** credentials 文件绝对路径；空串 = 不去读文件。 */
    credentialsPath: string;
    readFile: (path: string) => string;
}
/**
 * 取 key：**环境变量优先，credentials 文件兜底**。
 * 永不打印、永不写进日志；调用方只把它塞进 Authorization 头。
 */
export declare function loadJevKey(deps: KeyDeps, envName?: string): string;
/** 问 JEV 时喂给它的上下文。 */
export interface JevInput {
    /** 助手这一轮的收尾正文（会被发到 OpenRouter）。 */
    reply: string;
    /** 本轮用户说了什么（可选；让判断不至于只见半边）。 */
    userText?: string;
    /** 最近用过的贴纸 id（写进 state 供参考，去重仍由代码做）。 */
    recent?: readonly string[];
    /** 助手自称的角色/语气（可选，来自插件的语气设定）。 */
    persona?: string;
}
/** 组装 JEV 原生请求（纯函数，可单测）。 */
export declare function buildJevRequest(input: JevInput, model?: string): Record<string, unknown>;
/** 响应校验的产出。 */
interface Parsed {
    family: string;
    probability: number;
    yesProbability: number;
}
/**
 * 严格校验响应（JEV 文档要求：缺字段/类型不符/概率越界/未知 label 一律当错误，**绝不当作放行**）。
 * 返回 null 表示这份响应不可用，调用方走兜底。
 */
export declare function parseJevResponse(body: unknown): Parsed | null;
/** 一次决策缓存（按 `${sessionId}:${turn}`）。 */
export interface DecisionCache {
    get(sessionId: string, turn: number): JevDecision | undefined;
    set(sessionId: string, turn: number, decision: JevDecision): void;
    size(): number;
}
/**
 * 定长 FIFO 缓存。
 *
 * 存在的唯一理由是**刷新即重放**：JEV 结果非确定，没有缓存的话同一条回复
 * 每刷新一次就可能换一张贴纸，直接违反 v2.0 的核心不变量。
 */
export declare function createDecisionCache(limit?: number): DecisionCache;
/**
 * 族内挑一张：**避开最近用过的**，在同一 (会话, 轮次) 上确定。
 *
 * 为什么用哈希而不是随机：同一次请求重试/重放必须落到同一张；而变化由 turn 提供
 * （每轮 turn 不同 → 同一族里轮着换），这比 `Math.random()` 既好测又不会在刷新时跳。
 */
export declare function pickInFamily(entries: readonly StickerTerm[], familyKey: string, avoid: ReadonlySet<string>, sessionId: string, turn: number): StickerTerm | undefined;
/** `decide()` 的注入点（测试不碰网络、不碰磁盘、不碰时钟）。 */
export interface JevDeps {
    fetch: typeof globalThis.fetch;
    readFile: (path: string) => string;
    env: NodeJS.ProcessEnv | Record<string, string | undefined>;
    /** credentials 文件绝对路径（空串 = 不读文件）。 */
    credentialsPath: string;
    /** 调用时刻（ms，默认 Date.now）。 */
    now: () => number;
    keyEnv?: string;
}
/** 一次调用的可调参数。 */
export interface JevCallOptions {
    model?: string;
    timeoutMs?: number;
    persona?: string;
}
/**
 * 问一次 JEV。
 *
 * 任何失败（没 key / 网络错 / 超时 / HTTP 非 2xx / 响应不合法）都返回 `ok=false`，
 * **绝不抛**：贴纸层的兜底是既有规则，一个外部服务不该有能力打断会话。
 */
export declare function decideJev(deps: JevDeps, input: JevInput, options?: JevCallOptions): Promise<JevDecision>;
export {};
