/**
 * 设置来源的**延迟绑定句柄**（本包纯模块；实际只被浏览器半边用）。
 *
 * 放在 `src/` 而不是 `src/client/` 是**刻意的**：`tsconfig.build.json` 只编译 `src/*.ts`
 * （`src/client/**` 由 tsdown 单独打包），放这里才能被 node 直接 require 到、进单元测试。
 * 同类的共享纯模块还有 `theme.ts` / `config.ts` / `derive.ts`。
 *
 * ## 0.1.7：这个文件同时是**类型兼容垫片**
 *
 * 客户端设置服务跨版本改过名，而且**可能整个不存在**：
 *
 * | dsh 版本 | 客户端服务 | 取值方式 | 类型 |
 * | --- | --- | --- | --- |
 * | 0.1.5-rc.1 / 0.1.6-alpha.2 | `ctx.settingsScope` | `bind({ namespace })` | `SettingsScope*` |
 * | **0.1.7-rc.2** | **`ctx.configForms`**（`settingsScope` 在 0.1.7 的 app.asar 里 0 命中） | `get(entryId)` | `ConfigForm*` |
 *
 * 两个形状**逐字段同构**（`status` / `value` / `base` / `user` / `revision` / `writable` /
 * `mode`），所以这里把 0.1.7 的 `ConfigForm` / `ConfigFormSnapshot` 原地别名成
 * `SettingsScope` / `SettingsScopeSnapshot`，**六个 client 文件一行都不用改**——
 * 只把 import 来源从已消失的 `@deepseek-ai/dsh-client-runtime/client` 换成本模块。
 *
 * 更要命的是失败形态：顶层 `inject` 里写一个拿不到的服务，cordis 的 loader 会**永久停在
 * `pending (waiting for service: …)`**，浏览器侧报 `web boot: 1 entry did not activate`，
 * **整个应用打不开**（2026-09-25 在 DSH Desktop 0.1.7-rc.2 上实测）。
 *
 * ## 这个句柄怎么解
 *
 * 它**自己就是一个合法的设置来源**：
 *   - 没挂上真服务时，快照恒为 `unavailable`，读到的 `value` 是 `undefined`。
 *     各处本来就会回落到 `DEFAULT_CONFIG`（`node.tsx` / `pet.tsx` / `panel.tsx` 都是
 *     `{ ...DEFAULT_CONFIG, ...(value ?? {}) }`），所以**贴纸层与挂件照常工作**，
 *     配置面板显示"设置不可达，使用默认值"。
 *   - `attach(live)` 之后，读与订阅透传给真服务，并主动通知一次订阅者 ——
 *     组件不需要重新注册，界面自己就活了。
 *
 * 这样装配顺序不再是正确性问题：无论服务早到、晚到还是永远不来，插件都能起来。
 */
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client';
/** 0.1.7 的设置来源类型；名字沿用以避免六个 client 文件跟着改。 */
export type SettingsScope<T> = ConfigForm<T>;
/** 0.1.7 的设置快照类型（与 0.1.5 的 `SettingsScopeSnapshot` 逐字段同构）。 */
export type SettingsScopeSnapshot<T> = ConfigFormSnapshot<T>;
/** 延迟绑定句柄：既是设置来源，又能事后挂上真服务。 */
export interface LazySettingsScope<T> extends ConfigForm<T> {
    /**
     * 挂上真正的设置服务。
     *
     * @param live - 官方服务 `configForms.get(entryId)` 的返回值。
     * @returns 解绑函数（连订阅一起撤掉）；跟随插件 fiber 用 `ctx.effect` 持有。
     */
    attach(live: ConfigForm<T>): () => void;
    /** 是否已挂上真服务（诊断用）。 */
    readonly attached: boolean;
}
/**
 * 建一个延迟绑定句柄。
 *
 * @returns 一个立刻可用、形如设置来源的句柄。
 */
export declare function createLazyScope<T>(): LazySettingsScope<T>;
