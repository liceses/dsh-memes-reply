/**
 * `/jev-pick` 路由端到端（进程内，不碰真网络）。
 *
 * 为什么这条要有独立测试：缓存、回落、族内去重**全部只在路由这一层**，
 * `jev.test.mjs` 只测了纯函数。没有这组，接线错了要等到"起了 DSH 戳一下"才发现。
 * fetch 走 `RouteDeps.jev.fetch` 注入，所以这里能精确控制 JEV 会回什么。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { createStats, createStickerRoute } from '../lib/route.js'
import { createTrace } from '../lib/trace.js'
import { DEFAULT_CONFIG } from '../lib/config.js'
import { MOOD_FAMILIES } from '../lib/moods.js'

/** 用仓库里真实的 157 张素材（只读，不写）。 */
const ASSET_ROOT = fileURLToPath(new URL('../assets', import.meta.url))

const CELEBRATE = MOOD_FAMILIES.find((family) => family.key === 'celebrate')

/** 一份合法 JEV 响应。 */
function jevBody(choice, probability, noul) {
  return {
    answers: {
      stick: { type: 'noul', noul },
      family: {
        type: 'choice',
        choice,
        probabilities: { [choice]: probability },
        confidence: 0.5,
      },
    },
    usage: { input_tokens: 100, output_tokens: 10, cost: 0.00005 },
  }
}

function fakeRes() {
  const captured = { status: 0, headers: {}, body: '' }
  const res = {
    captured,
    writeHead(status, headers) {
      captured.status = status
      Object.assign(captured.headers, headers ?? {})
      return res
    },
    end(body) {
      if (typeof body === 'string') captured.body = body
      return res
    },
    setHeader() {},
  }
  return res
}

function fakeReq({ url, method = 'GET', host = '127.0.0.1:3080', headers = {}, body = null }) {
  const listeners = new Map()
  const req = {
    url,
    method,
    headers: { host, ...headers },
    setEncoding() {},
    on(event, listener) {
      listeners.set(event, listener)
      return req
    },
    destroy() {},
  }
  if (body !== null) {
    queueMicrotask(() => {
      listeners.get('data')?.(body)
      listeners.get('end')?.()
    })
  } else {
    queueMicrotask(() => listeners.get('end')?.())
  }
  return req
}

/** 建路由 + 注入 JEV。 */
function harness({ jev = {}, recent = [], cfg = {} } = {}) {
  let state = { version: 1, sessions: recent.length === 0 ? {} : { s1: { recent } }, global: {} }
  const trace = createTrace(48)
  const stats = createStats()
  const route = createStickerRoute({
    ctx: { logger: { info() {}, warn() {} } },
    config: () => ({ ...DEFAULT_CONFIG, assetRoot: ASSET_ROOT, autoMode: 'jev', ...cfg }),
    stats,
    origin: () => 'http://127.0.0.1:3080',
    observeOrigin: () => {},
    state: {
      read: () => state,
      write: (next) => {
        state = next
      },
    },
    trace: { push: (entry) => trace.push(entry), list: () => trace.list() },
    jev: { env: { OPENROUTER_API_KEY: 'sk-test' }, credentialsPath: '', now: () => 0, ...jev },
  })
  return { route, stats, trace, getState: () => state }
}

function post(url, payload) {
  return fakeReq({
    url,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

const PATH = '/api/dsh-memes-reply/jev-pick'

test('/jev-pick：合法请求 → 拿到族内的一张真实贴纸', async () => {
  let calls = 0
  const h = harness({
    jev: {
      fetch: async () => {
        calls += 1
        return { ok: true, status: 200, json: async () => jevBody('celebrate', 0.61, 0.81) }
      },
    },
  })
  const res = fakeRes()
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 3, text: '验收完成，全绿。' }), res)
  const body = JSON.parse(res.captured.body)
  assert.equal(res.captured.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.cached, false)
  assert.equal(body.family, 'celebrate')
  assert.equal(body.stick, true)
  assert.ok(CELEBRATE.members.includes(body.id), `${body.id} 不在 celebrate 族里`)
  assert.equal(calls, 1)
  assert.equal(h.stats.jev.calls, 1)
  assert.equal(h.stats.jev.fallbacks, 0)
  assert.ok(h.stats.jev.costUsd > 0, '成本要记账')
})

test('/jev-pick：同一 (会话,轮次) 二次请求走缓存 —— 刷新不会换一张、也不再花钱', async () => {
  let calls = 0
  const h = harness({
    jev: {
      fetch: async () => {
        calls += 1
        return { ok: true, status: 200, json: async () => jevBody('celebrate', 0.61, 0.81) }
      },
    },
  })
  const first = fakeRes()
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 3, text: 'x' }), first)
  const second = fakeRes()
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 3, text: 'x' }), second)
  const a = JSON.parse(first.captured.body)
  const b = JSON.parse(second.captured.body)
  assert.equal(calls, 1, '第二次不该再打 OpenRouter')
  assert.equal(b.cached, true)
  assert.equal(a.id, b.id, '刷新即重放：同一轮必须同一张')
  assert.equal(h.stats.jev.hits, 1)
})

test('/jev-pick：换轮次会重新决策（不是一轮定死）', async () => {
  let calls = 0
  const h = harness({
    jev: {
      fetch: async () => {
        calls += 1
        return { ok: true, status: 200, json: async () => jevBody('celebrate', 0.61, 0.81) }
      },
    },
  })
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 3, text: 'x' }), fakeRes())
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 4, text: 'x' }), fakeRes())
  assert.equal(calls, 2)
})

test('/jev-pick：JEV 判"这轮不贴" → ok:true 且 id 为 null（不再强制每轮有鱼）', async () => {
  const h = harness({
    jev: { fetch: async () => ({ ok: true, status: 200, json: async () => jevBody('blank', 0.8, 0.9) }) },
  })
  const res = fakeRes()
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 1, text: 'SELECT 1;' }), res)
  const body = JSON.parse(res.captured.body)
  assert.equal(body.ok, true)
  assert.equal(body.stick, false)
  assert.equal(body.id, null)
})

test('/jev-pick：调用失败 → ok:false（调用方走既有规则），并记一次回落', async () => {
  const h = harness({
    jev: {
      fetch: async () => ({
        ok: false,
        status: 402,
        json: async () => ({}),
      }),
    },
  })
  const res = fakeRes()
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 2, text: 'x' }), res)
  const body = JSON.parse(res.captured.body)
  assert.equal(res.captured.status, 200, '失败也要 200 —— 贴纸层按 ok:false 兜底，不该当成 HTTP 错误')
  assert.equal(body.ok, false)
  assert.equal(body.id, null)
  assert.match(body.error, /http 402/)
  assert.equal(h.stats.jev.fallbacks, 1)
  assert.ok(
    h.trace.list().some((entry) => entry.kind === 'host:jev' && String(entry.note).includes('回落')),
    '回落要留痕，否则线上无法解释"为什么这轮是随机的"',
  )
})

test('/jev-pick：失败也被缓存 —— 一轮最多一次尝试，网络抖动不该变成每帧重试', async () => {
  let calls = 0
  const h = harness({
    jev: {
      fetch: async () => {
        calls += 1
        return { ok: false, status: 500, json: async () => ({}) }
      },
    },
  })
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 2, text: 'x' }), fakeRes())
  const second = fakeRes()
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 2, text: 'x' }), second)
  assert.equal(calls, 1)
  assert.equal(JSON.parse(second.captured.body).cached, true)
})

test('/jev-pick：族内避开最近用过的（冷却生效）', async () => {
  // 把 celebrate 族除一张之外全部标成"刚用过"，那这一张就是唯一解。
  const keep = CELEBRATE.members[0]
  const recent = CELEBRATE.members.slice(1)
  const h = harness({
    recent,
    jev: { fetch: async () => ({ ok: true, status: 200, json: async () => jevBody('celebrate', 0.9, 0.95) }) },
  })
  const res = fakeRes()
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 5, text: 'x' }), res)
  assert.equal(JSON.parse(res.captured.body).id, keep)
})

test('/jev-pick：方法与入参校验（GET 405 / 缺 sessionId 或 turn 400 / 坏 JSON 400）', async () => {
  const h = harness({ jev: { fetch: async () => ({ ok: true, status: 200, json: async () => jevBody('blank', 1, 1) }) } })

  const wrongMethod = fakeRes()
  await h.route.handler(fakeReq({ url: PATH }), wrongMethod)
  assert.equal(wrongMethod.captured.status, 405)

  for (const payload of [{ turn: 3 }, { sessionId: 's1' }, { sessionId: 's1', turn: 0 }, { sessionId: 's1', turn: 1.5 }]) {
    const res = fakeRes()
    await h.route.handler(post(PATH, payload), res)
    assert.equal(res.captured.status, 400, JSON.stringify(payload))
    assert.equal(JSON.parse(res.captured.body).ok, false)
  }

  const bad = fakeRes()
  await h.route.handler(
    fakeReq({ url: PATH, method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' }),
    bad,
  )
  assert.equal(bad.captured.status, 400)
})

test('/jev-pick：回环围栏照旧（非回环 Host 403）', async () => {
  const h = harness()
  const res = fakeRes()
  await h.route.handler(
    fakeReq({
      url: PATH,
      method: 'POST',
      host: 'evil.example.com',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's1', turn: 1, text: 'x' }),
    }),
    res,
  )
  assert.equal(res.captured.status, 403)
})

test('/stats：带上 JEV 计数（花了多少 / 缓存多少 / 回落多少）', async () => {
  const h = harness({
    jev: { fetch: async () => ({ ok: true, status: 200, json: async () => jevBody('celebrate', 0.61, 0.81) }) },
  })
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 1, text: 'x' }), fakeRes())
  const res = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/stats' }), res)
  const body = JSON.parse(res.captured.body)
  assert.equal(body.jev.calls, 1)
  assert.equal(body.jev.cacheSize, 1)
  assert.ok(body.jev.costUsd > 0)
})

// ---------------------------------------------------------------- 调试浮层的数据源

const LOG_PATH = '/api/dsh-memes-reply/jev-log'

/** 读一次调试日志。 */
async function readLog(h, query = '') {
  const res = fakeRes()
  await h.route.handler(fakeReq({ url: `${LOG_PATH}${query}` }), res)
  return { status: res.captured.status, body: JSON.parse(res.captured.body) }
}

test('/jev-log：记下**发出去什么、收回来什么**', async () => {
  const h = harness({
    jev: { fetch: async () => ({ ok: true, status: 200, json: async () => jevBody('celebrate', 0.61, 0.81) }) },
  })
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 7, text: '验收完成，全绿。' }), fakeRes())

  const { status, body } = await readLog(h)
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.total, 1)
  assert.equal(body.capacity, 20)
  const [entry] = body.entries
  assert.equal(entry.turn, 7)
  assert.equal(entry.ok, true)
  assert.equal(entry.status, 200)
  assert.equal(entry.family, 'celebrate')
  assert.equal(entry.yesProbability, 0.81)
  // 这就是用户要看的两个东西：
  assert.equal(entry.request.state.assistant_reply, '验收完成，全绿。')
  assert.equal(entry.request.questions.family.type, 'choice')
  assert.equal(entry.response.answers.family.choice, 'celebrate')
  assert.equal(body.stats.calls, 1)
})

test('/jev-log：失败也留现场（HTTP 状态 + 响应体），日志里看得出是回落了', async () => {
  const h = harness({
    jev: {
      fetch: async () => ({ ok: false, status: 402, json: async () => ({ error: 'insufficient credits' }) }),
    },
  })
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 2, text: 'x' }), fakeRes())

  const { body } = await readLog(h)
  const [entry] = body.entries
  assert.equal(entry.ok, false)
  assert.equal(entry.status, 402)
  assert.equal(entry.error, 'http 402')
  assert.equal(entry.response.error, 'insufficient credits')
  assert.equal(body.stats.fallbacks, 1)
})

test('/jev-log：命中缓存不产生新条目（一次刷新会重放好几轮，不能把真实的淹掉）', async () => {
  let calls = 0
  const h = harness({
    jev: {
      fetch: async () => {
        calls += 1
        return { ok: true, status: 200, json: async () => jevBody('celebrate', 0.61, 0.81) }
      },
    },
  })
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 3, text: 'x' }), fakeRes())
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 3, text: 'x' }), fakeRes())
  await h.route.handler(post(PATH, { sessionId: 's1', turn: 3, text: 'x' }), fakeRes())

  const { body } = await readLog(h)
  assert.equal(calls, 1)
  assert.equal(body.total, 1, '三次请求只有一次真实往返，日志就该只有一条')
  assert.equal(body.stats.hits, 2, '缓存命中次数由 stats 表达，不占日志条目')
})

test('/jev-log：最新的在前（面板要"刚发生了什么"）', async () => {
  const h = harness({
    jev: { fetch: async () => ({ ok: true, status: 200, json: async () => jevBody('celebrate', 0.61, 0.81) }) },
  })
  for (const turn of [1, 2, 3]) await h.route.handler(post(PATH, { sessionId: 's1', turn, text: 'x' }), fakeRes())
  const { body } = await readLog(h)
  assert.deepEqual(
    body.entries.map((entry) => entry.turn),
    [3, 2, 1],
  )
})

test('/jev-log：空日志也是合法响应；limit 被夹取；非 GET 405', async () => {
  const h = harness({ jev: {} })
  const empty = await readLog(h)
  assert.equal(empty.status, 200)
  assert.deepEqual(empty.body.entries, [])
  assert.equal(empty.body.total, 0)

  const clampedHigh = await readLog(h, '?limit=9999')
  assert.ok(clampedHigh.body.entries.length <= 20)
  const clampedLow = await readLog(h, '?limit=0')
  assert.equal(clampedLow.body.entries.length, 0, '空日志下，limit 夹到下限也仍是 0 条')

  const wrong = fakeRes()
  await h.route.handler(fakeReq({ url: LOG_PATH, method: 'POST', body: '{}' }), wrong)
  assert.equal(wrong.captured.status, 405)
})

test('/layout：JEV 调试浮层有独立座位（位置与收起态各自持久化）', async () => {
  const h = harness({ jev: {} })

  const initial = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/layout' }), initial)
  assert.deepEqual(JSON.parse(initial.captured.body).jevDebug, {})

  const saved = fakeRes()
  await h.route.handler(
    fakeReq({
      url: '/api/dsh-memes-reply/layout',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slot: 'jevDebug', right: 40.4, bottom: 200, collapsed: true }),
    }),
    saved,
  )
  const savedBody = JSON.parse(saved.captured.body)
  assert.equal(savedBody.ok, true)
  assert.equal(savedBody.jevDebug.right, 40, '坐标取整')
  assert.equal(savedBody.jevDebug.bottom, 200)
  assert.equal(savedBody.jevDebug.collapsed, true)
  assert.equal(h.getState().global.jevDebug.collapsed, true)
  assert.equal(h.getState().global.pet, undefined, '写浮层不该顺手创建 pet 槽')

  const readBack = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/layout' }), readBack)
  assert.equal(JSON.parse(readBack.captured.body).jevDebug.collapsed, true)

  // 不带 slot = pet（v2.1 之前的客户端没有这个字段，不能因为新增座位把它弄坏）
  const legacy = fakeRes()
  await h.route.handler(
    fakeReq({
      url: '/api/dsh-memes-reply/layout',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ right: 10, bottom: 10 }),
    }),
    legacy,
  )
  assert.equal(JSON.parse(legacy.captured.body).pet.right, 10)
  assert.equal(h.getState().global.jevDebug.right, 40, '写 pet 不该动 jevDebug')
})
