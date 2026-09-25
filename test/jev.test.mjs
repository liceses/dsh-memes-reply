/**
 * JEV 决策层单测。
 *
 * 只测纯函数与注入点：**不碰网络、不碰磁盘、不碰真实时钟**。
 * 唯一的例外是最后一条"族表必须真实存在"——它读 `assets/index.json`，
 * 因为那张表是人工整理的，没有它就没东西挡住一个拼错的 id 静默失效。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { MOOD_BLANK, MOOD_FAMILIES, allFamilyMembers, familyCriteria, familyOf } from '../lib/moods.js'
import {
  buildJevRequest,
  capped,
  createDecisionCache,
  createJevLog,
  decideJev,
  JEV_DEFAULT_TIMEOUT_MS,
  keyFromCredentials,
  loadJevKey,
  parseJevResponse,
  pickInFamily,
} from '../lib/jev.js'

/** 最小素材集（族成员子集）。 */
const ENTRIES = [
  { id: 'qingzhu', name: '庆祝', tags: ['收工'], aliases: ['qingzhu'] },
  { id: 'ganbei', name: '干杯', tags: ['谈成了'], aliases: ['ganbei'] },
  { id: 'defen-10', name: '得分', tags: ['满分'], aliases: [] },
  { id: 'bug', name: 'Bug', tags: ['报错'], aliases: ['bug'] },
]

/** 一份合法响应的样板。 */
function goodBody(choice, probability, noul, cost) {
  return {
    answers: {
      stick: { type: 'noul', noul },
      family: {
        type: 'choice',
        choice,
        probabilities: { [choice]: probability, bug: Math.max(0, 1 - probability - 0.1), blank: 0.1 },
        confidence: 0.5,
      },
    },
    usage: { input_tokens: 100, output_tokens: 10, ...(cost === undefined ? {} : { cost }) },
  }
}

/** 注入点样板。 */
function deps(overrides = {}) {
  return {
    fetch: async () => ({ ok: true, status: 200, json: async () => goodBody('celebrate', 0.61, 0.81, 0.00005) }),
    readFile: () => '',
    env: { OPENROUTER_API_KEY: 'sk-test' },
    credentialsPath: '',
    now: () => 0,
    ...overrides,
  }
}

test('keyFromCredentials 取得到，也认得带引号的形式', () => {
  assert.equal(keyFromCredentials('version: 1\nrecords:\n  OPENROUTER_API_KEY: sk-abc123\n'), 'sk-abc123')
  assert.equal(keyFromCredentials('OPENROUTER_API_KEY: "sk-quoted"\n'), 'sk-quoted')
  assert.equal(keyFromCredentials('OPENROUTER_API_KEY: \'sk-single\'\n'), 'sk-single')
})

test('keyFromCredentials 面对别的 key 与空文件返回空串（不误取）', () => {
  assert.equal(keyFromCredentials('OPENROUTER_API_KEY_OLD: sk-old\n'), '')
  assert.equal(keyFromCredentials('DEEPSEEK_API_KEY: sk-deep\n'), '')
  assert.equal(keyFromCredentials(''), '')
})

test('loadJevKey：环境变量优先于 credentials 文件', () => {
  const file = 'OPENROUTER_API_KEY: sk-from-file\n'
  assert.equal(
    loadJevKey({ env: { OPENROUTER_API_KEY: 'sk-from-env' }, credentialsPath: '/x', readFile: () => file }),
    'sk-from-env',
  )
  // env 没有 → 落到文件（本机实测：DSH 把 key 存在文件里而没注入环境变量）
  assert.equal(loadJevKey({ env: {}, credentialsPath: '/x', readFile: () => file }), 'sk-from-file')
  // 文件读失败也不能抛
  assert.equal(
    loadJevKey({
      env: {},
      credentialsPath: '/x',
      readFile: () => {
        throw new Error('ENOENT')
      },
    }),
    '',
  )
})

test('buildJevRequest 问的是「哪一族」，并要求一个 stick 是非题', () => {
  const req = buildJevRequest({ reply: '验收完成，全绿。', recent: ['qingzhu'] })
  assert.equal(req.questions.stick.type, 'noul')
  assert.equal(req.questions.family.type, 'choice')
  const criteria = req.questions.family.criteria
  for (const family of MOOD_FAMILIES) assert.ok(criteria[family.key] !== undefined, `缺族 ${family.key}`)
  assert.ok(criteria[MOOD_BLANK] !== undefined, '缺 blank')
  // 157 张直选实测会糊（margin 0.02），所以候选里**不该**出现具体贴纸 id
  assert.equal(Object.keys(criteria).length, MOOD_FAMILIES.length + 1)
  assert.equal(req.state.assistant_reply, '验收完成，全绿。')
  assert.deepEqual(req.state.recently_used, ['qingzhu'])
  assert.equal(req.model, 'typesafe/jev-1.13')
})

test('buildJevRequest 可选的用户话/语气说明只在给了的时候出现', () => {
  const bare = buildJevRequest({ reply: 'x' })
  assert.equal('user_message' in bare.state, false)
  assert.equal('persona' in bare.state, false)
  const full = buildJevRequest({ reply: 'x', userText: '你好', persona: '干脆' })
  assert.equal(full.state.user_message, '你好')
  assert.equal(full.state.persona, '干脆')
})

test('parseJevResponse 接受合法响应并取出概率', () => {
  const parsed = parseJevResponse(goodBody('celebrate', 0.61, 0.81))
  assert.deepEqual(parsed, { family: 'celebrate', probability: 0.61, yesProbability: 0.81 })
})

test('parseJevResponse 接受 blank（这是"这轮不贴"的唯一出口）', () => {
  const parsed = parseJevResponse(goodBody(MOOD_BLANK, 0.7, 0.1))
  assert.equal(parsed?.family, MOOD_BLANK)
})

test('parseJevResponse 拒绝未知 label —— 缺字段/畸形的响应是错误，不是放行', () => {
  assert.equal(parseJevResponse(goodBody('qingzhu', 0.9, 0.9)), null, '具体贴纸 id 不是合法族')
  assert.equal(parseJevResponse(goodBody('not_a_family', 0.9, 0.9)), null)
  assert.equal(parseJevResponse(null), null)
  assert.equal(parseJevResponse({}), null)
  assert.equal(parseJevResponse({ answers: {} }), null)
  assert.equal(parseJevResponse({ answers: { family: { type: 'choice', choice: 'celebrate' } } }), null, '缺 stick')
})

test('parseJevResponse 对越界概率取 0，而不是当成高分', () => {
  const parsed = parseJevResponse(goodBody('celebrate', 1.5, 1.5))
  assert.equal(parsed?.probability, 0)
  assert.equal(parsed?.yesProbability, 0)
})

test('pickInFamily 只在族内挑，且避开冷却里用过的', () => {
  const avoid = new Set(['qingzhu', 'ganbei'])
  for (let turn = 1; turn <= 40; turn++) {
    const picked = pickInFamily(ENTRIES, 'celebrate', avoid, 's1', turn)
    assert.equal(picked?.id, 'defen-10', `turn=${turn} 只该剩 defen-10`)
  }
})

test('pickInFamily 全被冷却时退回整族（宁可能重复，也不要没图）', () => {
  const avoid = new Set(['qingzhu', 'ganbei', 'defen-10'])
  const picked = pickInFamily(ENTRIES, 'celebrate', avoid, 's1', 7)
  assert.ok(['qingzhu', 'ganbei', 'defen-10'].includes(picked.id))
})

test('pickInFamily 对同一 (会话,轮次) 确定，换轮次会变化（刷新不跳、轮与轮有变化）', () => {
  const a = pickInFamily(ENTRIES, 'celebrate', new Set(), 's1', 3)
  const b = pickInFamily(ENTRIES, 'celebrate', new Set(), 's1', 3)
  assert.equal(a.id, b.id, '同一轮必须同一张（刷新即重放）')
  const seen = new Set()
  for (let turn = 1; turn <= 30; turn++) seen.add(pickInFamily(ENTRIES, 'celebrate', new Set(), 's1', turn).id)
  assert.ok(seen.size > 1, '轮次变了该换着来')
})

test('pickInFamily 对未知族/空素材返回 undefined（不抛）', () => {
  assert.equal(pickInFamily(ENTRIES, 'nope', new Set(), 's1', 1), undefined)
  assert.equal(pickInFamily([], 'celebrate', new Set(), 's1', 1), undefined)
})

test('createDecisionCache 命中、并且按上限淘汰最旧的', () => {
  const cache = createDecisionCache(2)
  const one = { ok: true, family: 'bug', stick: true, probability: 1, costUsd: null, ms: 1, note: '' }
  cache.set('s', 1, one)
  cache.set('s', 2, one)
  assert.equal(cache.get('s', 1), one)
  cache.set('s', 3, one)
  assert.equal(cache.size(), 2)
  assert.equal(cache.get('s', 1), undefined, '最旧的被淘汰')
  assert.equal(cache.get('s', 3), one)
  // 同一个 key 重设要变成最新（热键不该被冤枉淘汰）
  cache.set('s', 2, one)
  cache.set('s', 4, one)
  assert.equal(cache.get('s', 2), one)
})

test('decideJev 成功路径：判出族、给出成本与耗时', async () => {
  let ticks = 0
  const decision = await decideJev(deps({ now: () => (ticks += 100) }), { reply: '验收完成，全绿。' })
  assert.equal(decision.ok, true)
  assert.equal(decision.family, 'celebrate')
  assert.equal(decision.stick, true)
  assert.equal(decision.probability, 0.61)
  assert.equal(decision.costUsd, 0.00005)
  assert.ok(decision.note.includes('庆祝'))
})

test('decideJev：noul 低于 0.5 就判"这轮不贴"', async () => {
  const decision = await decideJev(
    deps({ fetch: async () => ({ ok: true, status: 200, json: async () => goodBody('celebrate', 0.9, 0.2) }) }),
    { reply: 'x' },
  )
  assert.equal(decision.ok, true)
  assert.equal(decision.stick, false)
})

test('decideJev：blank 一律不贴（哪怕 noul 很高）', async () => {
  const decision = await decideJev(
    deps({ fetch: async () => ({ ok: true, status: 200, json: async () => goodBody(MOOD_BLANK, 0.9, 0.95) }) }),
    { reply: 'x' },
  )
  assert.equal(decision.stick, false)
})

test('decideJev 没有 key 就不发请求（也绝不抛）', async () => {
  let called = false
  const decision = await decideJev(
    deps({
      env: {},
      credentialsPath: '',
      fetch: async () => {
        called = true
        return { ok: true, status: 200, json: async () => goodBody('celebrate', 1, 1) }
      },
    }),
    { reply: 'x' },
  )
  assert.equal(decision.ok, false)
  assert.equal(decision.note, 'no key')
  assert.equal(called, false)
})

test('decideJev：HTTP 非 2xx / 响应畸形 / 抛错，统统回落而不抛', async () => {
  const cases = [
    { fetch: async () => ({ ok: false, status: 429, json: async () => ({}) }), expect: 'http 429' },
    { fetch: async () => ({ ok: true, status: 200, json: async () => ({ answers: {} }) }), expect: 'bad response' },
    {
      fetch: async () => {
        throw new Error('ECONNRESET')
      },
      expect: 'error ECONNRESET',
    },
  ]
  for (const item of cases) {
    const decision = await decideJev(deps({ fetch: item.fetch }), { reply: 'x' })
    assert.equal(decision.ok, false)
    assert.equal(decision.note, item.expect)
    assert.equal(decision.stick, false)
  }
})

test('decideJev：fetch 不理会 signal 时也一定会超时返回（不然会永远挂住）', async () => {
  const decision = await decideJev(
    deps({ fetch: () => new Promise(() => {}) }),
    { reply: 'x' },
    { timeoutMs: 30 },
  )
  assert.equal(decision.ok, false)
  assert.equal(decision.note, 'timeout 30ms')
  assert.equal(JEV_DEFAULT_TIMEOUT_MS, 4000)
})

test('可注入时钟：耗时来自注入的 now，不读真实时间', async () => {
  // 常量时钟 → 耗时必然是 0。真实 `Date.now()` 不可能给出 0，
  // 所以这条能证明耗时确实走的注入点（而不是顺手回了真实时间）。
  const decision = await decideJev(deps({ now: () => 7 }), { reply: 'x' })
  assert.equal(decision.ms, 0)
  // 步进时钟 → 耗时是步长的整数倍且大于 0（不可能来自真实时钟，那会是个零头）
  let ticks = 1000
  const stepped = await decideJev(deps({ now: () => (ticks += 250) }), { reply: 'x' })
  assert.ok(stepped.ms > 0 && stepped.ms % 250 === 0, `ms=${stepped.ms}`)
})

test('族表：每个成员 id 都真实存在于 index.json，且没有一 id 进两族', () => {
  const index = JSON.parse(readFileSync(new URL('../assets/index.json', import.meta.url), 'utf8'))
  const known = new Set(index.sticker.map((entry) => entry.id))
  const members = allFamilyMembers()
  const missing = members.filter((id) => !known.has(id))
  assert.deepEqual(missing, [], `族表里有索引中不存在的 id：${missing.join(', ')}`)
  assert.equal(new Set(members).size, members.length, '同一个 id 被写进了两族')
  // 13 族 + blank；族 key 唯一
  assert.equal(new Set(MOOD_FAMILIES.map((f) => f.key)).size, MOOD_FAMILIES.length)
  assert.equal(familyOf(MOOD_BLANK), undefined, 'blank 不是一族，它只是"不贴"的出口')
  // 覆盖率：绝大多数素材都能进候选（未收录的仍可由 keyword/点名/latch 选中）
  assert.ok(members.length >= 140, `族表覆盖太少：${members.length}`)
})

test('familyCriteria 的 key 与族一一对应', () => {
  const criteria = familyCriteria()
  assert.deepEqual(Object.keys(criteria), [...MOOD_FAMILIES.map((f) => f.key), MOOD_BLANK])
})

// --------------------------------------------------------------------- 调试面板用的裁剪

test('capped：长字符串被截断并**显式标注**原文长度（不悄悄丢内容）', () => {
  const long = 'x'.repeat(5000)
  const out = capped({ reply: long })
  assert.ok(out.reply.length < 5000)
  assert.ok(out.reply.startsWith('x'.repeat(1200)))
  assert.ok(out.reply.includes('截断，原文 5000 字符'), out.reply.slice(-40))
})

test('capped：短字符串/数字/布尔/null 原样通过', () => {
  assert.equal(capped('短的'), '短的')
  assert.equal(capped(7), 7)
  assert.equal(capped(true), true)
  assert.equal(capped(null), null)
})

test('capped：数组与对象按条数裁剪，并标注还剩多少', () => {
  const big = capped({ labels: Array.from({ length: 60 }, (_, i) => `l${i}`) })
  assert.equal(big.labels.length, 41, '40 项 + 一行"还有多少"')
  assert.ok(String(big.labels[40]).includes('还有 20 项'))
  const wide = capped(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i])))
  assert.equal(Object.keys(wide).length, 41)
  assert.ok(String(wide['…']).includes('还有 20 个字段'))
})

test('capped：undefined 归一成 null（JSON 里才有意义）', () => {
  assert.equal(capped(undefined), null)
  assert.equal(capped({ a: undefined }).a, null)
})

test('capped：层级过深就停 —— 不为了一个调试面板把整个对象图走穿', () => {
  let deep = { value: 1 }
  for (let i = 0; i < 12; i++) deep = { nested: deep }
  const out = JSON.stringify(capped(deep))
  assert.ok(out.includes('层级过深'), out.slice(0, 200))
})

// --------------------------------------------------------------------- 调试日志环形缓冲

test('createJevLog：最新的在前，且按容量淘汰最旧的', () => {
  let tick = 0
  const log = createJevLog(3, () => (tick += 100))
  const base = {
    sessionId: 's',
    model: 'm',
    ok: true,
    family: 'bug',
    stick: true,
    probability: 1,
    yesProbability: 1,
    costUsd: null,
    ms: 1,
    note: '',
    status: 200,
    error: '',
    request: null,
    response: null,
  }
  log.push({ ...base, turn: 1 })
  log.push({ ...base, turn: 2 })
  log.push({ ...base, turn: 3 })
  assert.deepEqual(
    log.list().map((entry) => entry.turn),
    [3, 2, 1],
    '面板要"刚发生了什么"',
  )
  log.push({ ...base, turn: 4 })
  assert.equal(log.size(), 3)
  assert.deepEqual(
    log.list().map((entry) => entry.turn),
    [4, 3, 2],
    '最旧的被淘汰',
  )
  assert.equal(log.capacity(), 3)
})

test('createJevLog：list(n) 只要最近 n 条；reset 清空；容量至少 1', () => {
  const log = createJevLog(0)
  assert.equal(log.capacity(), 1, '容量 0 会让日志变成永远没有内容')
  const entry = {
    sessionId: 's',
    turn: 1,
    model: 'm',
    ok: true,
    family: 'bug',
    stick: true,
    probability: 1,
    yesProbability: 1,
    costUsd: null,
    ms: 1,
    note: '',
    status: 200,
    error: '',
    request: null,
    response: null,
  }
  log.push(entry)
  log.push({ ...entry, turn: 2 })
  assert.deepEqual(
    log.list(1).map((item) => item.turn),
    [2],
  )
  assert.deepEqual(log.list(0), [])
  log.reset()
  assert.equal(log.size(), 0)
})

// --------------------------------------------------------------------- 往返原件（调试面板的数据源）

test('decideJev 成功时带回完整往返：请求里有回复原文，响应里有族的概率表', async () => {
  const decision = await decideJev(deps(), { reply: '验收完成，全绿。' })
  assert.equal(decision.ok, true)
  assert.equal(decision.status, 200)
  assert.equal(decision.error, '')
  assert.equal(decision.yesProbability, 0.81, 'noul 的概率也要带出来给面板看')
  assert.equal(decision.request.state.assistant_reply, '验收完成，全绿。')
  assert.equal(decision.request.questions.family.type, 'choice')
  assert.equal(decision.response.answers.family.choice, 'celebrate')
  assert.equal(decision.response.usage.cost, 0.00005)
})

test('decideJev 失败时也带回现场：HTTP 状态 + 响应体 + 原始错误', async () => {
  const decision = await decideJev(
    deps({ fetch: async () => ({ ok: false, status: 402, json: async () => ({ error: 'insufficient credits' }) }) }),
    { reply: 'x' },
  )
  assert.equal(decision.ok, false)
  assert.equal(decision.status, 402)
  assert.equal(decision.error, 'http 402')
  assert.equal(decision.response.error, 'insufficient credits', '402 的正文是排障唯一线索，必须留下')
  assert.equal(decision.request.state.assistant_reply, 'x')
})

test('decideJev 连不上时也有请求原文可看（能看出"本来要发什么"）', async () => {
  const decision = await decideJev(
    deps({
      fetch: async () => {
        throw new Error('ECONNRESET')
      },
    }),
    { reply: '发不出去也要留证据' },
  )
  assert.equal(decision.ok, false)
  assert.equal(decision.status, null, '没拿到 HTTP 响应')
  assert.equal(decision.request.state.assistant_reply, '发不出去也要留证据')
  assert.equal(decision.response, null)
})

test('decideJev 无 key 时不发请求，也就没有请求原件（与"发了但失败"区分开）', async () => {
  const decision = await decideJev(deps({ env: {}, credentialsPath: '' }), { reply: 'x' })
  assert.equal(decision.note, 'no key')
  assert.equal(decision.request, null, '没发出去就不该假装有请求')
})

test('decideJev 存进面板的请求是裁剪过的：12k 正文不会原样进内存', async () => {
  const decision = await decideJev(deps(), { reply: 'y'.repeat(9000) })
  const stored = decision.request.state.assistant_reply
  assert.ok(stored.length < 1400, `实际 ${stored.length}`)
  assert.ok(stored.includes('截断，原文 9000 字符'))
})
