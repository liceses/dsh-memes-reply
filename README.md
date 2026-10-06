# dsh-memes-reply · 蓝色大肥鱼表情包回复

> **English**: A DSH plugin that drops one animated blue-fish sticker under each reply — picked by context, by the model, or by you for the next turn.

[![DSH Plugin](https://img.shields.io/badge/DSH-plugin-4f46e5.svg)](https://github.com/topics/dsh-plugin)
![DSH version](https://img.shields.io/badge/DSH-%E2%89%A50.1.7--rc.1%20%3C0.3-0ea5e9.svg)
![Version](https://img.shields.io/badge/version-0.1.4-blue.svg)

让 DSH 在**每一条回复**正文下方（靠左、与正文左对齐）贴一张**会动的**蓝色大肥鱼表情包。

它替你省掉的是"自己找图 → 复制 → 粘贴"这条手工链：一轮一张，贴在回复下面，**刷新还在、向上滚回历史还在、每个会话各是各的**。
贴哪张由语境决定（默认：回复里命中情绪词就补一张），也可以由你**为下一轮点名一张**。

素材（157 张 / 86 MB）走插件自己的 HTTP 路由直出，**不经过 DSH 附件流水线** —— 那条流水线会把动画压成静图。

---

<a id="looks"></a>
## 它长什么样、怎么动

一轮回复在页面上的版面（ASCII 结构图，不是截图）：

```
你    帮我把这个脚本改成 TypeScript
模型  改好了，三条都过了类型检查。

      [ 大肥鱼 ]  ← 贴纸：贴纸层画的，不是回复正文
                    靠左、与正文左对齐 · 默认 96px

                                   [ 大肥鱼 ]  ← 常驻挂件：右下角浮层，可拖、可收
```

**动效是真的动画，不是一张静图**：贴纸层永远加载**全尺寸动画 WebP**，不走首帧缩略图。
下面三条是从本机运行中的实例 `GET /api/dsh-memes-reply/catalog` 拿到的**真实元数据**（原始 JSON 见「[诊断](#diagnostics)」）：

| 贴纸 id | 名字 | 尺寸 | 帧数 | 帧率 | 时长 | 单张体积 |
| --- | --- | --- | --- | --- | --- | --- |
| `tiaowu-pizhichun` | 跳舞(低皮质醇) | 240×240 | 66 | 50fps | 1320 ms | 629,686 B |
| `notice-bits` | 通知_提示 Bits | 240×240 | 86 | 50fps | 1720 ms | 715,886 B |
| `qidai-1` | 期待 | 200×200 | 131 | 50fps | 2620 ms | 794,786 B |

### 它长在哪（四个座位）

| 面 | 座位 | 说明 |
| --- | --- | --- |
| 贴纸层 · 生成中 | keyed `conversation.chat.node` + 自定义 `ConversationNodeDefinition` | 只负责生成中的占位（思考 / 打字中）。那时官方过程块**强制展开**，所以放在流里是安全的 |
| 贴纸层 · 落定 | list `conversation.chat.turnTail`（官方"回合收尾"槽位） | 最终贴纸挂这里。官方的 `turn-tail` 节点 kind 在**过程折叠豁免名单**内，不会被「工作步骤展示」折进工具细节块（理由见下节） |
| 常驻挂件 | `shell.overlay`（加法型，frame-wide） | "随时能看到"是硬需求，与"这条回复的贴纸"是两个职责 |
| 配置面板 | `plugins.bundle.config`（key = 组合包名 `dsh-memes-reply`） | 插件管理页里本插件自己的页面；旧的 `settings.plugin.item` 已被统一插件管理移除 |

### 什么时候出现

| 时机 | 屏幕上看到什么 | 谁决定 |
| --- | --- | --- |
| 生成中（`phase=streaming`） | 「思考 / 打字」那一组里的占位表情 | 按 `(会话, 轮次)` 哈希**确定性**挑一张 —— 同一回合反复渲染永远是同一张 |
| 回复写完（`turn/end` 后 `phase=settled`） | **同一个节点**换成这一轮的最终贴纸 | 派生优先级（见「[工作原理](#mechanism)」）；`autoMode=jev` 时结论是异步取回的，**没到之前不显示任何贴纸** |
| 没选中 / 本会话静音 / 总开关关掉 | 什么都不贴 | 规则与开关 |

### 下一轮指定一张（三种入口）

| 入口 | 作用域 | 怎么用 |
| --- | --- | --- |
| 配置面板的**预览墙** | 全局、一次性 | 点一格缩略图 → `POST /latch`（面板底部「取消指定」清掉） |
| `/fish <id \| 关键词>` | **本会话**、一次性 | 命令；优先于面板的全局指定 |
| 模型工具 `use_sticker` | 本回合 | 模型自己点名，不需要你操作 |

「一次性」是字面意思：指定被**最新的那个已落定回合**用掉即清（`src/client/node.tsx` 的 `latchConsumedFor`），历史回合不会把它反复吃掉。

---

<a id="install"></a>
## 快速开始

三种装法。**共同前提：装完要重启**（bundle 层与客户端脚本清单都在启动时读取）。

### 一、装

#### 方式一：从 GitHub 装（推荐）

```bash
dsh plugin --profile web add github:liceses/dsh-memes-reply
```

实测 **1.26 MB / 4 秒**：不编译、不装构建依赖、不需要任何构建白名单。

> **DSH Desktop 用户注意**：`desktop` profile 由 Electron 独占管理，命令行会被直接拒绝
> （`profile "desktop" is managed exclusively by the Electron application`）。
> 请在**设置 → 插件**界面填入仓库地址。

> 为什么能免编译：`lib/` 已随仓库提交，而 pnpm 的 `packageShouldBeBuilt()` 只有两种情况会构建 ——
> ① `scripts.prepare` 存在；② 有 `prepublish`/`prepack`/`publish` 且 `main` 文件**不存在**。
> 本包用 `prepack`（发布时才编译），而 `lib/index.js` 已入库 → 两条都不成立，直接跳过。
>
> 早期提交（≤ `2865aca`）没提交 `lib/` 且用的是 `prepare`，所以 git 安装会现场编译，
> 并撞上 pnpm 的构建白名单（`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`）。现在不需要了。

#### 方式二：从 npm 装（**尚未发布**）

> [!IMPORTANT]
> **这条路现在走不通 —— 包还没发布到 npm，下面这条命令目前会 404。** 先看方式一。

包已经按发布形态准备好 —— `npm pack` 约 210 KB、内含编译好的 `lib/`、`prepack` 会在打包前自动构建 ——
但**还没有发布到 npm**，所以下面这条命令目前会 404：

```bash
# 尚未可用；等发布后再用
dsh plugin --profile web add dsh-memes-reply
```

发布流程就两步：`npm login` → `npm publish`（`prepack` 自动编译，不用手工 build）。

#### 方式三：本地链接（开发用）

```bash
pnpm install && npm run build    # link: 安装不会替你跑 prepack，得先自己编译
dsh plugin --profile web add "link:D:\developing\DSH-plugin\dsh-memes-reply"
```

### 二、取素材

素材 **87 MB**，既不随 npm 包发布，也不在 git 仓库里（走 GitHub release 附件）：

```bash
cd ~/.dsh/profiles/web/node_modules/dsh-memes-reply
node scripts/fetch-assets.mjs
```

它会下载 → 校验 `sha256` 与字节数 → 解到 `<DSH_HOME>/memes-reply/assets`。
下载慢或不通就手动下载后走本地包：`node scripts/fetch-assets.mjs --from <memes-assets-v1.zip>`；
只想看它会做什么：加 `--dry-run`。目标目录已有素材时会直接退出（要覆盖加 `--force`）。

> 素材不是必须的一步 —— 没取的话插件照常加载，只是没有图可贴（面板会显示 0 张）。

本机已取过的真实结果：`<DSH_HOME>/memes-reply/assets` 下 **315 个文件 / 91,221,513 字节** ——
顶层 158 个（157 张贴纸 + `index.json`），`thumb/` 里 157 张缩略图。

### 三、验证装对了

```bash
dsh --profile web --dump-config | grep memes-reply   # 能看到 id: memes-reply
node test/live-probe.mjs                             # 对运行中的 GUI 打活体探针
```

`live-probe` 会一次性把客户端 bundle、贴纸字节、缩略图、清单、`/vocab`、`/session-state`、
「下一轮用这张」与状态行全部打一遍。

> **改了 host 半区必须重启 `dsh web`**（路由是启动时注册的）；只改浏览器半边则刷新页面即可。
> 客户端贴纸层为此带了一份**打包词表兜底**：宿主没重启（`/vocab` 还是 404）时它照样工作。

### 四、用

| 入口 | 说明 |
| --- | --- |
| （默认） | 什么都不用做：`autoMode=keyword`（默认）命中情绪词就补一张；改成 `every` 就每 N 轮必贴；改成 `jev` 就交给 JEV 按语境判（见下节） |
| 工具 `use_sticker(mood, id?)` | 模型点名要哪张：`mood` 是**2–4 字情绪词**（得意、翻车、摸鱼、bug、收工…）。工具**只回 id/name**，不产出任何 URL —— 渲染由贴纸层负责 |
| `/fish` | 状态 + 前 40 张清单 |
| `/fish list <关键词>` | 过滤清单 |
| `/fish on` \| `/fish off` | 本会话静音开关（状态持久在 `<DSH_HOME>/memes-reply/state.json`） |
| `/fish <id\|关键词>` | 给**下一轮**指定一张（一次性；优先于面板的全局指定） |
| 设置面板 | 状态行 + 22 个字段 + 预览墙 + 「下一轮用这张」（全局一次性指定） |

---

<a id="toc"></a>
## 目录

| 想了解 | 看这里 |
| --- | --- |
| 它长什么样、怎么动 | [四个座位 / 动效 / 触发时机](#looks) |
| 怎么装、怎么取素材 | [快速开始](#install) |
| 有哪些可配的开关 | [配置面板（22 字段）](#config-panel) |
| 它到底怎么实现的 | [工作原理](#mechanism) |
| 为什么不用自定义会话事件 | [零日志污染的理由](#no-custom-events) |
| 让 JEV 按语境判贴哪张 | [JEV 模式](#jev) |
| 常驻挂件怎么玩 | [常驻挂件](#pet) |
| 贴纸贴在哪个座位、什么时候出现 | [落定与折叠](#seats-timing) |
| 157 张素材怎么来的 | [素材与体积](#assets) |
| 出问题了怎么看 | [诊断](#diagnostics) |
| 凭什么说这些是真数据 | [验证记录](#evidence) |
| 有什么坑 | [已知局限](#limits) |
| 想改代码 | [开发](#dev) · [文件地图](#filemap) |
| 端点与情绪族 | [HTTP 端点](#routes) · [13 个情绪族](#moods) |

---

<a id="config-panel"></a>
## 配置面板

位置：**侧栏 插件 → 已安装 → 查看 memes-reply**（统一插件管理页；配置面板画在本插件自己的页面上，默认展开）。形态对齐原版折叠卡片
（标题 + 描述 + 未保存徽章 + chevron → 展开体 → 底部 丢弃/保存），全部用 `--dsw-alias-*` 主题变量。

| 区域 | 内容 |
| --- | --- |
| 状态行 | 素材张数 / 格式 / 总体积 / 已服务次数 / 生效的 `index.json` 路径（12 秒轮询 + 手动刷新） |
| 字段 | 总开关、画质来源、压缩副本目录、原图目录、冷却轮数、兜底贴纸、规则（off/keyword/every/jev）、间隔轮数、JEV 三项（模型/超时/语气说明）、挂件三件（开关/大小/停靠角）、外观（形状/圆角/边框粗细/样式/颜色）、贴纸大小与上移量 |
| 预览墙 | 12 格缩略图（静态首帧，均值 7 KB）＋「换一批」；点一张即 `POST /latch` 设为下一轮指定，并加载全尺寸动画确认 |
| 底部 | 换一批 · 取消指定 · 丢弃 · 保存 |

配置字段走官方客户端设置服务 `ctx.configForms`（草稿→保存，revision 冲突自带恢复），由宿主设置服务
写进 **profile 的 patch**（`~/.dsh/profiles/<profile>/cordis.patch.yml` 里该条目的 `config:`；
0.1.5/0.1.6 时代的 `~/.dsh/settings.yaml` 已被改名 `settings.yaml.imported`，只作迁移对照）。
状态行/预览墙/指定走插件自己的同源路由。
面板里改的规则（`autoMode` / 间隔 / 兜底 / 冷却）由**浏览器半边直接读设置**生效，不需要重启。

### 22 个字段与默认值

字段序就是设置面板的展示顺序，也是保存 diff 的顺序（`src/config.ts` 的 `CONFIG_FIELDS`）。
默认值取自 `src/config.ts` 的 `DEFAULT_CONFIG`，说明取自 `src/schema.ts` 里每个字段的 `description`。

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关：关掉后不再贴图 |
| `quality` | `compressed` | 画质来源：`compressed` = 压缩副本；`original` = 原始素材目录（需填 `originalRoot`） |
| `assetRoot` | 空（= `<DSH_HOME>/memes-reply/assets`） | 压缩副本目录 |
| `originalRoot` | 空 | 原始素材目录（`quality=original` 时使用） |
| `cooldownTurns` | `3` | 同一张贴纸连续 N 轮内不重复，0 = 关闭 |
| `fallback` | 空 | 兜底贴纸 id：规则一个都没选中时用它，保证总有鱼；留空 = 不兜底 |
| `autoMode` | `keyword` | `off` = 只在模型点名时贴；`keyword` = 回复命中情绪词就贴；`every` = 每 N 轮必贴一张；`jev` = 交给 JEV 判情绪族（最贴语境，且能判"这轮不贴"；**会把回复正文发到 OpenRouter**） |
| `autoEveryTurns` | `3` | `autoMode=every` 时的间隔轮数 |
| `jevModel` | `typesafe/jev-1.13` | `autoMode=jev` 用的模型 |
| `jevTimeoutMs` | `4000` | JEV 单次超时（ms）；超时/报错回落既有规则 |
| `jevPersona` | 空 | 给 JEV 的角色/语气说明（留空 = 不给；**内容会被发到 OpenRouter**） |
| `jevDebugVisible` | `false` | JEV 调试漂浮面板：一枚可拖的小胶囊，点开能看到每次真实往返的请求与响应（只读诊断） |
| `petVisible` | `true` | 常驻挂件：页面上一直显示一只大肥鱼 |
| `petSize` | `128` | 常驻挂件边长（px），建议 96–240 |
| `petCorner` | `br` | 常驻挂件默认停靠角（拖动过之后以拖拽坐标为准） |
| `shape` | `circle` | 贴纸外形：`circle` = 圆形；`rounded` = 圆角方形（贴纸节点与挂件共用） |
| `radius` | `18` | 圆角方形时的圆角半径（px） |
| `borderWidth` | `2` | 边框粗细（px，0 = 无边框） |
| `borderStyle` | `solid` | 边框样式：实线 / 虚线 / 无 |
| `borderColor` | 空（= 跟随主题强调色） | 边框颜色 |
| `bubbleSize` | `96` | 贴纸边长（px）：贴在回复正文下方、与正文左对齐的那一枚 |
| `bubbleRise` | `0` | 贴纸上移量（px）：0 = 紧贴正文下方；正数往上收（会压住正文最后一行） |

**本机的真实 dump**（`dsh --profile web --dump-config`，实跑，exit 0 / 48,051 字符）里，这个插件只有两行 ——
**没有 `config:` 块，也就是 22 个字段全在默认值上**：

```yaml
# == dsh-memes-reply
- id: memes-reply
  name: dsh-memes-reply
```

`desktop` profile 里同样没有 `config:` 块（只有 `- id: memes-reply` + `disabled: false`）。

---

<a id="mechanism"></a>
## 工作原理

### v2.0：贴纸是"会话流里的一个节点"

贴纸不再是"宿主发事件、客户端抢座位渲染"的浮层，而是**会话事件的纯函数**：
一轮 = 一个节点，跟着那条回复走 —— 向上滚回历史能看到、刷新页面还在、每个会话各是各的。
生成中先显示「思考中 / 打字中」，回复写完的瞬间**同一个节点**换成这一轮的最终贴纸。

- **每回合一张**，不用模型操心（`autoMode=every` 时每轮必贴；`autoMode=jev` 时由 JEV 按语境判情绪族、
  而且**能判"这轮不贴"**；模型也可以用 `use_sticker` 点名要哪张）
- **两阶段**：生成中 = 占位表情 → 落定 = 最终贴纸（结构性替换，不是遮住）
- **会动**：永远加载全尺寸动画 WebP，不走首帧缩略图
- **零日志污染**：不往 session log 写自定义事件（那会让日志在别的构建里"拒绝解释"，见下）
- **原生风格的配置面板**（侧栏 插件 → 已安装 → 查看 memes-reply）：状态行 + 22 个字段 + 素材预览墙
- **常驻挂件**：页面上**一直**有一只大肥鱼（点一下换一张、可拖、可收成小圆点）——随时能看到
- 一键关掉：面板总开关 + `/fish off` 本会话静音

分工上，宿主只做四件事（`src/index.ts`）：贴纸字节路由、客户端派生的**数据与开关**（`/vocab` / `/session-state`）、
模型工具 `use_sticker`、斜杠命令 `/fish` 与设置表单；**"贴哪张"这个决定整个搬到了浏览器半边**，
由 `src/derive.ts` 这份 host 与浏览器共用的纯逻辑算出来 —— 所以刷新只是重放，不需要任何持久化绑定。

### 派生优先级（落定那一张）

`finalStickerFor()`（`src/derive.ts`）按顺序取第一个能落地的：

```
人指定（本会话 /fish > 面板全局）  >  JEV 语境结论  >  模型点名（id，其次 mood 关键词）
                                  >  规则（keyword / every）  >  兜底贴纸  >  不贴
```

- 规则里 `keyword` 命中的词、模型给的 `mood`，都由**同一套检索器**（`src/search.ts`，两端共用）解成 id ——
  同一份词表 + 同一个算法 ⇒ 两端结论一致。
- 冷却（`cooldownTurns`）在规则这一层过滤"最近用过的"，不会否决人指定或模型点名。

<a id="no-custom-events"></a>
### 为什么不用自定义会话事件

最"正统"的写法是像官方 `present` 工具那样把决定 `session.append('memes-reply/sticker', …)` 写进日志。
**这条路对本插件是危险的**：`Session.append()` 没有任何渠道设置 `ignorable` 标记，而持久化读取的规则是
"未知类型且未标记 `ignorable` → **拒绝解释整个日志**"，且已知类型表是**仓库内生成**的静态表、
下游插件类型按构造就不在里面。写自定义事件 = 让用户的历史会话变成打不开。

所以 v2.0 只**读**会话事件：决定完全是 `(会话, 轮次, 收尾正文, 模型的工具实参, 宿主开关)` 的纯函数
（`src/derive.ts`，host 与浏览器共用同一份实现），可重放、无竞态、零污染。

<a id="seats-timing"></a>
### 贴纸贴在哪一轮、什么时候出现

| 环节 | 说明 |
| --- | --- |
| 一轮一个 | 定义匹配 `turn/start`（建）、`step/start` / `assistant/message` / `tool/call` / `turn/end`（更新） |
| 生成中 | `phase=streaming` → 从「思考 / 打字」那一组里确定性挑一张（同回合永远同一张）。渲染在**自定义会话流节点**里 |
| 落定 | `turn/end` 后 `phase=settled` → 按优先级派生：会话/面板指定 > **JEV 语境结论** > 模型点名 > 规则（keyword/every）> 兜底。`autoMode=jev` 时结论是异步取回的，**没到之前不显示任何贴纸**（先闪一张随机的再换掉更难看）。渲染在官方 **`conversation.chat.turnTail`** 槽位里 |
| 落定的输入从哪来 | 不再自己从会话事件累积，而是读官方算好的 `TurnTailChatData.closing`（**本轮最后一个有内容的收尾助手**）：正文拼 `kind:'text'` 的块，模型点名解 `use_sticker` 那个 `tool-call` 块的 `argsRaw`。纯函数在 `src/closing.ts`，有单测 |
| 为什么落定要换座位 | 官方「工作步骤展示」（选择希望看到多少工具调用细节）会把会话流节点算进**过程折叠窗口**：<br>`processMember = !豁免名单.has(kind) && anchorSeq >= processStartSeq && (liveProcess \|\| answerAnchorSeq === null \|\| anchorSeq < answerAnchorSeq)`<br>我们的自定义 kind 不在豁免名单里（名单：`system-prompt / user / steering / turn-trigger / turn-process / turn-error / turn-max-tokens / turn-tail`），而且本轮没有"干净收尾回复"时 `answerAnchorSeq` 是 `null` —— 那时**所有** `anchorSeq >= processStartSeq` 的节点都算过程成员，**往后挪锚点也没用**：折叠一收，贴纸就跟着工具细节被藏起来（2026-09-25 实测）。官方 `turn-tail` 的 kind 在豁免名单内，而这个槽位本来就是给"回合收尾的功能贡献"准备的 **list** |
| 与交付卡片共存 | 同槽位，但它是 **list**（加法型）—— 各占一个条目，互不抢占（v1.0 的事故点是 keyed 座位被抢） |

### 模型那一侧：一行提示 + 一个工具

工具注册了就对所有会话可用，但**用不用完全由模型决定**。实测（扫全部会话日志）显示：装好之后跑过的别的会话，
请求里都带着 `use_sticker`（ds-tts 连续 6 轮都带着），却**一次都没调用过** —— 它排在 71 个工具的目录末尾，
模型在正常写代码/查问题的流程里没有理由去动一个"装饰性"工具。

所以 `src/prompt.ts` 往系统提示里加**一行**（不是一段），锚在 `TOOLS_SDK` 之前（`order = 锚点 - 100`），
且只在**工具真的注册了**、**总开关开着**、**本会话没被 `/fish off` 静音**时才输出，否则输出空串（0 token）：

```
情绪合适时（问题修好、踩了坑、夸一句、任务收工）可以用 use_sticker 贴一张大肥鱼；一轮最多一张，用户说不要图时别贴。
```

工具 `use_sticker` 的职责收窄成三件（`src/tool.ts`）：校验模型的点名（id 存在、文件真读得到，失败给**可执行**的重试建议）、
维护"人按过的开关"（会话静音 / 一次性指定 / 最近用过）、回一句人话告诉模型"已选定，**正文里不要写任何图片 URL**，也不用再调用"。
"每轮最多一张"由**结构**保证：一轮只有一个节点、只认最后一次点名。

<a id="jev"></a>
### JEV 模式：让 JEV 决定贴哪张

`autoMode: 'jev'` —— 把这一轮的回复交给 [JEV](https://openrouter.ai/typesafe/jev-1.13)
（TypeSafe 的 System One 模型，只做选择/分类/打分）判一个**情绪族**，再由代码在族内挑一张。

#### 为什么是"先判族、再选张"

真实 API 实测（2026-09-20，`text=验收完成…踩了个坑…`，同一份 state）：

| 问法 | 延迟 | 成本/轮 | 选中项 margin |
| --- | --- | --- | --- |
| **只问 13 族**，族内由代码挑（本插件采用） | **~1.3 s** | **$0.00005** | 0.30（族级，语义正确） |
| 族 → 具体张（两次调用） | ~3.5 s | $0.0001 | 0.72 |
| 157 张直选（一次调用） | 1.0 s | $0.00022 | **0.02（糊：`all-good-1` 0.29 vs `qingzhu` 0.27）** |

JEV 对**窄候选集**明显更可靠，而"族里到底选哪张"（三张几乎一样的一字马）本来就该由代码定
——顺带把冷却去重与确定性一起解决了。这与 JEV 自己的纪律一致：精确规则与算术用代码，Jev 只做判断。

#### 三条硬需求怎么落的

| 需求 | 做法 |
| --- | --- |
| **刷新即重放**（同一轮永远同一张） | 结论在**宿主**按 `(sessionId, turn)` 缓存（`/stats` 的 `jev.cached` 可见）；客户端刷新只是重放，不再花钱也不会换一张 |
| **绝不拖住会话** | 没 key / HTTP 非 2xx / 响应不合法 / 超时（默认 4 s，`AbortController` + `Promise.race` 双保险）一律回落既有 `keyword`/`every` 规则；失败也留一条 `host:jev` 轨迹 |
| **key 不出宿主** | 浏览器半边只请求 `/jev-pick` 拿结论（`scripts/check-client-purity.mjs` 是门禁）。key 读 `OPENROUTER_API_KEY`，**读不到就退到 `<DSH_HOME>/.credentials.yaml`**（本机实测 DSH 把 key 存在那里而没注入插件进程环境变量） |

#### 代价（说清楚，不埋在代码里）

- **隐私**：开这个模式等于**把助手每一轮的回复正文发到 OpenRouter**（正文截断 12k 字符）。
- **成本**：实测 **$0.0000488/轮**（约 1 万分之 5 美元），已在 `/stats` 的 `jev.costUsd` 记账。
- **延迟**：直连实测 **784 ms**，经 `127.0.0.1:10808` 实测 **2268 ms**（同一份请求）。
  Node 的 global `fetch` 默认**不读** `HTTPS_PROXY`；Node 24 起可用 `NODE_USE_ENV_PROXY=1` 让它读。
- **非确定性**：同一输入两次跑出 `yes=0.79 / 0.80` —— 这就是必须做服务端缓存的原因。
- `needs_review`（CLI 退出码 2）在真正两可的回复上**是常态**（例：`celebrate 0.61` vs `bug 0.31`），
  不是错误。这里取分布的最大值，不把"未达 0.8 阈值"当成失败。

#### 还能"这轮不贴"

`blank` 是候选里的一族，配一个 `stick` 是非题（实测 `yes=0.79~0.83`）。两个都指向"没情绪"时
就**不贴**，所以 `jev` 模式下"每轮必有鱼"不再是唯一选项 —— 纯技术输出可以不打扰。

<a id="jev-debug"></a>
#### 调试浮层：看它到底发了什么、回了什么

配置面板里打开 **JEV 调试浮层**（默认关），页面右上会出现一枚可拖的小胶囊，点开成面板：

| 面板里能看到 | 说明 |
| --- | --- |
| 头部计数 | `调用 N · 缓存 M · 回落 K · $总成本`（缓存与回落分开，才看得出"没花钱"和"没贴上"是两件事） |
| 每次一趟 | 时间 / turn / 状态徽章（成功 / 判不贴 / 失败）/ 族 / `p` / `yes` / 耗时 / 成本 |
| 展开一趟 | **发给 JEV 的完整请求 JSON** + **JEV 回的完整响应 JSON**（含 `probabilities` 概率表） |
| 失败时 | HTTP 状态 + 响应正文（402 欠费、429 限流那一类的正文是排障唯一线索）也留着 |

三条设计约束：

- **只记真实往返**：命中缓存不产生新条目 —— 一次刷新会重放好几个回合，都记进去只会把真正发生过的事淹掉。
  缓存次数由头部那个 `缓存 M` 表达。
- **只在展开时轮询**（每 2.5 s）：收了或关了就不发请求。
- **只读**：面板里没有任何写操作（不重发、不改族表）—— 排障工具不该能改变被观测的东西。

日志在宿主内存里（环形，最近 20 趟，不落盘）；请求/响应里的长文本按 1.2k 字符截断并**显式标注**
"截断，原文 N 字符"。位置与收起态写回 `state.json`，刷新后还在。

<a id="moods"></a>
### 13 个情绪族 + `blank`（`src/moods.ts`）

族表是**人工整理**的：157 张里 152 张归入 13 族，剩 5 张不收。未收录的 id 不会消失 ——
它们仍可被 `keyword` 模式、模型点名、`latch` 选中，只是不作为 JEV 的候选出现。

| 族 key | 中文族名 | 给 JEV 的语义说明 | 族内张数 |
| --- | --- | --- | --- |
| `celebrate` | 庆祝 · 成事 | 事情成了、收工、值得高兴（干杯、礼花、跳舞、起哄） | 20 |
| `praise` | 点赞 · 打气 | 认可、表扬、给谁打气或安慰（点赞、满分、加油、没事的） | 11 |
| `bug` | 翻车 · 自嘲 | 出错、翻车、搞砸了、摆烂跑路（自嘲语气，不是真的生气） | 15 |
| `sad` | 委屈 · 害怕 | 难过、委屈、害怕、紧张（真的低落，不是自嘲） | 8 |
| `thinking` | 思考 · 认真 | 正在分析、讲清原理、准备交底（认真脸、墨镜、扇子） | 9 |
| `confused` | 困惑 · 呆住 | 没看懂、意外、愣住、一脸问号（抓拍、呆滞） | 12 |
| `tired` | 摸鱼 · 想睡 | 累了、想摸鱼、想睡、吃瓜看戏 | 14 |
| `angry` | 不满 · 叫停 | 明确不满、叫停、警告、反对、翻白眼（带态度的拒绝） | 14 |
| `shy` | 害羞 · 卖萌 | 被夸到不好意思、扭捏、卖萌、撒娇（软乎乎） | 10 |
| `greet` | 打招呼 · 收尾 | 开场寒暄、回应问候、道别、露个头（社交性的，不是情绪） | 10 |
| `notice` | 提醒 · 交代 | 要提醒风险、指重点、交代清楚 | 9 |
| `gift` | 送礼 · 表白 | 送东西、发钱、爱心、玫瑰、情书 | 13 |
| `expect` | 期待 · 稍等 | 在等结果、拭目以待、请稍等、快到了 | 7 |
| `blank` | ——（不是贴纸） | **唯一允许 JEV 说"不贴"的出口**：纯技术输出时选它 | 0 |

`test/jev.test.mjs` 有一条回归盯着"表里的 id 必须真实存在"。

<a id="routes"></a>
### HTTP 端点（11 条，全部在 `/api/dsh-memes-reply` 下）

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET/HEAD | `/sticker/<id>.<ext>` | 贴纸字节（**全尺寸动画**，immutable + ETag/304） |
| GET/HEAD | `/thumb/<id>.<ext>` | 缩略图字节（设置面板预览墙） |
| GET | `/catalog` | 素材清单（分页 + 种子，预览墙数据） |
| GET | `/vocab` | **全量**检索词表（客户端派生用；157 条约 29 KB） |
| GET | `/session-state` | 会话态（静音 / 指定 / 最近用过） |
| POST | `/jev-pick` | JEV 按语境选一张（`autoMode=jev`） |
| GET/POST | `/latch` | 「下一轮用这张」读写 |
| GET | `/jev-log` | JEV 调试日志（环形，最近 20 趟真实往返） |
| POST | `/layout` | 常驻挂件拖拽坐标（旧名 `/pet` 等价） |
| GET | `/stats` | 诊断 / 面板状态行 |
| POST | `/debug` | 客户端 → host 回执（只进内存环形缓冲，不落盘） |

id 白名单是 `^[a-z0-9][a-z0-9-]{0,39}$`（`src/protocol.ts`），因为只接受这个形状，路由天然不存在路径穿越；
单张贴纸读取上限 16 MiB。**`POST /latch` 没有鉴权**（本机任意页面可调），只影响"下一轮贴哪张"，
且有回环围栏 + 不发 CORS 头 + id 白名单（见「[已知局限](#limits)」）。

<a id="pet"></a>
## 常驻挂件：随时能看到大肥鱼

页面上**一直**有一只大肥鱼（默认右下角，128px 圆形）。它坐在 `shell.overlay` ——
官方对那个座位的定义就是 *frame-wide floating layer*，**加法型**（`replaceRisk: none`），
而且整层 click-through、条目自己 opt in 到 pointer events，所以它**不挡**下面的界面。

（这也是你原来那只 `鲸鱼娘` 的模型：`~/.dsh/pet.json` 里就是 `display: {visible, size, right, bottom}`。）

| 行为 | 说明 |
| --- | --- |
| 点一下鱼身 | 换一张（随机取一张） |
| 拖动 | 移动位置；落点写进 `state.json`，**刷新/换会话都还在** |
| 悬停 | 浮出 `✨ 换一张` / `✕ 收起` |
| 收起后 | 变成 32px 小圆点（用缩略图当图标），点它随时再展开 |
| 设置 | 常驻挂件开关 / 大小（64–320）/ 默认停靠角 |

本机 `state.json` 里挂件的真实落点：`"pet": { "id": "penji", "right": 1415, "bottom": 704 }`。

<a id="assets"></a>
## 素材与体积

| 档 | 参数（动画 WebP） |
| --- | --- |
| 1–3 | 320px · q60 / q50 / q40 |
| 4 | 280px · q40 |
| 5 | 240px · q35 |
| 6 | 200px · q30 |

```bash
# 默认：保留全部帧，单张上限 700 KB（体积换顺滑）
node scripts/import-assets.mjs --format webp --also-package

# 降到 25fps：动作仍比 GIF 顺，体积省掉约 1/3（推荐在意外体积时用）
node scripts/import-assets.mjs --format webp --fps 25 --also-package

# 想换回 GIF（体积最小，帧率会被阶梯砍到 10–20fps）
node scripts/import-assets.mjs --format gif --also-package

node scripts/import-assets.mjs --thumbs --also-package    # 只补缩略图（设置面板预览墙）
node scripts/import-assets.mjs --dry-run                  # 只看会做什么
node scripts/import-assets.mjs --reindex --also-package   # 只重算元数据+标签，不重新编码
```

当前产物：**157 张 / 85.9 MB / 均值 560 KB**（全帧的代价）。`assets/` 跟着仓库走的话建议用
`--fps 25` 减半到 ~45 MB，或把 `assets/` 加进 `.gitignore`（运行时主力其实是 `~/.dsh` 那份）。

release 附件包的真实清单（`scripts/assets-pack.json`）：**315 个文件 / 157 张贴纸 / 91,043,470 字节**，
`sha256 = 345684d337dada6332f99627ce44ab91c244b918aba4c4236947e9cd6641f9d1`，`fetch-assets.mjs` 会逐项校验。
本机解出来的那份是 **315 个文件 / 91,221,513 字节**（顶层 157 张贴纸 + `index.json`，`thumb/` 157 张缩略图）——
文件数与清单一致，字节数比压缩包大是解压后的正常结果。

改素材语义/标签：编辑 `scripts/sticker-map.json`（128 条：id + 中文 tags + 英文 aliases），重跑导入。
`id` 是 ASCII 短名（`dianzan`、`aixin-2`），进 URL；原名只留在索引里。

> 重跑导入后要执行 `npm run build`：客户端自带一份**打包词表**（`src/client/vocab-fallback.json`，
> 由 `scripts/build-client-vocab.mjs` 从 `assets/index.json` 生成），有测试盯着它与索引不漂移。

### 词的纪律（踩过两次）

**凡是展示给模型看的词，都必须能被自己的检索器命中**：工具描述里的例子、系统提示里的场景短语、
失败文案里建议的重试词——全都有回归测试盯着。
踩过的两次：描述里写「得意」却检索不到；提示里写「任务收工」导致模型传「扒源码收工」也检索不到。

检索器对中文是容忍的：`修好了`→`修好`、`踩了坑`→`踩坑`、`扒源码收工`→（含）`收工` 都能落到图上，
而 ≤2 字的短查询（`点赞`、`哭`）行为不变。模型只给 `mood` 时，**客户端用同一套检索器解出 id**。
匹配不上时工具会**明说可以重试**；设置里的「兜底贴纸」（默认关）能让它无论如何都贴一张，并如实标注。

<a id="diagnostics"></a>
## 诊断

```bash
node scripts/probe-report.mjs 40     # 读 /stats：这一版 bundle 加载了吗 / 节点渲染了吗 / 选的是哪张 / 有没有被折叠
node scripts/scan-sticker-usage.mjs  # 每个会话：提示是否进请求 / 工具是否可用 / 是否真调用 / 出了几张图
```

浏览器控制台宿主看不到，所以客户端的关键动作都会经 `POST /debug` 回传到 host 的环形缓冲
（`/stats` 一次读全）——这是"某条回复为什么没有贴纸"唯一能看见的办法。

### 真机读数（本机运行中的实例）

`GET /api/dsh-memes-reply/stats` 的**真实返回**（长 `trace` 数组已省略，其余逐字未改）：

```json
{
  "ok": true, "ready": true,
  "entries": 157,
  "index": "C:\\Users\\ROG\\.dsh\\memes-reply\\assets\\index.json",
  "format": "webp",
  "assetRoot": "C:\\Users\\ROG\\.dsh\\memes-reply\\assets",
  "originalRoot": "", "quality": "compressed",
  "totalBytes": 90057114,
  "served": 9, "miss": 0, "denied": 0,
  "lastId": "penji", "lastAt": 1791315376623,
  "latch": null,
  "jev": { "calls": 0, "hits": 0, "fallbacks": 0, "costUsd": 0, "lastMs": 0, "lastNote": "", "cacheSize": 0 }
}
```

同一份 `/stats` 里的 `trace` 有 48 条回执、6 种 kind 各 8 次（`client-apply` 出现 8 次 ≈ 8 次页面加载）。**客户端半边真的挂上了两个座位**
（这两条是原始回执文本）：

```
client:sticker-node-installed · build=sticker-node-a kind=memes-sticker
client:sticker-turn-tail-installed · slot=conversation.chat.turnTail id=dsh-memes-reply-sticker（落定贴纸的新座位；旧的自定义节点只留生成中占位）
client:sticker-turn-tail-slot · 槽位已声明 → 注册 dsh-memes-reply-sticker
client:sticker-turn-tail-registered · register 成功 id=dsh-memes-reply-sticker · slots.entries=1 条[dsh-memes-reply-sticker]
```

`/catalog?limit=3` 的**真实返回**（「[它长什么样](#looks)」那张动效表的原始 JSON；URL 里的主机名是本机实例的）：

```json
{"ok":true,"ready":true,"total":157,"items":[
 {"id":"tiaowu-pizhichun","name":"跳舞(低皮质醇)","tags":["跳舞(低皮质醇)","低皮质醇","从容","松弛"],
  "bytes":629686,"w":240,"h":240,"frames":66,"fps":50,"durationMs":1320,
  "thumb":"http://127.0.0.1:3081/api/dsh-memes-reply/thumb/tiaowu-pizhichun.webp",
  "url":"http://127.0.0.1:3081/api/dsh-memes-reply/sticker/tiaowu-pizhichun.webp"},
 {"id":"notice-bits","name":"通知_提示 Bits","tags":["通知_提示 Bits","通知","打赏动画"],
  "bytes":715886,"w":240,"h":240,"frames":86,"fps":50,"durationMs":1720},
 {"id":"qidai-1","name":"期待","tags":["期待","期待","等着","催更"],
  "bytes":794786,"w":200,"h":200,"frames":131,"fps":50,"durationMs":2620}]}
```

### 会话日志体检（`scan-sticker-usage.mjs`）的真实输出

```
扫 82 个会话，列出最近 10 个：

时间                  workspace                             提示    工具    调用    贴纸URL  解出
2026/9/22 20:00:22  D-applications-deepseekharness         有     1     0        0  2.6 MB
2026/9/22 19:59:08  D-developing-Oss~76F8~5173             有     2     0        0  0.8 MB
2026/9/22 19:58:15  D-developing-ds~6C11~95F4~79D1~7       有     1     0        0  0.2 MB
2026/9/22 19:54:57  D-developing-ds~6C11~95F4~79D1~7       有     1     0        0  0.1 MB
2026/9/22 19:53:15  D-developing-ds~6C11~95F4~79D1~7       有     1     0        0  0.1 MB
2026/9/22 19:50:47  D-developing-ds~6C11~95F4~79D1~7       -     2     0        0  53.7 MB
2026/9/22 19:17:54  D-developing                           -     0     0        0  0.0 MB
2026/9/22 19:04:09  D-developing-ai~0020benchmark-Qw       有     5     3        0  6.2 MB
2026/9/22 14:44:48  D-developing-make-videos-kit           有    20     6        0  4.3 MB
2026/9/22 12:29:00  D-applications-deepseekharness         有     2     0        0  2.9 MB

最近 10 个会话：提示命中 8 个 · 真的调用过 2 个
```

怎么读这张表（脚本自己的说明）：

- 「提示」列 = 装配后的请求里确实带了我们那一行（`有`）/ 只在正文里出现过、可能是我自己引用过（`?`）/ 没有（`-`）；
- 「工具」列 = 请求的工具目录里有几个 `use_sticker`（= 工具对所有会话可用）。**有数字但「调用」为 0 = 模型看见了却没用**；
- 判断"模型到底用没用"看**「调用」列**，别被「工具」列骗了（那是没装插件的老会话）。
- 「贴纸URL」列数的是会话产物里的贴纸 URL 条数；上表里是 0 —— 该列匹配的是 `/api/dsh-memes-reply/sticker/`，
  而这些会话里的贴纸是**客户端派生渲染**的（v2.0 起工具**不再产出 URL**，只回 id/name），所以这一列在 v2.0 会话上天然是 0。

### JEV 那一层另有一条通道

`GET /jev-log`（环形，最近 20 趟真实往返，含请求与响应原件）。
不用敲命令 —— 面板里打开「JEV 调试浮层」就能看，见 [JEV 模式 → 调试浮层](#jev-debug)。
命令行想直接看就：

```bash
# 最近 5 趟真实往返（含发给 JEV 的请求与它回的响应）
node -e "fetch('http://127.0.0.1:3080/api/dsh-memes-reply/jev-log?limit=5').then(r=>r.json()).then(d=>console.log(JSON.stringify(d.entries,null,2)))"
```

`/stats` 里的 `jev` 段是**计数**（calls / hits / fallbacks / costUsd / cacheSize），不是原文 ——
原文只在 `/jev-log`，那样 12 秒轮询的 `/stats` 才不会被一堆没人看的 JSON 拖胖。

### 插件自有状态在哪

```
<DSH_HOME>/memes-reply/
  assets/      素材（157 张贴纸 + index.json；由 fetch-assets.mjs 或 import-assets.mjs 产出）
  state.json   人按过的开关：每会话静音 / 一次性指定 / 最近用过 / 挂件坐标 / JEV 面板位置
```

`state.json` 的**真实片段**（本机，`recent` 是冷却用的"最近用过"，`pet` 是挂件落点）：

```json
{
  "version": 1,
  "sessions": {
    "session-49fbb356-4c93-4e96-9fd6-b43151d595f8": { "recent": ["tingzhi-gongzuo", "qingzhu", "mojing-fanguang"] },
    "session-d3a88913-da08-4ec4-8796-770dd6ae99ad": { "recent": ["dianzan", "tingzhi-gongzuo", "qingzhu"] }
  },
  "global": { "pet": { "id": "penji", "right": 1415, "bottom": 704 } }
}
```

写盘纪律：同目录 tmp + rename 的**原子写**；文件损坏 / 缺失一律当空状态处理 ——
**绝不因为一个 json 坏掉而让插件起不来**（写失败只记一行日志，不影响回复）。

<a id="evidence"></a>
## 验证记录（本机）

这一节只记**这次 README 改写作业里真跑过的东西**，跑不了的如实标注。

| 项目 | 怎么跑的 | 结果 |
| --- | --- | --- |
| 宿主状态 | `GET http://127.0.0.1:3081/api/dsh-memes-reply/stats` | HTTP 200 · `ready:true` · 157 张 · webp · 90,057,114 字节 · `served:9` |
| 素材元数据 | `GET /catalog?limit=3` | 三条真实条目（66 / 86 / 131 帧，见上表） |
| 词表 | `GET /vocab` | `total:157`，29,389 字符 |
| 会话态 | `GET /session-state`（无会话 id） | `{"muted":false,"latch":null,"sessionLatch":null,"recent":[]}` |
| 客户端半边 | `node scripts/probe-report.mjs 25` | ①`build=turn-tail-c` ②✅ `build=sticker-node-a` ③贴纸节点回执 **0 条**（这份 trace 里还没有任何一回合渲染过贴纸）④被折进过程展示 **0** 条 ⑤落定未选中 **0** 条 |
| 会话日志体检 | `node scripts/scan-sticker-usage.mjs --limit 10` | 扫 82 个会话；最近 10 个里提示命中 8 个、真的调用过 2 个（6 次 / 3 次） |
| 配置 dump | `dsh --profile web --dump-config` | exit 0；该条目**没有 `config:` 块**（22 个字段全默认） |
| 测试套件 | `node --test "test/*.test.mjs"` | 107 tests / 100 pass / **7 fail** —— 全部是环境缺件（工作树里没有 `node_modules`、没有 `assets/`），见下 |
| 端到端肉眼确认 | —— | **没有做**：本次作业没有驱动 GUI、没有截图，所以"贴纸上屏的样子"只有客户端回执（`trace`）与派生逻辑作证，不是目视确认 |

那 7 条失败的成因（逐条核对过）：

- `vocab-fallback`（2 条）与 `族表成员存在`（1 条）读的是**仓库内** `<repo>/assets/index.json`，而素材不入库；
- `apply` / `route` / `jev-route`（3 条）同样依赖那份索引；
- `manifest-compat`（1 条）需要 `semver`，而工作树没有 `node_modules`。

也就是说：**干净 clone 上直接跑测试不会全绿** —— 得先装依赖并让仓库里也有 `assets/index.json`（见「[维护者须知](#lib-committed)」的补充）。

<a id="limits"></a>
## 已知限制与代价

- 贴纸层依赖浏览器半边的**节点定义 API**（部署版 `@deepseek-ai/dsh-client-ui-conversation` 的
  `ctx.uiConversation.events.register`）：CLI/headless 没有这个 surface，那里只有工具与路由
- 构建期依赖里注册表曾叫 `ctx.conversationEvents`（0.1.7 之前），所以客户端是**按运行时的名字**
  做的兼容（`src/client/node.tsx` 顶部有说明），不 import 那个包的类型
- 历史回合不补贴纸：派生只对"装了之后产生的回合"生效（刻意不改写已有历史）
- 预览墙依赖缩略图：没跑过 `--thumbs` 时该格降级成名字 chip（不会破图）
- 动画 WebP 需要现代浏览器（Chrome/Edge/Firefox，Safari 14+）；老浏览器只会显示第一帧
- 素材字节走 `ctx.fs`：会话处于受限沙箱模式时读取可能被拒，此时工具不选图（宁可没有，也不出破图）
- 原图目录是可选项：`quality=original` 需要自己填 `originalRoot`，否则静默回落压缩副本
- 路由无 Range：图片是整文件读（单张 ≤16 MiB 上限）；WebP 本身已压缩，不做 gzip
- `POST /latch` 没有鉴权（本机任意页面可调）：只影响"下一轮贴哪张"，且有回环围栏 + 不发 CORS 头 + id 白名单
- **`jev` 模式会把助手每轮回复正文发到 OpenRouter**（截断 12k 字符）：这是拿隐私换语境贴合度的模式，
  默认关着，要自己开
- **`jev` 模式会晚约 1 秒出图**：等宿主问完 JEV 才显示。这期间**刻意什么都不显示** ——
  先闪一张随机的再换掉比晚一点更难看；超时（默认 4 s）后回落既有规则
- **`jev` 模式依赖外部服务与 key**：没 key / 欠费 / 网络不通 / 响应不合法，一律回落 `keyword`/`every`，
  且 `/stats` 的 `jev.fallbacks` 与 `host:jev` 轨迹都会留痕（不然线上无法解释"为什么这轮是随机的"）
- JEV 是**非确定**的（同一输入两次可能给不同分布）：同轮次靠宿主缓存钉住，跨轮次本来就会变
- 族表（`src/moods.ts`）是人工整理的：157 张里 152 张进了 13 族，剩 5 张不收
  （仍可被 `keyword`/点名/`latch` 选中，只是不作为 JEV 候选）
- **调试浮层的日志在内存里**（最近 20 趟，不落盘）：宿主重启即清空，也不跨进程共享
- **调试浮层里的请求/响应是截断过的**（长文本 1.2k 字符，并标注原文长度）：要看全文得自己调
  `OPENROUTER_API_KEY` 直接打端点 —— 面板是给人眼的，不是取证工具
- 调试浮层只在**展开时**轮询（每 2.5 s）：收起来就不刷新，头部计数会显示成上一次的值

<a id="dev"></a>
## 开发

```bash
npm run typecheck          # tsc --noEmit（host + client 全量）
npm run build              # 生成打包词表 → tsc 出 host（lib/*.js + d.ts）→ tsdown 出客户端 bundle
npm run check:client       # 客户端 bundle 纯净化检查（宿主依赖不得进浏览器）
npm test                   # 先 build + 纯洁检查，再跑全部单测
node test/live-probe.mjs   # 对正在运行的 GUI 打活体探针（bundle/字节/304/缩略图/词表/会话态/latch/状态行）
```

测试分工：`route.test.mjs`（路由分支：字节/缩略图/清单/词表/会话态/latch/围栏）、
`search.test.mjs`（检索，含"工具描述里的示例词必须命中"的回归）、`derive.test.mjs`（v2.0 派生优先级与确定性）、
`auto.test.mjs`（规则）、`apply.test.mjs`（桩服务跑 `apply()`：工具→字节→/fish→面板指定→两个新端点）、
`index.test.mjs` + `thumbs.test.mjs`（真实产物体检）、`vocab-fallback.test.mjs`（打包词表不许漂移）、
`manifest-compat.test.mjs`（`@deepseek-ai/dsh-*` peer 必须容纳受支持的每个 dsh 运行时版本）、
`client-bundle.test.mjs`（产物契约）。

浏览器半边的纪律：`src/client/**` 只能 import `react`、`@deepseek-ai/dsh-client-*` 和本包的
纯模块（`types.ts` / `protocol.ts` / `config.ts` / `derive.ts` / `search.ts` / `closing.ts` / `settings-source.ts`）。
**绝不能** import `schema.ts`（会把 schemastery 打进浏览器），这条由 `npm run check:client` 强制。

改客户端后要在 `/stats` 里核对 `client-apply` 回执里的 `build=`（`src/client/index.tsx` 顶部的
`CLIENT_BUILD`）——不然你看到的可能还是上一版 bundle。

<a id="lib-committed"></a>
### 维护者须知：`lib/` 是入库的

本仓库把构建产物 `lib/` 提交进版本库，为的是让 git 安装免编译（见上）。
**代价是它不会自己更新**：

```bash
npm run build          # 改完 src/ 之后
git add lib && git commit -m "build: 同步 lib/"
```

忘了这一步，GitHub 用户拿到的就是旧产物。`npm run build` 会依次跑
`build-client-vocab.mjs`（从 `assets/index.json` 生成打包词表）→ `tsc`（出 host `lib/*.js` + `d.ts`）
→ `tsdown`（出客户端 `lib/client.js`）。

> 三点顺带：
> - `assets/index.json` 不在仓库里，所以 `npm run build` **需要先有素材**（先跑一次 `fetch-assets.mjs`）。
> - 只改了客户端时用 `npm run build:client`（跳过 `tsc`，快一些），但它同样需要索引。
> - `build-client-vocab.mjs` 每次都会刷新 `src/client/vocab-fallback.json` 里的 `generatedAt`
>   时间戳（既有行为，测试比对前会抹掉它）。想让 diff 干净就
>   `git checkout -- src/client/vocab-fallback.json`；`lib/` 产物不受影响，连续两次构建字节一致。

> **补充（2026-10 核对，原文之外的实测结论）**：上面那句「先跑一次 `fetch-assets.mjs`」**路径对不上** ——
> `scripts/build-client-vocab.mjs` 读的是**仓库内** `<repo>/assets/index.json`，而 `fetch-assets.mjs`
> 默认解到 `<DSH_HOME>/memes-reply/assets`，两者不是同一个目录。要让仓库里也有索引：
>
> ```bash
> node scripts/fetch-assets.mjs --dest assets          # 直接把素材解进仓库 assets/
> # 或：node scripts/import-assets.mjs --also-package  # 从原图生成时顺带写进仓库 assets/
> ```
>
> 这也是干净 clone 上 `node --test "test/*.test.mjs"` 会有 7 条失败的原因（见「[验证记录](#evidence)」）。

<a id="filemap"></a>
## 文件地图

| 路径 | 作用 |
| --- | --- |
| `src/index.ts` | host 装配：路由（含 `/vocab` `/session-state`）+ 工具 + 命令 + 设置 |
| `src/route.ts` | 十一条端点：`/sticker`、`/thumb`、`/catalog`、`/vocab`、`/session-state`、`/jev-pick`、`/jev-log`、`/latch`、`/layout`、`/stats`、`/debug`（回环围栏、ETag/304） |
| `src/derive.ts` | **v2.0 核心**：派生优先级与确定性（host 与浏览器共用）；`jev` 结论的优先级排在"人指定"之后、模型点名之前 |
| `src/auto.ts` | 四条规则的纯逻辑（keyword / every / off / jev）；`jev` 在这里**必须返回 null**，那张由宿主异步取回 |
| `src/search.ts` | 关键词检索（纯函数，中文反向包含 + 同分按名字短优先） |
| `src/tool.ts` | `use_sticker`：点名校验 + 维护宿主开关（静音/指定/冷却） |
| `src/command.ts` | `/fish` |
| `src/jev.ts` | **JEV 决策客户端**（host only）：读 key（env → credentials 文件）、组装请求、严格校验响应、超时竞速、结论缓存、族内选张 |
| `src/moods.ts` | **情绪族表**（host only）：13 族 + `blank` → 152 张素材的人工映射；`test/jev.test.mjs` 盯着"表里的 id 必须真实存在" |
| `src/assets.ts` | 索引加载与三根解析（原图 → assetRoot → 包内 assets；缩略图同理） |
| `src/prompt.ts` | 系统提示里的一行"贴纸可用"提示（按开关/静音/工具是否注册动态输出） |
| `src/state.ts` / `src/schema.ts` / `src/config.ts` / `src/protocol.ts` / `src/types.ts` / `src/theme.ts` | 状态、设置 schema、纯常量、共享协议、类型、外观变量 |
| `src/settings-source.ts` | **设置来源的延迟绑定句柄 + 0.1.7 类型垫片**（纯模块）：对外仍是 `SettingsScope` 这个名字，内部把 0.1.7 的 `ConfigForm` / `ConfigFormSnapshot` 原地别名过来；没挂上真服务时读默认值，服务到了 `attach()` 上去自动通知订阅者。为的是不让「某个版本没有设置服务」把整个插件带下线 |
| `src/closing.ts` | **落定贴纸的输入提取**（纯模块）：从官方 `TurnTailChatData.closing` 里取正文与 `use_sticker` 的实参；`modelPickOf` 也从这里共用 |
| `src/client/index.tsx` | 浏览器半边入口：最外层回执 + 样式 + 面板 + 挂件 + 两个贴纸座位 |
| `src/client/node.tsx` | **贴纸的渲染单元**（两个座位共用）：派生 / 词表 / 会话态 / JEV / 动画 / 可观测回执。`seat='flow'` 只渲染生成中的占位，`seat='turn-tail'` 渲染落定贴纸（为什么分两个座位见文件头） |
| `src/client/turn-tail.tsx` | **落定座位**：注册进官方 `conversation.chat.turnTail`，把官方数据翻译成渲染单元要的字段 |
| `src/client/vocab.ts` | 词表来源：优先 `/vocab`，兜底打包词表 |
| `src/client/pet.tsx` | 常驻挂件（点击换图 / 拖拽 / 悬停工具 / 收起成小圆点） |
| `src/client/jevpanel.tsx` | **JEV 调试浮层**（可开关）：小胶囊 ↔ 面板；每次真实往返的请求与响应；只在展开时轮询 |
| `src/client/panel.tsx` / `api.ts` / `styles.ts` | 折叠卡片、同源数据通道、面板 CSS |
| `scripts/import-assets.mjs` | 压素材 + 缩略图 + `index.json`（零依赖，只要 ffmpeg） |
| `scripts/fetch-assets.mjs` | 取 release 附件素材（校验 `sha256` 与字节数；`--from` / `--dest` / `--dry-run` / `--force`） |
| `scripts/assets-pack.json` | 素材包清单：`sha256` / `bytes` / `files` / `stickers` |
| `scripts/build-client-vocab.mjs` | 从 `index.json` 生成客户端打包词表 |
| `scripts/sticker-map.json` | 128 条语义 → id/tags/aliases（人工可改） |
| `scripts/probe-report.mjs` | 读 `/stats` 把客户端回执读成人话 |
| `scripts/scan-sticker-usage.mjs` | 扫会话日志：提示进没进请求 / 工具调没调用 |
| `scripts/check-client-purity.mjs` | 客户端 bundle 纯净化门禁 |
| `tsdown.config.ts` | 客户端 bundle 构建（CJS closure + 平台模块 external） |

### 设计文档（`docs/`）

| 文档 | 内容 |
| --- | --- |
| `需求分析-v0.1.md` | 最早的需求分析 |
| `需求与方案-v1.0.md` | v1.0 方案 + §12–§15 的事故复盘与证据 |
| `需求与方案-v2.0-贴纸层.md` | v2.0 的重做理由与探针记录 |
| `需求与方案-v2.1-JEV贴纸决策.md` | 为什么"先判族再选张"、缓存/回落/隐私怎么落的 |
| `dsh-0.1.6a2-plugin-config-panel-migration.md` | 0.1.6-alpha.2 配置面板迁移 |
| `dsh-0.1.7-migration.md` | 0.1.7 迁移（`SettingsForms` 没有 `register()` 那一段） |
| `dsh-0.2.0-compat.md` | 0.2.0 兼容 |

<a id="history"></a>
## 历史

v1.0 的贴纸是"宿主发事件 → 客户端轮询取走 → 抢 `turnTail` 座位渲染"，留下了一串事故：
渲染的是首帧静图（不会动）、尾巴座位被 `present` 交付卡片抢走、刷新即空、事件赶不上渲染。
复盘与证据都在 `docs/需求与方案-v1.0.md`（§12–§15），v2.0 的重做理由与探针记录在
`docs/需求与方案-v2.0-贴纸层.md`。

v2.1 加了 **JEV 模式**（`autoMode=jev`）：把"每 N 轮哈希随机一张"换成"按语境判情绪族、族内由代码选张"，
并让"这轮不贴"第一次成为合法选项。为什么是"先判族再选张"、以及缓存/回落/隐私怎么落的，
都写在 `docs/需求与方案-v2.1-JEV贴纸决策.md`。

v2.2 改**放置**：贴纸从"右下角、上收 40px 压住气泡角"改成**正文下方、与正文左对齐、不压字**
（`justifyContent: flex-start`，`bubbleRise` 默认 40 → 0）。生成中占位与落定那张共用同一渲染单元，
所以一起靠左；常驻挂件（右下角浮层、可拖）不受影响。

<a id="license"></a>
## 许可

**BSD-3-Clause** —— 声明见 [`package.json`](package.json) 的 `license` 字段（`"license": "BSD-3-Clause"`）。

**注意：本仓库根目录没有 `LICENSE` 文件**（`gh repo view --json licenseInfo` 也是 `null`），
所以这里不放 License 徽章，也没有在仓库里添加许可证文件 —— 补一份需要仓库主人确认版权署名。

---

## 相关

- 素材来源：`D:\Pictures\image_ACG\蓝色大肥鱼表情包`（导入脚本的默认原图目录，`scripts/import-assets.mjs`）
- [JEV / typesafe](https://openrouter.ai/typesafe/jev-1.13) —— `autoMode=jev` 用到的 System One 模型
