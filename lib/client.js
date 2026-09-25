window.__ModuleLoader__.load({
	id: "dsh-memes-reply",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/vendor/dsh-plugin-config-slot.tsx
		/**
		* 内置副本 —— 源在 workspace 的 `dsh-plugin-config-slot/src/index.tsx`
		* （dsh 0.1.6a2 统一插件管理下「插件自带配置面板」的注册适配层）。
		* 每个插件仓库自持一份，是为了让仓库能独立 clone + 构建。
		* 不要在这里改功能：改源，然后跑
		*   node dsh-plugin-config-slot/scripts/vendor.mjs
		* 重新生成（加 `--check` 只校验）。
		*/
		/**
		* dsh-plugin-config-slot — dsh 0.1.6a2 统一插件管理下的「插件自带配置面板」注册适配层。
		*
		* ## 为什么需要这一层
		*
		* 0.1.6a2 把插件管理统一到了新的 Plugins 页面
		* （`@deepseek-ai/dsh-client-ui-plugin-manager`，侧栏「插件」入口；宿主侧是
		* `@deepseek-ai/dsh-plugin-manager`）。插件配置面板不再挂在设置对话框里，
		* 而是改由插件管理页声明的三个槽位承载：
		*
		* | 槽位 | 种类 | 键 | 用途 |
		* | --- | --- | --- | --- |
		* | `plugins.item` | list | `id` + `order` + `label` | **官方**宿主平面配置页，列在「官方」分组 |
		* | `plugins.bundle.config` | keyed | 组合包 npm 包名 | 组合包自己的配置，画在它的页面上（描述与行之间） |
		* | `plugins.row.config` | keyed | `<包名>#<行 id>` | 某一行自己的配置页 |
		*
		* 旧的 `settings.plugin.item`（rc7 时代按 settings 命名空间键控的卡片槽）在
		* 0.1.6a2 已**不存在**。旧写法
		*
		* ```ts
		* ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({ … }, Card))
		* ```
		*
		* 在新机制下槽位永不出现，`inject` 回调永不触发，注册无声消失 —— 于是配置面板
		* 「点了没反应、也不报错、界面空白」。这就是升级后全部失效的根因。
		*
		* 第三方组合包（其 `cordis.patch.yml` 声明了行）对应的是
		* `plugins.bundle.config`：配置画在组合包自己的页面上，打开路径为
		* 侧栏「插件」→「已安装」→「查看 <包名>」。
		*
		* ## 这一层做什么
		*
		* 1. 用 `plugins.bundle.config` + 组合包 npm 包名这一个**正确入口**注册；
		* 2. 按新契约分发 owner props 的 `view`（`summary` = 标题下的一句话简介，
		*    `page` = 带自己保存控件的表单）；
		* 3. 边界：命名空间未由 Host 提供时给出明确提示（而不是空白）；
		*    没有可配置项时给出空态（而不是报错）；配置缺失 / 为空由插件自己的表单
		*    合并默认值（本层不碰字段语义）；
		* 4. 不重写任何插件的表单 —— 表单原样复用，本层只做注册与外壳。
		*
		* 依赖只有 `react`，且作为**构建期依赖被内联**进各插件的浏览器半侧
		* （各插件的 tsdown 客户端构建把非平台模块全部内联），因此运行时不新增依赖，
		* 也不需要被装进 profile。
		*/
		/** `plugins.bundle.config`：组合包自己的配置页。 */
		const BUNDLE_CONFIG_SLOT = "plugins.bundle.config";
		/** 官方 `settings.plugins` 字典里 `unavailable` 的中文文案（保持一致观感）。 */
		const DEFAULT_UNAVAILABLE_TEXT = "该插件当前未加载，暂时无法配置。";
		/** 空配置态默认文案。 */
		const DEFAULT_EMPTY_TEXT = "该插件没有可配置项。";
		/** 样式标记，避免重复注入。 */
		const STYLE_MARK = "dsh-plugin-config-slot";
		/**
		* 页面外壳样式：只使用官方主题变量，观感与官方插件配置页
		* （`PluginConfigForm.module.css`）一致。
		*/
		const PAGE_CSS = [
			".dshpcs-page{display:flex;flex-direction:column}",
			".dshpcs-page ul{list-style:none;margin:0;padding:0}",
			".dshpcs-page li{list-style:none}",
			".dshpcs-notice{color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.9));margin:0 0 12px;font-size:12px;line-height:1.5}"
		].join("");
		/** 重复注册 / 重复注入的守卫。 */
		function injectPageStyles() {
			if (typeof document === "undefined") return;
			if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_MARK)}]`) !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = STYLE_MARK;
			tag.dataset.pluginCss = STYLE_MARK;
			tag.textContent = PAGE_CSS;
			document.head.appendChild(tag);
		}
		/** 读一次来源快照；来源缺失或读取抛错都归入不可达，绝不让面板崩掉。 */
		function readSnapshot(source) {
			if (source === void 0) return null;
			try {
				return source.getSnapshot();
			} catch {
				return UNAVAILABLE_SNAPSHOT;
			}
		}
		/** 读取失败时的固定快照引用（`useSyncExternalStore` 要求引用稳定）。 */
		const UNAVAILABLE_SNAPSHOT = Object.freeze({ status: "unavailable" });
		/** 快照是否表示「Host 没有为本页提供这个 settings 命名空间」。 */
		function isUnavailable(snapshot) {
			if (snapshot === null) return false;
			return snapshot.status === "unavailable" || snapshot.available === false;
		}
		/** 订阅一个设置来源（`useSyncExternalStore` 的 subscribe/getSnapshot 两侧）。 */
		function useConfigSnapshot(source) {
			const subscribe = (0, react.useCallback)((listener) => source === void 0 ? NOOP : source.subscribe(listener), [source]);
			const getSnapshot = (0, react.useCallback)(() => readSnapshot(source), [source]);
			return (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
		}
		/** 空订阅函数（来源缺省时）。 */
		const NOOP = () => {};
		/**
		* 把插件的配置表单注册进 0.1.6a2 插件管理页的 `plugins.bundle.config` 槽位。
		*
		* @param host - 插件浏览器半侧的上下文（只用它的 `slots`）。
		* @param options - 组合包包名、表单渲染器、可选的设置来源与注入面。
		* @returns 注销函数（跟随插件 fiber 生命周期调用即可）。
		*/
		function registerBundleConfigPage(host, options) {
			injectPageStyles();
			const emptyText = options.emptyText ?? DEFAULT_EMPTY_TEXT;
			const unavailableText = options.unavailableText ?? DEFAULT_UNAVAILABLE_TEXT;
			const { bundle, component, render, inject, source, summary, unavailableHint } = options;
			const hasBody = component !== void 0 || render !== void 0;
			/**
			* 条目组件：官方插件管理页会以 `view: 'summary'` 与 `view: 'page'` 各渲染一次。
			* `hooks` 在任何分支之前调用，保证 render 之间 hook 顺序稳定。
			*/
			const BundleConfigPage = (props) => {
				const snapshot = useConfigSnapshot(source);
				if (props.view === "summary") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: summary ?? "" });
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dshpcs-page",
					"data-plugin-config-page": bundle,
					children: [isUnavailable(snapshot) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "dshpcs-notice",
						role: "status",
						children: [unavailableText, unavailableHint === void 0 ? "" : ` ${unavailableHint}`]
					}) : null, !hasBody ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dshpcs-notice",
						role: "status",
						children: emptyText
					}) : component !== void 0 ? (0, react.createElement)(component, props) : render?.(props)]
				});
			};
			return host.slots.inject(BUNDLE_CONFIG_SLOT, () => host.slots.register({
				name: BUNDLE_CONFIG_SLOT,
				key: bundle,
				...inject === void 0 ? {} : { inject }
			}, BundleConfigPage));
		}
		//#endregion
		//#region src/protocol.ts
		/**
		* dsh-memes-reply — 路由与协议常量。
		*
		* 全部放在这里，是为了让 host 与（M2 的）client 用同一份字符串常量，
		* 不出现"两边各自写死一个路径"的漂移。
		*/
		/** 本插件占用的路由前缀（webServer 前缀路由）。 */
		const ROUTE_PREFIX = "/api/dsh-memes-reply";
		/** 贴纸字节端点：`<STICKER_PATH>/<id>.<ext>`。 */
		const STICKER_PATH = `${ROUTE_PREFIX}/sticker`;
		/** 素材清单端点（预览墙数据）。 */
		const CATALOG_PATH = `${ROUTE_PREFIX}/catalog`;
		/**
		* 检索词表端点（v2.0 客户端派生用）。
		*
		* 与 `/catalog` 的区别：这里是**全量**的精简词表（id/name/tags/aliases + 全尺寸 URL），
		* 一次拉取、只在客户端做关键词扫描用；`/catalog` 是分页+种子的预览墙数据。
		*/
		const VOCAB_PATH = `${ROUTE_PREFIX}/vocab`;
		/**
		* 会话态端点（静音 / 一次性指定 / 最近用过）。
		*
		* v2.0 把"贴哪张"的**算法**搬到了客户端（纯派生、刷新即重放），但"人按过的开关"
		* 仍然由宿主说了算：这个端点就是客户端读那三个字段的唯一入口。
		*/
		const SESSION_STATE_PATH = `${ROUTE_PREFIX}/session-state`;
		/** 「下一轮用这张」端点（设置面板写入）。 */
		const LATCH_PATH = `${ROUTE_PREFIX}/latch`;
		/**
		* JEV 取结论端点（`autoMode='jev'` 时客户端来取这一轮该贴哪张）。
		*
		* 为什么结论要绕宿主一圈：JEV 调用需要 API key，而客户端 bundle **绝不能**带 key。
		* 宿主按 `(sessionId, turn)` 缓存结论，客户端刷新只是重放，不会换一张。
		*/
		const JEV_PATH = `${ROUTE_PREFIX}/jev-pick`;
		/**
		* JEV 调试日志端点（漂浮面板读它）。
		*
		* 为什么与 `/stats` 分开：一份往返带请求原文与响应原文（裁剪后各约 1–4 KB），
		* 而 `/stats` 是 12 秒轮询的常客 —— 挂进去等于每次轮询都搬一堆没人看的 JSON。
		*/
		const JEV_LOG_PATH = `${ROUTE_PREFIX}/jev-log`;
		/** 界面落点（常驻挂件的拖拽坐标，客户端读写，落在 state.json）。 */
		const LAYOUT_PATH = `${ROUTE_PREFIX}/layout`;
		/** 诊断端点。 */
		const STATS_PATH = `${ROUTE_PREFIX}/stats`;
		/**
		* 诊断回执（客户端 → host，只进内存环形缓冲，不落盘）。
		* 存在的理由：浏览器控制台我看不到，而"贴纸到底走到哪一步断的"必须可观测。
		*/
		const DEBUG_PATH = `${ROUTE_PREFIX}/debug`;
		/** 设置命名空间。 */
		const SETTINGS_NS = "dsh-memes-reply";
		/** 从文件名取扩展名（小写，不含点）。 */
		function extensionOf(file) {
			const i = file.lastIndexOf(".");
			return i < 0 ? "" : file.slice(i + 1).toLowerCase();
		}
		//#endregion
		//#region src/theme.ts
		/** 数值夹取（设置面板可能被手改，schema 之外再兜一层）。 */
		function clampNumber(value, min, max, fallback) {
			const numeric = typeof value === "number" ? value : Number(value);
			if (!Number.isFinite(numeric)) return fallback;
			return Math.min(max, Math.max(min, Math.round(numeric)));
		}
		/** 边框颜色：空串 = 跟随主题强调色。 */
		function borderColorOf(config) {
			const raw = config.borderColor.trim();
			if (raw === "") return "var(--dsw-alias-brand-primary, #4c9aff)";
			return /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s]+\)|[a-zA-Z]+)$/.test(raw) ? raw : "var(--dsw-alias-brand-primary, #4c9aff)";
		}
		/** 边框样式：`none` 或 0 粗细都表示没有边框。 */
		function borderStyleOf(style, width) {
			if (style === "none" || width <= 0) return "none";
			return style === "dashed" ? "dashed" : "solid";
		}
		/** 常驻挂件仍是"组件 + 样式表"两段式：形状与边框由设置驱动。 */
		const PET_TARGETS = [".dsh-memes-reply-pet", ".dsh-memes-reply-pet-img"].join(", ");
		/** 生成设置驱动的 CSS 覆盖块（追加在基础样式之后）。 */
		function themeCss(config) {
			const shape = config.shape === "rounded" ? "rounded" : "circle";
			const radius = clampNumber(config.radius, 0, 64, 18);
			const width = clampNumber(config.borderWidth, 0, 8, 2);
			const radiusCss = shape === "circle" ? "50%" : `${radius}px`;
			return [
				`/* dsh-memes-reply: 设置驱动的外观（常驻挂件） */`,
				`${PET_TARGETS} { border-radius: ${radiusCss}; }`,
				`.dsh-memes-reply-pet { border-width: ${width}px; border-style: ${borderStyleOf(config.borderStyle, width)}; border-color: ${borderColorOf(config)}; }`
			].join("\n");
		}
		//#endregion
		//#region src/config.ts
		/** 配置默认值：`assetRoot` 留空表示"跟随默认目录"，避免把绝对路径写进设置文件。 */
		const DEFAULT_CONFIG = {
			enabled: true,
			quality: "compressed",
			assetRoot: "",
			originalRoot: "",
			cooldownTurns: 3,
			fallback: "",
			autoMode: "keyword",
			autoEveryTurns: 3,
			jevModel: "typesafe/jev-1.13",
			jevTimeoutMs: 4e3,
			jevPersona: "",
			jevDebugVisible: false,
			petVisible: true,
			petSize: 128,
			petCorner: "br",
			shape: "circle",
			radius: 18,
			borderWidth: 2,
			borderStyle: "solid",
			borderColor: "",
			bubbleSize: 96,
			bubbleRise: 40
		};
		/** 设置面板里字段的顺序（也决定保存 diff 的顺序）。 */
		const CONFIG_FIELDS = [
			"enabled",
			"quality",
			"assetRoot",
			"originalRoot",
			"cooldownTurns",
			"fallback",
			"autoMode",
			"autoEveryTurns",
			"jevModel",
			"jevTimeoutMs",
			"jevPersona",
			"jevDebugVisible",
			"petVisible",
			"petSize",
			"petCorner",
			"shape",
			"radius",
			"borderWidth",
			"borderStyle",
			"borderColor",
			"bubbleSize",
			"bubbleRise"
		];
		//#endregion
		//#region src/client/api.ts
		/**
		* dsh-memes-reply — 设置面板与贴纸层的数据通道（浏览器侧）。
		*
		* 一律走本插件自己的同源路由（已实测匿名可达），不需要任何私有 RPC：
		*   GET  /stats           状态行
		*   GET  /catalog         预览墙 / 挂件取图
		*   GET  /vocab           全量检索词表（v2.0 客户端派生）
		*   GET  /session-state   会话态（静音 / 一次性指定 / 最近用过）
		*   POST /latch           「下一轮用这张」
		*   GET/POST /pet         常驻挂件的位置与形态
		*/
		/** 一个同源 JSON GET；失败返回 undefined（面板降级显示，不抛）。 */
		async function getJson(path) {
			try {
				const response = await fetch(path, { headers: { accept: "application/json" } });
				if (!response.ok) return void 0;
				return await response.json();
			} catch {
				return;
			}
		}
		/** 状态行数据。 */
		function fetchStats() {
			return getJson(STATS_PATH);
		}
		/** 预览墙数据；`q` 非空时按关键词过滤。 */
		function fetchCatalog(limit, seed, q = "") {
			return getJson(`${CATALOG_PATH}?limit=${limit}&seed=${seed}${q === "" ? "" : `&q=${encodeURIComponent(q)}`}`);
		}
		/**
		* 全量检索词表（v2.0 客户端派生的唯一数据源）。
		*
		* 一次拉取、进程内缓存：词表只在重跑导入脚本时变，没必要每个回合都问一次。
		*/
		let vocabPromise = null;
		/** 取词表（带进程内缓存；失败返回 undefined，调用方降级）。 */
		function fetchVocab() {
			if (vocabPromise === null) vocabPromise = getJson(VOCAB_PATH).then((response) => {
				if (response === void 0 || response.ready !== true) vocabPromise = null;
				return response;
			});
			return vocabPromise;
		}
		/** 取一个会话的状态（静音/指定/冷却）；失败返回 undefined。 */
		function fetchSessionState(sessionId) {
			if (sessionId === "") return Promise.resolve(void 0);
			return getJson(`${SESSION_STATE_PATH}?sessionId=${encodeURIComponent(sessionId)}`);
		}
		/**
		* 设/清「下一轮用这张」。
		* @returns 生效后的 latch（null = 已清空）；失败返回 undefined。
		*/
		async function putLatch(id) {
			try {
				const response = await fetch(LATCH_PATH, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ id })
				});
				if (!response.ok) return void 0;
				const body = await response.json();
				if (body?.ok !== true) return void 0;
				return body.latch ?? null;
			} catch {
				return;
			}
		}
		/** 读落点（挂件位置/收起态/当前那张 + 兜底贴纸位置）。 */
		async function fetchLayout() {
			return getJson(LAYOUT_PATH);
		}
		/** 写落点（只传要改的字段）。 */
		async function putLayout(patch) {
			try {
				const response = await fetch(LAYOUT_PATH, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(patch)
				});
				if (!response.ok) return void 0;
				const body = await response.json();
				return body?.ok === true ? body : void 0;
			} catch {
				return;
			}
		}
		/**
		* 诊断回执：把客户端的关键动作回传 host（进内存环形缓冲，`/stats` 可读）。
		* 浏览器控制台开发者看不到，所以这条通道是"气泡为什么没出来"唯一可观测的办法。
		* 一律 fire-and-forget，失败静默 —— 诊断绝不能影响功能。
		*/ function postDebug(entry) {
			try {
				fetch(DEBUG_PATH, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(entry),
					keepalive: true
				}).catch(() => {});
			} catch {}
		}
		/**
		* 每个 `(会话, 轮次)` 只问宿主一次。
		*
		* 两层去重，理由不同：`done` 挡住"同一轮反复渲染"，`inflight` 挡住
		* "同一轮并发渲染各发一个请求"（React 严格模式下 effect 会跑两遍，这里必须扛住）。
		* **失败也记**：一个轮次最多一次尝试，别让一次网络抖动变成每帧重试的循环。
		*/
		const jevDone = /* @__PURE__ */ new Map();
		const jevInflight = /* @__PURE__ */ new Map();
		/** 取这一轮的 JEV 结论（宿主侧按 `(会话, 轮次)` 缓存，刷新即重放）。 */
		function fetchJevPick(input) {
			if (input.sessionId === "" || input.turn < 1) return Promise.resolve(void 0);
			const key = `${input.sessionId}:${input.turn}`;
			const settled = jevDone.get(key);
			if (settled !== void 0) return Promise.resolve(settled);
			const running = jevInflight.get(key);
			if (running !== void 0) return running;
			const promise = (async () => {
				try {
					const response = await fetch(JEV_PATH, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							sessionId: input.sessionId,
							turn: input.turn,
							text: input.text,
							...input.userText === void 0 || input.userText === "" ? {} : { userText: input.userText }
						})
					});
					if (!response.ok) return void 0;
					const body = await response.json();
					if (body === null || typeof body !== "object") return void 0;
					const answer = {
						...body,
						id: typeof body.id === "string" ? body.id : null
					};
					jevDone.set(key, answer);
					if (jevDone.size > 128) jevDone.clear();
					return answer;
				} catch {
					return;
				} finally {
					jevInflight.delete(key);
				}
			})();
			jevInflight.set(key, promise);
			return promise;
		}
		/** 读 JEV 调试日志（漂浮面板用）。 */
		function fetchJevLog(limit = 10) {
			return getJson(`${JEV_LOG_PATH}?limit=${limit}`);
		}
		//#endregion
		//#region src/client/jevpanel.tsx
		/**
		* dsh-memes-reply — JEV 调试漂浮面板（可开关）。
		*
		* 要回答的问题只有一个：**这一轮到底发给 JEV 什么、它回了什么。**
		* 宿主把每次真实往返记在 `/jev-log`（只记真发生过的调用，命中缓存不产生新条目），
		* 这里把它画出来：一枚可拖的小胶囊 ↔ 展开成面板。
		*
		* 座位与挂件同一个 `shell.overlay`（frame-wide、加法型、整层 click-through），
		* 所以只在面板本体范围内接管指针事件，不挡下面的界面。
		*
		* 三条纪律：
		*   1. **只在展开时轮询** —— 收起/关闭就不发请求，别为一个关着的面板每 2.5 秒吵一次宿主；
		*   2. **只读** —— 这里没有任何写操作（不重发、不改族表），排障工具不该能改变被观测的东西；
		*   3. 位置与收起态写回 `state.json`（`/layout` 的 `jevDebug` 槽），刷新后还在。
		*/
		/** 展开时的轮询间隔：够快看到"刚发的那次"，又不至于把宿主吵醒太频繁。 */
		const POLL_MS = 2500;
		/** 面板最多显示几条。 */
		const SHOW_LIMIT = 10;
		/** 默认落点：右上角，避开挂件（右下）与面板里的刷新按钮。 */
		const DEFAULT_POS = {
			right: 28,
			bottom: 0,
			top: 96
		};
		/** 拖拽判定阈值。 */
		const DRAG_SLOP$1 = 4;
		/** 夹取。 */
		function clamp$1(value, min, max) {
			return Math.min(max, Math.max(min, Math.round(value)));
		}
		/** 时间戳 → `HH:MM:SS`。 */
		function clock(at) {
			const date = new Date(at);
			const pad = (value) => String(value).padStart(2, "0");
			return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
		}
		/** 一次往返的状态徽章文案与语气。 */
		function badgeOf(entry) {
			if (!entry.ok) return {
				text: entry.error === "" ? "失败" : entry.error,
				tone: "bad"
			};
			if (!entry.stick) return {
				text: "判不贴",
				tone: "muted"
			};
			return {
				text: "成功",
				tone: "good"
			};
		}
		/** JSON 展示（拿不到就显式说明，不静默空白）。 */
		function pretty(value) {
			if (value === null || value === void 0) return "（没有）";
			try {
				return JSON.stringify(value, null, 2);
			} catch {
				return "（无法序列化）";
			}
		}
		/** 一条往返。 */
		function Row({ entry }) {
			const [open, setOpen] = (0, react.useState)(false);
			const badge = badgeOf(entry);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: "dsh-memes-reply-jev-item",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "dsh-memes-reply-jev-head",
					onClick: () => setOpen((value) => !value),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-memes-reply-jev-time",
							children: clock(entry.at)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `dsh-memes-reply-jev-badge dsh-memes-reply-jev-badge-${badge.tone}`,
							children: badge.text
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-memes-reply-jev-meta",
							children: [
								"#",
								entry.turn,
								" · ",
								entry.family,
								" · p=",
								entry.probability.toFixed(2),
								" · yes=",
								entry.yesProbability.toFixed(2),
								" ·",
								" ",
								entry.ms,
								"ms",
								entry.costUsd === null ? "" : ` · $${entry.costUsd.toFixed(6)}`
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-memes-reply-jev-caret",
							children: open ? "▾" : "▸"
						})
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-memes-reply-jev-body",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-jev-label",
							children: [
								"发给 JEV",
								entry.status === null ? "" : ` · HTTP ${entry.status}`,
								" · 模型 ",
								entry.model
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							className: "dsh-memes-reply-jev-pre",
							children: pretty(entry.request)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-jev-label",
							children: [
								"JEV 回",
								entry.error === "" ? "" : ` · 错误 ${entry.error}`,
								entry.note === "" ? "" : ` · ${entry.note}`
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							className: "dsh-memes-reply-jev-pre",
							children: pretty(entry.response)
						})
					]
				}) : null]
			});
		}
		/** JEV 调试漂浮面板。 */
		function JevDebugPanel({ scope }) {
			const snapshot = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => scope.subscribe(listener), [scope]), (0, react.useCallback)(() => scope.getSnapshot(), [scope]));
			const config = (0, react.useMemo)(() => ({
				...DEFAULT_CONFIG,
				...snapshot.value ?? {}
			}), [snapshot.value]);
			const [panel, setPanel] = (0, react.useState)({});
			const [log, setLog] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)("");
			const posRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)(null);
			const collapsed = panel.collapsed === true;
			/** 读回位置（刷新后还在）。 */
			(0, react.useEffect)(() => {
				let alive = true;
				(async () => {
					const saved = (await fetchLayout())?.jevDebug;
					if (!alive || saved === void 0) return;
					setPanel(saved);
					if (typeof saved.right === "number" && typeof saved.bottom === "number") posRef.current = {
						right: saved.right,
						bottom: saved.bottom
					};
				})();
				return () => {
					alive = false;
				};
			}, []);
			/** 只在展开时拉日志（收起即停，别为一个关着的面板一直吵宿主）。 */
			(0, react.useEffect)(() => {
				if (!config.jevDebugVisible || collapsed) return;
				let alive = true;
				const pull = async () => {
					const response = await fetchJevLog(SHOW_LIMIT);
					if (!alive) return;
					if (response === void 0) {
						setError("取不到日志（宿主路由不可达？）");
						return;
					}
					setError("");
					setLog(response);
				};
				pull();
				const handle = window.setInterval(() => void pull(), POLL_MS);
				return () => {
					alive = false;
					window.clearInterval(handle);
				};
			}, [config.jevDebugVisible, collapsed]);
			/**
			* 落点样式。
			*
			* 注意它必须待在下面那个 `if (!config.jevDebugVisible) return null` **之前**：
			* hook 不能在条件返回之后调用 —— 开关从关到开会让 hook 数量变化，React 会直接报错
			* （`test/client-bundle.test.mjs` 的"hooks 顺序门禁"盯着这条，实测会红）。
			*/
			const style = (0, react.useMemo)(() => {
				if (typeof panel.right === "number" && typeof panel.bottom === "number") return {
					right: panel.right,
					bottom: panel.bottom
				};
				return {
					right: DEFAULT_POS.right,
					top: DEFAULT_POS.top
				};
			}, [panel]);
			if (!config.jevDebugVisible) return null;
			const onPointerDown = (event) => {
				const element = event.currentTarget;
				element.setPointerCapture?.(event.pointerId);
				const rect = element.getBoundingClientRect();
				dragRef.current = {
					x: event.clientX,
					y: event.clientY,
					right: window.innerWidth - rect.right,
					bottom: window.innerHeight - rect.bottom,
					moved: false
				};
			};
			const onPointerMove = (event) => {
				const drag = dragRef.current;
				if (drag === null) return;
				const dx = event.clientX - drag.x;
				const dy = event.clientY - drag.y;
				if (!drag.moved && Math.abs(dx) < DRAG_SLOP$1 && Math.abs(dy) < DRAG_SLOP$1) return;
				drag.moved = true;
				const right = clamp$1(drag.right - dx, 4, Math.max(4, window.innerWidth - 80));
				const bottom = clamp$1(drag.bottom - dy, 4, Math.max(4, window.innerHeight - 40));
				posRef.current = {
					right,
					bottom
				};
				setPanel((previous) => ({
					...previous,
					right,
					bottom
				}));
			};
			const onPointerUp = (event) => {
				const drag = dragRef.current;
				dragRef.current = null;
				event.currentTarget.releasePointerCapture?.(event.pointerId);
				if (drag === null || !drag.moved) return;
				if (posRef.current !== null) putLayout({
					slot: "jevDebug",
					...posRef.current
				});
			};
			const setCollapsed = (next) => {
				setPanel((previous) => ({
					...previous,
					collapsed: next
				}));
				putLayout({
					slot: "jevDebug",
					collapsed: next
				});
			};
			const stats = log?.stats;
			const entries = log?.entries ?? [];
			if (collapsed) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-memes-reply-jev-layer",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "dsh-memes-reply-jev-chip",
					style,
					title: "展开 JEV 调试面板",
					onClick: () => setCollapsed(false),
					children: ["JEV", stats === void 0 ? "" : ` ${stats.calls}`]
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-memes-reply-jev-layer",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-memes-reply-jev-panel",
					style,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-jev-title",
							onPointerDown,
							onPointerMove,
							onPointerUp,
							onPointerCancel: onPointerUp,
							title: "拖动可移动",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "JEV 往返" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-memes-reply-jev-totals",
									children: stats === void 0 ? "（未取到 /jev-log）" : `调用 ${stats.calls} · 缓存 ${stats.hits} · 回落 ${stats.fallbacks} · $${stats.costUsd.toFixed(6)}`
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "dsh-memes-reply-jev-actions",
									onPointerDown: (event) => event.stopPropagation(),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dsh-memes-reply-jev-tool",
										title: "立即刷新",
										onClick: () => {
											(async () => {
												const response = await fetchJevLog(SHOW_LIMIT);
												if (response !== void 0) setLog(response);
											})();
										},
										children: "⟳"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dsh-memes-reply-jev-tool",
										title: "收成小胶囊（随时点它再展开）",
										onClick: () => setCollapsed(true),
										children: "—"
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-jev-hint",
							children: [
								"只记",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "真实" }),
								"调用，命中缓存不产生新条目。展开时每 ",
								POLL_MS / 1e3,
								"s 自动刷新。"
							]
						}),
						error === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-memes-reply-jev-error",
							children: error
						}),
						entries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-jev-empty",
							children: [
								"还没有真实调用。",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								"把设置里的「自动贴纸」改成 ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: "jev" }),
								"，然后随便聊一轮。"
							]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: "dsh-memes-reply-jev-list",
							children: entries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, { entry }, `${entry.at}-${entry.sessionId}-${entry.turn}`))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-jev-hint",
							children: [
								"最多留最近 ",
								log?.capacity ?? SHOW_LIMIT,
								" 次（内存里，不落盘）。请求与响应里的长文本已截断。"
							]
						})
					]
				})
			});
		}
		//#endregion
		//#region src/auto.ts
		/**
		* dsh-memes-reply — 贴纸规则（**纯逻辑**，host 与浏览器半边共用）。
		*
		* v2.0 起这里只剩"怎么选一张"：三条规则（off / keyword / every）与确定性哈希。
		* v1.0 的传输件（文本缓冲、llm/stream 观察者、待取位 `AutoBus`）已随"宿主发布 → 客户端轮询"
		* 那条链一起退役 —— 现在贴纸是会话事件的纯函数（见 `derive.ts` 与 `client/node.tsx`）。
		*/
		/**
		* 关键词模式：在**助手文本里扫已知词汇**，命中最具体（最长）的那个。
		*
		* 注意不能把整段文本当 query 丢给 `searchStickers`：中文长段落会被切成一堆二字组合，
		* 既慢又糊。这里反向扫——157 条 × 每个 8 个词，对 ≤8KB 文本做 includes，
		* 简单、确定、可测；只认长度 ≥2 的词，单字不参与（误命中太多）。
		*/
		function pickByKeyword(entries, text, avoid) {
			const haystack = text.toLowerCase();
			if (haystack.trim() === "") return null;
			let best = null;
			for (const entry of entries) {
				if (avoid.has(entry.id)) continue;
				let bestTerm = "";
				for (const raw of [
					entry.name,
					...entry.tags,
					...entry.aliases
				]) {
					const term = raw.trim().toLowerCase();
					if (term.length < 2) continue;
					if (!haystack.includes(term)) continue;
					if (term.length > bestTerm.length) bestTerm = term;
				}
				if (bestTerm === "") continue;
				const score = bestTerm.length * 10 + (entry.tags.some((tag) => tag.toLowerCase() === bestTerm) ? 5 : 0);
				if (best === null || score > best.score) best = {
					entry,
					matched: bestTerm,
					score
				};
			}
			return best === null ? null : {
				entry: best.entry,
				reason: "keyword",
				matched: best.matched
			};
		}
		/** 确定性哈希：同一个 (会话, 轮次) 永远选出同一张，便于复现与测试。 */
		function hash(text) {
			let value = 2166136261;
			for (let i = 0; i < text.length; i++) {
				value ^= text.charCodeAt(i);
				value = Math.imul(value, 16777619);
			}
			return value >>> 0;
		}
		/** 「每 N 轮」模式：确定性挑一张没用过的。 */
		function pickEvery(entries, sessionId, turn, avoid) {
			const pool = entries.filter((entry) => !avoid.has(entry.id));
			const candidates = pool.length > 0 ? pool : entries;
			if (candidates.length === 0) return null;
			const chosen = candidates[hash(`${sessionId}:${turn}`) % candidates.length];
			return chosen === void 0 ? null : {
				entry: chosen,
				reason: "every",
				matched: ""
			};
		}
		/** 规则入口：按模式决定贴不贴。 */
		function pickAutoSticker(input) {
			if (input.mode === "off") return null;
			if (input.entries.length === 0) return null;
			if (input.mode === "keyword") return pickByKeyword(input.entries, input.text, input.avoid);
			if (input.mode === "jev") return null;
			const rawEvery = Math.trunc(Number(input.everyTurns));
			const every = Number.isFinite(rawEvery) && rawEvery >= 1 ? rawEvery : 1;
			const rawTurn = Math.trunc(Number(input.turn));
			const turn = Number.isFinite(rawTurn) && rawTurn >= 1 ? rawTurn : 1;
			if (turn % every !== 0) return null;
			return pickEvery(input.entries, input.sessionId, turn, input.avoid);
		}
		//#endregion
		//#region src/search.ts
		/** 中文查询里几乎不携带语义的句尾助词（「修好了」「收工啦」）。 */
		const TRAILING_PARTICLES = /[了的啦呀啊吧嘛哦喔呢哈咯噢嘿着过]+$/u;
		/** 夹在词中间的助词（「踩了坑」→「踩坑」）。只在生成额外切分基时用，不改原串。 */
		const ANY_PARTICLES = /[了的啦呀啊吧嘛哦喔呢哈咯噢嘿着过]/gu;
		/** 是否整串都是汉字（决定要不要做二字切分）。 */
		function isCjk(text) {
			return /^[\u3400-\u9fff]+$/u.test(text);
		}
		/**
		* 把查询切成 token。
		*
		* 为什么需要中文字 token：模型会把 `mood` 传成**语境短语**（真实现场：
		* `"mood":"扒源码收工"`）。整串在 128 条关键词表里必然找不到，但它的**尾二字
		* 「收工」**是有意义的。所以对每个中文片段额外生成几个"切分基"：
		*   1. 剥掉句尾助词的形式（修好了 → 修好）；
		*   2. 去掉所有助词的形式（踩了坑 → 踩坑）；
		*   3. 原片段本身（长度 ≥3 时）。
		* 每个基再补上所有相邻二字组合与首/尾二字（句意通常落在尾巴上）。
		*
		* 短查询（≤2 字）行为**完全不变**——「点赞」「哭」这类精确查询不能被弄糊。
		*/
		function tokenize(query) {
			const q = query.trim().toLowerCase();
			if (q === "") return [];
			const parts = q.split(/[\s,，、;；/|+()（）[\]{}"'`<>]+/u).map((s) => s.trim()).filter((s) => s !== "");
			const out = /* @__PURE__ */ new Set([q, ...parts]);
			for (const part of parts) {
				if (!isCjk(part)) continue;
				const bases = /* @__PURE__ */ new Set();
				const tailStripped = part.replace(TRAILING_PARTICLES, "");
				if (tailStripped.length >= 2) bases.add(tailStripped);
				const compact = part.replace(ANY_PARTICLES, "");
				if (compact.length >= 2) bases.add(compact);
				if (part.length >= 3) bases.add(part);
				for (const base of bases) {
					out.add(base);
					if (base.length >= 3) for (let i = 0; i + 2 <= base.length; i++) out.add(base.slice(i, i + 2));
					out.add(base.slice(0, 2));
					out.add(base.slice(-2));
				}
			}
			return [...out];
		}
		/** 单字段匹配打分：完全相等 > 前缀 > 子串 > 反向包含。 */
		function fieldScore(field, token) {
			const f = field.toLowerCase();
			if (f === token) return 10;
			if (f.startsWith(token)) return 6;
			if (token.length >= 2 && f.includes(token)) return 4;
			const isCjk = /[\u3400-\u9fff]/.test(f);
			if (token.includes(f) && (isCjk ? f.length >= 1 : f.length >= 3)) return 3;
			return 0;
		}
		/** 一条贴纸对一组 token 的得分。 */
		function scoreEntry(entry, tokens) {
			const id = entry.id.toLowerCase();
			let total = 0;
			for (const token of tokens) {
				let best = id === token ? 40 : 0;
				best = Math.max(best, fieldScore(entry.name, token));
				best = Math.max(best, fieldScore(id, token));
				for (const tag of entry.tags) best = Math.max(best, fieldScore(tag, token));
				for (const alias of entry.aliases) best = Math.max(best, fieldScore(alias, token));
				total += best;
			}
			return total;
		}
		/**
		* 检索 top-N。
		* @param entries - 候选贴纸（顺序即同分时的优先级）。
		* @param query - 模型/用户给的关键词。
		* @param limit - 最多返回几条候选。
		*/
		function searchStickers(entries, query, limit = 5) {
			const tokens = tokenize(query);
			if (tokens.length === 0) return [];
			const hits = [];
			for (const entry of entries) {
				const score = scoreEntry(entry, tokens);
				if (score > 0) hits.push({
					entry,
					score
				});
			}
			hits.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				return a.entry.name.length - b.entry.name.length;
			});
			return hits.slice(0, Math.max(1, limit));
		}
		//#endregion
		//#region src/derive.ts
		/**
		* dsh-memes-reply — 贴纸派生（host 与浏览器半边**共用同一套纯逻辑**）。
		*
		* v2.0 的架构决定：贴纸不再是"宿主发事件、客户端轮询取走"的推送物，而是
		* **会话事件的纯函数**——同一个 `(会话, 轮次, 收尾正文, 模型工具调用, 宿主开关)`
		* 永远推出同一张。这样刷新即重放，不需要任何持久化绑定（见 docs/需求与方案-v2.0 §3.3）。
		*
		* 本文件刻意不碰 fs / cordis / DOM：两边都能打包（客户端 bundle 的纯净门禁盯着 require）。
		*/
		/**
		* 生成中占位表情的池子。
		*
		* 只用素材里"自带文字语义"的那几张：`sikao`（正在思考）、`dazi`（打字 普通），
		* 以及真人有情绪时的变体。第一个是默认；按 `(会话, 轮次)` 确定性轮换。
		*/
		const THINKING_IDS = [
			"sikao",
			"dazi",
			"sikao-renzhen",
			"dazi-shengqi",
			"sikao-zixin"
		];
		/** FNV-1a：与 `auto.ts` 的哈希同款，保证两端"到点了"选同一张。 */
		function hashText(text) {
			let value = 2166136261;
			for (let i = 0; i < text.length; i++) {
				value ^= text.charCodeAt(i);
				value = Math.imul(value, 16777619);
			}
			return value >>> 0;
		}
		/** 从词表里按 id 取一张。 */
		function termOf(entries, id) {
			if (id === null || id === void 0 || id === "") return void 0;
			return entries.find((entry) => entry.id === id);
		}
		/**
		* 生成中的占位表情：按 `(会话, 轮次)` 确定性轮换。
		*
		* 确定性是刻意的 —— 同一个回合反复渲染（滚动、刷新、重放）必须得到同一张，
		* 否则"刷新即重放"这条需求会被一个随机数毁掉。
		*/
		function thinkingStickerFor(entries, sessionId, turn) {
			const pool = THINKING_IDS.map((id) => termOf(entries, id)).filter((entry) => entry !== void 0);
			const candidates = pool.length > 0 ? pool : entries;
			if (candidates.length === 0) return null;
			const chosen = candidates[hashText(`${sessionId}:thinking:${turn}`) % candidates.length];
			if (chosen === void 0) return null;
			return {
				id: chosen.id,
				name: chosen.name,
				url: chosen.url,
				reason: "thinking",
				matched: ""
			};
		}
		/** 一次落定派生：优先级 = 一次性指定 > JEV 结论 > 模型点名（id 或关键词）> 规则（keyword/every）> 兜底。 */
		function finalStickerFor(input) {
			const latched = termOf(input.entries, input.latchId);
			if (latched !== void 0) return {
				id: latched.id,
				name: latched.name,
				url: latched.url,
				reason: "latch",
				matched: ""
			};
			const jeved = termOf(input.entries, input.jevId);
			if (jeved !== void 0) return {
				id: jeved.id,
				name: jeved.name,
				url: jeved.url,
				reason: "jev",
				matched: ""
			};
			const modeled = termOf(input.entries, input.modelId);
			if (modeled !== void 0) return {
				id: modeled.id,
				name: modeled.name,
				url: modeled.url,
				reason: "model",
				matched: ""
			};
			const mood = (input.modelMood ?? "").trim();
			if (mood !== "") {
				const hit = searchStickers(input.entries, mood, 1)[0];
				if (hit !== void 0) return {
					id: hit.entry.id,
					name: hit.entry.name,
					url: hit.entry.url,
					reason: "model",
					matched: mood
				};
			}
			const picked = pickAutoSticker({
				mode: input.mode,
				everyTurns: input.everyTurns,
				sessionId: input.sessionId,
				turn: input.turn,
				text: input.text,
				entries: input.entries,
				avoid: input.avoid ?? /* @__PURE__ */ new Set()
			});
			if (picked !== null) {
				const entry = termOf(input.entries, picked.entry.id);
				if (entry !== void 0) return {
					id: entry.id,
					name: entry.name,
					url: entry.url,
					reason: picked.reason,
					matched: picked.matched
				};
			}
			const fallback = termOf(input.entries, input.fallbackId);
			if (fallback !== void 0) return {
				id: fallback.id,
				name: fallback.name,
				url: fallback.url,
				reason: "fallback",
				matched: ""
			};
			return null;
		}
		/** 原因 → 人话（提示文案）。 */
		function reasonText(choice) {
			switch (choice.reason) {
				case "latch": return "你点的那张";
				case "jev": return "JEV 按语境挑的";
				case "model": return choice.matched === "" ? "模型挑的" : `模型点名「${choice.matched}」`;
				case "keyword": return choice.matched === "" ? "命中语境" : `命中「${choice.matched}」`;
				case "every": return "到点了";
				case "fallback": return "兜底那张";
				case "thinking": return "生成中";
			}
		}
		//#endregion
		//#region src/client/vocab-fallback.json
		var items = [
			{
				"id": "bug",
				"name": "Bug",
				"tags": [
					"Bug",
					"虫子",
					"报错",
					"修bug",
					"修好",
					"修复",
					"踩坑",
					"调通"
				],
				"aliases": [
					"bug",
					"error",
					"debug",
					"issue",
					"fix"
				],
				"file": "bug.webp"
			},
			{
				"id": "popcat-frame",
				"name": "Popcat 帧",
				"tags": [
					"Popcat 帧",
					"popcat",
					"逐帧"
				],
				"aliases": [
					"popcat",
					"frame",
					"popcat-frame"
				],
				"file": "popcat-frame.webp"
			},
			{
				"id": "popcat-smooth",
				"name": "Popcat 平滑",
				"tags": [
					"Popcat 平滑",
					"popcat",
					"张嘴"
				],
				"aliases": [
					"popcat",
					"smooth",
					"popcat-smooth"
				],
				"file": "popcat-smooth.webp"
			},
			{
				"id": "raid-1",
				"name": "Raid",
				"tags": [
					"Raid",
					"突袭",
					"冲击"
				],
				"aliases": [
					"raid",
					"rush",
					"attack",
					"raid-1"
				],
				"file": "raid-1.webp"
			},
			{
				"id": "raid-2",
				"name": "Raid",
				"tags": [
					"Raid",
					"突袭",
					"冲击"
				],
				"aliases": [
					"raid",
					"rush",
					"attack",
					"raid-2"
				],
				"file": "raid-2.webp"
			},
			{
				"id": "all-good-1",
				"name": "一切都好",
				"tags": [
					"一切都好",
					"没问题",
					"放心",
					"稳了",
					"跑通",
					"通过"
				],
				"aliases": [
					"allgood",
					"fine",
					"ok",
					"noproblem",
					"works",
					"all-good",
					"all-good-1"
				],
				"file": "all-good-1.webp"
			},
			{
				"id": "all-good-2",
				"name": "一切都好",
				"tags": [
					"一切都好",
					"没问题",
					"放心",
					"稳了",
					"跑通",
					"通过"
				],
				"aliases": [
					"allgood",
					"fine",
					"ok",
					"noproblem",
					"works",
					"all-good",
					"all-good-2"
				],
				"file": "all-good-2.webp"
			},
			{
				"id": "all-good-3",
				"name": "一切都好",
				"tags": [
					"一切都好",
					"没问题",
					"放心",
					"稳了",
					"跑通",
					"通过"
				],
				"aliases": [
					"allgood",
					"fine",
					"ok",
					"noproblem",
					"works",
					"all-good",
					"all-good-3"
				],
				"file": "all-good-3.webp"
			},
			{
				"id": "zhuyi",
				"name": "主意",
				"tags": [
					"主意",
					"灵光一闪",
					"有办法了"
				],
				"aliases": [
					"idea",
					"eureka",
					"brainwave",
					"zhuyi"
				],
				"file": "zhuyi.webp"
			},
			{
				"id": "tingzhi-gongzuo",
				"name": "停止工作",
				"tags": [
					"停止工作",
					"下班",
					"不干了",
					"摆烂",
					"收工",
					"完工",
					"下班了"
				],
				"aliases": [
					"stop",
					"offwork",
					"quit",
					"done",
					"tingzhi-gongzuo"
				],
				"file": "tingzhi-gongzuo.webp"
			},
			{
				"id": "cuimian",
				"name": "催眠",
				"tags": [
					"催眠",
					"催眠",
					"睡觉"
				],
				"aliases": [
					"hypnosis",
					"sleep",
					"focus",
					"cuimian"
				],
				"file": "cuimian.webp"
			},
			{
				"id": "mojing-fanguang-pixel",
				"name": "像素墨镜反光",
				"tags": [
					"像素墨镜反光",
					"像素墨镜",
					"酷"
				],
				"aliases": [
					"sunglasses",
					"pixel",
					"cool",
					"mojing-fanguang-pixel"
				],
				"file": "mojing-fanguang-pixel.webp"
			},
			{
				"id": "liuqi-dai",
				"name": "六七(呆)",
				"tags": [
					"六七(呆)",
					"67",
					"发呆"
				],
				"aliases": [
					"67",
					"blank",
					"liuqi-dai"
				],
				"file": "liuqi-dai.webp"
			},
			{
				"id": "liuqi",
				"name": "六七",
				"tags": [
					"六七",
					"67",
					"六七"
				],
				"aliases": ["67", "liuqi"],
				"file": "liuqi.webp"
			},
			{
				"id": "maopao-1",
				"name": "冒泡",
				"tags": [
					"冒泡",
					"冒泡",
					"出现",
					"潜水"
				],
				"aliases": [
					"bubble",
					"appear",
					"lurk",
					"maopao",
					"maopao-1"
				],
				"file": "maopao-1.webp"
			},
			{
				"id": "maopao-2",
				"name": "冒泡",
				"tags": [
					"冒泡",
					"冒泡",
					"出现",
					"潜水"
				],
				"aliases": [
					"bubble",
					"appear",
					"lurk",
					"maopao",
					"maopao-2"
				],
				"file": "maopao-2.webp"
			},
			{
				"id": "dao-1",
				"name": "刀",
				"tags": [
					"刀",
					"菜刀",
					"威胁"
				],
				"aliases": [
					"knife",
					"threat",
					"dao",
					"dao-1"
				],
				"file": "dao-1.webp"
			},
			{
				"id": "dao-2",
				"name": "刀",
				"tags": [
					"刀",
					"菜刀",
					"威胁"
				],
				"aliases": [
					"knife",
					"threat",
					"dao",
					"dao-2"
				],
				"file": "dao-2.webp"
			},
			{
				"id": "daoda-shaozi",
				"name": "到达(拿勺子)",
				"tags": [
					"到达(拿勺子)",
					"来吃饭",
					"到了"
				],
				"aliases": [
					"arrive",
					"spoon",
					"eat",
					"daoda-shaozi"
				],
				"file": "daoda-shaozi.webp"
			},
			{
				"id": "daoda-kuaizi",
				"name": "到达(拿筷子)",
				"tags": [
					"到达(拿筷子)",
					"来吃饭",
					"到了"
				],
				"aliases": [
					"arrive",
					"chopsticks",
					"eat",
					"daoda-kuaizi"
				],
				"file": "daoda-kuaizi.webp"
			},
			{
				"id": "daoda",
				"name": "到达",
				"tags": [
					"到达",
					"来了",
					"到了"
				],
				"aliases": [
					"arrive",
					"here",
					"coming",
					"daoda"
				],
				"file": "daoda.webp"
			},
			{
				"id": "shuaka",
				"name": "刷卡",
				"tags": [
					"刷卡",
					"付款",
					"消费"
				],
				"aliases": [
					"pay",
					"card",
					"checkout",
					"shuaka"
				],
				"file": "shuaka.webp"
			},
			{
				"id": "jiayou",
				"name": "加油",
				"tags": [
					"加油",
					"鼓励",
					"打气"
				],
				"aliases": [
					"cheer",
					"gogogo",
					"fight",
					"jiayou"
				],
				"file": "jiayou.webp"
			},
			{
				"id": "dianzan-fan",
				"name": "反向点赞",
				"tags": [
					"反向点赞",
					"差评",
					"不赞",
					"反对"
				],
				"aliases": [
					"dislike",
					"thumbsdown",
					"boo",
					"nope",
					"dianzan-fan"
				],
				"file": "dianzan-fan.webp"
			},
			{
				"id": "fanzhuan",
				"name": "反转",
				"tags": [
					"反转",
					"反转",
					"翻盘"
				],
				"aliases": [
					"reverse",
					"flip",
					"plot-twist",
					"fanzhuan"
				],
				"file": "fanzhuan.webp"
			},
			{
				"id": "tanhao",
				"name": "叹号",
				"tags": [
					"叹号",
					"感叹",
					"重要"
				],
				"aliases": [
					"exclamation",
					"important",
					"alert",
					"tanhao"
				],
				"file": "tanhao.webp"
			},
			{
				"id": "chi-baomihua",
				"name": "吃(爆米花)",
				"tags": [
					"吃(爆米花)",
					"吃瓜",
					"看戏"
				],
				"aliases": [
					"popcorn",
					"watch",
					"drama",
					"chi-baomihua"
				],
				"file": "chi-baomihua.webp"
			},
			{
				"id": "chi-tiantianquan",
				"name": "吃(甜甜圈)",
				"tags": [
					"吃(甜甜圈)",
					"吃",
					"甜食"
				],
				"aliases": [
					"donut",
					"eat",
					"snack",
					"chi-tiantianquan"
				],
				"file": "chi-tiantianquan.webp"
			},
			{
				"id": "chi-xigua",
				"name": "吃(西瓜)",
				"tags": [
					"吃(西瓜)",
					"吃瓜",
					"围观"
				],
				"aliases": [
					"watermelon",
					"eat",
					"drama",
					"chi-xigua"
				],
				"file": "chi-xigua.webp"
			},
			{
				"id": "jita",
				"name": "吉他",
				"tags": [
					"吉他",
					"弹吉他",
					"音乐"
				],
				"aliases": [
					"guitar",
					"music",
					"jita"
				],
				"file": "jita.webp"
			},
			{
				"id": "dai-1",
				"name": "呆",
				"tags": [
					"呆",
					"发呆",
					"懵",
					"无聊",
					"发愣"
				],
				"aliases": [
					"blank",
					"stare",
					"dumb",
					"bored",
					"dai",
					"dai-1"
				],
				"file": "dai-1.webp"
			},
			{
				"id": "dai-2",
				"name": "呆",
				"tags": [
					"呆",
					"发呆",
					"懵",
					"无聊",
					"发愣"
				],
				"aliases": [
					"blank",
					"stare",
					"dumb",
					"bored",
					"dai",
					"dai-2"
				],
				"file": "dai-2.webp"
			},
			{
				"id": "dai-3",
				"name": "呆",
				"tags": [
					"呆",
					"发呆",
					"懵",
					"无聊",
					"发愣"
				],
				"aliases": [
					"blank",
					"stare",
					"dumb",
					"bored",
					"dai",
					"dai-3"
				],
				"file": "dai-3.webp"
			},
			{
				"id": "dai-tiezhi-1",
				"name": "呆(贴纸)",
				"tags": [
					"呆(贴纸)",
					"贴纸",
					"发呆"
				],
				"aliases": [
					"sticker",
					"blank",
					"dai-tiezhi",
					"dai-tiezhi-1"
				],
				"file": "dai-tiezhi-1.webp"
			},
			{
				"id": "dai-tiezhi-2",
				"name": "呆(贴纸)",
				"tags": [
					"呆(贴纸)",
					"贴纸",
					"发呆"
				],
				"aliases": [
					"sticker",
					"blank",
					"dai-tiezhi",
					"dai-tiezhi-2"
				],
				"file": "dai-tiezhi-2.webp"
			},
			{
				"id": "dai-tiezhi-3",
				"name": "呆(贴纸)",
				"tags": [
					"呆(贴纸)",
					"贴纸",
					"发呆"
				],
				"aliases": [
					"sticker",
					"blank",
					"dai-tiezhi",
					"dai-tiezhi-3"
				],
				"file": "dai-tiezhi-3.webp"
			},
			{
				"id": "ku-1",
				"name": "哭",
				"tags": [
					"哭",
					"难过",
					"委屈",
					"眼泪"
				],
				"aliases": [
					"cry",
					"sad",
					"tears",
					"sob",
					"ku",
					"ku-1"
				],
				"file": "ku-1.webp"
			},
			{
				"id": "ku-2",
				"name": "哭",
				"tags": [
					"哭",
					"难过",
					"委屈",
					"眼泪"
				],
				"aliases": [
					"cry",
					"sad",
					"tears",
					"sob",
					"ku",
					"ku-2"
				],
				"file": "ku-2.webp"
			},
			{
				"id": "ku-3",
				"name": "哭",
				"tags": [
					"哭",
					"难过",
					"委屈",
					"眼泪"
				],
				"aliases": [
					"cry",
					"sad",
					"tears",
					"sob",
					"ku",
					"ku-3"
				],
				"file": "ku-3.webp"
			},
			{
				"id": "changge",
				"name": "唱歌",
				"tags": [
					"唱歌",
					"唱歌",
					"K歌"
				],
				"aliases": [
					"sing",
					"song",
					"karaoke",
					"changge"
				],
				"file": "changge.webp"
			},
			{
				"id": "he-yinliao",
				"name": "喝(饮料杯)",
				"tags": [
					"喝(饮料杯)",
					"喝饮料",
					"奶茶"
				],
				"aliases": [
					"drink",
					"juice",
					"coffee",
					"he-yinliao"
				],
				"file": "he-yinliao.webp"
			},
			{
				"id": "penji",
				"name": "喷剂",
				"tags": [
					"喷剂",
					"喷雾",
					"驱散"
				],
				"aliases": [
					"spray",
					"repel",
					"penji"
				],
				"file": "penji.webp"
			},
			{
				"id": "zuolao-1",
				"name": "坐牢",
				"tags": [
					"坐牢",
					"难受",
					"被困",
					"加班"
				],
				"aliases": [
					"jail",
					"trapped",
					"grind",
					"zuolao",
					"zuolao-1"
				],
				"file": "zuolao-1.webp"
			},
			{
				"id": "zuolao-2",
				"name": "坐牢",
				"tags": [
					"坐牢",
					"难受",
					"被困",
					"加班"
				],
				"aliases": [
					"jail",
					"trapped",
					"grind",
					"zuolao",
					"zuolao-2"
				],
				"file": "zuolao-2.webp"
			},
			{
				"id": "lajitong",
				"name": "垃圾桶",
				"tags": [
					"垃圾桶",
					"扔掉",
					"垃圾"
				],
				"aliases": [
					"trash",
					"bin",
					"delete",
					"lajitong"
				],
				"file": "lajitong.webp"
			},
			{
				"id": "mojing-fanguang",
				"name": "墨镜反光",
				"tags": [
					"墨镜反光",
					"墨镜",
					"帅",
					"酷",
					"得意",
					"得瑟",
					"自信"
				],
				"aliases": [
					"sunglasses",
					"cool",
					"shine",
					"smug",
					"mojing-fanguang"
				],
				"file": "mojing-fanguang.webp"
			},
			{
				"id": "mojing-xunhuan",
				"name": "墨镜循环",
				"tags": [
					"墨镜循环",
					"墨镜",
					"循环"
				],
				"aliases": [
					"sunglasses",
					"loop",
					"cool",
					"mojing-xunhuan"
				],
				"file": "mojing-xunhuan.webp"
			},
			{
				"id": "fuhuojie",
				"name": "复活节",
				"tags": [
					"复活节",
					"彩蛋",
					"节日"
				],
				"aliases": [
					"easter",
					"egg",
					"fuhuojie"
				],
				"file": "fuhuojie.webp"
			},
			{
				"id": "touyun",
				"name": "头晕",
				"tags": [
					"头晕",
					"晕",
					"绕晕",
					"懵"
				],
				"aliases": [
					"dizzy",
					"confused",
					"spinning",
					"touyun"
				],
				"file": "touyun.webp"
			},
			{
				"id": "nailao-hulian",
				"name": "奶酪糊脸",
				"tags": [
					"奶酪糊脸",
					"翻车",
					"糊脸"
				],
				"aliases": [
					"fail",
					"pie",
					"facepalm",
					"nailao-hulian"
				],
				"file": "nailao-hulian.webp"
			},
			{
				"id": "haipa-1",
				"name": "害怕",
				"tags": [
					"害怕",
					"恐惧",
					"吓到",
					"发抖"
				],
				"aliases": [
					"fear",
					"scared",
					"afraid",
					"horror",
					"haipa",
					"haipa-1"
				],
				"file": "haipa-1.webp"
			},
			{
				"id": "haipa-2",
				"name": "害怕",
				"tags": [
					"害怕",
					"恐惧",
					"吓到",
					"发抖"
				],
				"aliases": [
					"fear",
					"scared",
					"afraid",
					"horror",
					"haipa",
					"haipa-2"
				],
				"file": "haipa-2.webp"
			},
			{
				"id": "haixiu-1",
				"name": "害羞",
				"tags": [
					"害羞",
					"脸红",
					"不好意思",
					"扭捏"
				],
				"aliases": [
					"shy",
					"blush",
					"embarrassed",
					"haixiu",
					"haixiu-1"
				],
				"file": "haixiu-1.webp"
			},
			{
				"id": "haixiu-2",
				"name": "害羞",
				"tags": [
					"害羞",
					"脸红",
					"不好意思",
					"扭捏"
				],
				"aliases": [
					"shy",
					"blush",
					"embarrassed",
					"haixiu",
					"haixiu-2"
				],
				"file": "haixiu-2.webp"
			},
			{
				"id": "xiaochou-1",
				"name": "小丑",
				"tags": [
					"小丑",
					"尴尬",
					"自作自受",
					"打脸"
				],
				"aliases": [
					"clown",
					"joker",
					"cringe",
					"selfown",
					"xiaochou",
					"xiaochou-1"
				],
				"file": "xiaochou-1.webp"
			},
			{
				"id": "xiaochou-2",
				"name": "小丑",
				"tags": [
					"小丑",
					"尴尬",
					"自作自受",
					"打脸"
				],
				"aliases": [
					"clown",
					"joker",
					"cringe",
					"selfown",
					"xiaochou",
					"xiaochou-2"
				],
				"file": "xiaochou-2.webp"
			},
			{
				"id": "gongzuo-xiaoshui",
				"name": "工作(小睡)",
				"tags": [
					"工作(小睡)",
					"摸鱼",
					"打盹",
					"划水"
				],
				"aliases": [
					"work",
					"nap",
					"slack",
					"idle",
					"gongzuo-xiaoshui"
				],
				"file": "gongzuo-xiaoshui.webp"
			},
			{
				"id": "gongzuo",
				"name": "工作(普通)",
				"tags": [
					"工作(普通)",
					"上班",
					"干活"
				],
				"aliases": [
					"work",
					"coding",
					"busy",
					"gongzuo"
				],
				"file": "gongzuo.webp"
			},
			{
				"id": "gongzuo-shengqi",
				"name": "工作(生气)",
				"tags": [
					"工作(生气)",
					"上班气",
					"暴躁"
				],
				"aliases": [
					"work",
					"angry",
					"gongzuo-shengqi"
				],
				"file": "gongzuo-shengqi.webp"
			},
			{
				"id": "gongzuo-pijuan",
				"name": "工作(疲倦)",
				"tags": [
					"工作(疲倦)",
					"累",
					"疲惫",
					"加班"
				],
				"aliases": [
					"work",
					"tired",
					"exhausted",
					"gongzuo-pijuan"
				],
				"file": "gongzuo-pijuan.webp"
			},
			{
				"id": "daixin-lashi-hard",
				"name": "带薪拉屎(困难模式)",
				"tags": [
					"带薪拉屎(困难模式)",
					"摸鱼",
					"带薪拉屎"
				],
				"aliases": [
					"slack",
					"paidpoop",
					"hard",
					"daixin-lashi-hard"
				],
				"file": "daixin-lashi-hard.webp"
			},
			{
				"id": "daixin-lashi-easy",
				"name": "带薪拉屎(简单模式)",
				"tags": [
					"带薪拉屎(简单模式)",
					"摸鱼",
					"带薪拉屎"
				],
				"aliases": [
					"slack",
					"paidpoop",
					"easy",
					"daixin-lashi-easy"
				],
				"file": "daixin-lashi-easy.webp"
			},
			{
				"id": "ganbei",
				"name": "干杯",
				"tags": [
					"干杯",
					"喝酒",
					"聚会",
					"合作"
				],
				"aliases": [
					"cheers",
					"toast",
					"drink",
					"ganbei"
				],
				"file": "ganbei.webp"
			},
			{
				"id": "qingzhu",
				"name": "庆祝",
				"tags": [
					"庆祝",
					"成功",
					"撒花",
					"搞定",
					"完成",
					"收工",
					"完工"
				],
				"aliases": [
					"celebrate",
					"success",
					"done",
					"ship",
					"finished",
					"qingzhu"
				],
				"file": "qingzhu.webp"
			},
			{
				"id": "defen-0",
				"name": "得分(0分)",
				"tags": [
					"得分(0分)",
					"零分",
					"失败",
					"翻车"
				],
				"aliases": [
					"score",
					"zero",
					"fail",
					"defen-0"
				],
				"file": "defen-0.webp"
			},
			{
				"id": "defen-10",
				"name": "得分(10分)",
				"tags": [
					"得分(10分)",
					"满分",
					"成功"
				],
				"aliases": [
					"score",
					"perfect",
					"win",
					"defen-10"
				],
				"file": "defen-10.webp"
			},
			{
				"id": "sikao-zixin",
				"name": "思考(自信地)",
				"tags": [
					"思考(自信地)",
					"自信",
					"想通了"
				],
				"aliases": [
					"think",
					"confident",
					"sure",
					"sikao-zixin"
				],
				"file": "sikao-zixin.webp"
			},
			{
				"id": "sikao-renzhen",
				"name": "思考(认真地)",
				"tags": [
					"思考(认真地)",
					"认真思考",
					"分析"
				],
				"aliases": [
					"think",
					"serious",
					"analyze",
					"sikao-renzhen"
				],
				"file": "sikao-renzhen.webp"
			},
			{
				"id": "qingshu",
				"name": "情书",
				"tags": [
					"情书",
					"表白",
					"信"
				],
				"aliases": [
					"loveletter",
					"letter",
					"confession",
					"qingshu"
				],
				"file": "qingshu.webp"
			},
			{
				"id": "jingxia",
				"name": "惊吓",
				"tags": [
					"惊吓",
					"震惊",
					"吓一跳"
				],
				"aliases": [
					"shock",
					"startled",
					"surprise",
					"jingxia"
				],
				"file": "jingxia.webp"
			},
			{
				"id": "dazi-naonu",
				"name": "打字(恼怒)",
				"tags": [
					"打字(恼怒)",
					"恼怒打字",
					"暴躁"
				],
				"aliases": [
					"typing",
					"annoyed",
					"dazi-naonu"
				],
				"file": "dazi-naonu.webp"
			},
			{
				"id": "dazi",
				"name": "打字(普通)",
				"tags": [
					"打字(普通)",
					"打字中",
					"输出中"
				],
				"aliases": [
					"typing",
					"writing",
					"dazi"
				],
				"file": "dazi.webp"
			},
			{
				"id": "dazi-shengqi",
				"name": "打字(生气)",
				"tags": [
					"打字(生气)",
					"生气打字",
					"狂敲"
				],
				"aliases": [
					"typing",
					"angry",
					"rant",
					"dazi-shengqi"
				],
				"file": "dazi-shengqi.webp"
			},
			{
				"id": "dazhaohu-1",
				"name": "打招呼",
				"tags": [
					"打招呼",
					"你好",
					"招手",
					"hi"
				],
				"aliases": [
					"hello",
					"hi",
					"wave",
					"greet",
					"dazhaohu",
					"dazhaohu-1"
				],
				"file": "dazhaohu-1.webp"
			},
			{
				"id": "dazhaohu-2",
				"name": "打招呼",
				"tags": [
					"打招呼",
					"你好",
					"招手",
					"hi"
				],
				"aliases": [
					"hello",
					"hi",
					"wave",
					"greet",
					"dazhaohu",
					"dazhaohu-2"
				],
				"file": "dazhaohu-2.webp"
			},
			{
				"id": "dayouxi",
				"name": "打游戏",
				"tags": [
					"打游戏",
					"游戏",
					"打电动"
				],
				"aliases": [
					"game",
					"gaming",
					"play",
					"dayouxi"
				],
				"file": "dayouxi.webp"
			},
			{
				"id": "kuoyinqi",
				"name": "扩音器",
				"tags": [
					"扩音器",
					"喊话",
					"喇叭",
					"广播"
				],
				"aliases": [
					"megaphone",
					"announce",
					"shout",
					"kuoyinqi"
				],
				"file": "kuoyinqi.webp"
			},
			{
				"id": "zhuapai-phone",
				"name": "抓拍(手机)",
				"tags": [
					"抓拍(手机)",
					"拍照",
					"截图"
				],
				"aliases": [
					"phone",
					"photo",
					"screenshot",
					"zhuapai-phone"
				],
				"file": "zhuapai-phone.webp"
			},
			{
				"id": "zhuapai-camera",
				"name": "抓拍(摄像机)",
				"tags": [
					"抓拍(摄像机)",
					"录像",
					"拍下来"
				],
				"aliases": [
					"camera",
					"record",
					"capture",
					"zhuapai-camera"
				],
				"file": "zhuapai-camera.webp"
			},
			{
				"id": "zheshan",
				"name": "折扇",
				"tags": [
					"折扇",
					"扇风",
					"从容"
				],
				"aliases": [
					"fan",
					"fold",
					"chill",
					"zheshan"
				],
				"file": "zheshan.webp"
			},
			{
				"id": "paiying",
				"name": "拍蝇",
				"tags": [
					"拍蝇",
					"拍苍蝇",
					"消灭bug"
				],
				"aliases": [
					"swat",
					"fly",
					"bug",
					"killbug",
					"paiying"
				],
				"file": "paiying.webp"
			},
			{
				"id": "tuoxie-1",
				"name": "拖鞋",
				"tags": [
					"拖鞋",
					"拖鞋",
					"打人"
				],
				"aliases": [
					"slipper",
					"smack",
					"tuoxie",
					"tuoxie-1"
				],
				"file": "tuoxie-1.webp"
			},
			{
				"id": "tuoxie-2",
				"name": "拖鞋",
				"tags": [
					"拖鞋",
					"拖鞋",
					"打人"
				],
				"aliases": [
					"slipper",
					"smack",
					"tuoxie",
					"tuoxie-2"
				],
				"file": "tuoxie-2.webp"
			},
			{
				"id": "naqian",
				"name": "拿走我的钱",
				"tags": [
					"拿走我的钱",
					"要钱",
					"花钱",
					"付费"
				],
				"aliases": [
					"takemymoney",
					"pay",
					"cost",
					"shutupandtakemymoney",
					"naqian"
				],
				"file": "naqian.webp"
			},
			{
				"id": "zhi",
				"name": "指",
				"tags": [
					"指",
					"指着",
					"看这个"
				],
				"aliases": [
					"point",
					"look",
					"zhi"
				],
				"file": "zhi.webp"
			},
			{
				"id": "anniu",
				"name": "按钮",
				"tags": [
					"按钮",
					"按按钮",
					"启动"
				],
				"aliases": [
					"button",
					"press",
					"start",
					"anniu"
				],
				"file": "anniu.webp"
			},
			{
				"id": "yaokele",
				"name": "摇可乐",
				"tags": [
					"摇可乐",
					"摇可乐",
					"喷发",
					"搞事"
				],
				"aliases": [
					"shake",
					"cola",
					"explode",
					"yaokele"
				],
				"file": "yaokele.webp"
			},
			{
				"id": "yaotou",
				"name": "摇头",
				"tags": [
					"摇头",
					"不同意",
					"不是"
				],
				"aliases": [
					"shake",
					"no",
					"disagree",
					"yaotou"
				],
				"file": "yaotou.webp"
			},
			{
				"id": "yaoling",
				"name": "摇铃",
				"tags": [
					"摇铃",
					"铃铛",
					"提醒",
					"开饭"
				],
				"aliases": [
					"bell",
					"ring",
					"notify",
					"yaoling"
				],
				"file": "yaoling.webp"
			},
			{
				"id": "mojing-zhai",
				"name": "摘掉墨镜",
				"tags": [
					"摘掉墨镜",
					"摘墨镜",
					"认真"
				],
				"aliases": [
					"sunglasses",
					"off",
					"serious",
					"mojing-zhai"
				],
				"file": "mojing-zhai.webp"
			},
			{
				"id": "motou",
				"name": "摸头",
				"tags": [
					"摸头",
					"安慰",
					"拍拍"
				],
				"aliases": [
					"pat",
					"headpat",
					"comfort",
					"motou"
				],
				"file": "motou.webp"
			},
			{
				"id": "qiaogun-1",
				"name": "撬棍",
				"tags": [
					"撬棍",
					"撬棍",
					"砸"
				],
				"aliases": [
					"crowbar",
					"smash",
					"qiaogun",
					"qiaogun-1"
				],
				"file": "qiaogun-1.webp"
			},
			{
				"id": "qiaogun-2",
				"name": "撬棍",
				"tags": [
					"撬棍",
					"撬棍",
					"砸"
				],
				"aliases": [
					"crowbar",
					"smash",
					"qiaogun",
					"qiaogun-2"
				],
				"file": "qiaogun-2.webp"
			},
			{
				"id": "qiaogun-3",
				"name": "撬棍",
				"tags": [
					"撬棍",
					"撬棍",
					"砸"
				],
				"aliases": [
					"crowbar",
					"smash",
					"qiaogun",
					"qiaogun-3"
				],
				"file": "qiaogun-3.webp"
			},
			{
				"id": "qiaotou",
				"name": "敲头",
				"tags": [
					"敲头",
					"敲打",
					"提醒",
					"笨蛋"
				],
				"aliases": [
					"bonk",
					"knock",
					"head",
					"qiaotou"
				],
				"file": "qiaotou.webp"
			},
			{
				"id": "qidai-1",
				"name": "期待",
				"tags": [
					"期待",
					"期待",
					"等着",
					"催更"
				],
				"aliases": [
					"expect",
					"wait",
					"hope",
					"qidai",
					"qidai-1"
				],
				"file": "qidai-1.webp"
			},
			{
				"id": "qidai-2",
				"name": "期待",
				"tags": [
					"期待",
					"期待",
					"等着",
					"催更"
				],
				"aliases": [
					"expect",
					"wait",
					"hope",
					"qidai",
					"qidai-2"
				],
				"file": "qidai-2.webp"
			},
			{
				"id": "qiang",
				"name": "枪",
				"tags": [
					"枪",
					"手枪",
					"威胁"
				],
				"aliases": [
					"gun",
					"threat",
					"qiang"
				],
				"file": "qiang.webp"
			},
			{
				"id": "sikao",
				"name": "正在思考",
				"tags": [
					"正在思考",
					"思考中",
					"加载中"
				],
				"aliases": [
					"thinking",
					"loading",
					"hmm",
					"sikao"
				],
				"file": "sikao.webp"
			},
			{
				"id": "siwang",
				"name": "死亡",
				"tags": [
					"死亡",
					"挂了",
					"完蛋",
					"躺平"
				],
				"aliases": [
					"dead",
					"rip",
					"gameover",
					"siwang"
				],
				"file": "siwang.webp"
			},
			{
				"id": "han",
				"name": "汗",
				"tags": [
					"汗",
					"无语",
					"尴尬",
					"冷汗"
				],
				"aliases": [
					"sweat",
					"awkward",
					"speechless",
					"han"
				],
				"file": "han.webp"
			},
			{
				"id": "diantou",
				"name": "点头",
				"tags": [
					"点头",
					"同意",
					"嗯嗯"
				],
				"aliases": [
					"nod",
					"yes",
					"agree",
					"diantou"
				],
				"file": "diantou.webp"
			},
			{
				"id": "dianzan",
				"name": "点赞",
				"tags": [
					"点赞",
					"好评",
					"厉害",
					"牛",
					"夸",
					"夸奖"
				],
				"aliases": [
					"like",
					"thumbsup",
					"zan",
					"ok",
					"nice",
					"awesome",
					"praise",
					"dianzan"
				],
				"file": "dianzan.webp"
			},
			{
				"id": "shao-1",
				"name": "烧",
				"tags": [
					"烧",
					"着火",
					"烧了"
				],
				"aliases": [
					"fire",
					"burn",
					"shao",
					"shao-1"
				],
				"file": "shao-1.webp"
			},
			{
				"id": "shao-2",
				"name": "烧",
				"tags": [
					"烧",
					"着火",
					"烧了"
				],
				"aliases": [
					"fire",
					"burn",
					"shao",
					"shao-2"
				],
				"file": "shao-2.webp"
			},
			{
				"id": "aixin-1",
				"name": "爱心",
				"tags": [
					"爱心",
					"喜欢",
					"爱",
					"比心",
					"感谢",
					"谢谢"
				],
				"aliases": [
					"love",
					"heart",
					"like",
					"thanks",
					"aixin",
					"aixin-1"
				],
				"file": "aixin-1.webp"
			},
			{
				"id": "aixin-2",
				"name": "爱心",
				"tags": [
					"爱心",
					"喜欢",
					"爱",
					"比心",
					"感谢",
					"谢谢"
				],
				"aliases": [
					"love",
					"heart",
					"like",
					"thanks",
					"aixin",
					"aixin-2"
				],
				"file": "aixin-2.webp"
			},
			{
				"id": "aixin-3",
				"name": "爱心",
				"tags": [
					"爱心",
					"喜欢",
					"爱",
					"比心",
					"感谢",
					"谢谢"
				],
				"aliases": [
					"love",
					"heart",
					"like",
					"thanks",
					"aixin",
					"aixin-3"
				],
				"file": "aixin-3.webp"
			},
			{
				"id": "meigui",
				"name": "玫瑰",
				"tags": [
					"玫瑰",
					"花",
					"送花",
					"浪漫"
				],
				"aliases": [
					"rose",
					"flower",
					"love",
					"meigui"
				],
				"file": "meigui.webp"
			},
			{
				"id": "shengqi",
				"name": "生气",
				"tags": [
					"生气",
					"愤怒",
					"火大",
					"不满",
					"气死"
				],
				"aliases": [
					"angry",
					"mad",
					"rage",
					"furious",
					"shengqi"
				],
				"file": "shengqi.webp"
			},
			{
				"id": "dianfengshan-1",
				"name": "电风扇",
				"tags": [
					"电风扇",
					"吹风",
					"冷静"
				],
				"aliases": [
					"fan",
					"cool",
					"wind",
					"dianfengshan",
					"dianfengshan-1"
				],
				"file": "dianfengshan-1.webp"
			},
			{
				"id": "dianfengshan-2",
				"name": "电风扇",
				"tags": [
					"电风扇",
					"吹风",
					"冷静"
				],
				"aliases": [
					"fan",
					"cool",
					"wind",
					"dianfengshan",
					"dianfengshan-2"
				],
				"file": "dianfengshan-2.webp"
			},
			{
				"id": "huaban",
				"name": "画板",
				"tags": [
					"画板",
					"画图",
					"设计"
				],
				"aliases": [
					"draw",
					"canvas",
					"design",
					"huaban"
				],
				"file": "huaban.webp"
			},
			{
				"id": "zhayan",
				"name": "眨眼",
				"tags": [
					"眨眼",
					"眨眼",
					"暗示"
				],
				"aliases": [
					"wink",
					"hint",
					"zhayan"
				],
				"file": "zhayan.webp"
			},
			{
				"id": "shuijiao-uu",
				"name": "睡觉 (UU)",
				"tags": [
					"睡觉 (UU)",
					"睡觉",
					"UU"
				],
				"aliases": [
					"sleep",
					"zzz",
					"uu",
					"shuijiao-uu"
				],
				"file": "shuijiao-uu.webp"
			},
			{
				"id": "shuijiao-zhunbei-1",
				"name": "睡觉(准备阶段1)",
				"tags": ["睡觉(准备阶段1)", "准备睡觉"],
				"aliases": [
					"sleep",
					"prepare",
					"shuijiao-zhunbei-1"
				],
				"file": "shuijiao-zhunbei-1.webp"
			},
			{
				"id": "shuijiao-zhunbei-2",
				"name": "睡觉(准备阶段2)",
				"tags": ["睡觉(准备阶段2)", "准备睡觉"],
				"aliases": [
					"sleep",
					"prepare",
					"shuijiao-zhunbei-2"
				],
				"file": "shuijiao-zhunbei-2.webp"
			},
			{
				"id": "shuijiao",
				"name": "睡觉(普通)",
				"tags": [
					"睡觉(普通)",
					"睡觉",
					"晚安",
					"摸鱼",
					"困了",
					"睡了"
				],
				"aliases": [
					"sleep",
					"zzz",
					"night",
					"tired",
					"shuijiao"
				],
				"file": "shuijiao.webp"
			},
			{
				"id": "liwu-1",
				"name": "礼物",
				"tags": [
					"礼物",
					"送礼",
					"礼物"
				],
				"aliases": [
					"gift",
					"present",
					"liwu",
					"liwu-1"
				],
				"file": "liwu-1.webp"
			},
			{
				"id": "liwu-2",
				"name": "礼物",
				"tags": [
					"礼物",
					"送礼",
					"礼物"
				],
				"aliases": [
					"gift",
					"present",
					"liwu",
					"liwu-2"
				],
				"file": "liwu-2.webp"
			},
			{
				"id": "xiao-zhi",
				"name": "笑(指)",
				"tags": [
					"笑(指)",
					"嘲笑",
					"指着笑",
					"你看他"
				],
				"aliases": [
					"pointlaugh",
					"mock",
					"lmao",
					"xiao-zhi"
				],
				"file": "xiao-zhi.webp"
			},
			{
				"id": "xiao",
				"name": "笑",
				"tags": [
					"笑",
					"开心",
					"哈哈",
					"大笑"
				],
				"aliases": [
					"laugh",
					"lol",
					"happy",
					"haha",
					"xiao"
				],
				"file": "xiao.webp"
			},
			{
				"id": "jinzhang-1",
				"name": "紧张",
				"tags": [
					"紧张",
					"忐忑",
					"压力",
					"着急",
					"焦虑"
				],
				"aliases": [
					"nervous",
					"anxious",
					"tense",
					"hurry",
					"jinzhang",
					"jinzhang-1"
				],
				"file": "jinzhang-1.webp"
			},
			{
				"id": "jinzhang-2",
				"name": "紧张",
				"tags": [
					"紧张",
					"忐忑",
					"压力",
					"着急",
					"焦虑"
				],
				"aliases": [
					"nervous",
					"anxious",
					"tense",
					"hurry",
					"jinzhang",
					"jinzhang-2"
				],
				"file": "jinzhang-2.webp"
			},
			{
				"id": "hongbao-1",
				"name": "红包",
				"tags": [
					"红包",
					"红包",
					"打赏",
					"祝福"
				],
				"aliases": [
					"redpacket",
					"gift",
					"lucky",
					"hongbao",
					"hongbao-1"
				],
				"file": "hongbao-1.webp"
			},
			{
				"id": "hongbao-2",
				"name": "红包",
				"tags": [
					"红包",
					"红包",
					"打赏",
					"祝福"
				],
				"aliases": [
					"redpacket",
					"gift",
					"lucky",
					"hongbao",
					"hongbao-2"
				],
				"file": "hongbao-2.webp"
			},
			{
				"id": "jiaodai",
				"name": "胶带",
				"tags": [
					"胶带",
					"封嘴",
					"贴住"
				],
				"aliases": [
					"tape",
					"silence",
					"jiaodai"
				],
				"file": "jiaodai.webp"
			},
			{
				"id": "ziwoanwei",
				"name": "自我安慰",
				"tags": [
					"自我安慰",
					"安慰自己",
					"没事的",
					"崩溃",
					"破防"
				],
				"aliases": [
					"selfcomfort",
					"cope",
					"itsfine",
					"overwhelmed",
					"ziwoanwei"
				],
				"file": "ziwoanwei.webp"
			},
			{
				"id": "tiantian",
				"name": "舔舔",
				"tags": [
					"舔舔",
					"舔",
					"馋"
				],
				"aliases": [
					"lick",
					"tongue",
					"tiantian"
				],
				"file": "tiantian.webp"
			},
			{
				"id": "tiaowu-sanwei",
				"name": "舞蹈(散味)",
				"tags": [
					"舞蹈(散味)",
					"散味",
					"扇风",
					"臭"
				],
				"aliases": [
					"smell",
					"fart",
					"dance",
					"tiaowu-sanwei"
				],
				"file": "tiaowu-sanwei.webp"
			},
			{
				"id": "yingguangbang",
				"name": "荧光棒",
				"tags": [
					"荧光棒",
					"打call",
					"应援"
				],
				"aliases": [
					"glowstick",
					"cheer",
					"support",
					"yingguangbang"
				],
				"file": "yingguangbang.webp"
			},
			{
				"id": "dangao",
				"name": "蛋糕",
				"tags": [
					"蛋糕",
					"生日",
					"蛋糕",
					"庆祝"
				],
				"aliases": [
					"cake",
					"birthday",
					"dangao"
				],
				"file": "dangao.webp"
			},
			{
				"id": "beiji-bits",
				"name": "被击中(Bits)",
				"tags": [
					"被击中(Bits)",
					"被打赏",
					"Bits"
				],
				"aliases": [
					"hitbits",
					"donate",
					"beiji-bits"
				],
				"file": "beiji-bits.webp"
			},
			{
				"id": "beiji-tuoxie",
				"name": "被击中(拖鞋)",
				"tags": [
					"被击中(拖鞋)",
					"被拖鞋打",
					"挨打"
				],
				"aliases": [
					"hitslipper",
					"ouch",
					"beiji-tuoxie"
				],
				"file": "beiji-tuoxie.webp"
			},
			{
				"id": "beiji-aixin",
				"name": "被击中(爱心)",
				"tags": [
					"被击中(爱心)",
					"被爱心击中",
					"心动"
				],
				"aliases": [
					"hitheart",
					"heart",
					"beiji-aixin"
				],
				"file": "beiji-aixin.webp"
			},
			{
				"id": "beiji-yingbi",
				"name": "被击中(硬币)",
				"tags": [
					"被击中(硬币)",
					"被打赏",
					"收到钱"
				],
				"aliases": [
					"hitcoin",
					"donate",
					"beiji-yingbi"
				],
				"file": "beiji-yingbi.webp"
			},
			{
				"id": "yaomi",
				"name": "要米",
				"tags": [
					"要米",
					"要钱",
					"讨饭",
					"打赏"
				],
				"aliases": [
					"beg",
					"money",
					"donate",
					"tip",
					"yaomi"
				],
				"file": "yaomi.webp"
			},
			{
				"id": "jilu-1",
				"name": "记录",
				"tags": [
					"记录",
					"记笔记",
					"小本本"
				],
				"aliases": [
					"note",
					"record",
					"log",
					"jilu",
					"jilu-1"
				],
				"file": "jilu-1.webp"
			},
			{
				"id": "jilu-2",
				"name": "记录",
				"tags": [
					"记录",
					"记笔记",
					"小本本"
				],
				"aliases": [
					"note",
					"record",
					"log",
					"jilu",
					"jilu-2"
				],
				"file": "jilu-2.webp"
			},
			{
				"id": "tiaowu",
				"name": "跳舞",
				"tags": [
					"跳舞",
					"舞蹈",
					"开心"
				],
				"aliases": [
					"dance",
					"dancing",
					"tiaowu"
				],
				"file": "tiaowu.webp"
			},
			{
				"id": "tiaowu-caramelldansen",
				"name": "跳舞(Caramelldansen)",
				"tags": ["跳舞(Caramelldansen)", "洗脑舞"],
				"aliases": [
					"caramelldansen",
					"dance",
					"tiaowu-caramelldansen"
				],
				"file": "tiaowu-caramelldansen.webp"
			},
			{
				"id": "tiaowu-helltaker",
				"name": "跳舞(Helltaker)",
				"tags": ["跳舞(Helltaker)", "节奏舞"],
				"aliases": [
					"helltaker",
					"dance",
					"tiaowu-helltaker"
				],
				"file": "tiaowu-helltaker.webp"
			},
			{
				"id": "tiaowu-pizhichun",
				"name": "跳舞(低皮质醇)",
				"tags": [
					"跳舞(低皮质醇)",
					"低皮质醇",
					"从容",
					"松弛"
				],
				"aliases": [
					"lowcortisol",
					"chill",
					"relax",
					"tiaowu-pizhichun"
				],
				"file": "tiaowu-pizhichun.webp"
			},
			{
				"id": "notice-bits",
				"name": "通知_提示 Bits",
				"tags": [
					"通知_提示 Bits",
					"通知",
					"打赏动画"
				],
				"aliases": [
					"notice",
					"bits",
					"donate",
					"notice-bits"
				],
				"file": "notice-bits.webp"
			},
			{
				"id": "notice-star",
				"name": "通知_提示 星星_收藏",
				"tags": [
					"通知_提示 星星_收藏",
					"通知",
					"收藏动画"
				],
				"aliases": [
					"notice",
					"star",
					"save",
					"favorite",
					"notice-star"
				],
				"file": "notice-star.webp"
			},
			{
				"id": "notice-dianzan",
				"name": "通知_提示 点赞",
				"tags": [
					"通知_提示 点赞",
					"通知",
					"点赞动画"
				],
				"aliases": [
					"notice",
					"like",
					"notice-dianzan"
				],
				"file": "notice-dianzan.webp"
			},
			{
				"id": "notice-like",
				"name": "通知_提示 爱心_喜欢",
				"tags": [
					"通知_提示 爱心_喜欢",
					"通知",
					"喜欢",
					"点赞动画"
				],
				"aliases": [
					"notice",
					"like",
					"notification",
					"notice-like"
				],
				"file": "notice-like.webp"
			},
			{
				"id": "notice-coin",
				"name": "通知_提示 硬币",
				"tags": [
					"通知_提示 硬币",
					"通知",
					"投币动画"
				],
				"aliases": [
					"notice",
					"coin",
					"donate",
					"notice-coin"
				],
				"file": "notice-coin.webp"
			},
			{
				"id": "notice-custom",
				"name": "通知_自定义",
				"tags": [
					"通知_自定义",
					"通知",
					"自定义"
				],
				"aliases": [
					"notice",
					"custom",
					"notice-custom"
				],
				"file": "notice-custom.webp"
			},
			{
				"id": "qian",
				"name": "钱",
				"tags": [
					"钱",
					"钞票",
					"付费",
					"预算"
				],
				"aliases": [
					"money",
					"cash",
					"cost",
					"budget",
					"qian"
				],
				"file": "qian.webp"
			},
			{
				"id": "wenhao",
				"name": "问号",
				"tags": [
					"问号",
					"疑惑",
					"不懂"
				],
				"aliases": [
					"question",
					"confused",
					"what",
					"wenhao"
				],
				"file": "wenhao.webp"
			},
			{
				"id": "jingyin-1",
				"name": "静音",
				"tags": [
					"静音",
					"闭嘴",
					"安静"
				],
				"aliases": [
					"mute",
					"quiet",
					"shutup",
					"jingyin",
					"jingyin-1"
				],
				"file": "jingyin-1.webp"
			},
			{
				"id": "jingyin-2",
				"name": "静音",
				"tags": [
					"静音",
					"闭嘴",
					"安静"
				],
				"aliases": [
					"mute",
					"quiet",
					"shutup",
					"jingyin",
					"jingyin-2"
				],
				"file": "jingyin-2.webp"
			},
			{
				"id": "chan-daocha",
				"name": "馋(刀叉)",
				"tags": [
					"馋(刀叉)",
					"嘴馋",
					"开饭"
				],
				"aliases": [
					"hungry",
					"crave",
					"fork",
					"chan-daocha"
				],
				"file": "chan-daocha.webp"
			},
			{
				"id": "chan-kuaizi",
				"name": "馋(筷子)",
				"tags": [
					"馋(筷子)",
					"嘴馋",
					"想吃"
				],
				"aliases": [
					"hungry",
					"crave",
					"chopsticks",
					"chan-kuaizi"
				],
				"file": "chan-kuaizi.webp"
			},
			{
				"id": "jiashi",
				"name": "驾驶",
				"tags": [
					"驾驶",
					"开车",
					"上路"
				],
				"aliases": [
					"drive",
					"car",
					"roadtrip",
					"jiashi"
				],
				"file": "jiashi.webp"
			},
			{
				"id": "mofa",
				"name": "魔法",
				"tags": [
					"魔法",
					"魔法",
					"施法",
					"变"
				],
				"aliases": [
					"magic",
					"spell",
					"abracadabra",
					"mofa"
				],
				"file": "mofa.webp"
			}
		];
		//#endregion
		//#region src/client/vocab.ts
		/**
		* dsh-memes-reply — 客户端词表来源（v2.0 贴纸派生的输入）。
		*
		* 两条来源，优先权威、兜底离线：
		*
		*   1. **`GET /vocab`（首选）**：宿主读**当前**索引（含 `assetRoot` / `originalRoot` 覆盖），
		*      返回全量 id/name/tags/aliases + 全尺寸 URL。素材重导后不必重装插件。
		*   2. **打包兜底（`vocab-fallback.json`）**：宿主半区是启动时装载的，宿主没重启时
		*      `/vocab` 是 404 —— 这时用打包进来的同一份词表，贴纸层照常工作。
		*      两者的检索字段必须一致，`test/vocab-fallback.test.mjs` 盯着漂移。
		*
		* 兜底词表只带 `file`（压缩副本文件名），URL 用**相对路径**拼：浏览器按当前页面 origin
		* 解析，局域网 IP / 反代前缀都不需要宿主再"学习 origin"。
		*/
		/** 打包兜底词表 → 派生用的形状（相对 URL）。 */
		function bundledVocab() {
			return (items ?? []).map((item) => ({
				id: item.id,
				name: item.name,
				tags: item.tags,
				aliases: item.aliases,
				url: `${STICKER_PATH}/${item.id}.${extensionOf(item.file)}`
			}));
		}
		/** 当前可用的词表：`/vocab` 可达就用它，否则用打包兜底。 */
		async function resolveVocab() {
			const response = await fetchVocab();
			if (response?.ready === true && Array.isArray(response.items) && response.items.length > 0) return {
				entries: response.items,
				source: "host"
			};
			return {
				entries: bundledVocab(),
				source: "bundled"
			};
		}
		//#endregion
		//#region src/client/node.tsx
		/**
		* dsh-memes-reply — 贴纸层：**会话流里的一个派生节点**（v2.0 主线）。
		*
		* ## 它解决什么
		*
		* v1.0 的贴纸是"宿主发事件 → 客户端轮询取走 → 抢一个尾巴座位渲染"，于是有三宗病：
		* 不会动（渲染的是首帧缩略图）、抢不到座位（`present` 交付卡片占着链首）、刷新即空
		* （绑定只在内存里）。v2.0 改成**会话事件到节点的纯函数**：
		*
		* - 一轮 = 一个节点（`turn/start` 建，`turn/end` 落定）；
		* - 节点状态只由会话事件推出来 → 刷新、滚动、切会话都会**原样重放**；
		* - 渲染完全由我们控（圆贴纸压在气泡右下角、全尺寸动画 WebP、悬停放大、点击看大图）；
		* - 两阶段：生成中是「思考/打字中」，落定后**同一个节点**换成这一轮的最终贴纸
		*   （前一张是结构性地消失，不是被遮住）。
		*
		* ## 几个查出来的硬事实（别再踩）
		*
		* 1. 注册表运行时叫 `ctx.uiConversation.events.register(def)`（部署版 1.5-rc.1；
		*    本仓构建期依赖 rc.8 那时叫 `conversationEvents`，所以不 import 那个包的类型）。
		* 2. 节点自己构造：`{key: context.key, kind, id: context.id, target:'chat', anchorSeq, location, visibility, data}`。
		* 3. 渲染按 `kind` 字符串分发；没有对应条目时官方渲染 "unknown surface" 的 JSON 兜底。
		* 4. **`assistant/live-chunk` 这类瞬时事件不进定义**（实测 `帧=0`）：所以生成中的锚点只能取
		*    最后一个**持久**事件的 seq（`turn/start` / `step/start`），它就在流式正文之前 —— 位置正好。
		* 5. 官方 `TURN_PROCESS_INDEPENDENT_KINDS` 折叠白名单里没有我们；把锚点放在**收尾回复之后**
		*    （`assistant/message` 的 seq + 0.1）就不落在"过程窗口"里，不会被折起来（探针实测 `过程成员=no`）。
		*/
		/** 我们的节点 kind（渲染分发按这个字符串）。 */
		const STICKER_NODE_KIND = "memes-sticker";
		/** 客户端构建标记：刷新后从 `/stats` 的 `client-apply` 回执里核对。 */
		const NODE_BUILD = "sticker-node-a";
		/** 从助手消息里抽出可见正文。 */
		function textOfMessage(message) {
			const content = message?.content;
			if (!Array.isArray(content)) return "";
			let text = "";
			for (const block of content) {
				const typed = block;
				if (typed !== null && typed.type === "text" && typeof typed.text === "string") text += typed.text;
			}
			return text;
		}
		/** 从 `use_sticker` 的实参里取 `id` 与 `mood`。 */
		function modelPickOf(argumentsRaw) {
			const empty = {
				id: null,
				mood: null
			};
			if (argumentsRaw === null || argumentsRaw === void 0) return empty;
			let parsed = argumentsRaw;
			if (typeof argumentsRaw === "string") try {
				parsed = JSON.parse(argumentsRaw);
			} catch {
				return empty;
			}
			if (parsed === null || typeof parsed !== "object") return empty;
			const raw = parsed;
			return {
				id: typeof raw.id === "string" && raw.id !== "" ? raw.id : null,
				mood: typeof raw.mood === "string" && raw.mood.trim() !== "" ? raw.mood.trim() : null
			};
		}
		/** 造定义：一轮一个节点。 */
		function makeStickerDefinition() {
			const turnOf = (event) => Number(event.data?.turn ?? 0);
			return {
				kind: STICKER_NODE_KIND,
				target: "chat",
				match(event) {
					if (event.type === "turn/start") return {
						id: String(turnOf(event)),
						role: "start"
					};
					if (event.type === "step/start" || event.type === "assistant/message" || event.type === "tool/call" || event.type === "turn/end") return {
						id: String(turnOf(event)),
						role: "update"
					};
					return null;
				},
				start(_context, match) {
					return {
						turn: turnOf(match.event),
						liveAnchor: Number(match.event.seq),
						closingSeq: 0,
						text: "",
						modelId: null,
						modelMood: null,
						closed: false
					};
				},
				update(context, match) {
					const event = match.event;
					const seq = Number(event.seq);
					const state = context.state;
					if (state === void 0) return {
						turn: turnOf(event),
						liveAnchor: seq,
						closingSeq: 0,
						text: "",
						modelId: null,
						modelMood: null,
						closed: event.type === "turn/end"
					};
					const next = {
						...state,
						liveAnchor: Math.max(state.liveAnchor, seq)
					};
					if (event.type === "assistant/message") {
						next.closingSeq = seq;
						next.text = textOfMessage(event.data?.message);
						return next;
					}
					if (event.type === "tool/call" && event.data?.name === "use_sticker") {
						const pick = modelPickOf(event.data?.arguments);
						if (pick.id !== null) next.modelId = pick.id;
						if (pick.mood !== null) next.modelMood = pick.mood;
						return next;
					}
					if (event.type === "turn/end") next.closed = true;
					return next;
				},
				buildViewNode(context) {
					const state = context.state;
					if (state === void 0) return null;
					const location = context.start?.location ?? context.matches[context.matches.length - 1]?.location;
					const anchorSeq = (state.closed && state.closingSeq > 0 ? state.closingSeq : state.liveAnchor) + .1;
					return {
						key: context.key,
						kind: STICKER_NODE_KIND,
						id: context.id,
						target: "chat",
						anchorSeq,
						location,
						visibility: "visible",
						data: {
							turn: state.turn,
							phase: state.closed ? "settled" : "streaming",
							text: state.text,
							modelId: state.modelId,
							modelMood: state.modelMood
						}
					};
				}
			};
		}
		/** 已经把回执报过的 (key, 阶段)，以及首屏回放的配额。 */
		const reported = /* @__PURE__ */ new Map();
		const REPLAY_REPORT_LIMIT = 6;
		let firstSightings = 0;
		/** 一次性消费 latch：只有"最新的那个已落定回合"能拿走它，避免历史回合把它反复吃掉。 */
		let latchConsumedFor = 0;
		/** 当前视口附近的节点才真正挂 `<img>`（动画 WebP 均值 560KB，长会话里不能全挂）。 */
		function useNearViewport(ref) {
			const [near, setNear] = (0, react.useState)(true);
			(0, react.useEffect)(() => {
				const element = ref.current;
				if (element === null || typeof IntersectionObserver === "undefined") return;
				const observer = new IntersectionObserver((entries) => {
					for (const entry of entries) setNear(entry.isIntersecting);
				}, { rootMargin: "900px 0px" });
				observer.observe(element);
				return () => observer.disconnect();
			}, [ref]);
			return near;
		}
		/** 贴纸层的渲染单元（一轮一个）。 */
		function StickerNodeView({ scope, ...props }) {
			const sessionId = typeof props.sessionId === "string" ? props.sessionId : "";
			const data = props.node?.data;
			const turn = data?.turn ?? 0;
			const phase = data?.phase ?? "settled";
			const [config, setConfig] = (0, react.useState)(() => ({
				...DEFAULT_CONFIG,
				...scope.getSnapshot().value ?? {}
			}));
			const [entries, setEntries] = (0, react.useState)([]);
			const [state, setState] = (0, react.useState)({
				muted: false,
				latch: null,
				sessionLatch: null,
				recent: []
			});
			/**
			* JEV 结论：`undefined` = 还没问（此期间**不显示任何贴纸**，免得先闪一张随机的），
			* `null` = 问过了但没结论（回落既有规则），字符串 = 这一轮就贴它。
			*/
			const [jevPick, setJevPick] = (0, react.useState)(void 0);
			const ref = (0, react.useRef)(null);
			const near = useNearViewport(ref);
			(0, react.useEffect)(() => {
				const read = () => setConfig({
					...DEFAULT_CONFIG,
					...scope.getSnapshot().value ?? {}
				});
				read();
				return scope.subscribe(read);
			}, [scope]);
			(0, react.useEffect)(() => {
				let alive = true;
				(async () => {
					const vocab = await resolveVocab();
					if (!alive) return;
					setEntries(vocab.entries);
					postDebug({
						kind: "sticker-node-vocab",
						note: `source=${vocab.source} 条目=${vocab.entries.length}`
					});
				})();
				return () => {
					alive = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				let alive = true;
				(async () => {
					const next = await fetchSessionState(sessionId);
					if (!alive || next === void 0) return;
					setState({
						muted: next.muted === true,
						latch: next.latch ?? null,
						sessionLatch: next.sessionLatch ?? null,
						recent: Array.isArray(next.recent) ? next.recent : []
					});
				})();
				return () => {
					alive = false;
				};
			}, [sessionId, phase]);
			(0, react.useEffect)(() => {
				if (!config.enabled || state.muted) return;
				if (config.autoMode !== "jev" || phase !== "settled") return;
				let alive = true;
				(async () => {
					const answer = await fetchJevPick({
						sessionId,
						turn,
						text: data?.text ?? ""
					});
					if (!alive) return;
					const id = answer?.ok === true && typeof answer.id === "string" ? answer.id : null;
					setJevPick({ id });
					postDebug({
						kind: "sticker-jev",
						...sessionId === "" ? {} : { sessionId },
						turn,
						...id === null ? {} : { id },
						note: answer === void 0 ? "host 无响应 → 回落既有规则" : answer.ok !== true ? `JEV 失败(${answer.error ?? "?"}) → 回落既有规则` : `${answer.cached === true ? "缓存重放" : `${answer.ms ?? "?"}ms`} family=${answer.family ?? "?"} p=${typeof answer.probability === "number" ? answer.probability.toFixed(2) : "?"} ${id === null ? "判定本轮不贴" : `选中=${id}`}${answer.note === void 0 ? "" : ` (${answer.note})`}`
					});
				})();
				return () => {
					alive = false;
				};
			}, [
				config.enabled,
				config.autoMode,
				state.muted,
				phase,
				sessionId,
				turn,
				data?.text
			]);
			const choice = (0, react.useMemo)(() => {
				if (!config.enabled || state.muted || entries.length === 0) return null;
				if (phase === "streaming") return thinkingStickerFor(entries, sessionId, turn);
				if (config.autoMode === "jev" && jevPick === void 0) return null;
				const latch = state.sessionLatch ?? state.latch;
				return finalStickerFor({
					entries,
					sessionId,
					turn,
					text: data?.text ?? "",
					modelId: data?.modelId ?? null,
					modelMood: data?.modelMood ?? null,
					jevId: jevPick?.id ?? null,
					mode: config.autoMode,
					everyTurns: config.autoEveryTurns,
					fallbackId: config.fallback,
					latchId: latch,
					avoid: new Set(state.recent)
				});
			}, [
				config,
				state,
				entries,
				phase,
				sessionId,
				turn,
				data?.text,
				data?.modelId,
				data?.modelMood,
				jevPick
			]);
			(0, react.useEffect)(() => {
				if (phase !== "settled" || choice?.reason !== "latch") return;
				if (latchConsumedFor >= turn) return;
				latchConsumedFor = turn;
				putLatch(null);
				postDebug({
					kind: "sticker-latch-consumed",
					...sessionId === "" ? {} : { sessionId },
					turn,
					id: choice.id
				});
			}, [
				phase,
				choice?.reason,
				choice?.id,
				turn,
				sessionId
			]);
			(0, react.useEffect)(() => {
				const key = props.node?.key ?? "?";
				const mark = `${phase}|${choice?.id ?? "none"}`;
				if (reported.get(key) === mark) return;
				const firstSight = reported.get(key) === void 0;
				reported.set(key, mark);
				if (firstSight) {
					if (firstSightings >= REPLAY_REPORT_LIMIT) return;
					firstSightings += 1;
				}
				const dataset = (ref.current?.closest("[data-chat-flow-key]"))?.dataset ?? {};
				const rect = ref.current?.getBoundingClientRect();
				postDebug({
					kind: "sticker-node",
					...sessionId === "" ? {} : { sessionId },
					turn,
					...choice === null ? {} : { id: choice.id },
					note: `build=${NODE_BUILD} phase=${phase} 选中=${choice === null ? "无" : `${choice.id}(${reasonText(choice)})`} anchor=${props.node?.anchorSeq ?? "?"} key=${key} 过程成员=${dataset.turnProcessMember ?? "no"} rect=${rect === void 0 ? "?" : `${Math.round(rect.top)}/${Math.round(rect.height)}`}`
				});
			}, [
				phase,
				choice?.id,
				sessionId,
				turn,
				props.node?.anchorSeq,
				props.node?.key
			]);
			if (choice === null) return null;
			const size = Math.max(40, Math.min(220, config.bubbleSize));
			const streaming = phase === "streaming";
			const tip = `《${choice.name}》· ${reasonText(choice)} · 点击看大图`;
			const radius = config.shape === "circle" ? "50%" : `${Math.max(0, config.radius)}px`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref,
				className: "dsh-memes-reply-node-row",
				style: {
					display: "flex",
					justifyContent: "flex-end",
					marginTop: -Math.max(0, config.bubbleRise),
					paddingRight: 6
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsh-memes-reply-node-fish",
					title: tip,
					"aria-label": tip,
					onClick: () => window.open(choice.url, "_blank", "noopener,noreferrer"),
					style: {
						width: size,
						height: size,
						padding: 0,
						border: config.borderStyle === "none" || config.borderWidth <= 0 ? "none" : `${config.borderWidth}px ${config.borderStyle} ${config.borderColor === "" ? "var(--dsw-alias-border-2, #d0d5dd)" : config.borderColor}`,
						borderRadius: radius,
						background: "transparent",
						cursor: "pointer",
						overflow: "hidden",
						opacity: streaming ? .85 : 1,
						transform: streaming ? "scale(0.92)" : "none",
						transition: "transform 120ms ease, opacity 120ms ease"
					},
					children: near ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						src: choice.url,
						alt: choice.name,
						draggable: false,
						onLoad: (event) => {
							const image = event.currentTarget;
							postDebug({
								kind: "sticker-img-loaded",
								...sessionId === "" ? {} : { sessionId },
								turn,
								id: choice.id,
								note: `src=${choice.url} 原始尺寸=${image.naturalWidth}x${image.naturalHeight} 显示=${Math.round(image.clientWidth)}px`
							});
						},
						onError: () => {
							postDebug({
								kind: "sticker-img-error",
								...sessionId === "" ? {} : { sessionId },
								turn,
								id: choice.id,
								note: `src=${choice.url} 加载失败（破图）`
							});
						},
						style: {
							width: "100%",
							height: "100%",
							objectFit: "cover",
							borderRadius: radius,
							display: "block"
						}
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
						display: "block",
						width: "100%",
						height: "100%",
						borderRadius: radius
					} })
				})
			});
		}
		/**
		* 挂上贴纸层。
		*
		* `ctx.inject(['uiConversation'])` 而**不是**顶层 `inject`：万一某个部署里这个服务不存在，
		* 也不能把本插件整个浏览器半边（含设置面板）带下线。
		*/
		function installStickerNode(ctx, scope) {
			ctx.inject(["uiConversation"], (inner) => {
				const ui = inner.uiConversation;
				if (ui === void 0 || ui.events === void 0) {
					postDebug({
						kind: "sticker-node-no-service",
						note: "uiConversation 不在，贴纸层未装上"
					});
					return;
				}
				let dispose = null;
				try {
					dispose = ui.events.register(makeStickerDefinition());
				} catch (error) {
					const message = error?.message;
					postDebug({
						kind: "sticker-node-register-failed",
						note: `build=${NODE_BUILD} err=${typeof message === "string" ? message : String(error)}`
					});
				}
				if (dispose !== null) inner.effect(() => dispose, "dsh-memes-reply: 贴纸节点定义");
				inner.slots.inject("conversation.chat.node", () => inner.slots.register({
					name: "conversation.chat.node",
					key: STICKER_NODE_KIND
				}, (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StickerNodeView, {
					scope,
					...props
				})));
				postDebug({
					kind: "sticker-node-installed",
					note: `build=${NODE_BUILD} kind=${STICKER_NODE_KIND}`
				});
			});
		}
		//#endregion
		//#region src/client/panel.tsx
		/**
		* dsh-memes-reply — 设置面板（官方折叠卡片风格）。
		*
		* 位置：0.1.6a2 插件管理页的 `plugins.bundle.config`
		* （侧栏「插件」→「已安装」→「查看 dsh-memes-reply」，由内置适配层
		* `src/vendor/dsh-plugin-config-slot.tsx` 注册）。
		* 形态对齐原版卡片：标题 + 描述 + 未保存徽章 + chevron → 展开体 → 底部 丢弃/保存。
		* 配置字段走官方 `settingsScope`（草稿→保存，逐字段可"恢复默认"）；状态行、预览墙、
		* 「下一轮用这张」走插件自己的同源路由。
		*/
		/** 预览墙格数。 */
		const WALL_SIZE = 12;
		/** 状态行轮询间隔（只在卡片展开时跑）。 */
		const STATS_POLL_MS = 12e3;
		/** 体积显示。 */
		function formatBytes(bytes) {
			if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
			if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
			return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
		}
		/** 单字段是否被用户覆盖过（PRESENCE 即覆盖，官方 scope 的 user 层语义）。 */
		function isOverridden(user, field) {
			return Object.prototype.hasOwnProperty.call(user, field);
		}
		/** 值比较（保存 diff 用）。 */
		function same(a, b) {
			return Object.is(a, b);
		}
		/** 一行字段：标签 + 控件 + 可选提示 + 可选"恢复默认"。 */
		function Field({ label, hint, overridden, disabled, onReset, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-memes-reply-field",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: label }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-memes-reply-field-control",
						children: [children, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-memes-reply-reset",
							disabled: disabled || !overridden,
							title: overridden ? "清除这一项的覆盖，回到默认值" : "当前就是默认值",
							onClick: onReset,
							children: "默认"
						})]
					}),
					hint !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-memes-reply-field-hint",
						children: hint
					}) : null
				]
			});
		}
		/** 设置卡片（`defaultOpen` = 插件管理页把配置画在独立页面上时直接展开）。 */
		function SettingsCard({ scope, defaultOpen = false }) {
			const snapshot = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => scope.subscribe(listener), [scope]), (0, react.useCallback)(() => scope.getSnapshot(), [scope]));
			const config = (0, react.useMemo)(() => ({
				...DEFAULT_CONFIG,
				...snapshot.value ?? {}
			}), [snapshot.value]);
			const user = snapshot.user ?? {};
			const writable = snapshot.writable && snapshot.status === "ready";
			const [open, setOpen] = (0, react.useState)(defaultOpen);
			const [draft, setDraft] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const [saveFailed, setSaveFailed] = (0, react.useState)(false);
			const [stats, setStats] = (0, react.useState)(null);
			const [catalog, setCatalog] = (0, react.useState)(null);
			const [wallSeed, setWallSeed] = (0, react.useState)(0);
			const [wallLoading, setWallLoading] = (0, react.useState)(false);
			const [latch, setLatch] = (0, react.useState)(null);
			const [latchFailed, setLatchFailed] = (0, react.useState)(false);
			const [preview, setPreview] = (0, react.useState)(null);
			const current = draft ?? config;
			const dirty = (0, react.useMemo)(() => draft !== null && CONFIG_FIELDS.some((field) => !same(current[field], config[field])), [
				draft,
				current,
				config
			]);
			const refreshStats = (0, react.useCallback)(async () => {
				const next = await fetchStats();
				if (next !== void 0) {
					setStats(next);
					setLatch(next.latch);
				}
			}, []);
			const refreshWall = (0, react.useCallback)(async (seed) => {
				setWallLoading(true);
				const next = await fetchCatalog(WALL_SIZE, seed);
				setCatalog(next ?? null);
				setWallLoading(false);
			}, []);
			(0, react.useEffect)(() => {
				if (!open) return;
				refreshStats();
				refreshWall(wallSeed);
				const handle = window.setInterval(() => void refreshStats(), STATS_POLL_MS);
				return () => window.clearInterval(handle);
			}, [
				open,
				refreshStats,
				wallSeed,
				refreshWall
			]);
			const edit = (field, value) => {
				setSaveFailed(false);
				setDraft({
					...draft ?? config,
					[field]: value
				});
			};
			const save = async () => {
				if (!dirty || saving) return;
				setSaving(true);
				setSaveFailed(false);
				try {
					for (const field of CONFIG_FIELDS) if (!same(current[field], config[field])) await scope.set(field, current[field]);
					setDraft(null);
					await refreshStats();
				} catch {
					setSaveFailed(true);
				} finally {
					setSaving(false);
				}
			};
			const discard = () => {
				setDraft(null);
				setSaveFailed(false);
			};
			const resetField = async (field) => {
				setSaveFailed(false);
				const next = { ...draft ?? config };
				delete next[field];
				setDraft(next);
				try {
					await scope.unset(field);
					setDraft(null);
				} catch {
					setSaveFailed(true);
				}
			};
			const select = async (item) => {
				setLatchFailed(false);
				setPreview(item);
				const next = await putLatch(item.id);
				if (next === void 0) {
					setLatchFailed(true);
					return;
				}
				setLatch(next);
			};
			const cancelLatch = async () => {
				setLatchFailed(false);
				const next = await putLatch(null);
				if (next === void 0) {
					setLatchFailed(true);
					return;
				}
				setLatch(next);
				setPreview(null);
			};
			const ready = stats?.ready === true;
			const items = catalog?.items ?? [];
			const latched = latch === null ? null : items.find((item) => item.id === latch) ?? null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: open ? "dsh-memes-reply-card dsh-memes-reply-card-open" : "dsh-memes-reply-card",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "dsh-memes-reply-head",
					"aria-expanded": open,
					"aria-label": `${open ? "收起" : "展开"}大肥鱼表情包回复设置`,
					onClick: () => setOpen(!open),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-memes-reply-headtext",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-memes-reply-name",
								children: "大肥鱼表情包回复"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-memes-reply-desc",
								children: ["模型按语境在回复里贴一张会动的大肥鱼", snapshot.status === "unavailable" ? "（设置不可达，使用默认值）" : ""]
							})]
						}),
						dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-memes-reply-pending",
							children: "未保存"
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-memes-reply-chevron",
							"aria-hidden": true,
							children: "▾"
						})
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-memes-reply-body",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-memes-reply-status",
							children: stats === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "状态不可达（路由未挂载或服务未启动）" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								ready ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									"素材 ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: stats.entries }),
									" 张 · ",
									stats.format || "未知格式",
									" · ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: formatBytes(stats.totalBytes) }),
									" · 已服务",
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: stats.served }),
									" 次",
									stats.miss > 0 ? ` · 未命中 ${stats.miss}` : ""
								] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "dsh-memes-reply-status-error",
									children: ["索引未就绪：先运行 ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: "node scripts/fetch-assets.mjs" })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-memes-reply-btn",
									onClick: () => void refreshStats(),
									children: "刷新"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "dsh-memes-reply-status-path",
									children: [stats.index || "（未找到 index.json）", stats.originalRoot === "" ? "" : ` · 原图目录 ${stats.originalRoot}`]
								})
							] })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-fields",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "总开关",
									hint: "关掉后不再贴图；历史里的图仍能正常显示",
									overridden: isOverridden(user, "enabled"),
									disabled: !writable,
									onReset: () => void resetField("enabled"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-memes-reply-check",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: current.enabled,
											disabled: !writable,
											onChange: (event) => edit("enabled", event.target.checked)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: current.enabled ? "已启用" : "已停用" })]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "画质来源",
									hint: "original 需要填原图目录；找不到文件会静默回落到压缩副本",
									overridden: isOverridden(user, "quality"),
									disabled: !writable,
									onReset: () => void resetField("quality"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: current.quality,
										disabled: !writable,
										onChange: (event) => edit("quality", event.target.value),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "compressed",
											children: "压缩副本（compressed）"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "original",
											children: "原始素材（original）"
										})]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "压缩副本目录",
									hint: "留空 = <DSH_HOME>/memes-reply/assets",
									overridden: isOverridden(user, "assetRoot"),
									disabled: !writable,
									onReset: () => void resetField("assetRoot"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "text",
										value: current.assetRoot,
										placeholder: "留空 = 默认目录",
										disabled: !writable,
										onChange: (event) => edit("assetRoot", event.target.value)
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "原图目录",
									hint: "仅 quality=original 时使用",
									overridden: isOverridden(user, "originalRoot"),
									disabled: !writable,
									onReset: () => void resetField("originalRoot"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "text",
										value: current.originalRoot,
										placeholder: "例如 D:/Pictures/image_ACG/蓝色大肥鱼表情包",
										disabled: !writable,
										onChange: (event) => edit("originalRoot", event.target.value)
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "冷却轮数",
									hint: "同一张贴纸连续 N 轮内不重复；0 = 关闭",
									overridden: isOverridden(user, "cooldownTurns"),
									disabled: !writable,
									onReset: () => void resetField("cooldownTurns"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 0,
										max: 20,
										value: current.cooldownTurns,
										disabled: !writable,
										onChange: (event) => edit("cooldownTurns", Math.max(0, Math.min(20, Number(event.target.value) || 0)))
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "兜底贴纸",
									hint: "关键词一个都没匹配上时用它，保证总有鱼；留空 = 不兜底（只回一条重试建议）",
									overridden: isOverridden(user, "fallback"),
									disabled: !writable,
									onReset: () => void resetField("fallback"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "text",
										value: current.fallback,
										placeholder: "例如 dianzan；留空 = 不兜底",
										disabled: !writable,
										onChange: (event) => edit("fallback", event.target.value.trim())
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "自动贴纸",
									hint: "off = 只由模型决定；keyword = 回复命中情绪词就补一张（默认）；every = 每 N 轮必贴，不问模型；jev = 把回复交给 JEV 判情绪族（会把正文发到 OpenRouter，约 1.3s / 每轮 $0.00005）",
									overridden: isOverridden(user, "autoMode"),
									disabled: !writable,
									onReset: () => void resetField("autoMode"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: current.autoMode,
										disabled: !writable,
										onChange: (event) => edit("autoMode", event.target.value),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "keyword",
												children: "keyword（命中情绪词）"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "every",
												children: "every（每 N 轮必贴）"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "jev",
												children: "jev（按语境判情绪族）"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "off",
												children: "off（只由模型决定）"
											})
										]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "自动间隔轮数",
									hint: "仅 autoMode=every 时生效；1 = 每轮都贴",
									overridden: isOverridden(user, "autoEveryTurns"),
									disabled: !writable,
									onReset: () => void resetField("autoEveryTurns"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 1,
										max: 20,
										value: current.autoEveryTurns,
										disabled: !writable,
										onChange: (event) => edit("autoEveryTurns", Math.max(1, Math.min(20, Number(event.target.value) || 1)))
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "JEV 模型",
									hint: "autoMode=jev 时用的模型；改它等于改决策质量（默认 typesafe/jev-1.13）",
									overridden: isOverridden(user, "jevModel"),
									disabled: !writable,
									onReset: () => void resetField("jevModel"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										value: current.jevModel,
										placeholder: "typesafe/jev-1.13",
										disabled: !writable,
										onChange: (event) => edit("jevModel", event.target.value.trim())
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "JEV 超时（ms）",
									hint: "超时或报错一律回落既有规则，贴纸层绝不拖住会话",
									overridden: isOverridden(user, "jevTimeoutMs"),
									disabled: !writable,
									onReset: () => void resetField("jevTimeoutMs"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 500,
										max: 2e4,
										step: 500,
										value: current.jevTimeoutMs,
										disabled: !writable,
										onChange: (event) => edit("jevTimeoutMs", Math.max(500, Math.min(2e4, Number(event.target.value) || 4e3)))
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "JEV 语气说明",
									hint: "可选：告诉 JEV 这个助手的角色/语气（内容也会被发到 OpenRouter）；留空 = 不给",
									overridden: isOverridden(user, "jevPersona"),
									disabled: !writable,
									onReset: () => void resetField("jevPersona"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										value: current.jevPersona,
										placeholder: "例如：中文技术助手，语气干脆、偶尔自嘲",
										disabled: !writable,
										onChange: (event) => edit("jevPersona", event.target.value)
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "JEV 调试浮层",
									hint: "开着会在页面右上出现一枚可拖的小胶囊，点开成面板：能看到每次真实往返发给 JEV 的请求与 JEV 回的响应（只读诊断，收起就不轮询）",
									overridden: isOverridden(user, "jevDebugVisible"),
									disabled: !writable,
									onReset: () => void resetField("jevDebugVisible"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-memes-reply-check",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: current.jevDebugVisible,
											disabled: !writable,
											onChange: (event) => edit("jevDebugVisible", event.target.checked)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: current.jevDebugVisible ? "显示" : "隐藏" })]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "常驻挂件",
									hint: "页面上一直显示一只大肥鱼（随时能看到）：点它换一张、拖动可移动、✕ 收成小圆点",
									overridden: isOverridden(user, "petVisible"),
									disabled: !writable,
									onReset: () => void resetField("petVisible"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "dsh-memes-reply-check",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: current.petVisible,
											disabled: !writable,
											onChange: (event) => edit("petVisible", event.target.checked)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: current.petVisible ? "显示中" : "已隐藏" })]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "挂件大小",
									hint: "边长（px），建议 96–240",
									overridden: isOverridden(user, "petSize"),
									disabled: !writable,
									onReset: () => void resetField("petSize"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 64,
										max: 320,
										value: current.petSize,
										disabled: !writable,
										onChange: (event) => edit("petSize", Math.max(64, Math.min(320, Number(event.target.value) || 128)))
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "挂件停靠角",
									hint: "默认停在哪一角；拖动过之后以拖拽坐标为谁",
									overridden: isOverridden(user, "petCorner"),
									disabled: !writable,
									onReset: () => void resetField("petCorner"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: current.petCorner,
										disabled: !writable,
										onChange: (event) => edit("petCorner", event.target.value),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "br",
												children: "右下"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "bl",
												children: "左下"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "tr",
												children: "右上"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "tl",
												children: "左上"
											})
										]
									})
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-section-title",
							children: ["外观", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "三种贴纸共用形状与边框；改完立即生效" })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-fields",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "外形",
									hint: "圆形 / 圆角方形（挂件、气泡角、兜底三种贴纸共用）",
									overridden: isOverridden(user, "shape"),
									disabled: !writable,
									onReset: () => void resetField("shape"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: current.shape,
										disabled: !writable,
										onChange: (event) => edit("shape", event.target.value),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "circle",
											children: "圆形"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "rounded",
											children: "圆角方形"
										})]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "圆角半径",
									hint: "仅「圆角方形」时生效（px）",
									overridden: isOverridden(user, "radius"),
									disabled: !writable,
									onReset: () => void resetField("radius"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 0,
										max: 64,
										value: current.radius,
										disabled: !writable,
										onChange: (event) => edit("radius", Math.max(0, Math.min(64, Number(event.target.value) || 0)))
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "边框粗细",
									hint: "px，0 = 无边框",
									overridden: isOverridden(user, "borderWidth"),
									disabled: !writable,
									onReset: () => void resetField("borderWidth"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 0,
										max: 8,
										value: current.borderWidth,
										disabled: !writable,
										onChange: (event) => edit("borderWidth", Math.max(0, Math.min(8, Number(event.target.value) || 0)))
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "边框样式",
									hint: "实线 / 虚线 / 无",
									overridden: isOverridden(user, "borderStyle"),
									disabled: !writable,
									onReset: () => void resetField("borderStyle"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: current.borderStyle,
										disabled: !writable,
										onChange: (event) => edit("borderStyle", event.target.value),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "solid",
												children: "实线"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "dashed",
												children: "虚线"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "none",
												children: "无边框"
											})
										]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "边框颜色",
									hint: "如 #4c9aff；留空 = 跟随主题强调色",
									overridden: isOverridden(user, "borderColor"),
									disabled: !writable,
									onReset: () => void resetField("borderColor"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "text",
										value: current.borderColor,
										placeholder: "留空 = 主题色",
										disabled: !writable,
										onChange: (event) => edit("borderColor", event.target.value.trim())
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "气泡角贴纸大小",
									hint: "贴在回复右下角那枚的边长（px）",
									overridden: isOverridden(user, "bubbleSize"),
									disabled: !writable,
									onReset: () => void resetField("bubbleSize"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 48,
										max: 240,
										value: current.bubbleSize,
										disabled: !writable,
										onChange: (event) => edit("bubbleSize", Math.max(48, Math.min(240, Number(event.target.value) || 96)))
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "气泡角上移量",
									hint: "px，越大越往气泡上压；0 = 贴在气泡下方",
									overridden: isOverridden(user, "bubbleRise"),
									disabled: !writable,
									onReset: () => void resetField("bubbleRise"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 0,
										max: 120,
										value: current.bubbleRise,
										disabled: !writable,
										onChange: (event) => edit("bubbleRise", Math.max(0, Math.min(120, Number(event.target.value) || 0)))
									})
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-section-title",
							children: ["素材预览", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: catalog === null ? "" : `共 ${catalog.total} 张 · 点一张＝下一轮贴它` })]
						}),
						wallLoading && items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-memes-reply-empty",
							children: "正在载入…"
						}) : items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-memes-reply-empty",
							children: "没有可预览的素材（检查索引与素材目录）"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-memes-reply-wall",
							children: items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: latch === item.id ? "dsh-memes-reply-cell dsh-memes-reply-cell-active" : "dsh-memes-reply-cell",
								title: `${item.name} · ${formatBytes(item.bytes)} · ${item.frames} 帧 @ ${item.fps}fps`,
								onClick: () => void select(item),
								children: [item.thumb === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-memes-reply-cell-fallback",
									children: item.name
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
									src: item.thumb,
									alt: item.name,
									loading: "lazy",
									decoding: "async"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-memes-reply-cell-name",
									children: item.name
								})]
							}, item.id))
						}),
						preview !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-preview",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
								src: preview.url,
								alt: preview.name
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								"《",
								preview.name,
								"》 · ",
								formatBytes(preview.bytes),
								" · ",
								preview.frames,
								" 帧 · ",
								(preview.durationMs / 1e3).toFixed(2),
								"s",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								latch === preview.id ? "已指定：下一轮会贴这张" : "未指定"
							] })]
						}) : null,
						latch !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "dsh-memes-reply-preview",
							children: [
								"下一轮指定：",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: latched?.name ?? latch }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-memes-reply-btn",
									onClick: () => void cancelLatch(),
									children: "取消指定"
								})
							]
						}) : null,
						latchFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-memes-reply-failed",
							children: "操作失败：请确认插件路由可用"
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-memes-reply-footer",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-memes-reply-btn",
									disabled: wallLoading,
									onClick: () => setWallSeed((seed) => seed + 1),
									children: "换一批"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-memes-reply-spacer" }),
								saveFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-memes-reply-failed",
									children: "保存失败"
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-memes-reply-btn",
									disabled: !dirty || saving,
									onClick: discard,
									children: "丢弃"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsh-memes-reply-btn dsh-memes-reply-btn-primary",
									disabled: !dirty || saving || !writable,
									onClick: () => void save(),
									children: saving ? "保存中…" : "保存"
								})
							]
						})
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/client/pet.tsx
		/**
		* dsh-memes-reply — 常驻挂件（"随时能看到大肥鱼"）。
		*
		* 坐在 `shell.overlay`：官方目录把它定义为 *frame-wide floating layer*——**加法型**
		* （`replaceRisk: none`），而且"the layer itself is click-through — entries opt back into
		* pointer events"，所以我只在鱼身范围内接管事件，不会挡住下面的界面。
		*
		* 这也是你原来那只 `鲸鱼娘` 的模型（`~/.dsh/pet.json` 里就是 `display: {visible, size,
		* right, bottom}`）：一枚常驻的、可拖、可换、可收起的圆贴纸，只是这里有 157 张可轮换。
		*
		* 状态：位置 / 是否收成小圆点 / 当前那张都写进 host 的 `state.json`（`/pet` 端点），
		* 刷新页面、换个会话都还在。
		*/
		/** 挂件尺寸的夹取范围。 */
		const MIN_SIZE = 64;
		const MAX_SIZE = 320;
		/** 收起来之后那枚小圆点的边长。 */
		const DOT_SIZE = 32;
		/** 拖拽判定的最小位移：小于它算"点击"（换一张）。 */
		const DRAG_SLOP = 4;
		/** 四角的默认停靠位置（拖过之后以拖拽坐标为准）。 */
		const CORNER_STYLE = {
			br: {
				right: 28,
				bottom: 104
			},
			bl: {
				left: 28,
				bottom: 104
			},
			tr: {
				right: 28,
				top: 96
			},
			tl: {
				left: 28,
				top: 96
			}
		};
		/** 夹取。 */
		function clamp(value, min, max) {
			return Math.min(max, Math.max(min, Math.round(value)));
		}
		/** 常驻挂件。 */
		function StickerPet({ scope }) {
			const snapshot = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => scope.subscribe(listener), [scope]), (0, react.useCallback)(() => scope.getSnapshot(), [scope]));
			const config = (0, react.useMemo)(() => ({
				...DEFAULT_CONFIG,
				...snapshot.value ?? {}
			}), [snapshot.value]);
			const [item, setItem] = (0, react.useState)(null);
			const [pet, setPet] = (0, react.useState)({});
			const [hover, setHover] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			/** 拖拽期间的位置镜像（state 更新是异步的，落点要用它）。 */
			const posRef = (0, react.useRef)(null);
			const dragRef = (0, react.useRef)(null);
			const size = clamp(config.petSize, MIN_SIZE, MAX_SIZE);
			/** 换一张：优先用记住的那张，否则随机取一批里的头一张。 */
			const shuffle = (0, react.useCallback)(async (preferId) => {
				setBusy(true);
				try {
					const picked = (preferId !== void 0 && preferId !== "" ? await fetchCatalog(1, 0, preferId) : await fetchCatalog(8, Math.floor(Math.random() * 1e6)))?.items?.[0];
					if (picked === void 0) return;
					setItem(picked);
					putLayout({
						slot: "pet",
						id: picked.id
					});
				} finally {
					setBusy(false);
				}
			}, []);
			(0, react.useEffect)(() => {
				let alive = true;
				(async () => {
					const saved = (await fetchLayout())?.pet;
					if (!alive) return;
					if (saved !== void 0) {
						setPet(saved);
						if (typeof saved.right === "number" && typeof saved.bottom === "number") posRef.current = {
							right: saved.right,
							bottom: saved.bottom
						};
					}
					await shuffle(saved?.id);
				})();
				return () => {
					alive = false;
				};
			}, [shuffle]);
			const style = (0, react.useMemo)(() => {
				const base = {
					width: pet.collapsed === true ? DOT_SIZE : size,
					height: pet.collapsed === true ? DOT_SIZE : size
				};
				if (typeof pet.right === "number" && typeof pet.bottom === "number") {
					base.right = pet.right;
					base.bottom = pet.bottom;
					return base;
				}
				return {
					...base,
					...CORNER_STYLE[config.petCorner]
				};
			}, [
				pet,
				size,
				config.petCorner
			]);
			if (!config.petVisible) return null;
			const onPointerDown = (event) => {
				const element = event.currentTarget;
				element.setPointerCapture?.(event.pointerId);
				const rect = element.getBoundingClientRect();
				dragRef.current = {
					x: event.clientX,
					y: event.clientY,
					right: window.innerWidth - rect.right,
					bottom: window.innerHeight - rect.bottom,
					moved: false
				};
			};
			const onPointerMove = (event) => {
				const drag = dragRef.current;
				if (drag === null) return;
				const dx = event.clientX - drag.x;
				const dy = event.clientY - drag.y;
				if (!drag.moved && Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
				drag.moved = true;
				const right = clamp(drag.right - dx, 4, Math.max(4, window.innerWidth - DOT_SIZE - 4));
				const bottom = clamp(drag.bottom - dy, 4, Math.max(4, window.innerHeight - DOT_SIZE - 4));
				posRef.current = {
					right,
					bottom
				};
				setPet((previous) => ({
					...previous,
					right,
					bottom
				}));
			};
			const onPointerUp = (event) => {
				const drag = dragRef.current;
				dragRef.current = null;
				event.currentTarget.releasePointerCapture?.(event.pointerId);
				if (drag === null) return;
				if (!drag.moved) {
					if (pet.collapsed === true) {
						setPet((previous) => ({
							...previous,
							collapsed: false
						}));
						putLayout({
							slot: "pet",
							collapsed: false
						});
					} else shuffle();
					return;
				}
				if (posRef.current !== null) putLayout({
					slot: "pet",
					...posRef.current
				});
			};
			const collapse = (collapsed) => {
				setPet((previous) => ({
					...previous,
					collapsed
				}));
				putLayout({
					slot: "pet",
					collapsed
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsh-memes-reply-pet-layer",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: pet.collapsed === true ? "dsh-memes-reply-pet dsh-memes-reply-pet-dot" : hover ? "dsh-memes-reply-pet dsh-memes-reply-pet-hover" : "dsh-memes-reply-pet",
					style,
					role: "button",
					tabIndex: 0,
					"aria-label": item === null ? "大肥鱼挂件" : `大肥鱼挂件：《${item.name}》· 点击换一张`,
					title: item === null ? "大肥鱼挂件" : `《${item.name}》· 点击换一张 · 拖动可移动`,
					onPointerDown,
					onPointerMove,
					onPointerUp,
					onPointerCancel: onPointerUp,
					onMouseEnter: () => setHover(true),
					onMouseLeave: () => setHover(false),
					onKeyDown: (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							shuffle();
						}
					},
					children: [item === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-memes-reply-pet-empty",
						"aria-hidden": true,
						children: "🐟"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						className: "dsh-memes-reply-pet-img",
						src: pet.collapsed === true ? item.thumb ?? item.url : item.url,
						alt: item.name,
						draggable: false
					}), pet.collapsed !== true && hover ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-memes-reply-pet-tools",
						onPointerDown: (event) => event.stopPropagation(),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-memes-reply-pet-tool",
							disabled: busy,
							title: "换一张",
							onClick: () => void shuffle(),
							children: "✨"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-memes-reply-pet-tool",
							title: "收成小圆点（随时点它再展开）",
							onClick: () => collapse(true),
							children: "✕"
						})]
					}) : null]
				})
			});
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* dsh-memes-reply — 设置面板样式（浏览器侧，全部用官方主题变量）。
		*
		* 观感对齐原版设置页的折叠卡片：同样的边框层级、同样的三级文字色、
		* 同样的 12px 圆角与 13px 行高。所有颜色都走 `--dsw-alias-*`，明暗主题自动跟随。
		*/
		/** 类名前缀（避免与原版或其它插件撞样式）。 */
		const P = "dsh-memes-reply";
		/** 面板 CSS。 */
		const CSS = `
.${P}-card {
  list-style: none;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3));
  background: var(--dsw-alias-bg-layer-3, rgba(128, 128, 128, 0.06));
  border-radius: 12px;
  overflow: hidden;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.${P}-card:hover { border-color: var(--dsw-alias-label-dimmed, rgba(128, 128, 128, 0.5)); }
.${P}-card-open {
  background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.1));
  border-color: var(--dsw-alias-label-dimmed, rgba(128, 128, 128, 0.5));
}
.${P}-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  background: none;
  border: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}
.${P}-head:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4c9aff); outline-offset: -2px; }
.${P}-headtext { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.${P}-name { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary, inherit); }
.${P}-desc { font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-tertiary, inherit); }
.${P}-pending {
  flex: 0 0 auto;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform, rgba(128, 128, 128, 0.2));
  color: var(--dsw-alias-label-secondary, inherit);
}
.${P}-chevron { flex: 0 0 auto; color: var(--dsw-alias-label-tertiary, inherit); transition: transform 0.15s ease; }
.${P}-card-open .${P}-chevron { transform: rotate(180deg); }
.${P}-body { border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3)); padding: 12px 14px 14px; }
.${P}-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3, rgba(128, 128, 128, 0.06));
  font-size: 12.5px;
  color: var(--dsw-alias-label-secondary, inherit);
}
.${P}-status b { color: var(--dsw-alias-label-primary, inherit); font-weight: 600; }
.${P}-status-path { flex: 1 1 100%; font-size: 11.5px; color: var(--dsw-alias-label-tertiary, inherit); word-break: break-all; }
.${P}-status-error { color: var(--dsw-alias-label-error, #e5484d); }
.${P}-fields { display: grid; gap: 10px; margin-top: 12px; }
.${P}-field { display: grid; grid-template-columns: 148px minmax(0, 1fr); align-items: center; gap: 8px 12px; }
.${P}-field > label { font-size: 13px; color: var(--dsw-alias-label-secondary, inherit); }
.${P}-field-hint { grid-column: 2; font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-tertiary, inherit); margin: 0; }
.${P}-field-control { display: flex; align-items: center; gap: 8px; min-width: 0; }
.${P}-field input[type='text'],
.${P}-field input[type='number'],
.${P}-field select {
  width: 100%;
  min-width: 0;
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform, rgba(128, 128, 128, 0.09));
  color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  font: inherit;
  font-size: 13px;
}
.${P}-field input:disabled, .${P}-field select:disabled { opacity: 0.6; cursor: not-allowed; }
.${P}-check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--dsw-alias-label-primary, inherit); }
.${P}-reset {
  flex: 0 0 auto;
  font-size: 11.5px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3));
  background: none;
  color: var(--dsw-alias-label-tertiary, inherit);
  cursor: pointer;
}
.${P}-reset:hover:not(:disabled) { color: var(--dsw-alias-label-primary, inherit); }
.${P}-reset:disabled { opacity: 0.4; cursor: default; }
.${P}-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, inherit);
}
.${P}-section-title span { font-weight: 400; font-size: 11.5px; color: var(--dsw-alias-label-tertiary, inherit); }
.${P}-wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
.${P}-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: var(--dsw-alias-bg-layer-3, rgba(128, 128, 128, 0.06));
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.${P}-cell:hover { border-color: var(--dsw-alias-label-dimmed, rgba(128, 128, 128, 0.5)); }
.${P}-cell-active {
  border-color: var(--dsw-alias-brand-primary, #4c9aff);
  background: var(--dsw-alias-bg-module-platform, rgba(128, 128, 128, 0.16));
}
.${P}-cell img { width: 72px; height: 72px; border-radius: 8px; background: var(--dsw-alias-bg-base, transparent); object-fit: contain; }
.${P}-cell-fallback {
  width: 72px; height: 72px; display: flex; align-items: center; justify-content: center;
  font-size: 11px; text-align: center; color: var(--dsw-alias-label-tertiary, inherit);
  border-radius: 8px; background: var(--dsw-alias-bg-module-platform, rgba(128, 128, 128, 0.12));
}
.${P}-cell-name {
  max-width: 80px; font-size: 11px; line-height: 14px; text-align: center;
  color: var(--dsw-alias-label-secondary, inherit);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.${P}-preview { display: flex; align-items: center; gap: 10px; margin-top: 10px; font-size: 12.5px; color: var(--dsw-alias-label-secondary, inherit); }
.${P}-preview img { width: 96px; height: 96px; border-radius: 10px; background: var(--dsw-alias-bg-layer-3, rgba(128, 128, 128, 0.06)); }
.${P}-empty { font-size: 12.5px; color: var(--dsw-alias-label-tertiary, inherit); padding: 8px 0; }
.${P}-footer {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 14px; padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3));
}
.${P}-btn {
  padding: 5px 12px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3));
  background: none;
  color: var(--dsw-alias-label-secondary, inherit);
}
.${P}-btn:hover:not(:disabled) { color: var(--dsw-alias-label-primary, inherit); }
.${P}-btn:disabled { opacity: 0.45; cursor: default; }
.${P}-btn-primary {
  background: var(--dsw-alias-brand-primary, #4c9aff);
  border-color: var(--dsw-alias-brand-primary, #4c9aff);
  color: #fff;
}
.${P}-btn-primary:hover:not(:disabled) { color: #fff; opacity: 0.92; }
.${P}-failed { font-size: 12.5px; color: var(--dsw-alias-label-error, #e5484d); }
.${P}-spacer { flex: 1; }

/* ---- 常驻挂件（shell.overlay）：随时能看到的那只大肥鱼 ---- */
.${P}-pet-layer { position: fixed; inset: 0; pointer-events: none; }
.${P}-pet {
  position: fixed;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid var(--dsw-alias-brand-primary, #4c9aff);
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.92));
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
  cursor: grab;
  user-select: none;
  touch-action: none;
  pointer-events: auto;
  transition: transform 0.12s ease;
}
.${P}-pet:hover, .${P}-pet-hover { transform: scale(1.06); }
.${P}-pet:active { cursor: grabbing; }
.${P}-pet:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4c9aff); outline-offset: 2px; }
.${P}-pet-img { width: 100%; height: 100%; border-radius: 50%; object-fit: contain; pointer-events: none; }
.${P}-pet-empty { font-size: 22px; line-height: 1; }
.${P}-pet-dot { border-width: 1px; opacity: 0.92; box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2); }
.${P}-pet-tools {
  position: absolute;
  top: -10px;
  right: -8px;
  display: flex;
  gap: 4px;
  pointer-events: auto;
}
.${P}-pet-tool {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.95));
  color: var(--dsw-alias-label-secondary, inherit);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}
.${P}-pet-tool:hover:not(:disabled) { color: var(--dsw-alias-label-primary, inherit); }
.${P}-pet-tool:disabled { opacity: 0.5; cursor: default; }

/* ---- JEV 调试漂浮面板（可开关） ---- */
.${P}-jev-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 60;
}
.${P}-jev-chip {
  position: fixed;
  pointer-events: auto;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.95));
  color: var(--dsw-alias-label-secondary, inherit);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.${P}-jev-chip:hover { color: var(--dsw-alias-label-primary, inherit); }
.${P}-jev-panel {
  position: fixed;
  pointer-events: auto;
  width: 440px;
  max-width: calc(100vw - 24px);
  max-height: min(72vh, 640px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.98));
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  font-size: 12px;
}
.${P}-jev-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: grab;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.25));
  color: var(--dsw-alias-label-primary, inherit);
  font-weight: 600;
  user-select: none;
}
.${P}-jev-title:active { cursor: grabbing; }
.${P}-jev-totals {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, inherit);
}
.${P}-jev-actions { display: flex; gap: 4px; }
.${P}-jev-tool {
  width: 20px; height: 20px; padding: 0;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  background: none;
  color: var(--dsw-alias-label-secondary, inherit);
  font-size: 11px; line-height: 1; cursor: pointer;
}
.${P}-jev-tool:hover { color: var(--dsw-alias-label-primary, inherit); }
.${P}-jev-hint {
  padding: 6px 10px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary, inherit);
}
.${P}-jev-error {
  margin: 0 10px 6px;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-primary, inherit);
  background: color-mix(in srgb, #e5484d 16%, transparent);
}
.${P}-jev-empty {
  padding: 10px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, inherit);
}
.${P}-jev-empty code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-module-platform, rgba(128, 128, 128, 0.12));
}
.${P}-jev-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding: 0 10px 6px;
  list-style: none;
}
.${P}-jev-item { border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2)); }
.${P}-jev-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 0;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  color: inherit;
  cursor: pointer;
}
.${P}-jev-time { font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-tertiary, inherit); }
.${P}-jev-badge {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10.5px;
  white-space: nowrap;
}
.${P}-jev-badge-good { background: color-mix(in srgb, #30a46c 20%, transparent); }
.${P}-jev-badge-bad { background: color-mix(in srgb, #e5484d 22%, transparent); }
.${P}-jev-badge-muted { background: var(--dsw-alias-bg-module-platform, rgba(128, 128, 128, 0.14)); }
.${P}-jev-meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, inherit);
}
.${P}-jev-caret { color: var(--dsw-alias-label-tertiary, inherit); }
.${P}-jev-body { padding: 0 0 8px; }
.${P}-jev-label {
  margin: 6px 0 3px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, inherit);
}
.${P}-jev-pre {
  margin: 0;
  padding: 6px 8px;
  max-height: 190px;
  overflow: auto;
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform, rgba(128, 128, 128, 0.1));
  color: var(--dsw-alias-label-secondary, inherit);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 15px;
  white-space: pre-wrap;
  word-break: break-word;
}

`;
		//#endregion
		//#region src/client/index.tsx
		/** 客户端构建标记：每次改客户端就换一个，刷新后从 `/stats` 的 `client-apply` 回执里核对。 */
		const CLIENT_BUILD = "bundle-config-slot-c";
		/** 需要的客户端服务（缺一个就等，不硬撑）。 */
		const inject = ["slots", "settingsScope"];
		/** 挂载浏览器半边。 */
		function apply(ctx) {
			postDebug({
				kind: "client-apply",
				note: `build=${CLIENT_BUILD}`
			});
			const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.plugin = SETTINGS_NS;
				const render = (value) => {
					style.textContent = `${CSS}\n${themeCss({
						...DEFAULT_CONFIG,
						...value ?? {}
					})}`;
				};
				render(scope.getSnapshot().value);
				const unsubscribe = scope.subscribe(() => render(scope.getSnapshot().value));
				document.head.appendChild(style);
				return () => {
					unsubscribe();
					style.remove();
				};
			}, "dsh-memes-reply: panel styles");
			registerBundleConfigPage(ctx, {
				bundle: "dsh-memes-reply",
				summary: "模型按语境在回复里贴一张会动的大肥鱼",
				source: scope,
				render: () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsCard, {
					scope,
					defaultOpen: true
				})
			});
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-memes-reply-pet",
				order: 30
			}, () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StickerPet, { scope })));
			installStickerNode(ctx, scope);
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-memes-reply-jev-debug",
				order: 31
			}, () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(JevDebugPanel, { scope })));
		}
		//#endregion
		exports.CLIENT_BUILD = CLIENT_BUILD;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map