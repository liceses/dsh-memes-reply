/**
 * dsh-memes-reply — 设置面板样式（浏览器侧，全部用官方主题变量）。
 *
 * 观感对齐原版设置页的折叠卡片：同样的边框层级、同样的三级文字色、
 * 同样的 12px 圆角与 13px 行高。所有颜色都走 `--dsw-alias-*`，明暗主题自动跟随。
 */

/** 类名前缀（避免与原版或其它插件撞样式）。 */
const P = 'dsh-memes-reply'

/** 面板 CSS。 */
export const CSS = `
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

`
