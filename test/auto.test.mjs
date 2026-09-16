/**
 * 自动贴纸（B-auto）单测：规则、待取位、文本缓冲。纯函数 + 注入时钟，不碰磁盘。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createAutoBus,
  createAutoTextBuffer,
  pickAutoSticker,
  pickByKeyword,
  pickEvery,
  tapTextStream,
} from '../lib/auto.js'

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

test('待取位：seq 单调、按 since 去重、init 只同步游标、过期不补发', () => {
  let now = 1_000_000
  const bus = createAutoBus(() => now)
  const published = bus.publish({
    sessionId: 's1',
    turn: 1,
    id: 'bug',
    name: 'Bug',
    url: 'http://x/1',
    thumb: null,
    reason: 'keyword',
    matched: '修好了',
    at: now,
  })
  assert.equal(published.seq, 1)

  // 首次（init）只给游标
  assert.deepEqual(bus.pending('s1', 0, true), { seq: 1, event: null })
  // 正常取到
  assert.equal(bus.pending('s1', 0, false).event?.id, 'bug')
  // 游标"超前"（来自上一个 host 进程：重启后 seq 归零，浏览器却还记着旧游标）→ 必须夹回 0，
  // 否则事件会被 `event.seq <= since` 永久过滤掉 —— 这正是"重启后怎么都不出贴纸"的原因之一。
  assert.equal(bus.pending('s1', 40, false).event?.id, 'bug', '超前游标应被夹回 0')
  // 已经取过的游标不再重复
  assert.equal(bus.pending('s1', 1, false).event, null)
  // 别的会话互不干扰
  assert.equal(bus.pending('s2', 0, false).event, null)

  // 过期（> TTL）不再补发
  now += 10 * 60 * 1000
  assert.equal(bus.pending('s1', 0, false).event, null)
})

test('文本缓冲：累积、取走即清、有上限', () => {
  const buffer = createAutoTextBuffer()
  buffer.feed('s1', '前半句')
  buffer.feed('s1', '后半句')
  assert.equal(buffer.take('s1'), '前半句后半句')
  assert.equal(buffer.take('s1'), '')
  assert.equal(buffer.size(), 0)

  buffer.feed('s1', 'x'.repeat(20_000))
  assert.ok(buffer.take('s1').length <= 8_000, '缓冲必须有上限')
})

test('流观察者：只吃 text-delta，且原样透传所有 chunk', async () => {
  const buffer = createAutoTextBuffer()
  const chunks = [
    { type: 'reasoning-delta', text: '不该被收进正文' },
    { type: 'text-delta', text: '修好' },
    { type: 'text-delta', text: '了' },
    { type: 'usage', usage: {} },
  ]
  async function* source() {
    for (const chunk of chunks) yield chunk
  }
  const seen = []
  for await (const chunk of tapTextStream(buffer, 's1', source())) seen.push(chunk)
  assert.equal(seen.length, chunks.length, '一个 chunk 都不能吞')
  assert.equal(buffer.take('s1'), '修好了')
})

test('最后一步信号：这一步没调工具 → 流结束时回调一次（贴纸提前发布）', async () => {
  const buffer = createAutoTextBuffer()
  let calls = 0
  async function* plain() {
    yield { type: 'text-delta', text: '修好了' }
    yield { type: 'usage', usage: {} }
    yield { type: 'finish', reason: 'stop' }
  }
  for await (const _chunk of tapTextStream(buffer, 's1', plain(), () => {
    calls += 1
  })) {
    // 跑完即可
  }
  assert.equal(calls, 1, '没有工具调用 → 这是最后一步，应该回调')
})

test('最后一步信号：这一步调了工具 → 不回调（后面还有步，等真正最后一步）', async () => {
  for (const chunk of [
    { type: 'tool-call', id: 'c1', name: 'read', arguments: '{}' },
    { type: 'tool-call-delta', index: 0, id: 'c1', argumentsDelta: '{}' },
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: { type: 'tool-call' } },
  ]) {
    const buffer = createAutoTextBuffer()
    let calls = 0
    async function* withTool() {
      yield { type: 'text-delta', text: '先看一下' }
      yield chunk
    }
    for await (const _chunk of tapTextStream(buffer, 's1', withTool(), () => {
      calls += 1
    })) {
      // 跑完即可
    }
    assert.equal(calls, 0, `chunk ${chunk.type} 说明这一步调了工具，不该当成最后一步`)
  }
})
