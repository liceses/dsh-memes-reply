# dsh 0.1.6a2：插件配置面板全部失效的定位与修复

> 记录时间：2026-09-18
> 环境：全局 `@deepseek-ai/dsh@0.1.6-alpha.2`（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh`），
> profile `web`（`~/.dsh/profiles/web`），升级前为 `0.1.5-alpha.2`
> 现象：升级到 0.1.6a2 后，本地插件的配置面板全部打不开 / 显示不出来（设置里没有、也点不出、也不报错）

## 一、0.1.6a2 到底把插件管理改成了什么

0.1.6a2 新增了统一插件管理面：

- 浏览器侧：`@deepseek-ai/dsh-client-ui-plugin-manager` —— 侧栏「插件」整页
  （组合包列表 / 组合包详情 / 行开关 / 配置台账）。
- 宿主侧：`@deepseek-ai/dsh-plugin-manager`（`pluginManager.*` remote：`listBundles` /
  `listPlugins` / `inspect` / `setPluginEnabled` …），以及
  `@deepseek-ai/dsh-host-plugin-inventory` + `@deepseek-ai/dsh-client-ui-settings-plugin-inventory`
  （设置里只剩**只读**的插件清单）。

**插件配置面板的挂载点整体搬家**：不再挂在设置对话框的
`settings.plugin.item`（rc7 时代按 settings 命名空间 keyed 的卡片槽），改由插件管理页声明
三个槽位承载（`dsh-client-ui-plugin-manager/lib/types/client/slot-contract.d.ts`）：

| 槽位 | 种类 | 键 | 渲染位置 |
| --- | --- | --- | --- |
| `plugins.item` | list | `id` + `order` + `label` | 「官方」分组（**官方**宿主平面配置页占用） |
| `plugins.bundle.config` | keyed | 组合包 npm 包名 | 组合包自己的页面上，描述与行之间 |
| `plugins.row.config` | keyed | `<包名>#<行 id>` | 该行自己的页面（行上多一个「配置」控件） |

条目组件还会收到 owner props `view: 'summary' | 'page'`：管理页用 `summary` 取标题下的一句话，
用 `page` 取带自己保存控件的表单。

### 旧槽位确实没了

0.1.6a2 的 SlotMap 里已经**没有** `settings.plugin.item`
（`dsh-client-ui-settings` 只剩 `settings.section` / `settings.plugins.tab` /
`settings.general.item` / `settings.onboarding` 等）。`ctx.slots.inject()` 是"等槽位被声明后
才执行注册回调"，槽位永不出现 → 回调永不触发 → 注册无声消失：

> 不报错、不空白报错、点了没反应 —— 与观察到的现象完全一致。

### 哪些面板真的坏了

全量清点（workspace + profile 内所有已装插件的**已构建产物**）：

| 插件 | 旧注册 | 0.1.6a2 结果 |
| --- | --- | --- |
| `@icelily/dsh-auto-proxy` | `settings.plugin.item`（keyed） | ❌ 失效（槽位被移除） |
| `dsh-hmm-wait` | `settings.plugin.item`（keyed） | ❌ 失效 |
| `dsh-memes-reply` | `settings.plugin.item`（keyed） | ❌ 失效 |
| `dsh-workflow`(`@icelily/dsh-project-model`) | `settings.section` | ✅ 仍可用（设置里「项目模型」在） |
| `dsh-bg-rotator/wallpaper-rotator` | `settings.section` | ✅ 仍可用（「壁纸轮换」在） |
| `ds-tts` | `settings.general.item` | ✅ 仍可用（通用设置里的朗读行在） |
| `dsh-freebuff` | `settings.section` | ⚠️ 组合包被关闭（不在 `dsh.profile.bundles` 里），面板自然不出现；属开关状态而非注册 bug |
| 其余（btw / prompt-optimizer / showme-html / sound-alerts / opencode-go-monitor / skills-manager / browser-skill / agent-team / status-rotator / relay-forwarder / text-drop …） | 不注册配置面板 | — |

结论：**根因唯一**——`settings.plugin.item` → `plugins.bundle.config`（外加 `view` 契约与
键从"命名空间"换成"组合包名"）。不是三个各自不同的 bug。

### 宿主侧不需要动

`ctx.settings.register(namespace, schema, …)`（命名空间注册）与
`ctx.settingsScope.bind({ namespace })`（浏览器侧绑定）在 0.1.6a2 都没有变；
rc7 已取消 settings 命名空间白名单，0.1.6a2 沿用。三个插件的 `~/.dsh/settings.yaml`
命名空间分区与值都读得到。

## 二、修复

新增共享适配层 **`dsh-plugin-config-slot`**（唯一源在 workspace 的
`dsh-plugin-config-slot/`，含 `react-dom/server` 渲染的 10 条回归）：

- 用 `plugins.bundle.config` + **组合包 npm 包名**注册（第三方组合包的正当入口）；
- 按新契约分发 `view`（`summary` 一句话 / `page` 完整表单）；
- 边界：命名空间不可达 → 明确提示（对齐官方 `unavailable` 文案）；
  没有可配置项 → 空态；快照读取抛错 → 降级为提示，不打崩面板；
- 只做注册与外壳，**不重写插件的表单**。

### 打包方式：内置副本（每个仓库自持）

三个插件仓库要各自可独立 clone + 构建，所以适配层不按 `file:../dsh-plugin-config-slot`
引用，而是**逐字内置**到每个仓库：

```
src/vendor/dsh-plugin-config-slot.tsx     # 三份完全一致（含头部说明）
src/client/index.ts(x)                    # 相对导入；本仓库随构建内联
```

- 生成 / 校验：唯一源那侧 `npm run vendor`（写）与 `npm run vendor:check`（校验，
  已接进 `npm test`）；改动唯一源后必须重跑，否则副本漂移会让测试红。
- 没有任何新增依赖（构建期被 tsdown 内联，运行时也不需要）。

三个插件各自只改「注册那几行」（这是各包自己的注册点，无法合并）：

| 插件 | 改动 |
| --- | --- |
| `dsh-hmm-wait` | `src/client/index.tsx`：`settings.plugin.item` → `registerBundleConfigPage({ bundle: 'dsh-hmm-wait', … })`；`panel.tsx` 加 `defaultOpen`；`tsdown.config.ts` 修 `alwaysBundle` |
| `dsh-memes-reply` | 同上（`bundle: 'dsh-memes-reply'`）；`CLIENT_BUILD` 标记更新；`test/client-bundle.test.mjs` 断言改为新槽位 |
| `@icelily/dsh-auto-proxy` | 同上（`bundle: '@icelily/dsh-auto-proxy'`，沿用官方 `inject` 出口，表单用 `AutoProxyCardPage` 包装并强制展开）；`controller.ts` 暴露 `snapshot()` |

顺带修掉的构建坑：`tsdown 0.22` 已不支持 `deps.alwaysBundle: true`
（会被归一化成模式表 `[true]`，一旦出现不在 `neverBundle` 里的裸导入就抛
`Expected pattern to be a non-empty string`）。hmm-wait / memes-reply 的客户端构建都改成
受支持的 `NoExternalFn` 谓词 `(id) => !CLIENT_EXTERNALS.includes(id)`。

## 三、验证（0.1.6a2 实机）

- 侧栏「插件」→「已安装」→「查看 auto-proxy / hmm-wait / memes-reply」：
  三个配置面板都正常渲染，字段与 `~/.dsh/settings.yaml` 里的值一致；
- 保存：memes-reply 改一个字段 → 保存后 `~/.dsh/settings.yaml` 出现该键（durable 文档，
  重启后仍在）；再点该字段的「默认」→ 覆盖被清除、文件回到原样；
- 生效：把「常驻挂件」关掉保存 → 页面上的大肥鱼立刻消失；恢复默认 → 立刻回来；
- 边界（唯一源 `dsh-plugin-config-slot` 的 10 条回归）：空配置态、命名空间不可达（两种表达）、
  快照抛错降级、summary/page 分发、注入面转发、三份内置副本不漂移 —— 全绿。

## 四、以后加插件配置面板

在这个仓库里直接用内置副本：

```ts
import { registerBundleConfigPage } from '../vendor/dsh-plugin-config-slot.tsx'   // NodeNext 仓库写 .js

registerBundleConfigPage(ctx, {
  bundle: '<package name>',       // = 组合包名（Host 清单里的名字）
  summary: '一句话',
  render: () => <YourForm defaultOpen />,
})
```

新仓库要么跑一遍 `node dsh-plugin-config-slot/scripts/vendor.mjs`（把它加进 `TARGETS`），
要么直接把唯一源 `src/index.tsx` 拷进 `src/vendor/`。

别再注册 `settings.plugin.item`（已移除）；也别把第三方组合包的配置塞进
`plugins.item`——那个槽位是官方宿主平面配置页的位置。
