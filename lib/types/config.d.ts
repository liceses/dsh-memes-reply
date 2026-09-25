/**
 * dsh-memes-reply — 纯常量配置（host 与浏览器半边共用）。
 *
 * 单独成一个模块的理由：`schema.ts` 里有 schemastery 的 Schema 对象，
 * 浏览器半边**绝不能** import 它（会把 schemastery 打进客户端 bundle）。
 * 所以默认值这类纯数据放这里，`schema.ts` 再 re-export 保持 host 侧 import 不变。
 */
import type { MemesConfig } from './types.js';
/** 配置默认值：`assetRoot` 留空表示"跟随默认目录"，避免把绝对路径写进设置文件。 */
export declare const DEFAULT_CONFIG: MemesConfig;
/** 设置面板里字段的顺序（也决定保存 diff 的顺序）。 */
export declare const CONFIG_FIELDS: Array<keyof MemesConfig>;
/** 关键词模式里可参与命中的最短词长：单字太容易误命中，一律不参与。 */
export declare const AUTO_KEYWORD_MIN_TERM_LEN = 2;
/**
 * 匹配失败时回给模型的"保证能命中"的词。
 * 这些词都写在 `scripts/sticker-map.json` 的标签里，并有回归测试盯着——
 * 给模型的建议词必须真的检索得到（这条纪律是被两次真实事故教出来的）。
 */
export declare const RETRY_WORDS: string[];
/** 预览墙默认格数。 */
export declare const CATALOG_DEFAULT_LIMIT = 12;
/** 预览墙最多格数（防止有人手改 query 拉爆）。 */
export declare const CATALOG_MAX_LIMIT = 48;
