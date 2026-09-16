# dsh-memes-reply

让 DSH 在回复里贴一张**会动的**蓝色大肥鱼表情包。素材经插件自有 HTTP 路由直出，保留动画（**动画 WebP，默认保留全部帧**）。

- 模型按语境用一个工具挑图，**一轮最多一张**（硬性拦在工具层，不指望模型自觉）
- 素材不进系统提示词：157 张全在 `index.json` 里，靠关键词/中文标签检索
- 不动任何既有 UI：图片用 markdown 内联进回复正文，流式打字期间就能看到
- **原生风格的配置面板**（设置 → 插件 → 可配置）：实时状态行 + 12 个配置字段 + 素材预览墙，"点一张＝下一轮贴它"
- **常驻挂件**：页面上**一直**有一只大肥鱼（点一下换一张、可拖、可收成小圆点）——随时能看到
- **自动贴纸（B-auto）**：模型没贴时，按规则**不问模型**也补一张（关键词命中 / 每 N 轮），出现在输入框上方
- 一键关掉：面板总开关 + `/fish off` 本会话静音

## 安装

```bash
# 1) 装进 web profile（会把包加进依赖与 bundle 层）
dsh plugin --profile web add "link:D:\developing\DSH-plugin\dsh-memes-reply"

# 2) 生成压缩素材与缩略图（首次必做；同时写 ~/.dsh 与包内 assets/）
node scripts/import-assets.mjs --format webp --also-package --thumbs

# 3) 重启 dsh web（bundle 层与客户端脚本清单都在启动时读取）
```

`dsh --profile web --dump-config` 里能看到 `id: memes-reply` 就说明装对了。
装好后 `node test/live-probe.mjs` 会一次性把客户端 bundle、贴纸字节、缩略图、清单、
「下一轮用这张」与状态行全部打一遍。

## 配置面板

位置：**设置 → 插件 → 可配置**（和 `dsh-hmm-wait` 并排）。形态对齐原版折叠卡片
（标题 + 描述 + 未保存徽章 + chevron → 展开体 → 底部 丢弃/保存），全部用 `--dsw-alias-*` 主题变量。

| 区域 | 内容 |
| --- | --- |
| 状态行 | 素材张数 / 格式 / 总体积 / 已服务次数 / 生效的 `index.json` 路径（12 秒轮询 + 手动刷新） |
| 字段 | 总开关、呈现形态、画质来源、压缩副本目录、原图目录、冷却轮数；每个字段右侧「默认」＝清掉该字段的覆盖（官方 `scope.unset`） |
| 预览墙 | 12 格缩略图（静态首帧，均值 7 KB）＋「换一批」；点一张即 `POST /latch` 设为下一轮指定，并加载全尺寸动画确认 |
| 底部 | 换一批 · 取消指定 · 丢弃 · 保存 |

配置字段走官方 `ctx.settingsScope`（草稿→保存，revision 冲突自带恢复），落盘到
`~/.dsh/settings.yaml` 的 `dsh-memes-reply:` 段；状态行/预览墙/指定走插件自己的同源路由。

## 用法

| 入口 | 说明 |
| --- | --- |
| 工具 `use_sticker(mood, id?)` | 模型自己调：`mood` 是**2–4 字情绪词**（得意、翻车、摸鱼、bug、收工…）。`form=inline` 返回可粘进正文的 markdown；`form=sticker` 只回"已交给贴纸层"，正文零 URL |
| `/fish` | 状态 + 前 40 张清单 |
| `/fish list <关键词>` | 过滤清单 |
| `/fish on` \| `/fish off` | 本会话静音开关（状态持久在 `<DSH_HOME>/memes-reply/state.json`） |
| `/fish <id\|关键词>` | 给**下一轮**指定一张（一次性；优先于面板的全局指定） |
| `/fish mode inline\|sticker` | 本会话形态覆盖（sticker = 正文零 URL，模型挑的那张改走贴纸层） |
| 设置面板 | 状态行 + 12 个字段 + 预览墙 + 「下一轮用这张」（全局一次性指定） |

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

## 自动贴纸（B-auto）：不问模型也能贴

模型"用不用"是概率，你要的是确定性 —— 所以有第二条路：**host 自己判断，客户端自己画**。

| 环节 | 做法 |
| --- | --- |
| 输入 | host 观察 `llm/stream` 的 `text-delta`，攒下这一轮的助手正文（有上限，只用于扫词） |
| 决策 | **最后一步的流结束时**（这一步没调工具 ⇒ 正文已完整）就决策；`agent/turn-stopping` 只作兜底，且对同一轮幂等 |
| 传递 | 结果进"待取位"，客户端每 **0.8 秒**轮询 `/auto/pending`；拿到就放进落地仓（`src/store.ts`，按轮次索引） |
| 渲染 | `conversation.chat.turnTail` 上的**气泡角圆贴纸**（见下），点图看大图、`✕` 收起 |

### 为什么是"隐形轮询器 + 落地仓 + 链式座位"三件套

链式座位的 `select` 是**同步纯函数**（只拿得到 `{turn, seq, openFile}`，没有 `sessionId`，也不能异步），
所以自己发不了请求。于是拆成三件：

1. **隐形轮询器**（`conversation.input.dock`，渲染 `null`）：这个座位常驻且拿得到 `sessionId`，负责把待取位搬进仓；
2. **落地仓**（`src/store.ts`）：按 `turn` 索引 + 新鲜度 + 收起标记，`peek(turn)` 是纯查询（反复调用不会"消费"掉，否则贴纸会闪一下就没）；
3. **链式座位**（`conversation.chat.turnTail`，`priority: 10`）：`select` 同步查仓，有就接下渲染，没有就让位。

`autoMode` 三档：

- `keyword`（默认）：**整词命中**某个标签/别名才贴（"修好了"→ Bug、"收工"→ 庆祝）。不看整段文本打分，而是反向扫 157 条的关键词表，命中最长的那个词。
- `every`：每 N 轮必贴一张（`autoEveryTurns`，确定性挑图：`hash(会话:轮次)`，可复现）。
- `off`：只由模型决定。

三道闸门（任一命中就不补），避免"两条路同时贴"：

1. 模型这一轮已经贴过（同一轮最多一张这条纪律对两条路径都成立）；
2. 本会话被 `/fish off` 静音；
3. 命中的贴纸在最近用过列表里（**与手动贴纸共享冷却**）。

代价与取舍：

- 轮询 0.8 秒一次本地 JSON（`autoMode=off` 时响应只有几十字节）；
- `turnTail` 是**竞争性**链，我用 `priority: 10` 排在 `present` 交付卡片（`priority: 0`）**之后**：
  **有交付卡片的回合不显示贴纸**，但交付卡片本身完全正常 —— 这是刻意的让位，不是 bug；
- 链的 ownerProps 里没有 `sessionId`，组件里用 `matched.sessionId === props.sessionId` **再核对一次**；
  万一误判，失败模式只是"这一回合不显示"。

### 绑定：为什么按 `seq` 而不是按轮次号

真事故（trace 实证，2026-09-16）：

```
21:52:01  host:publish      turn=22  id=tanhao       ← host 认为这是第 22 轮
21:52:02  client:poll-event turn=22  id=tanhao       ← 事件已正确送达
21:52:05  client:select     turn=20  miss            ← 客户端来问的是第 20 轮
```

host 的轮次号来自 `agent/pre-step`（agent 计数器），客户端的来自 `TurnLocation.turn`
（会话事件计数器）—— **同一时刻差 2，而且差值会漂移**。所以"按轮次号对齐"这条路本身不成立
（我最初写的 ±1 兜底只是碰运气）。

改用 `ownerProps.seq`（该轮 `finalNode` 的会话序号，**单调递增、跨编号体系稳定**）：

| 步骤 | 规则 |
| --- | --- |
| 事件到达 | 记下"已见过的最大 seq"作为**水线** |
| selector 判定 | 本轮已认领过 → 稳定返回；编号恰巧一致 → 直接命中；否则**第一条 seq 越过水线的尾巴**接手 |
| 页面刚加载就收到事件 | 水线还是 0 → 用**第一条**渲染的尾巴立基线，不接手（否则历史上最旧的那一轮会抢走它） |
| 组件挂载 | `claim(turn)` 把待绑定那张搬到本轮，之后本轮稳定返回、别的轮次再也拿不走 |
| 保留时长 | 客户端仓 30 分钟（比 host 投递 TTL 长得多）：`every` 在轮次开始就发布，而长回合可能跑十几分钟 |

> 备选 `conversation.chat.assistant-actions` 看着更合适（**list** 加法型、还给 `messageId`），
> 但被否掉了：`data-actions-reveal=hover` 的 CSS 只命中 `.actions` 容器，而 `extraActions`
> 渲染在它**内部** —— 贴纸会跟着图标行在**旧回合**一起被 hover 隐藏。尾巴链的内容是它的
> **兄弟节点**，不受影响。

### 时序：为什么 `every` 模式在"轮次开始"就发布

链式座位的 `select` 是**渲染期同步判定**，而轮询是 800ms 一次 —— 如果等到"流结束"才发布，
渲染那一刻仓里大概率还是空的（发布到渲染的窗口只有几十毫秒），**约 94% 的回合必然 miss**，
而且那个节点之后不会再重渲染。所以：

| 模式 | 发布时机 | 理由 |
| --- | --- | --- |
| `every` | **`agent/pre-step`（轮次开始）** | 不需要正文，越早越稳：事件必然先于尾巴节点渲染进仓 |
| `keyword` | 最后一步的流结束 | 需要正文；仍有极小概率赶不上，此时下一轮的 ±1 兜底会把它补上（晚一轮显示） |
| 模型 `form=sticker` | 工具调用时 | 更早，天然安全 |

另外修掉两个"会静默不出图"的坑：

- **游标跨进程失效**：重启后 host 的 `seq` 归零，而浏览器里的旧游标还停在上一进程的值 →
  `event.seq <= since` 会把事件**永久**过滤掉。现在 `pending` 会把"超前"的游标夹回 0。
- **坏轮次号**：`every` 模式下 `turn` 缺失时 `NaN % 1 !== 0` → 永远不发布且零报错。
  现在轮次号/间隔非法一律按 `1` 处理（宁可按规则贴一张，也不要静默不贴）。

### 出问题时怎么查（`/stats.trace`）

这条链有四个环节：host 决策 → 待取位 → 客户端轮询 → 链式座位渲染。任何一环静默失败都表现为
"什么都没出现"。所以两端都把关键动作写进同一个**内存环形缓冲**（最新 48 条，不落盘），
`GET /api/dsh-memes-reply/stats` 的 `trace` 字段一次读全：

| 谁记的 | kind | 说明 |
| --- | --- | --- |
| host | `host:tap-installed` / `host:tap-no-session` | 模型流观察者挂上了吗 / 请求里没带 sessionId |
| host | `host:final-step` | 最后一步（没调工具）→ 该决策了 |
| host | `host:turn-stopping` | 兜底路径触发 |
| host | `host:bail` | **为什么没贴**（总开关 / autoMode=off / 本轮已贴 / 静音 / 模型已贴 / 索引缺失 / 没选中） |
| host | `host:publish` | 已发布（带 id 与 reason） |
| 浏览器 | `client:poller-mount` | 隐形轮询器挂上了（带它拿到的 `sessionId`） |
| 浏览器 | `client:poll-alive` | 心跳（`ticks`/`since`）→ 证明真的在轮询 |
| 浏览器 | `client:poll-failed` / `client:poll-event` | 请求失败 / 收到事件（带 `response.turn`） |
| 浏览器 | `client:select` | 链式选择器判定（`hit:<id>` / `miss`，带 owner 的轮次号） |
| 浏览器 | `client:bubble-mount` | 气泡组件真的挂载了（带 `event.turn`） |

对照 `client:select` 的 `turn` 与 `host:publish` 的 `turn`，就能立刻看出"两侧轮次号是否一致"。

> 顺带修掉一个真会静默失效的 bug：`every` 模式下若轮次号缺失，`NaN % 1 !== 0` 会永远不发布、
> 且没有任何报错。现在轮次号/间隔非法时按 `1` 处理（宁可按规则贴一张，也不要静默不贴），
> 并有回归测试钉住。

## 为什么自己写路由

官方 `/api/file` 是给"正文里显示本地文件"准备的，但它 `Cache-Control: private, no-store`、无 Range、且带连接服务鉴权；贴纸动辄几百 KB 到 3 MB，靠它会每次渲染重下。自带路由可以：

- `ETag`（素材 sha256）+ `Cache-Control: private, max-age=31536000, immutable` → 同一张只下载一次
- 只接受回环 Host，不发任何 CORS 头（与 `dsh-showme-html` 同款围栏）
- id 走白名单正则（`^[a-z0-9][a-z0-9-]{0,39}$`），**不存在路径穿越面**

也**没有**走 DSH 附件流水线：那条路会把 GIF 归一化成静态图（只留第一帧），鱼就不动了。

## 为什么别的会话不贴纸（以及怎么解决）

工具对**所有会话**都可用——扫全部会话日志可见：装好之后跑过的别的会话，请求里都带着
`use_sticker`（`ds-tts` 连续 6 轮都带着），但**一次都没调用过**。原因是它排在 71 个工具的目录末尾，
在正常写代码/查问题的流程里，模型没有理由去动一个"装饰性"工具；**可用 ≠ 会用**。

所以插件除了注册工具，还往系统提示里加**一行**（`ctx.systemPrompt.section()`，顺序锚在所有内置工具
说明之后）：

> 情绪合适时（问题修好、踩了坑、夸一句、任务收工）可以用 use_sticker 贴一张大肥鱼；一轮最多一张，用户说不要图时别贴。

- 只在 **工具真的注册了 + 总开关开着 + 本会话没被 `/fish off` 静音** 时输出，否则输出空串（0 token）；
- 约 60 token/请求；把总开关关掉就全省掉；
- 想要**确定性**（每条回复都有图、完全不问模型）得靠 M2 的客户端贴纸层，那是另一条路。

## 素材与画质

原图 460 MB / 500×500 / **50fps**。50fps 对卡通贴纸是浪费，但既然选了"保留全部帧"，压缩就只动尺寸与质量：

| 档 | 参数（动画 WebP） |
| --- | --- |
| 1–3 | 320px · q60 / q50 / q40 |
| 4 | 280px · q40 |
| 5 | 240px · q35 |
| 6 | 200px · q30 |

320px 是前端 markdown 图片的满尺寸显示上限（CSS `width:auto; max-width:100%`），再大纯属浪费。

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

### 词的纪律（踩过两次）

**凡是展示给模型看的词，都必须能被自己的检索器命中**：工具描述里的例子、系统提示里的场景短语、
失败文案里建议的重试词——全都有回归测试盯着。
踩过的两次：描述里写「得意」却检索不到；提示里写「任务收工」导致模型传「扒源码收工」也检索不到。

检索器对中文是容忍的：`修好了`→`修好`、`踩了坑`→`踩坑`、`扒源码收工`→（含）`收工` 都能落到图上，
而 ≤2 字的短查询（`点赞`、`哭`）行为不变。匹配不上时工具会**明说可以重试**并给出保证命中的词；
设置里的「兜底贴纸」（默认关）能让它无论如何都贴一张，并如实标注是兜底。

查"最近到底有没有人用上"：

```bash
node scripts/scan-sticker-usage.mjs           # 每个会话：提示是否进请求 / 工具是否可用 / 是否真调用 / 出了几张图
```

## 开发

```bash
npm run typecheck          # tsc --noEmit（host + client 全量）
npm run build              # tsc 出 host（lib/*.js + d.ts）→ tsdown 出客户端 bundle（lib/client.js）
npm run check:client       # 客户端 bundle 纯净化检查（宿主依赖不得进浏览器）
npm test                   # 先 build + 纯洁检查，再跑 53 个测试
node test/live-probe.mjs   # 对正在运行的 GUI 打活体探针（bundle/字节/304/缩略图/清单/latch/状态行）
```

测试分四类：`route.test.mjs`（路由分支：字节/缩略图/清单/latch/围栏）、`search.test.mjs`（检索，含
"工具描述里的示例词必须命中"的回归）、`apply.test.mjs`（桩服务跑 `apply()`，串通"工具→URL→字节→
限额→/fish→面板指定"）、`index.test.mjs` + `thumbs.test.mjs`（真实产物体检）、`client-bundle.test.mjs`（产物契约）。

浏览器半边的纪律：`src/client/**` 只能 import `react`、`@deepseek-ai/dsh-client-*` 和本包的
`types.ts`/`protocol.ts`/`config.ts`。**绝不能** import `schema.ts`（会把 schemastery 打进浏览器），
这条由 `npm run check:client` 强制。

## 已知局限

- **形态 B 已实现**：`form=sticker` 时模型挑的那张走贴纸层（正文零 URL），另有 B-auto 的自动贴纸
- 配置面板只在 **Web GUI** 存在（Electron/CLI 没有这个 surface），不影响 host 侧功能
- 预览墙依赖缩略图：没跑过 `--thumbs` 时该格降级成名字 chip（不会破图）
- 动画 WebP 需要现代浏览器（Chrome/Edge/Firefox，Safari 14+）；老浏览器只会显示第一帧
- 图片只在 Web GUI 有意义：CLI/headless 场景里 markdown 只是文本，URL 会变成噪音
- 路由无 Range：图片是整文件读（单张 ≤16 MiB 上限）；WebP 本身已压缩，不做 gzip
- 素材字节走 `ctx.fs`：会话处于受限沙箱模式时读取可能被拒，此时工具**不产出 URL**（宁可让模型换一张，也不出破图）
- 原图目录是可选项：`quality=original` 需要自己填 `originalRoot`，否则静默回落压缩副本
- `POST /latch` 没有鉴权（本机任意页面可调）：只影响"下一轮贴哪张"，且有回环围栏 + 不发 CORS 头 + id 白名单

## 文件地图

| 路径 | 作用 |
| --- | --- |
| `src/index.ts` | host 装配：路由 + 工具 + 命令 + 设置 + 轮次观察者 |
| `src/route.ts` | 七条端点：`/sticker`、`/thumb`、`/catalog`、`/latch`、`/auto/pending`、`/pet`、`/stats`（回环围栏、ETag/304） |
| `src/tool.ts` | `use_sticker`：选图（会话指定 > 面板指定 > id > 检索）、每轮限额、形态分支 |
| `src/assets.ts` | 索引加载与三根解析（原图 → assetRoot → 包内 assets；缩略图同理） |
| `src/search.ts` | 关键词检索（纯函数，中文反向包含 + 同分按名字短优先） |
| `src/command.ts` | `/fish` |
| `src/auto.ts` | 自动贴纸引擎：文本缓冲、规则（keyword/every）、待取位、流观察者 + "最后一步"信号（纯函数可测） |
| `src/store.ts` | 贴纸落地仓（按轮次索引 + 新鲜度 + 收起标记），host 与浏览器共用、纯逻辑可单测 |
| `src/prompt.ts` | 系统提示里的一行"贴纸可用"提示（按开关/静音/工具是否注册动态输出） |
| `src/state.ts` / `src/schema.ts` / `src/config.ts` / `src/turn.ts` / `src/protocol.ts` / `src/types.ts` | 状态、设置 schema（含 schemastery）、纯常量、每轮账本、共享常量与类型 |
| `src/client/index.tsx` | 浏览器半边：注入样式 + 注册 `settings.plugin.item`、`shell.overlay`、`conversation.input.dock`、`conversation.chat.turnTail` |
| `src/client/pet.tsx` | 常驻挂件（点击换图 / 拖拽 / 悬停工具 / 收起成小圆点） |
| `src/client/bubble.tsx` | 气泡角圆贴纸（链式座位，让位交付卡片） |
| `src/client/poller.tsx` | 隐形轮询器（拿 sessionId 喂落地仓，渲染 null） |
| `src/client/panel.tsx` / `api.ts` / `auto.ts` / `styles.ts` | 折叠卡片、同源数据通道、轮询封装、主题变量 CSS |
| `scripts/import-assets.mjs` | 压素材 + 缩略图 + `index.json`（零依赖，只要 ffmpeg） |
| `scripts/sticker-map.json` | 128 条语义 → id/tags/aliases（人工可改） |
| `scripts/check-client-purity.mjs` | 客户端 bundle 纯净化门禁 |
| `tsdown.config.ts` | 客户端 bundle 构建（CJS closure + 平台模块 external） |
