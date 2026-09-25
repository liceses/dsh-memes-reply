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
import { MOOD_BLANK, MOOD_FAMILIES, familyCriteria, familyOf } from './moods.js';
/** OpenRouter 的 Decisions 端点（**不是** /api/v1/chat/completions）。 */
export const JEV_URL = 'https://openrouter.ai/api/alpha/decisions';
/** 默认模型；改它等于改决策质量，所以留在配置里可覆盖。 */
export const JEV_DEFAULT_MODEL = 'typesafe/jev-1.13';
/** 读 key 的环境变量名。 */
export const JEV_KEY_ENV = 'OPENROUTER_API_KEY';
/** 默认超时：贴纸是"锦上添花"，绝不能拖住会话。超了就当没这回事。 */
export const JEV_DEFAULT_TIMEOUT_MS = 4000;
/**
 * 按上限裁剪一个任意值（纯函数，可单测）。
 *
 * 为什么必须有：调试面板要显示"发给 JEV 的原文"，而回复正文最长 12k 字符、
 * 响应带十几个 label 的概率表。全量留着会让决策缓存（256 条）变成几 MB 常驻内存，
 * 面板渲染也会卡。裁到 1.2k 字符（足够看清发了什么）并**显式标注截断**，
 * 比悄悄丢内容诚实。
 */
export function capped(value, options = {}, depth = 0) {
    const maxString = options.maxString ?? 1200;
    const maxItems = options.maxItems ?? 40;
    const maxDepth = options.depth ?? 6;
    if (typeof value === 'string') {
        return value.length <= maxString ? value : `${value.slice(0, maxString)}…[截断，原文 ${value.length} 字符]`;
    }
    if (value === null || typeof value === 'number' || typeof value === 'boolean')
        return value;
    if (value === undefined)
        return null;
    if (depth >= maxDepth)
        return '[层级过深，已省略]';
    if (Array.isArray(value)) {
        const head = value.slice(0, maxItems).map((item) => capped(item, options, depth + 1));
        if (value.length > maxItems)
            head.push(`…[还有 ${value.length - maxItems} 项]`);
        return head;
    }
    if (typeof value === 'object') {
        const out = {};
        const entries = Object.entries(value);
        for (const [key, item] of entries.slice(0, maxItems))
            out[key] = capped(item, options, depth + 1);
        if (entries.length > maxItems)
            out['…'] = `[还有 ${entries.length - maxItems} 个字段]`;
        return out;
    }
    return String(value);
}
/** 建调试日志（`limit` 条，超出丢最旧的）。 */
export function createJevLog(limit = 20, now = Date.now) {
    const ring = [];
    const cap = Math.max(1, Math.trunc(limit));
    return {
        push(entry) {
            ring.push({ at: entry.at ?? now(), ...entry });
            while (ring.length > cap)
                ring.shift();
        },
        list(count) {
            const wanted = count === undefined ? ring.length : Math.max(0, Math.trunc(count));
            // 最新的在前：面板要"刚发生了什么"，不是"最早发生了什么"。
            return ring.slice(Math.max(0, ring.length - wanted)).reverse();
        },
        size: () => ring.length,
        capacity: () => cap,
        reset: () => {
            ring.length = 0;
        },
    };
}
/** 失败时的结论（统一构造，避免各处手写默认值）。 */
function failed(note, ms = 0, extra = {}) {
    return {
        ok: false,
        family: MOOD_BLANK,
        stick: false,
        probability: 0,
        yesProbability: 0,
        costUsd: null,
        ms,
        note,
        status: null,
        error: '',
        request: null,
        response: null,
        ...extra,
    };
}
/**
 * 从 credentials 文件正文里取 key（纯函数，可单测）。
 *
 * 为什么要有这条兜底路径：DSH 把 key 存在 `<DSH_HOME>/.credentials.yaml`，
 * 但**不一定注入到插件进程的环境变量**里（本机实测：env 里没有，文件里有）。
 * 只做正则取值，不解析 YAML —— 不为了一个 key 把 yaml 依赖拖进插件。
 */
export function keyFromCredentials(text, envName = JEV_KEY_ENV) {
    if (text === '')
        return '';
    const re = new RegExp(`^\\s*${envName}\\s*:\\s*['"]?([^\\s'"]+)['"]?\\s*$`, 'm');
    const hit = re.exec(text);
    return hit === null ? '' : hit[1].trim();
}
/**
 * 取 key：**环境变量优先，credentials 文件兜底**。
 * 永不打印、永不写进日志；调用方只把它塞进 Authorization 头。
 */
export function loadJevKey(deps, envName = JEV_KEY_ENV) {
    const fromEnv = (deps.env[envName] ?? '').trim();
    if (fromEnv !== '')
        return fromEnv;
    if (deps.credentialsPath === '')
        return '';
    try {
        return keyFromCredentials(deps.readFile(deps.credentialsPath), envName);
    }
    catch {
        return '';
    }
}
/** 组装 JEV 原生请求（纯函数，可单测）。 */
export function buildJevRequest(input, model = JEV_DEFAULT_MODEL) {
    const recent = input.recent ?? [];
    return {
        model,
        state: {
            task: '给一条 AI 助手的回复挑一个最贴切的情绪族，用来配一张表情包贴纸。这是分类，不是创作。',
            assistant_reply: input.reply,
            ...(input.userText === undefined || input.userText === '' ? {} : { user_message: input.userText }),
            ...(input.persona === undefined || input.persona === '' ? {} : { persona: input.persona }),
            recently_used: recent,
            dedup_policy: 'recently_used 由代码排除，你只按贴切度选；最贴切的那族刚用过也照样选它。',
            note: '只判断语气与情绪；不要考虑图好不好看、也不要改写回复。',
        },
        questions: {
            stick: {
                type: 'noul',
                instructions: '这条助手回复值得贴一张表情包吗？纯技术输出、纯数据、纯日志、没有情绪时选否。',
                criteria: {
                    true: '回复带有可贴的情绪或社交语气（高兴、自嘲、认真、累、提醒……）。',
                    false: '回复是纯技术结论或纯数据，没有任何情绪可表达。',
                },
            },
            family: {
                type: 'choice',
                instructions: '这条回复最贴切哪个情绪族？只有一个最贴切时选它；确实没有情绪时选 blank。',
                criteria: familyCriteria(),
            },
        },
    };
}
/**
 * 严格校验响应（JEV 文档要求：缺字段/类型不符/概率越界/未知 label 一律当错误，**绝不当作放行**）。
 * 返回 null 表示这份响应不可用，调用方走兜底。
 */
export function parseJevResponse(body) {
    if (body === null || typeof body !== 'object')
        return null;
    const answers = body.answers;
    if (answers === null || typeof answers !== 'object')
        return null;
    const family = answers.family;
    const stick = answers.stick;
    if (family === null || typeof family !== 'object')
        return null;
    if (stick === null || typeof stick !== 'object')
        return null;
    const choice = family.choice;
    if (typeof choice !== 'string')
        return null;
    if (choice !== MOOD_BLANK && familyOf(choice) === undefined)
        return null;
    const probabilities = family.probabilities;
    let probability = 0;
    if (probabilities !== null && typeof probabilities === 'object') {
        const value = probabilities[choice];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
            probability = value;
    }
    const noul = stick.noul;
    const yesProbability = typeof noul === 'number' && Number.isFinite(noul) && noul >= 0 && noul <= 1 ? noul : 0;
    return { family: choice, probability, yesProbability };
}
/**
 * 定长 FIFO 缓存。
 *
 * 存在的唯一理由是**刷新即重放**：JEV 结果非确定，没有缓存的话同一条回复
 * 每刷新一次就可能换一张贴纸，直接违反 v2.0 的核心不变量。
 */
export function createDecisionCache(limit = 256) {
    const map = new Map();
    const keyOf = (sessionId, turn) => `${sessionId}:${turn}`;
    return {
        get: (sessionId, turn) => map.get(keyOf(sessionId, turn)),
        set: (sessionId, turn, decision) => {
            const key = keyOf(sessionId, turn);
            // 重设同一个 key 时先删再插，让它变成"最新"（LRU-ish 的淘汰顺序不会冤枉热键）。
            map.delete(key);
            map.set(key, decision);
            while (map.size > limit) {
                const oldest = map.keys().next();
                if (oldest.done === true)
                    break;
                map.delete(oldest.value);
            }
        },
        size: () => map.size,
    };
}
/** FNV-1a：与 `auto.ts` / `derive.ts` 同款，保证三处"到点了选同一张"的口径一致。 */
function hash(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) {
        value ^= text.charCodeAt(i);
        value = Math.imul(value, 16777619);
    }
    return value >>> 0;
}
/**
 * 族内挑一张：**避开最近用过的**，在同一 (会话, 轮次) 上确定。
 *
 * 为什么用哈希而不是随机：同一次请求重试/重放必须落到同一张；而变化由 turn 提供
 * （每轮 turn 不同 → 同一族里轮着换），这比 `Math.random()` 既好测又不会在刷新时跳。
 */
export function pickInFamily(entries, familyKey, avoid, sessionId, turn) {
    const family = familyOf(familyKey);
    if (family === undefined)
        return undefined;
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const members = family.members.map((id) => byId.get(id)).filter((entry) => entry !== undefined);
    if (members.length === 0)
        return undefined;
    const fresh = members.filter((entry) => !avoid.has(entry.id));
    const pool = fresh.length > 0 ? fresh : members;
    return pool[hash(`${sessionId}:${turn}:${familyKey}`) % pool.length];
}
/**
 * 问一次 JEV。
 *
 * 任何失败（没 key / 网络错 / 超时 / HTTP 非 2xx / 响应不合法）都返回 `ok=false`，
 * **绝不抛**：贴纸层的兜底是既有规则，一个外部服务不该有能力打断会话。
 */
export async function decideJev(deps, input, options = {}) {
    const key = loadJevKey(deps, deps.keyEnv ?? JEV_KEY_ENV);
    if (key === '')
        return failed('no key');
    const model = options.model !== undefined && options.model !== '' ? options.model : JEV_DEFAULT_MODEL;
    const timeoutMs = options.timeoutMs !== undefined && options.timeoutMs > 0 ? options.timeoutMs : JEV_DEFAULT_TIMEOUT_MS;
    const request = buildJevRequest(input, model);
    const started = deps.now();
    const controller = new AbortController();
    let timer;
    try {
        // 双保险：`AbortController` 让真实的 fetch 早点收工，`Promise.race` 兜住
        // "某个 fetch 实现根本不看 signal"的情况。缺了后者，一个不听话的实现能把
        // "绝不拖住会话"这条承诺变成无限等待。
        const timedOut = new Promise((resolve) => {
            timer = setTimeout(() => {
                controller.abort();
                resolve('timeout');
            }, timeoutMs);
        });
        const raced = await Promise.race([
            deps
                .fetch(JEV_URL, {
                method: 'POST',
                headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
                body: JSON.stringify(request),
                signal: controller.signal,
            })
                .then(async (response) => ({ kind: 'response', response }))
                .catch((error) => ({ kind: 'error', error })),
            timedOut,
        ]);
        /** 调试面板要看的"发出去的原文"。裁剪放在这里（而不是面板里），缓存才不会被撑大。 */
        const sent = capped(request);
        const ms = deps.now() - started;
        if (raced === 'timeout') {
            return failed(`timeout ${timeoutMs}ms`, ms, { error: `timeout ${timeoutMs}ms`, request: sent });
        }
        if (raced.kind === 'error') {
            const message = raced.error instanceof Error ? raced.error.message : String(raced.error);
            return failed(`error ${message}`, ms, { error: message, request: sent });
        }
        const response = raced.response;
        if (response.ok !== true) {
            // 非 2xx 也要留下响应体：402（欠费）与 429（限流）的正文是排障的唯一线索。
            const rawError = await safeJson(response);
            return failed(`http ${response.status}`, ms, {
                status: response.status,
                error: `http ${response.status}`,
                request: sent,
                response: capped(rawError),
            });
        }
        const body = await response.json();
        const parsed = parseJevResponse(body);
        if (parsed === null) {
            return failed('bad response', deps.now() - started, {
                status: response.status,
                error: 'bad response',
                request: sent,
                response: capped(body),
            });
        }
        const costRaw = body.usage?.cost;
        const costUsd = typeof costRaw === 'number' && Number.isFinite(costRaw) ? costRaw : null;
        const stick = parsed.yesProbability >= 0.5 && parsed.family !== MOOD_BLANK;
        const label = familyOf(parsed.family)?.label ?? MOOD_BLANK;
        return {
            ok: true,
            family: parsed.family,
            stick,
            probability: parsed.probability,
            yesProbability: parsed.yesProbability,
            costUsd,
            ms: deps.now() - started,
            note: `${stick ? label : '不贴'} p=${parsed.probability.toFixed(2)} yes=${parsed.yesProbability.toFixed(2)}`,
            status: response.status,
            error: '',
            request: sent,
            response: capped(body),
        };
    }
    catch (error) {
        return failed(`error ${error instanceof Error ? error.message : String(error)}`, deps.now() - started, {
            error: error instanceof Error ? error.message : String(error),
        });
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
/** 尽力读一个 JSON 响应体（读不动就退化成一段说明文本，绝不抛）。 */
async function safeJson(response) {
    try {
        return await response.json();
    }
    catch {
        return '[响应体不是 JSON，或读取失败]';
    }
}
//# sourceMappingURL=jev.js.map