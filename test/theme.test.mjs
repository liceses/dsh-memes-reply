/**
 * 外观变量单测：设置驱动的 CSS 覆盖块必须**只**产出安全的、夹取过的值。
 *
 * 这条很关键：外观是"用户随便填"的字段（颜色、半径、粗细），一旦拼错就会把整页样式搞坏。
 * v2.0 起这里只剩常驻挂件 —— 会话流里的贴纸节点在组件里直接读配置（见 client/node.tsx），
 * 所以下面只断言挂件那两条规则。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_CONFIG } from '../lib/config.js'
import { clampNumber, themeCss } from '../lib/theme.js'

/** 造配置。 */
function config(patch = {}) {
  return { ...DEFAULT_CONFIG, ...patch }
}

test('themeCss：默认产出圆形 + 主题色边框', () => {
  const css = themeCss(config())
  assert.match(css, /border-radius: 50%/)
  assert.match(css, /border-width: 2px; border-style: solid/)
  assert.match(css, /border-color: var\(--dsw-alias-brand-primary/)
  // 退役的两件（气泡角 / 兜底浮层）不该再产出任何变量。
  assert.doesNotMatch(css, /bubble-size|bubble-rise|fallback-size/)
})

test('themeCss：圆角方形 + 自定义边框颜色/样式/粗细', () => {
  const css = themeCss(
    config({ shape: 'rounded', radius: 24, borderWidth: 4, borderStyle: 'dashed', borderColor: '#ff8800' }),
  )
  assert.match(css, /border-radius: 24px/)
  assert.match(css, /border-width: 4px; border-style: dashed/)
  assert.match(css, /border-color: #ff8800/)
})

test('themeCss：边框粗细 0 或 none 都等于没有边框', () => {
  assert.match(themeCss(config({ borderWidth: 0 })), /border-style: none/)
  assert.match(themeCss(config({ borderStyle: 'none' })), /border-style: none/)
})

test('themeCss：非法颜色不会把任意 CSS 注进来', () => {
  const css = themeCss(config({ borderColor: 'red; } body { display:none } .x {' }))
  assert.doesNotMatch(css, /body\s*\{/, '不能把注入的内容原样拼进去')
  assert.match(css, /border-color: var\(--dsw-alias-brand-primary/)
  // 常见的安全写法仍然放行
  assert.match(themeCss(config({ borderColor: 'rgb(255, 0, 0)' })), /border-color: rgb\(255, 0, 0\)/)
  assert.match(themeCss(config({ borderColor: 'tomato' })), /border-color: tomato/)
})

test('themeCss：半径与粗细都被夹到安全区间（手改设置也不会出格）', () => {
  const css = themeCss(config({ shape: 'rounded', radius: 999, borderWidth: 99, borderStyle: 'dashed' }))
  assert.match(css, /border-radius: 64px/)
  assert.match(css, /border-width: 8px/)
  assert.match(css, /border-style: dashed/)
})

test('clampNumber：非数字一律回落默认值', () => {
  assert.equal(clampNumber(undefined, 0, 10, 3), 3)
  assert.equal(clampNumber('x', 0, 10, 3), 3)
  assert.equal(clampNumber(NaN, 0, 10, 3), 3)
  assert.equal(clampNumber('7', 0, 10, 3), 7)
  assert.equal(clampNumber(12, 0, 10, 3), 10)
})
