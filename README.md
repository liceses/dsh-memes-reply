# dsh-memes-reply

让 DSH 在**每一条回复**右下角贴一张**会动的**蓝色大肥鱼表情包。

## v2.0：贴纸是"会话流里的一个节点"

贴纸不再是"宿主发事件、客户端抢座位渲染"的浮层，而是**会话事件的纯函数**：
一轮 = 一个节点，跟着那条回复走 —— 向上滚回历史能看到、刷新页面还在、每个会话各是各的。
生成中先显示「思考中 / 打字中」，回复写完的瞬间**同一个节点**换成这一轮的最终贴纸。

- **每回合一张**，不用模型操心（`autoMode=every` 时每轮必贴；模型也可以用 `use_sticker` 点名要哪张）
- **两阶段**：生成中 = 占位表情 → 落定 = 最终贴纸（结构性替换，不是遮住）
- **会动**：永远加载全尺寸动画 WebP，不走首帧缩略图
- **零日志污染**：不往 session log 写自定义事件（那会让日志在别的构建里"拒绝解释"，见下）
- **原生风格的配置面板**（设置 → 插件 → 可配置）：状态行 + 18 个字段 + 素材预览墙
- **常驻挂件**：页面上**一直**有一只大肥鱼（点一下换一张、可拖、可收成小圆点）——随时能看到
- 一键关掉：面板总开关 + `/fish off` 本会话静音

### 它长在哪（三个座位）

| 面 | 座位 | 说明 |
| --- | --- | --- |
| 贴纸层（主线） | keyed `conversation.chat.node` + 自定义 `ConversationNodeDefinition` | 一轮一个节点；`anchorSeq` = 收尾回复的 seq + 0.1，正好落在回复下面、操作行上面 |
| 常驻挂件 | `shell.overlay`（加法型，frame-wide） | "随时能看到"是硬需求，与"这条回复的贴纸"是两个职责 |
| 设置面板 | `settings.plugin.item`（key = 命名空间） | 官方折叠卡片风格 |

### 为什么不用自定义会话事件

最"正统"的写法是像官方 `present` 工具那样把决定 `session.append('memes-reply/sticker', …)` 写进日志。
**这条路对本插件是危险的**：`Session.append()` 没有任何渠道设置 `ignorable` 标记，而持久化读取的规则是
"未知类型且未标记 `ignorable` → **拒绝解释整个日志**"，且已知类型表是**仓库内生成**的静态表、
下游插件类型按构造就不在里面。写自定义事件 = 让用户的历史会话变成打不开。

所以 v2.0 只**读**会话事件：决定完全是 `(会话, 轮次, 收尾正文, 模型的工具实参, 宿主开关)` 的纯函数
（`src/derive.ts`，host 与浏览器共用同一份实现），可重放、无竞态、零污染。

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
`/vocab`、`/session-state`、「下一轮用这张」与状态行全部打一遍。

> **改了 host 半区必须重启 `dsh web`**（路由是启动时注册的）；只改浏览器半边则刷新页面即可。
> 客户端贴纸层为此带了一份**打包词表兜底**：宿主没重启（`/vocab` 还是 404）时它照样工作。

## 用法

| 入口 | 说明 |
| --- | --- |
| （默认） | `autoMode=every` 时**每回合一张**，什么都不用做 |
| 工具 `use_sticker(mood, id?)` | 模型点名要哪张：`mood` 是**2–4 字情绪词**（得意、翻车、摸鱼、bug、收工…）。工具**只回 id/name**，不产出任何 URL —— 渲染由贴纸层负责 |
| `/fish` | 状态 + 前 40 张清单 |
| `/fish list <关键词>` | 过滤清单 |
| `/fish on` \| `/fish off` | 本会话静音开关（状态持久在 `<DSH_HOME>/memes-reply/state.json`） |
| `/fish <id\|关键词>` | 给**下一轮**指定一张（一次性；优先于面板的全局指定） |
| 设置面板 | 状态行 + 18 个字段 + 预览墙 + 「下一轮用这张」（全局一次性指定） |

## 配置面板

位置：**设置 → 插件 → 可配置**（和 `dsh-hmm-wait` 并排）。形态对齐原版折叠卡片
（标题 + 描述 + 未保存徽章 + chevron → 展开体 → 底部 丢弃/保存），全部用 `--dsw-alias-*` 主题变量。

| 区域 | 内容 |
| --- | --- |
| 状态行 | 素材张数 / 格式 / 总体积 / 已服务次数 / 生效的 `index.json` 路径（12 秒轮询 + 手动刷新） |
| 字段 | 总开关、画质来源、压缩副本目录、原图目录、冷却轮数、兜底贴纸、规则（off/keyword/every）、间隔轮数、挂件三件（开关/大小/停靠角）、外观（形状/圆角/边框粗细/样式/颜色）、贴纸大小与上移量 |
| 预览墙 | 12 格缩略图（静态首帧，均值 7 KB）＋「换一批」；点一张即 `POST /latch` 设为下一轮指定，并加载全尺寸动画确认 |
| 底部 | 换一批 · 取消指定 · 丢弃 · 保存 |

配置字段走官方 `ctx.settingsScope`（草稿→保存，revision 冲突自带恢复），落盘到
`~/.dsh/settings.yaml` 的 `dsh-memes-reply:` 段；状态行/预览墙/指定走插件自己的同源路由。
面板里改的规则（`autoMode` / 间隔 / 兜底 / 冷却）由**浏览器半边直接读设置**生效，不需要重启。

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
| 落定 | `turn/end` 后 `phase=settled` → 按优先级派生：会话/面板指定 > 模型点名 > 规则（keyword/every）> 兜底 |
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

## 开发

```bash
npm run typecheck          # tsc --noEmit（host + client 全量）
npm run build              # 生成打包词表 → tsc 出 host（lib/*.js + d.ts）→ tsdown 出客户端 bundle
npm run check:client       # 客户端 bundle 纯净化检查（宿主依赖不得进浏览器）
npm test                   # 先 build + 纯洁检查，再跑 62 个测试
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

## 文件地图

| 路径 | 作用 |
| --- | --- |
| `src/index.ts` | host 装配：路由（含 `/vocab` `/session-state`）+ 工具 + 命令 + 设置 |
| `src/route.ts` | 九条端点：`/sticker`、`/thumb`、`/catalog`、`/vocab`、`/session-state`、`/latch`、`/layout`、`/stats`、`/debug`（回环围栏、ETag/304） |
| `src/derive.ts` | **v2.0 核心**：派生优先级与确定性（host 与浏览器共用） |
| `src/auto.ts` | 三条规则的纯逻辑（keyword / every / off） |
| `src/search.ts` | 关键词检索（纯函数，中文反向包含 + 同分按名字短优先） |
| `src/tool.ts` | `use_sticker`：点名校验 + 维护宿主开关（静音/指定/冷却） |
| `src/command.ts` | `/fish` |
| `src/assets.ts` | 索引加载与三根解析（原图 → assetRoot → 包内 assets；缩略图同理） |
| `src/prompt.ts` | 系统提示里的一行"贴纸可用"提示（按开关/静音/工具是否注册动态输出） |
| `src/state.ts` / `src/schema.ts` / `src/config.ts` / `src/protocol.ts` / `src/types.ts` / `src/theme.ts` | 状态、设置 schema、纯常量、共享协议、类型、外观变量 |
| `src/client/index.tsx` | 浏览器半边入口：最外层回执 + 样式 + 面板 + 挂件 + 贴纸层 |
| `src/client/node.tsx` | **贴纸层**：`ConversationNodeDefinition` + keyed 渲染器（两阶段、锚点、动画、可观测回执） |
| `src/client/vocab.ts` | 词表来源：优先 `/vocab`，兜底打包词表 |
| `src/client/pet.tsx` | 常驻挂件（点击换图 / 拖拽 / 悬停工具 / 收起成小圆点） |
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
