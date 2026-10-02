/**
 * `src/closing.ts` 的单元测试。
 *
 * 这几条锁的是**落定贴纸换座位之后的数据来源**：插件不再自己从会话事件累积状态，
 * 而是读官方 `TurnTailChatData.closing`（本轮最后一个有内容的收尾助手）。
 * 取错了就是"每轮贴纸消失或选错"，所以逐条钉住。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { closingPickOf, closingTextOf, flowPickOf, modelPickOf } from '../lib/closing.js'

test('modelPickOf：对象实参', () => {
  assert.deepEqual(modelPickOf({ id: 'bug', mood: '翻车' }), { id: 'bug', mood: '翻车' })
})

test('modelPickOf：JSON 字符串实参（tool-call 的 argsRaw 就是这种）', () => {
  assert.deepEqual(modelPickOf('{"id":"dianzan","mood":"点赞"}'), { id: 'dianzan', mood: '点赞' })
})

test('modelPickOf：坏 JSON / null / 非对象一律回落到空', () => {
  assert.deepEqual(modelPickOf('{不是 JSON'), { id: null, mood: null })
  assert.deepEqual(modelPickOf(null), { id: null, mood: null })
  assert.deepEqual(modelPickOf(undefined), { id: null, mood: null })
  assert.deepEqual(modelPickOf('一个字符串'), { id: null, mood: null })
  assert.deepEqual(modelPickOf(42), { id: null, mood: null })
})

test('modelPickOf：空串与空白不当成有效值', () => {
  assert.deepEqual(modelPickOf({ id: '', mood: '   ' }), { id: null, mood: null })
  // mood 会被 trim —— 模型多打的空格不该进检索器
  assert.deepEqual(modelPickOf({ mood: ' 收工 ' }), { id: null, mood: '收工' })
})

test('closingTextOf：只拼 text 块，忽略 reasoning / tool-call / 其它', () => {
  const closing = {
    blocks: [
      { kind: 'reasoning', text: '我在想…' },
      { kind: 'text', text: '第一段' },
      { kind: 'tool-call', name: 'use_sticker', argsRaw: '{"mood":"收工"}' },
      { kind: 'text', text: '第二段' },
      { kind: 'image', attachment: {} },
    ],
  }
  assert.equal(closingTextOf(closing), '第一段\n第二段')
})

test('closingTextOf：没有收尾 / 没有块 → 空串（调用方按"命中不了关键词"处理）', () => {
  assert.equal(closingTextOf(null), '')
  assert.equal(closingTextOf(undefined), '')
  assert.equal(closingTextOf({}), '')
  assert.equal(closingTextOf({ blocks: [] }), '')
})

test('closingPickOf：取最后一个 use_sticker（模型可能试过多次，最后一次才算数）', () => {
  const closing = {
    blocks: [
      { kind: 'tool-call', name: 'use_sticker', argsRaw: '{"mood":"得意"}' },
      { kind: 'text', text: '中间还有正文' },
      { kind: 'tool-call', name: 'use_sticker', argsRaw: '{"id":"qingzhu","mood":"庆祝"}' },
    ],
  }
  assert.deepEqual(closingPickOf(closing), { id: 'qingzhu', mood: '庆祝' })
})

test('closingPickOf：忽略其它工具的 tool-call', () => {
  const closing = {
    blocks: [
      { kind: 'tool-call', name: 'shell', argsRaw: '{"mood":"不该被读到"}' },
      { kind: 'tool-call', name: 'use_sticker', argsRaw: '{"id":"bug"}' },
      { kind: 'tool-call', name: 'read_file', argsRaw: '{}' },
    ],
  }
  assert.deepEqual(closingPickOf(closing), { id: 'bug', mood: null })
})

test('closingPickOf：实参坏了不影响其它块，回落成空', () => {
  const closing = {
    blocks: [{ kind: 'tool-call', name: 'use_sticker', argsRaw: '不是 JSON' }],
  }
  assert.deepEqual(closingPickOf(closing), { id: null, mood: null })
})

test('closingPickOf：没有收尾 / 没有点名 → 空', () => {
  assert.deepEqual(closingPickOf(null), { id: null, mood: null })
  assert.deepEqual(closingPickOf({ blocks: [{ kind: 'text', text: '只有正文' }] }), { id: null, mood: null })
})

// ── flowPickOf：0.2.0 把「调工具」与「写正文」拆在两步时的兜底来源 ──────────────
//
// 回归背景：模型先调 use_sticker、下一步才写收尾正文，于是 closing.blocks 里没有那次
// tool-call，落定座位只看到"没点名"，贴的是规则/兜底那张（实测 pick=无，而生成中座位
// 报「模型点名「收工」」）。这里锁住"从本轮贴纸节点取回点名"这条兜底路径。

test('flowPickOf：从会话快照里取本轮那个贴纸节点已经算好的点名', () => {
  const snapshot = {
    locations: { getTurn: (turn) => (turn === 6 ? ['13:memes-sticker6'] : []) },
    nodes: {
      get: (key) =>
        key === '13:memes-sticker6' ? { kind: 'memes-sticker', data: { modelId: 'qingzhu', modelMood: null } } : undefined,
    },
  }
  assert.deepEqual(flowPickOf(snapshot, 6, 'memes-sticker'), { id: 'qingzhu', mood: null })
})

test('flowPickOf：只看本轮的贴纸节点（别的 kind 跳过，多个取最后一个）', () => {
  const nodes = {
    a: { kind: 'assistant-step', data: { modelId: 'bug', modelMood: '翻车' } },
    b: { kind: 'memes-sticker', data: { modelId: null, modelMood: null } },
    c: { kind: 'memes-sticker', data: { modelId: 'dianzan', modelMood: '点赞' } },
  }
  const snapshot = { locations: { getTurn: () => ['a', 'b', 'c'] }, nodes: { get: (key) => nodes[key] } }
  assert.deepEqual(flowPickOf(snapshot, 3, 'memes-sticker'), { id: 'dianzan', mood: '点赞' })
})

test('flowPickOf：快照形状不对 / 没有节点 / 没有点名 → 一律回落空，且不抛', () => {
  const empty = { id: null, mood: null }
  assert.deepEqual(flowPickOf(undefined, 1, 'memes-sticker'), empty)
  assert.deepEqual(flowPickOf({}, 1, 'memes-sticker'), empty)
  assert.deepEqual(flowPickOf({ locations: { getTurn: () => ['x'] }, nodes: { get: () => undefined } }, 1, 'memes-sticker'), empty)
  assert.deepEqual(flowPickOf({ locations: { getTurn: () => ['x'] }, nodes: { get: () => ({ kind: 'memes-sticker', data: {} }) } }, 1, 'memes-sticker'), empty)
})
