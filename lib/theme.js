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
/** 数值夹取（设置面板可能被手改，schema 之外再兜一层）。 */
export function clampNumber(value, min, max, fallback) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric))
        return fallback;
    return Math.min(max, Math.max(min, Math.round(numeric)));
}
/** 边框颜色：空串 = 跟随主题强调色。 */
function borderColorOf(config) {
    const raw = config.borderColor.trim();
    if (raw === '')
        return 'var(--dsw-alias-brand-primary, #4c9aff)';
    // 只接受 hex / rgb() / 命名色这类简单值，防止把任意 CSS 注进来。
    return /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s]+\)|[a-zA-Z]+)$/.test(raw)
        ? raw
        : 'var(--dsw-alias-brand-primary, #4c9aff)';
}
/** 边框样式：`none` 或 0 粗细都表示没有边框。 */
function borderStyleOf(style, width) {
    if (style === 'none' || width <= 0)
        return 'none';
    return style === 'dashed' ? 'dashed' : 'solid';
}
/** 常驻挂件仍是"组件 + 样式表"两段式：形状与边框由设置驱动。 */
const PET_TARGETS = ['.dsh-memes-reply-pet', '.dsh-memes-reply-pet-img'].join(', ');
/** 生成设置驱动的 CSS 覆盖块（追加在基础样式之后）。 */
export function themeCss(config) {
    const shape = config.shape === 'rounded' ? 'rounded' : 'circle';
    const radius = clampNumber(config.radius, 0, 64, 18);
    const width = clampNumber(config.borderWidth, 0, 8, 2);
    const radiusCss = shape === 'circle' ? '50%' : `${radius}px`;
    return [
        `/* dsh-memes-reply: 设置驱动的外观（常驻挂件） */`,
        `${PET_TARGETS} { border-radius: ${radiusCss}; }`,
        `.dsh-memes-reply-pet {` +
            ` border-width: ${width}px; border-style: ${borderStyleOf(config.borderStyle, width)};` +
            ` border-color: ${borderColorOf(config)}; }`,
    ].join('\n');
}
//# sourceMappingURL=theme.js.map