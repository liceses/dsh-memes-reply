/**
 * dsh-memes-reply — 路由与协议常量。
 *
 * 全部放在这里，是为了让 host 与（M2 的）client 用同一份字符串常量，
 * 不出现"两边各自写死一个路径"的漂移。
 */
/** 本插件占用的路由前缀（webServer 前缀路由）。 */
export declare const ROUTE_PREFIX = "/api/dsh-memes-reply";
/** 贴纸字节端点：`<STICKER_PATH>/<id>.<ext>`。 */
export declare const STICKER_PATH = "/api/dsh-memes-reply/sticker";
/** 缩略图端点（设置面板预览墙用）：`<THUMB_PATH>/<id>.<ext>`。 */
export declare const THUMB_PATH = "/api/dsh-memes-reply/thumb";
/** 素材清单端点（预览墙数据）。 */
export declare const CATALOG_PATH = "/api/dsh-memes-reply/catalog";
/**
 * 检索词表端点（v2.0 客户端派生用）。
 *
 * 与 `/catalog` 的区别：这里是**全量**的精简词表（id/name/tags/aliases + 全尺寸 URL），
 * 一次拉取、只在客户端做关键词扫描用；`/catalog` 是分页+种子的预览墙数据。
 */
export declare const VOCAB_PATH = "/api/dsh-memes-reply/vocab";
/**
 * 会话态端点（静音 / 一次性指定 / 最近用过）。
 *
 * v2.0 把"贴哪张"的**算法**搬到了客户端（纯派生、刷新即重放），但"人按过的开关"
 * 仍然由宿主说了算：这个端点就是客户端读那三个字段的唯一入口。
 */
export declare const SESSION_STATE_PATH = "/api/dsh-memes-reply/session-state";
/** 「下一轮用这张」端点（设置面板写入）。 */
export declare const LATCH_PATH = "/api/dsh-memes-reply/latch";
/**
 * JEV 取结论端点（`autoMode='jev'` 时客户端来取这一轮该贴哪张）。
 *
 * 为什么结论要绕宿主一圈：JEV 调用需要 API key，而客户端 bundle **绝不能**带 key。
 * 宿主按 `(sessionId, turn)` 缓存结论，客户端刷新只是重放，不会换一张。
 */
export declare const JEV_PATH = "/api/dsh-memes-reply/jev-pick";
/**
 * JEV 调试日志端点（漂浮面板读它）。
 *
 * 为什么与 `/stats` 分开：一份往返带请求原文与响应原文（裁剪后各约 1–4 KB），
 * 而 `/stats` 是 12 秒轮询的常客 —— 挂进去等于每次轮询都搬一堆没人看的 JSON。
 */
export declare const JEV_LOG_PATH = "/api/dsh-memes-reply/jev-log";
/** 界面落点（常驻挂件的拖拽坐标，客户端读写，落在 state.json）。 */
export declare const LAYOUT_PATH = "/api/dsh-memes-reply/layout";
/** 旧名保留：`/pet` 与 `/layout` 等价（早期版本只服务挂件）。 */
export declare const PET_PATH = "/api/dsh-memes-reply/layout";
/** 诊断端点。 */
export declare const STATS_PATH = "/api/dsh-memes-reply/stats";
/**
 * 诊断回执（客户端 → host，只进内存环形缓冲，不落盘）。
 * 存在的理由：浏览器控制台我看不到，而"贴纸到底走到哪一步断的"必须可观测。
 */
export declare const DEBUG_PATH = "/api/dsh-memes-reply/debug";
/** 设置命名空间。 */
export declare const SETTINGS_NS = "dsh-memes-reply";
/** 模型工具名。 */
export declare const TOOL_NAME = "use_sticker";
/** 斜杠命令名（不含前导斜杠）。 */
export declare const COMMAND_NAME = "fish";
/** 单张贴纸的读取上限（原图最大 8.4 MB，留足余量）。 */
export declare const MAX_STICKER_BYTES: number;
/** id 白名单：小写字母数字与连字符。因为只接受这个形状，路由天然不存在路径穿越。 */
export declare const STICKER_ID_RE: RegExp;
/** 扩展名 → Content-Type。 */
export declare const MIME: Readonly<Record<string, string>>;
/** 从文件名取扩展名（小写，不含点）。 */
export declare function extensionOf(file: string): string;
/** 组装一张贴纸的绝对 URL（markdown 图片必须是绝对 http(s) URL 才会被渲染）。 */
export declare function stickerUrl(origin: string, entry: {
    id: string;
    file: string;
}): string;
/** 缩略图文件名：索引里有就用它，否则按 `<id>.webp` 约定猜。 */
export declare function thumbFileOf(entry: {
    id: string;
    thumb?: string | null;
}): string;
/** 组装一张缩略图的绝对 URL。 */
export declare function thumbUrl(origin: string, entry: {
    id: string;
    thumb?: string | null;
}): string;
