# DSH 0.2.0 适配记录（清单闸门）

目标运行时：**DSH 0.2.0-rc.2**（桌面端 `DeepSeek Harness.exe` FileVersion）。

## 症状

桌面插件管理页从本仓库安装时报：

> 插件安装失败：`dsh-memes-reply@0.1.0` 与 DSH `0.2.0-rc.2` 不兼容（要求
> `@deepseek-ai/dsh-commands 0.1.5-rc.1 || 0.1.6-alpha.2 || 0.1.7-rc.2`，…… 6 项）。
> 运行它可能导致崩溃或数据丢失。请安装与当前 DSH 兼容的插件版本。

## 根因：`^` + 预发布版的组合

DSH 启动期（与插件管理页的安装前检查）用 `dsh-app-boot` 的 `evaluatePluginCompatibility`
逐条判定 `package.json` 的 peer。规则（`dsh-app-boot/lib/index.js`，0.2.0-rc.1 镜像逐行核对过）：

- 只检查 `peerDependencies` 里名字是 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-*` 的条目；
- 判据是 `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`，
  `runtimeVersion` 就是运行时（桌面 0.2.0-rc.2）自己的版本；
- **`engines.dsh` 不参与**这道闸门（它只是元数据）；
- profile 目录下的 `compatibility.json` 可以做**精确版本豁免**（`{ "<包名>@<版本>": ["<DSH 版本>"] }`），
  那是给第三方 registry 包用的应急通道，不是本插件该走的。

于是：

| range | `0.2.0-rc.2` | `0.1.7-rc.2` |
|---|---|---|
| `^0.1.7-rc.1` | **false**（`^` 的上界是 `0.2.0`，不含） | true |
| `>=0.1.7-rc.1 <0.3` | **true** | true |
| `^0.2.0-rc.1` | true | **false** |
| `0.1.5-rc.1 \|\| 0.1.6-alpha.2 \|\| 0.1.7-rc.2` | **false** | true |

**教训：跨小版本不要用 `^` 写预发布版范围，写显式区间 `>=A <B`。**
本仓库现在对 `engines.dsh` 与 8 个 `@deepseek-ai/dsh-*` peer 一律写 `>=0.1.7-rc.1 <0.3`：
同时容纳 web profile 用的 0.1.7-rc.2 与桌面端的 0.2.0-rc.x（收窄成 `^0.2.0-rc.1` 会让 web 那边反被拒）。

`test/manifest-compat.test.mjs` 把这条钉住了：受支持的每个运行时版本都必须落在每个 peer 范围内，
下次再遇到同样的墙会是**测试失败**，而不是用户装不上。

## 0.2.0 相对 0.1.7 改了什么（对本插件）

`upgrade/tools/diff-sdk.mjs` 结果：**移除 0 个包**，新增 7 个
（`dsh-client-product-analytics`、`dsh-experimental-schedule-bundle`、
`dsh-host-product-telemetry-otel`、`dsh-otel`、`dsh-client-ui-settings-session-log`、
`libreoffice-kit`、`libreoffice-kit-win32-x64`），其余 273 个包只抬版本号。
**没有任何包被删除或改名** —— 所以 0.1.7 那轮搬迁的代码面在 0.2.0 上依然成立。

本插件**没有**用到 0.2.0 里改过名字的运行时事件（`agent/session-start` → `agent/created`），
也没有读 `toolCallId` / `isError` 这类从 tool-result content block 挪到消息信封上的字段
（`grep` 过 `src/`：命中 0 处）。客户端半边只依赖 `slots` / `configForms` / `uiConversation`
三个服务与 `conversation.chat.turnTail` 槽位，这些在 0.2.0 里都在。

## 本轮验证

- 真实闸门：用 `@deepseek-ai/dsh-app-boot@0.2.0-rc.2` 自己的 `evaluatePluginCompatibility`
  判定本仓库 `package.json` → `undefined`（兼容）；对 0.1.7-rc.2 同样 `undefined`。
  （8 个 peer × `0.2.0-rc.2` 的 `semver.satisfies` 也逐条实算过。）
- 类型：`npm run typecheck`（本地 0.1.7-rc.2）与 `tsc -p tsconfig.sdk020.json`（0.2.0 镜像）都 0 错。
- 单测：`npm test` 全绿（含 `manifest-compat`）。
- 活宿主：桌面端 0.2.0-rc.2 用 `link:` 挂着本仓库，启动期闸门没有再报 incompatible，
  宿主半边（路由/工具/命令/设置）与客户端半边都有 `/stats` 回执。

## 本机环境提醒（别被误导）

- 开发用的 `node_modules/@deepseek-ai/*` 是**指向 SDK 类型镜像的 junction**
  （`…\DSH-plugin\upgrade\.sdk-mirror` = 0.1.7-rc.2），不是 npm 装出来的树；
  `package-lock.json` 因此**已陈旧**（还写着 0.1.5-rc.1 / 0.1.0-rc.8），
  别拿它当依赖真值 —— 依赖面要按镜像 / tarball / 宿主 profile 核。
- `tsconfig.sdk020.json` 是本机专用的类型基准（`paths` 指到 `upgrade/_sdk-020` 的 0.2.0 镜像），
  已加进 `.gitignore`，**不入库**。
