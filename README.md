# dsh-memes-reply

让 DSH 在**每一条回复**右下角贴一张**会动的**蓝色大肥鱼表情包。

## v2.0：贴纸是"会话流里的一个节点"

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

### 它长在哪（三个座位）

| 面 | 座位 | 说明 |
| --- | --- | --- |
| 贴纸层（主线） | keyed `conversation.chat.node` + 自定义 `ConversationNodeDefinition` | 一轮一个节点；`anchorSeq` = 收尾回复的 seq + 0.1，正好落在回复下面、操作行上面 |
| 常驻挂件 | `shell.overlay`（加法型，frame-wide） | "随时能看到"是硬需求，与"这条回复的贴纸"是两个职责 |
| 配置面板 | `plugins.bundle.config`（key = 组合包名 `dsh-memes-reply`） | 0.1.6a2 插件管理页里本插件自己的页面；旧的 `settings.plugin.item` 已被统一插件管理移除 |

### 为什么不用自定义会话事件

最"正统"的写法是像官方 `present` 工具那样把决定 `session.append('memes-reply/sticker', …)` 写进日志。
**这条路对本插件是危险的**：`Session.append()` 没有任何渠道设置 `ignorable` 标记，而持久化读取的规则是
"未知类型且未标记 `ignorable` → **拒绝解释整个日志**"，且已知类型表是**仓库内生成**的静态表、
下游插件类型按构造就不在里面。写自定义事件 = 让用户的历史会话变成打不开。

所以 v2.0 只**读**会话事件：决定完全是 `(会话, 轮次, 收尾正文, 模型的工具实参, 宿主开关)` 的纯函数
（`src/derive.ts`，host 与浏览器共用同一份实现），可重放、无竞态、零污染。

## 安装

三种装法。**共同前提：装完要重启**（bundle 层与客户端脚本清单都在启动时读取）。

### 方式一：从 GitHub 装（推荐）

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

### 方式二：从 npm 装（**尚未发布**）

包已经按发布形态准备好 —— `npm pack` 约 210 KB、内含编译好的 `lib/`、`prepack` 会在打包前自动构建 ——
但**还没有发布到 npm**，所以下面这条命令目前会 404：

```bash
# 尚未可用；等发布后再用
dsh plugin --profile web add dsh-memes-reply
```

发布流程就两步：`npm login` → `npm publish`（`prepack` 自动编译，不用手工 build）。

### 方式三：本地链接（开发用）

```bash
pnpm install && npm run build    # link: 安装不会替你跑 prepack，得先自己编译
dsh plugin --profile web add "link:D:\developing\DSH-plugin\dsh-memes-reply"
```

### 装完都要做的一步：取素材

素材 **87 MB**，既不随 npm 包发布，也不在 git 仓库里（走 GitHub release 附件）：

```bash
cd ~/.dsh/profiles/web/node_modules/dsh-memes-reply
node scripts/fetch-assets.mjs
```

它会下载 → 校验 `sha256` 与字节数 → 解到 `<DSH_HOME>/memes-reply/assets`。
下载慢或不通就手动下载后走本地包：`node scripts/fetch-assets.mjs --from <memes-assets-v1.zip>`；
只想看它会做什么：加 `--dry-run`。目标目录已有素材时会直接退出（要覆盖加 `--force`）。

> 素材不是必须的一步 —— 没取的话插件照常加载，只是没有图可贴（面板会显示 0 张）。

### 验证装对了

```bash
dsh --profile web --dump-config | grep memes-reply   # 能看到 id: memes-reply
node test/live-probe.mjs                             # 对运行中的 GUI 打活体探针
```

`live-probe` 会一次性把客户端 bundle、贴纸字节、缩略图、清单、`/vocab`、`/session-state`、
「下一轮用这张」与状态行全部打一遍。

> **改了 host 半区必须重启 `dsh web`**（路由是启动时注册的）；只改浏览器半边则刷新页面即可。
> 客户端贴纸层为此带了一份**打包词表兜底**：宿主没重启（`/vocab` 还是 404）时它照样工作。

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

## 用法

| 入口 | 说明 |
| --- | --- |
| （默认） | 什么都不用做：`autoMode=keyword`（默认）命中情绪词就补一张；改成 `every` 就每 N 轮必贴；改成 `jev` 就交给 JEV 按语境判（见下节） |
| 工具 `use_sticker(mood, id?)` | 模型点名要哪张：`mood` 是**2–4 字情绪词**（得意、翻车、摸鱼、bug、收工…）。工具**只回 id/name**，不产出任何 URL —— 渲染由贴纸层负责 |
| `/fish` | 状态 + 前 40 张清单 |
| `/fish list <关键词>` | 过滤清单 |
| `/fish on` \| `/fish off` | 本会话静音开关（状态持久在 `<DSH_HOME>/memes-reply/state.json`） |
| `/fish <id\|关键词>` | 给**下一轮**指定一张（一次性；优先于面板的全局指定） |
| 设置面板 | 状态行 + 22 个字段 + 预览墙 + 「下一轮用这张」（全局一次性指定） |

## 配置面板

位置：**侧栏 插件 → 已安装 → 查看 memes-reply**（0.1.6a2 统一插件管理页；配置面板画在本插件自己的页面上，默认展开）。形态对齐原版折叠卡片
（标题 + 描述 + 未保存徽章 + chevron → 展开体 → 底部 丢弃/保存），全部用 `--dsw-alias-*` 主题变量。

| 区域 | 内容 |
| --- | --- |
| 状态行 | 素材张数 / 格式 / 总体积 / 已服务次数 / 生效的 `index.json` 路径（12 秒轮询 + 手动刷新） |
| 字段 | 总开关、画质来源、压缩副本目录、原图目录、冷却轮数、兜底贴纸、规则（off/keyword/every/jev）、间隔轮数、JEV 三项（模型/超时/语气说明）、挂件三件（开关/大小/停靠角）、外观（形状/圆角/边框粗细/样式/颜色）、贴纸大小与上移量 |
| 预览墙 | 12 格缩略图（静态首帧，均值 7 KB）＋「换一批」；点一张即 `POST /latch` 设为下一轮指定，并加载全尺寸动画确认 |
| 底部 | 换一批 · 取消指定 · 丢弃 · 保存 |

配置字段走官方 `ctx.settingsScope`（草稿→保存，revision 冲突自带恢复），落盘到
`~/.dsh/settings.yaml` 的 `dsh-memes-reply:` 段；状态行/预览墙/指定走插件自己的同源路由。
面板里改的规则（`autoMode` / 间隔 / 兜底 / 冷却）由**浏览器半边直接读设置**生效，不需要重启。

## JEV 模式：让 JEV 决定贴哪张

`autoMode: 'jev'` —— 把这一轮的回复交给 [JEV](https://openrouter.ai/typesafe/jev-1.13)
（TypeSafe 的 System One 模型，只做选择/分类/打分）判一个**情绪族**，再由代码在族内挑一张。

### 为什么是"先判族、再选张"

真实 API 实测（2026-09-20，`text=验收完成…踩了个坑…`，同一份 state）：

| 问法 | 延迟 | 成本/轮 | 选中项 margin |
| --- | --- | --- | --- |
| **只问 13 族**，族内由代码挑（本插件采用） | **~1.3 s** | **$0.00005** | 0.30（族级，语义正确） |
| 族 → 具体张（两次调用） | ~3.5 s | $0.0001 | 0.72 |
| 157 张直选（一次调用） | 1.0 s | $0.00022 | **0.02（糊：`all-good-1` 0.29 vs `qingzhu` 0.27）** |

JEV 对**窄候选集**明显更可靠，而"族里到底选哪张"（三张几乎一样的一字马）本来就该由代码定
——顺带把冷却去重与确定性一起解决了。这与 JEV 自己的纪律一致：精确规则与算术用代码，Jev 只做判断。

### 三条硬需求怎么落的

| 需求 | 做法 |
| --- | --- |
| **刷新即重放**（同一轮永远同一张） | 结论在**宿主**按 `(sessionId, turn)` 缓存（`/stats` 的 `jev.cached` 可见）；客户端刷新只是重放，不再花钱也不会换一张 |
| **绝不拖住会话** | 没 key / HTTP 非 2xx / 响应不合法 / 超时（默认 4 s，`AbortController` + `Promise.race` 双保险）一律回落既有 `keyword`/`every` 规则；失败也留一条 `host:jev` 轨迹 |
| **key 不出宿主** | 浏览器半边只请求 `/jev-pick` 拿结论（`scripts/check-client-purity.mjs` 是门禁）。key 读 `OPENROUTER_API_KEY`，**读不到就退到 `<DSH_HOME>/.credentials.yaml`**（本机实测 DSH 把 key 存在那里而没注入插件进程环境变量） |

### 代价（说清楚，不埋在代码里）

- **隐私**：开这个模式等于**把助手每一轮的回复正文发到 OpenRouter**（正文截断 12k 字符）。
- **成本**：实测 **$0.0000488/轮**（约 1 万分之 5 美元），已在 `/stats` 的 `jev.costUsd` 记账。
- **延迟**：直连实测 **784 ms**，经 `127.0.0.1:10808` 实测 **2268 ms**（同一份请求）。
  Node 的 global `fetch` 默认**不读** `HTTPS_PROXY`；Node 24 起可用 `NODE_USE_ENV_PROXY=1` 让它读。
- **非确定性**：同一输入两次跑出 `yes=0.79 / 0.80` —— 这就是必须做服务端缓存的原因。
- `needs_review`（CLI 退出码 2）在真正两可的回复上**是常态**（例：`celebrate 0.61` vs `bug 0.31`），
  不是错误。这里取分布的最大值，不把"未达 0.8 阈值"当成失败。

### 还能"这轮不贴"

`blank` 是候选里的一族，配一个 `stick` 是非题（实测 `yes=0.79~0.83`）。两个都指向"没情绪"时
就**不贴**，所以 `jev` 模式下"每轮必有鱼"不再是唯一选项 —— 纯技术输出可以不打扰。

### 调试浮层：看它到底发了什么、回了什么

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

## 贴纸贴在哪一轮、什么时候出现

| 环节 | 说明 |
| --- | --- |
| 一轮一个节点 | 定义匹配 `turn/start`（建）、`step/start` / `assistant/message` / `tool/call` / `turn/end`（更新） |
| 生成中 | `phase=streaming` → 从「思考 / 打字」那一组里确定性挑一张（同回合永远同一张） |
| 落定 | `turn/end` 后 `phase=settled` → 按优先级派生：会话/面板指定 > **JEV 语境结论** > 模型点名 > 规则（keyword/every）> 兜底。`autoMode=jev` 时结论是异步取回的，**没到之前不显示任何贴纸**（先闪一张随机的再换掉更难看） |
| 锚点 | 落定后 = 收尾回复的 seq + 0.1（官方给"助手之后的补充节点"留的偏移）；生成中 = 最后一个持久事件的 seq |
| 不被折叠 | 锚点落在**收尾回复之后**，因此不进入官方"过程展示"的折叠窗口（探针实测 `过程成员=no`） |
| 与交付卡片共存 | 我们不在 `turnTail` 那条竞争链上，所以**回复里提文件路径时贴纸照样在**（v1.0 的老事故点） |

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

## 诊断

```bash
node scripts/probe-report.mjs 40     # 读 /stats：这一版 bundle 加载了吗 / 节点渲染了吗 / 选的是哪张 / 有没有被折叠
node scripts/scan-sticker-usage.mjs  # 每个会话：提示是否进请求 / 工具是否可用 / 是否真调用 / 出了几张图
```

浏览器控制台宿主看不到，所以客户端的关键动作都会经 `POST /debug` 回传到 host 的环形缓冲
（`/stats` 一次读全）——这是"某条回复为什么没有贴纸"唯一能看见的办法。

**JEV 那一层另有一条通道**：`GET /jev-log`（环形，最近 20 趟真实往返，含请求与响应原件）。
不用敲命令 —— 面板里打开「JEV 调试浮层」就能看，见 [JEV 模式 → 调试浮层](#调试浮层看它到底发了什么回了什么)。
命令行想直接看就：

```bash
# 最近 5 趟真实往返（含发给 JEV 的请求与它回的响应）
node -e "fetch('http://127.0.0.1:3080/api/dsh-memes-reply/jev-log?limit=5').then(r=>r.json()).then(d=>console.log(JSON.stringify(d.entries,null,2)))"
```

`/stats` 里的 `jev` 段是**计数**（calls / hits / fallbacks / costUsd / cacheSize），不是原文 ——
原文只在 `/jev-log`，那样 12 秒轮询的 `/stats` 才不会被一堆没人看的 JSON 拖胖。

## 开发

```bash
npm run typecheck          # tsc --noEmit（host + client 全量）
npm run build              # 生成打包词表 → tsc 出 host（lib/*.js + d.ts）→ tsdown 出客户端 bundle
npm run check:client       # 客户端 bundle 纯净化检查（宿主依赖不得进浏览器）
npm test                   # 先 build + 纯洁检查，再跑 123 个测试
node test/live-probe.mjs   # 对正在运行的 GUI 打活体探针（bundle/字节/304/缩略图/词表/会话态/latch/状态行）
```

测试分工：`route.test.mjs`（路由分支：字节/缩略图/清单/词表/会话态/latch/围栏）、
`search.test.mjs`（检索，含"工具描述里的示例词必须命中"的回归）、`derive.test.mjs`（v2.0 派生优先级与确定性）、
`auto.test.mjs`（规则）、`apply.test.mjs`（桩服务跑 `apply()`：工具→字节→/fish→面板指定→两个新端点）、
`index.test.mjs` + `thumbs.test.mjs`（真实产物体检）、`vocab-fallback.test.mjs`（打包词表不许漂移）、
`client-bundle.test.mjs`（产物契约）。

浏览器半边的纪律：`src/client/**` 只能 import `react`、`@deepseek-ai/dsh-client-*` 和本包的
纯模块（`types.ts` / `protocol.ts` / `config.ts` / `derive.ts` / `search.ts`）。
**绝不能** import `schema.ts`（会把 schemastery 打进浏览器），这条由 `npm run check:client` 强制。

改客户端后要在 `/stats` 里核对 `client-apply` 回执里的 `build=`（`src/client/index.tsx` 顶部的
`CLIENT_BUILD`）——不然你看到的可能还是上一版 bundle。

## 已知局限

- 贴纸层依赖浏览器半边的**节点定义 API**（部署版 `@deepseek-ai/dsh-client-ui-conversation` 1.5-rc.1
  的 `ctx.uiConversation.events.register`）：CLI/headless 没有这个 surface，那里只有工具与路由
- 构建期依赖（rc.8）里注册表还叫 `ctx.conversationEvents`，所以客户端是**按运行时的名字**做的兼容
  （`src/client/node.tsx` 顶部有说明），不 import 那个包的类型
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
| `src/client/index.tsx` | 浏览器半边入口：最外层回执 + 样式 + 面板 + 挂件 + 贴纸层 |
| `src/client/node.tsx` | **贴纸层**：`ConversationNodeDefinition` + keyed 渲染器（两阶段、锚点、动画、可观测回执；`jev` 模式下异步取一次宿主的结论） |
| `src/client/vocab.ts` | 词表来源：优先 `/vocab`，兜底打包词表 |
| `src/client/pet.tsx` | 常驻挂件（点击换图 / 拖拽 / 悬停工具 / 收起成小圆点） |
| `src/client/jevpanel.tsx` | **JEV 调试浮层**（可开关）：小胶囊 ↔ 面板；每次真实往返的请求与响应；只在展开时轮询 |
| `src/client/panel.tsx` / `api.ts` / `styles.ts` | 折叠卡片、同源数据通道、面板 CSS |
| `scripts/import-assets.mjs` | 压素材 + 缩略图 + `index.json`（零依赖，只要 ffmpeg） |
| `scripts/build-client-vocab.mjs` | 从 `index.json` 生成客户端打包词表 |
| `scripts/sticker-map.json` | 128 条语义 → id/tags/aliases（人工可改） |
| `scripts/probe-report.mjs` | 读 `/stats` 把客户端回执读成人话 |
| `scripts/check-client-purity.mjs` | 客户端 bundle 纯净化门禁 |
| `tsdown.config.ts` | 客户端 bundle 构建（CJS closure + 平台模块 external） |

## 历史

v1.0 的贴纸是"宿主发事件 → 客户端轮询取走 → 抢 `turnTail` 座位渲染"，留下了一串事故：
渲染的是首帧静图（不会动）、尾巴座位被 `present` 交付卡片抢走、刷新即空、事件赶不上渲染。
复盘与证据都在 `docs/需求与方案-v1.0.md`（§12–§15），v2.0 的重做理由与探针记录在
`docs/需求与方案-v2.0-贴纸层.md`。

v2.1 加了 **JEV 模式**（`autoMode=jev`）：把"每 N 轮哈希随机一张"换成"按语境判情绪族、族内由代码选张"，
并让"这轮不贴"第一次成为合法选项。为什么是"先判族再选张"、以及缓存/回落/隐私怎么落的，
都写在 `docs/需求与方案-v2.1-JEV贴纸决策.md`。
