# DSH 0.1.7 适配记录（dsh-memes-reply）

目标运行时：**DSH 0.1.7-rc.2**。跨仓口径见 `upgrade/RECIPE-0.1.7.md`，完整证据见 `upgrade/VERIFICATION-0.1.7.md`。

> 这两份文档在工作区里（`…\DSH-plugin\upgrade\`），**不随本仓库发布**；仓库外的读者只看本文即可。
> 0.2.0 的清单放宽（`>=0.1.7-rc.1 <0.3`）与那道启动期闸门的规则，见 [`dsh-0.2.0-compat.md`](./dsh-0.2.0-compat.md)。

## 与前两版的差别

| dsh 版本 | 宿主设置 | 客户端设置 | 客户端上下文类型 |
|---|---|---|---|
| 0.1.5-rc.1 / 0.1.6-alpha.2 | `settings.register(ns, schema, {applies:'live'})` → `get()`/`watch()` | `ctx.settingsScope.bind({namespace})` | `ClientContext`（来自 `dsh-client-runtime/client`） |
| **0.1.7-rc.2** | **没有 `register()`**：导出 `Config`（volatile 字段）+ `configure({auto:false}, ctx.fiber)`，读值走活引用 `.get()` | **`ctx.configForms.get(条目 id)`**（`settingsScope` 在 0.1.7 的 app.asar 里 **0 命中**） | cordis 的 `Context`（`ClientContext` 随整包消失） |

本包此前已经为 0.1.7 做过一次「探测 `register` 是否存在」的降级处理（commits `523dc9d`/`822d2f6`）。
本轮按**硬切 0.1.7** 的决策把降级分支收敛成单一路径。

## 改动清单

| 文件 | 改了什么 |
|---|---|
| `src/schema.ts` | `MemesSettingsSchema` → **`export const Config`**，22 个字段全部 `.default(…).description(…).volatile()`；新增 `LiveConfig` 与 `resolveLive()` |
| `src/protocol.ts` | 新增 **`ENTRY_ID = 'memes-reply'`**（0.1.7 的设置命名空间 = profile 条目 id，与 `cordis.patch.yml` 一致）；`SETTINGS_NS` 保留仅作对照 |
| `src/index.ts` | 删掉 `SettingsRegisterLike` 与整个 `service.register(...)` 分支；导出 `Config`；签名改 `apply(ctx, live: LiveConfig)`；`readConfig()` 每次现读；受限 fiber 里 `configure`（带 `typeof service.configure !== 'function'` 兜底，保持"服务形状不对也照常跑"） |
| `src/settings-source.ts` | 变成**类型兼容垫片**：把 0.1.7 的 `ConfigForm`/`ConfigFormSnapshot` 原地别名成 `SettingsScope`/`SettingsScopeSnapshot`（两者逐字段同构），并给延迟绑定句柄补 `mutate`（0.1.7 的 `ConfigForm` 要求它） |
| `src/client/index.tsx` | `ClientContext`→cordis `Context`；`ctx.settingsScope.bind({namespace})` → `ctx.configForms.get(ENTRY_ID)`（受限 fiber，`inject` 仍只放 `['slots']`）；`SettingsScopeService`→`ConfigFormsService` |
| `src/client/node.tsx`、`turn-tail.tsx` | `ClientContext`→`Context`；`turn-tail.tsx` 另加约 70 行排障回执（`sticker-turn-tail-mounted` / `-slot` / `-registered` / `-register-failed`，`slots.register` 的 try/catch 与 `slots.entries()` 探测），`CLIENT_BUILD` 随之升到 `turn-tail-c` |
| `src/client/{panel,pet,jevpanel}.tsx` | 只把类型 import 来源换成本仓 `settings-source.ts`（**一行逻辑都没改**） |
| `package.json` | peer 收敛为 `^0.1.7-rc.1`（原来是三版本析取；随后为容纳 0.2.0-rc.x 放宽成 `>=0.1.7-rc.1 <0.3`，见 [0.2.0 记录](./dsh-0.2.0-compat.md)）；新增两个 client 包为 peer（`dsh-client-ui-renderer` / `dsh-client-ui-settings`）；`dsh.manifestVersion:1`；`engines.dsh`；`dsh.client.inject` → `['@deepseek-ai/dsh-client-ui-settings']`；devDeps 对齐 0.1.7 并删掉已消失的 `dsh-client-runtime` / `dsh-client-ui-settings-plugins`；`schemastery` 由 `^3.18.2` 收紧为精确 `3.18.4` |
| `tsdown.config.ts`、`scripts/check-client-purity.mjs` | 平台模块/白名单删掉已消失的三个包，换 `dsh-client-ui-renderer`/`dsh-client-store` |
| `test/client-bundle.test.mjs` | manifest `inject` 断言更新；`test/apply.test.mjs` 的桩 ctx 改成 0.1.7 形状（`settings.configure`、`fiber`）+ 活配置桩（`{get}` 引用 + `setConfig` 直接改值，模拟 `_commitVolatile` 就提交进同一引用） |

## 为什么客户端顶层 `inject` 仍然只有 `slots`

0.1.7 的第一方插件（`dsh-client-locale`、`dsh-client-ui-theme`）确实**在顶层硬引 `configForms`**，
但本包保留"受限 fiber 取 `configForms` + 延迟绑定句柄"的写法，理由是：
**顶层 `inject` 里写一个拿不到的服务会让 loader 永久 pending、整个应用打不开**
（2026-09-25 在本机 0.1.7-rc.2 上实测过 `web boot: 1 entry did not activate`）。
`settings-source.ts` 的句柄在服务缺失时快照恒为 `unavailable`、各处回落 `DEFAULT_CONFIG`，
所以贴纸层与挂件照常工作，配置页显示"设置不可达"。

## 旧设置值

`settings.yaml.imported` 里**没有** `dsh-memes-reply` 段，所以**无需播种**。

## 验证

- `tsc --noEmit`：**0 error**
- 构建：`scripts/build-client-vocab.mjs` + `tsc -p tsconfig.build.json` + `tsdown` 均 exit 0
- 客户端纯净度门禁：通过（只 require `react`、`react/jsx-runtime`）
- 单测：**145/145**
- 产物自检：`lib/client.js` 里 `dsh-client-runtime`/`dsh-client-web-react`/`dsh-client-schema-form`/`settingsScope`/`MemesSettingsSchema` 命中均为 **0**，`configForms` 4；`lib/index.js` 里无 `settings.register` 实际调用（3 处命中都在文档注释里）。
  ⚠️ 但 `lib/settings-source.js`（`settingsScope` 5 处 + `dsh-client-runtime` 1 处）与 `lib/schema.js`（`MemesSettingsSchema` 1 处 + `ctx.settings.register` 1 处）里这些字符串**仍在**，全在注释里 —— 用"数命中"自检时别把这几个文件一起数进去，否则会误判成没改干净。
- 装配 + 活体启动：在一次性 DSH_HOME 里用 0.1.7-rc.2 真正挂载并 headless 启动，**无新增诊断**
