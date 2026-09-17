/**
 * 贴纸派生单测（v2.0 的核心逻辑）。
 *
 * 为什么这个文件很重要：贴纸现在不是"宿主发过来的事件"，而是**会话事件的纯函数**
 * （`lib/derive.js`，host 与浏览器半边共用）。这条性质撑着三件事：
 *   1. 刷新即重放（同输入 → 同输出）；
 *   2. 不需要任何持久化绑定；
 *   3. "静音 / 指定 / 冷却"仍由宿主说了算（它们是输入的一部分，不是随机扰动）。
 * 所以这里逐条锁死优先级与确定性 —— 将来谁把 `Math.random()` 引进派生路径，会立刻红。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { finalStickerFor, hashText, reasonText, thinkingStickerFor, THINKING_IDS } from '../lib/derive.js'

/** 最小词表：四条，字段形状与 `/vocab` 一致。 */
const ENTRIES = [
  { id: 'dianzan', name: '点赞', tags: ['点赞', '好评'], aliases: ['like'], url: '/api/dsh-memes-reply/sticker/dianzan.webp' },
  { id: 'bug', name: 'Bug', tags: ['bug', '踩坑'], aliases: ['bug'], url: '/api/dsh-memes-reply/sticker/bug.webp' },
  { id: 'sikao', name: '正在思考', tags: ['思考中'], aliases: [], url: '/api/dsh-memes-reply/sticker/sikao.webp' },
  { id: 'dazi', name: '打字(普通)', tags: ['打字中'], aliases: [], url: '/api/dsh-memes-reply/sticker/dazi.webp' },
]

/** 派生入参的基线。 */
const BASE = {
  entries: ENTRIES,
  sessionId: 's1',
  turn: 3,
  text: '',
  mode: 'every',
  everyTurns: 1,
}

test('优先级：一次性指定 > 模型点名 > 规则 > 兜底', () => {
  const latch = finalStickerFor({ ...BASE, latchId: 'dianzan', modelId: 'bug', text: '踩坑了', fallbackId: 'sikao' })
  assert.equal(latch?.id, 'dianzan')
  assert.equal(latch?.reason, 'latch')

  const model = finalStickerFor({ ...BASE, latchId: null, modelId: 'bug', text: '踩坑了', fallbackId: 'sikao' })
  assert.equal(model?.id, 'bug')
  assert.equal(model?.reason, 'model')

  const keyword = finalStickerFor({ ...BASE, latchId: null, modelId: null, mode: 'keyword', text: '这个 bug 终于踩坑修好', fallbackId: 'sikao' })
  assert.equal(keyword?.id, 'bug')
  assert.equal(keyword?.reason, 'keyword')
})

test('模型只给了关键词（mood）：客户端用同一套检索解出 id', () => {
  const choice = finalStickerFor({ ...BASE, modelMood: '点赞' })
  assert.equal(choice?.id, 'dianzan')
  assert.equal(choice?.reason, 'model')
  assert.equal(choice?.matched, '点赞')
  assert.match(reasonText(choice), /模型点名/)
})

test('模型给了一个不存在的 id：不当成命中，落回规则', () => {
  const choice = finalStickerFor({ ...BASE, modelId: 'nope', mode: 'keyword', text: '踩坑' })
  assert.equal(choice?.id, 'bug')
  assert.equal(choice?.reason, 'keyword')
})

test('every 模式是确定性的：同 (会话, 轮次) 永远同一张', () => {
  const a = finalStickerFor({ ...BASE, mode: 'every', turn: 7 })
  const b = finalStickerFor({ ...BASE, mode: 'every', turn: 7 })
  const c = finalStickerFor({ ...BASE, mode: 'every', turn: 8 })
  assert.equal(a?.id, b?.id, '同输入必须同输出（刷新即重放的基础）')
  assert.ok(a !== null && c !== null)
  assert.equal(a.reason, 'every')
})

test('avoid（冷却）里的贴纸不会在 every 模式里被选中', () => {
  const first = finalStickerFor({ ...BASE, mode: 'every', turn: 5 })
  assert.ok(first !== null)
  const avoid = new Set([String(first.id)])
  const second = finalStickerFor({ ...BASE, mode: 'every', turn: 5, avoid })
  assert.notEqual(second?.id, first.id, '冷却里的那张必须让位')
})

test('keyword 不命中 + 没兜底 = 这一轮没有贴纸（宁可没有，也不乱贴）', () => {
  const none = finalStickerFor({ ...BASE, mode: 'keyword', text: '今天天气不错' })
  assert.equal(none, null)
})

test('兜底贴纸：规则一个都没选中时才用，且如实标注原因', () => {
  const choice = finalStickerFor({ ...BASE, mode: 'keyword', text: '今天天气不错', fallbackId: 'dianzan' })
  assert.equal(choice?.id, 'dianzan')
  assert.equal(choice?.reason, 'fallback')
  assert.equal(reasonText(choice), '兜底那张')
})

test('autoMode=off：规则不选（但点名/指定仍然有效）', () => {
  assert.equal(finalStickerFor({ ...BASE, mode: 'off', text: '踩坑了' }), null)
  assert.equal(finalStickerFor({ ...BASE, mode: 'off', modelId: 'bug' })?.id, 'bug')
  // 面板"下一轮用这张"是人的显式动作，off 也认。
  assert.equal(finalStickerFor({ ...BASE, mode: 'off', latchId: 'dianzan' })?.id, 'dianzan')
})

test('生成中占位：确定性轮换，且只从"思考/打字"那一组里挑', () => {
  const a = thinkingStickerFor(ENTRIES, 's1', 3)
  const b = thinkingStickerFor(ENTRIES, 's1', 3)
  assert.equal(a?.id, b?.id, '同一个回合反复渲染必须是同一张')
  assert.equal(a?.reason, 'thinking')
  assert.ok(THINKING_IDS.includes(String(a?.id)), `应落在占位组里，实际 ${a?.id}`)
  const empty = thinkingStickerFor([], 's1', 3)
  assert.equal(empty, null, '词表为空时安静地返回 null，不许抛')
})

test('hashText：稳定、区分大小写之外的输入差异', () => {
  assert.equal(hashText('s1:3'), hashText('s1:3'))
  assert.notEqual(hashText('s1:3'), hashText('s1:4'))
})
