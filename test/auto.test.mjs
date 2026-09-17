/**
 * 贴纸规则单测（v2.0 起只剩"怎么选一张"）。纯函数，不碰磁盘。
 *
 * v1.0 的传输件（待取位 AutoBus / 文本缓冲 / llm-stream 观察者）已随"宿主发布 → 客户端轮询"
 * 那条链一起退役：贴纸现在是**会话事件的纯函数**（见 `lib/derive.js` 与 `src/client/node.tsx`）。
 * 规则本身仍由这里盯着 —— host 与浏览器半边共用同一份实现。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pickAutoSticker, pickByKeyword, pickEvery } from '../lib/auto.js'

/** 三条最小素材。 */
const ENTRIES = [
  {
    id: 'bug',
    name: 'Bug',
    file: 'bug.webp',
    source: 'o.gif',
    seq: null,
    tags: ['虫子', '报错', '修好了'],
    aliases: ['bug', 'error'],
    bytes: 1,
    sha256: '',
    thumb: 'bug.webp',
    w: 1,
    h: 1,
    frames: 1,
    fps: 1,
    durationMs: 1,
    encode: null,
  },
  {
    id: 'qingzhu',
    name: '庆祝',
    file: 'qingzhu.webp',
    source: 'o2.gif',
    seq: null,
    tags: ['成功', '收工'],
    aliases: ['done'],
    bytes: 1,
    sha256: '',
    thumb: null,
    w: 1,
    h: 1,
    frames: 1,
    fps: 1,
    durationMs: 1,
    encode: null,
  },
  {
    id: 'xiao',
    name: '笑',
    file: 'xiao.webp',
    source: 'o3.gif',
    seq: null,
    tags: ['开心', '哈哈'],
    aliases: ['lol'],
    bytes: 1,
    sha256: '',
    thumb: null,
    w: 1,
    h: 1,
    frames: 1,
    fps: 1,
    durationMs: 1,
    encode: null,
  },
]

const NONE = new Set()

test('关键词模式：命中最具体的词，单字词不参与', () => {
  const hit = pickByKeyword(ENTRIES, '这个 bug 终于修好了，可以收工', NONE)
  assert.ok(hit !== null)
  // 「修好了」(3 字) 比「bug」(3 字) 同长但同为标签；两者都命中 bug 条目 → 仍然是 bug
  assert.equal(hit.entry.id, 'bug')
  assert.ok(hit.matched.length >= 2)

  // 无匹配 → null（不乱贴）
  assert.equal(pickByKeyword(ENTRIES, '今天天气不错，去散个步', NONE), null)

  // 单字标签不参与：把「笑」单独放进文本里不会命中 —— 但「笑」是条目 name（1 字），
  // 按 minTermLen=2 被跳过，所以这里应返回 null。
  assert.equal(pickByKeyword(ENTRIES, '笑', NONE), null)
  // 而两字标签能命中
  assert.equal(pickByKeyword(ENTRIES, '哈哈', NONE)?.entry.id, 'xiao')
})

test('关键词模式：avoid 里的贴纸不再被选中', () => {
  const hit = pickByKeyword(ENTRIES, '修好了', new Set(['bug']))
  assert.equal(hit, null)
})

test('每 N 轮：确定性、respect avoid、空素材返回 null', () => {
  const a = pickEvery(ENTRIES, 's1', 3, NONE)
  const b = pickEvery(ENTRIES, 's1', 3, NONE)
  assert.ok(a !== null && b !== null)
  assert.equal(a.entry.id, b.entry.id, '同一个 (会话,轮次) 必须选同一张')

  const avoidAll = new Set(['bug', 'qingzhu'])
  const only = pickEvery(ENTRIES, 's1', 3, avoidAll)
  assert.equal(only?.entry.id, 'xiao')

  assert.equal(pickEvery([], 's1', 3, NONE), null)
  // 全部被 avoid 掉时退化成"从全部里挑"，而不是不贴
  assert.ok(pickEvery(ENTRIES, 's1', 3, new Set(['bug', 'qingzhu', 'xiao'])) !== null)
})

test('规则入口：off 不贴；every 只在整倍数轮贴', () => {
  const base = { sessionId: 's1', text: '修好了', entries: ENTRIES, avoid: NONE }
  assert.equal(pickAutoSticker({ ...base, mode: 'off', everyTurns: 3, turn: 3 }), null)
  assert.equal(pickAutoSticker({ ...base, mode: 'keyword', everyTurns: 3, turn: 99 })?.entry.id, 'bug')
  assert.equal(pickAutoSticker({ ...base, mode: 'every', everyTurns: 3, turn: 4 }), null)
  assert.ok(pickAutoSticker({ ...base, mode: 'every', everyTurns: 3, turn: 6 }) !== null)
  // everyTurns 非法值被夹到 1（= 每轮都贴），不会变成"永不贴"
  assert.ok(pickAutoSticker({ ...base, mode: 'every', everyTurns: 0, turn: 1 }) !== null)
})

test('规则入口：轮次号/间隔是坏数字时也不许静默不贴（真事故的回归）', () => {
  const base = { sessionId: 's1', text: '', entries: ENTRIES, avoid: NONE }
  // 真事故：turn 缺失 → `NaN % 1 !== 0` → every 模式永远不发布，而且没有任何报错。
  for (const bad of [undefined, null, NaN, 'x']) {
    assert.ok(
      pickAutoSticker({ ...base, mode: 'every', everyTurns: 1, turn: bad }) !== null,
      `turn=${String(bad)} 时也该贴一张，而不是静默不贴`,
    )
  }
  for (const bad of [undefined, NaN, 'x']) {
    assert.ok(pickAutoSticker({ ...base, mode: 'every', everyTurns: bad, turn: 5 }) !== null)
  }
  // 但"间隔 3、轮次 4"这种正常的不整倍数，仍然要克制地不贴
  assert.equal(pickAutoSticker({ ...base, mode: 'every', everyTurns: 3, turn: 4 }), null)
})

