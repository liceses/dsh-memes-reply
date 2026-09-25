/**
 * dsh-memes-reply — 外观变量（纯函数，host 与浏览器共用，可单测）。
 *
 * v2.0 之后仍有 **两处**外观由设置驱动：
 *   - 常驻挂件（`shell.overlay` 里的那只）：形状 / 边框走这里的 CSS 变量；
 *   - 会话流里的贴纸节点：形状 / 尺寸 / 边框在组件里直接读配置（它本来就要读配置做派生，
 *     所以不再绕一层 CSS 变量 —— 少一处"组件与样式表各写一套"的漂移源）。
 *
 * 这里只生成一段**CSS 变量覆盖**追加在基础样式之后。
 */
import type { MemesConfig } from './types.js';
/** 数值夹取（设置面板可能被手改，schema 之外再兜一层）。 */
export declare function clampNumber(value: unknown, min: number, max: number, fallback: number): number;
/** 生成设置驱动的 CSS 覆盖块（追加在基础样式之后）。 */
export declare function themeCss(config: MemesConfig): string;
