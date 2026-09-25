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
import type { Context } from '@deepseek-ai/cordis';
/** cordis 插件名。 */
export declare const name = "memes-reply";
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
export declare const inject: string[];
/** 挂载。 */
export declare function apply(ctx: Context): void;
