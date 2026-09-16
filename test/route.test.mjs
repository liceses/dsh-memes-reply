/**
 * 路由单测：贴纸字节、缩略图、素材清单、下一轮指定、缓存/304、错误码与回环围栏。
 *
 * 用假 `ctx.fs` + 临时目录里的真索引，覆盖各种分支，不需要起真的 HTTP 服务。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createStats, createStickerRoute } from '../lib/route.js'
import { createAutoBus } from '../lib/auto.js'
import { createTrace } from '../lib/trace.js'

/** 默认配置。 */
const CFG = {
  enabled: true,
  form: 'inline',
  quality: 'compressed',
  assetRoot: '',
  originalRoot: '',
  cooldownTurns: 3,
}

/** 造一份临时素材目录：两张贴纸 + 一张缩略图。 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'memes-route-'))
  const bytes = Buffer.from('GIF89a' + '\0'.repeat(64))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  mkdirSync(join(root, 'thumb'), { recursive: true })
  writeFileSync(join(root, 'thumb', 'dianzan.webp'), Buffer.from('RIFF____WEBP'))
  for (const [id, name] of [
    ['dianzan', '点赞'],
    ['ku-1', '哭'],
  ]) {
    writeFileSync(join(root, `${id}.gif`), bytes)
    void name
  }
  writeFileSync(
    join(root, 'index.json'),
    JSON.stringify({
      version: 1,
      format: 'gif',
      sticker: [
        {
          id: 'dianzan',
          name: '点赞',
          file: 'dianzan.gif',
          source: 'orig.gif',
          seq: null,
          tags: ['点赞', '好评'],
          aliases: ['like', 'dianzan'],
          bytes: bytes.length,
          sha256,
          thumb: 'dianzan.webp',
          w: 320,
          h: 320,
          frames: 3,
          fps: 12,
          durationMs: 250,
          encode: null,
        },
        {
          id: 'ku-1',
          name: '哭',
          file: 'ku-1.gif',
          source: 'orig-2.gif',
          seq: 1,
          tags: ['哭', '难过'],
          aliases: ['cry', 'ku-1'],
          bytes: bytes.length,
          sha256,
          // 故意用一个"哪儿都没有"的缩略图名：真产物目录里有 ku-1.webp，
          // 而包内 assets 是兜底根，用常见名会命中兜底，测不出缺失分支。
          thumb: 'ku-1-ghost.webp',
          w: 320,
          h: 320,
          frames: 5,
          fps: 12,
          durationMs: 400,
          encode: null,
        },
      ],
    }),
  )
  return { root, bytes, sha256 }
}

/** 假 ctx：只给 route 用到的 `get('fs')`。 */
function fakeCtx() {
  return {
    get(name) {
      if (name !== 'fs') return undefined
      return {
        async resolve(path) {
          return { targetKey: 'k:' + path, displayPath: path }
        },
        async stat(target) {
          // 假 fs 也要像真的一样：**不存在就说不存在**，否则测不出缺文件的分支。
          if (!existsSync(target.displayPath)) return undefined
          return { version: 'v1', type: 'file', size: 8 }
        },
        async readBytes(target) {
          const header = String(target.displayPath).endsWith('.webp')
            ? Buffer.from('RIFF____WEBP')
            : Buffer.from('GIF89a' + '\0'.repeat(64))
          return new Uint8Array(header)
        },
      }
    },
  }
}

/** 假响应：把 writeHead/end 记录成可断言的对象。 */
function fakeRes() {
  const captured = { status: 0, headers: {}, body: null, ended: false }
  return {
    captured,
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers ?? {}
    },
    end(body) {
      captured.ended = true
      captured.body = body ?? null
    },
  }
}

/** 假请求。 */
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
  // 请求体：下一次事件循环里把内容喂给 data/end 监听器。
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

/** 建路由 + 可控状态。 */
function harness(root, overrides = {}) {
  let state = { version: 1, sessions: {}, global: {} }
  const cfg = { ...CFG, assetRoot: root, ...overrides }
  const auto = createAutoBus()
  const trace = createTrace(48)
  const route = createStickerRoute({
    ctx: fakeCtx(),
    config: () => cfg,
    stats: createStats(),
    origin: () => 'http://127.0.0.1:3080',
    observeOrigin: () => {},
    state: {
      read: () => state,
      write: (next) => {
        state = next
      },
    },
    auto,
    trace: { push: (entry) => trace.push(entry), list: () => trace.list() },
  })
  return { route, getState: () => state, auto, trace }
}

// ---------------------------------------------------------------- 常驻挂件状态

test('/pet：GET 初始为空、POST 记位置/收起/当前那张、非法输入被拒', async () => {
  const { root } = fixture()
  const h = harness(root)

  const initial = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/pet' }), initial)
  assert.deepEqual(JSON.parse(String(initial.captured.body)), { ok: true, pet: {} })

  const saved = fakeRes()
  await h.route.handler(
    fakeReq({
      url: '/api/dsh-memes-reply/pet',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ right: 120.6, bottom: 88, collapsed: true, id: 'dianzan' }),
    }),
    saved,
  )
  const savedBody = JSON.parse(String(saved.captured.body))
  assert.equal(savedBody.ok, true)
  assert.equal(savedBody.pet.right, 121, '坐标取整')
  assert.equal(savedBody.pet.bottom, 88)
  assert.equal(savedBody.pet.collapsed, true)
  assert.equal(savedBody.pet.id, 'dianzan')
  assert.equal(h.getState().global.pet.id, 'dianzan')

  const readBack = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/pet' }), readBack)
  assert.equal(JSON.parse(String(readBack.captured.body)).pet.right, 121)

  // 局部更新：只改 collapsed，不动坐标
  const partial = fakeRes()
  await h.route.handler(
    fakeReq({
      url: '/api/dsh-memes-reply/pet',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ collapsed: false }),
    }),
    partial,
  )
  const partialBody = JSON.parse(String(partial.captured.body))
  assert.equal(partialBody.pet.collapsed, false)
  assert.equal(partialBody.pet.right, 121)

  // 非法 id / 非 JSON / 错误方法
  const badId = fakeRes()
  await h.route.handler(
    fakeReq({
      url: '/api/dsh-memes-reply/pet',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'nope' }),
    }),
    badId,
  )
  assert.equal(badId.captured.status, 400)

  const badType = fakeRes()
  await h.route.handler(
    fakeReq({ url: '/api/dsh-memes-reply/pet', method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }),
    badType,
  )
  assert.equal(badType.captured.status, 400)

  const badMethod = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/pet', method: 'PUT' }), badMethod)
  assert.equal(badMethod.captured.status, 405)
})

// ---------------------------------------------------------------- 诊断回执

test('/debug：POST 记一条、GET 405、缺 kind 400；/stats 能读回轨迹', async () => {
  const { root } = fixture()
  const h = harness(root)

  const bad = fakeRes()
  await h.route.handler(
    fakeReq({
      url: '/api/dsh-memes-reply/debug',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
    bad,
  )
  assert.equal(bad.captured.status, 400, '缺 kind 必须被拒')

  const get = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/debug' }), get)
  assert.equal(get.captured.status, 405)

  const ok = fakeRes()
  await h.route.handler(
    fakeReq({
      url: '/api/dsh-memes-reply/debug',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'select', turn: 7, id: 'bug', sessionId: 's1', note: 'hit' }),
    }),
    ok,
  )
  assert.equal(JSON.parse(String(ok.captured.body)).ok, true)

  const stats = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/stats' }), stats)
  const body = JSON.parse(String(stats.captured.body))
  const entry = body.trace.find((item) => item.kind === 'client:select')
  assert.ok(entry !== undefined, '/stats.trace 里应能读到客户端回执')
  assert.equal(entry.turn, 7)
  assert.equal(entry.id, 'bug')
  assert.equal(entry.note, 'hit')
})

// ---------------------------------------------------------------- 自动贴纸待取位

test('/auto/pending：缺 sessionId 400、非 GET 405、有/无事件与 init 语义', async () => {
  const { root } = fixture()
  const h = harness(root)

  const missing = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/auto/pending' }), missing)
  assert.equal(missing.captured.status, 400)

  const post = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/auto/pending?sessionId=s1', method: 'POST' }), post)
  assert.equal(post.captured.status, 405)

  const empty = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/auto/pending?sessionId=s1&since=0' }), empty)
  assert.equal(JSON.parse(String(empty.captured.body)).event, null)

  h.auto.publish({
    sessionId: 's1',
    turn: 3,
    id: 'dianzan',
    name: '点赞',
    url: 'http://127.0.0.1:3080/api/dsh-memes-reply/sticker/dianzan.gif',
    thumb: null,
    reason: 'every',
    matched: '',
    at: Date.now(),
  })

  const got = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/auto/pending?sessionId=s1&since=0' }), got)
  const body = JSON.parse(String(got.captured.body))
  assert.equal(body.ok, true)
  assert.equal(body.seq, 1)
  assert.equal(body.event.id, 'dianzan')
  assert.equal(body.event.reason, 'every')

  // 已经取过 → 不再重复
  const again = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/auto/pending?sessionId=s1&since=1' }), again)
  assert.equal(JSON.parse(String(again.captured.body)).event, null)

  // init=1 只同步游标
  const init = fakeRes()
  await h.route.handler(fakeReq({ url: '/api/dsh-memes-reply/auto/pending?sessionId=s1&since=0&init=1' }), init)
  assert.equal(JSON.parse(String(init.captured.body)).event, null)
})

// ---------------------------------------------------------------- 贴纸字节

test('贴纸字节：200 + image/gif + ETag + immutable', async () => {
  const { root, sha256 } = fixture()
  const { route } = harness(root)
  const res = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/sticker/dianzan.gif' }), res)

  assert.equal(route.kind, 'prefix')
  assert.equal(res.captured.status, 200)
  assert.equal(res.captured.headers['Content-Type'], 'image/gif')
  assert.equal(res.captured.headers['Cache-Control'], 'private, max-age=31536000, immutable')
  assert.equal(res.captured.headers.ETag, `"${sha256.slice(0, 32)}"`)
  assert.equal(res.captured.headers['Content-Length'], '70')
  assert.ok(res.captured.body instanceof Uint8Array)
})

test('条件请求命中 ETag 时返回 304 且没有正文', async () => {
  const { root, sha256 } = fixture()
  const { route } = harness(root)
  const res = fakeRes()
  await route.handler(
    fakeReq({ url: '/api/dsh-memes-reply/sticker/dianzan.gif', headers: { 'if-none-match': `"${sha256.slice(0, 32)}"` } }),
    res,
  )
  assert.equal(res.captured.status, 304)
  assert.equal(res.captured.body, null)
})

test('HEAD 只要头不要体', async () => {
  const { root } = fixture()
  const { route } = harness(root)
  const res = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/sticker/dianzan.gif', method: 'HEAD' }), res)
  assert.equal(res.captured.status, 200)
  assert.equal(res.captured.body, null)
})

test('未知 id / 非法 id / 非 GET 的状态码', async () => {
  const { root } = fixture()
  const { route } = harness(root)

  const unknown = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/sticker/nope.gif' }), unknown)
  assert.equal(unknown.captured.status, 404)

  const bad = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/sticker/..%2Fsecret.gif' }), bad)
  assert.equal(bad.captured.status, 404)

  const post = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/sticker/dianzan.gif', method: 'POST' }), post)
  assert.equal(post.captured.status, 405)
})

test('非回环 Host 一律 403', async () => {
  const { root } = fixture()
  const { route } = harness(root)
  const res = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/sticker/dianzan.gif', host: 'evil.example.com' }), res)
  assert.equal(res.captured.status, 403)
})

test('assetRoot 缺索引：有包内兜底就回落，没有才 503', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'memes-empty-'))
  mkdirSync(join(empty, 'x'), { recursive: true })
  const { route } = harness(empty)
  const res = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/sticker/dianzan.gif' }), res)

  const packaged = join(process.cwd(), 'assets', 'index.json')
  if (existsSync(packaged)) {
    // 包内 assets 是兜底：assetRoot 空着也能出图。
    assert.equal(res.captured.status, 200)
  } else {
    assert.equal(res.captured.status, 503)
    assert.match(String(res.captured.body), /import-assets/)
  }
})

test('条目存在但文件到处都找不到时 404，且不是 HTML', async () => {
  const root = mkdtempSync(join(tmpdir(), 'memes-ghost-'))
  writeFileSync(
    join(root, 'index.json'),
    JSON.stringify({
      version: 1,
      format: 'gif',
      sticker: [
        {
          id: 'ghost-sticker',
          name: '幽灵',
          file: 'ghost-sticker.gif',
          source: 'ghost.gif',
          seq: null,
          tags: ['幽灵'],
          aliases: ['ghost-sticker'],
          bytes: 1,
          sha256: 'x',
          w: 1,
          h: 1,
          frames: 1,
          fps: 1,
          durationMs: 1,
          encode: null,
        },
      ],
    }),
  )
  const { route } = harness(root)
  const res = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/sticker/ghost-sticker.gif' }), res)
  assert.equal(res.captured.status, 404)
  assert.equal(res.captured.headers['Content-Type'], 'application/json; charset=utf-8')
  assert.match(String(res.captured.body), /sticker file missing/)
})

test('未知路由 404', async () => {
  const { root } = fixture()
  const { route } = harness(root)
  const res = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/whatever' }), res)
  assert.equal(res.captured.status, 404)
})

// ---------------------------------------------------------------- 缩略图

test('缩略图：200 + image/webp；缺缩略图时 404 并给出修复命令', async () => {
  const { root } = fixture()
  const { route } = harness(root)

  const ok = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/thumb/dianzan.webp' }), ok)
  assert.equal(ok.captured.status, 200)
  assert.equal(ok.captured.headers['Content-Type'], 'image/webp')
  assert.equal(ok.captured.headers['Cache-Control'], 'private, max-age=31536000, immutable')

  // ku-1 没有缩略图文件（索引里写了名字但磁盘上没有）
  const missing = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/thumb/ku-1.webp' }), missing)
  assert.equal(missing.captured.status, 404)
  assert.match(String(missing.captured.body), /--thumbs/)
})

// ---------------------------------------------------------------- 素材清单

test('素材清单：带缩略图与全尺寸 URL，seed 可复现', async () => {
  const { root } = harness0()
  const { route } = harness(root)

  const res = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/catalog?limit=12&seed=3' }), res)
  assert.equal(res.captured.status, 200)
  const body = JSON.parse(String(res.captured.body))
  assert.equal(body.ok, true)
  assert.equal(body.ready, true)
  assert.equal(body.total, 2)
  assert.equal(body.items.length, 2)
  const first = body.items.find((item) => item.id === 'dianzan')
  assert.equal(first.thumb, 'http://127.0.0.1:3080/api/dsh-memes-reply/thumb/dianzan.webp')
  assert.equal(first.url, 'http://127.0.0.1:3080/api/dsh-memes-reply/sticker/dianzan.gif')
  assert.equal(first.frames, 3)
  // 缺缩略图的那张 → thumb:null（面板降级为名字 chip）
  assert.equal(body.items.find((item) => item.id === 'ku-1').thumb, null)

  // 同 seed 同顺序
  const again = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/catalog?limit=12&seed=3' }), again)
  const againBody = JSON.parse(String(again.captured.body))
  assert.deepEqual(
    againBody.items.map((item) => item.id),
    body.items.map((item) => item.id),
  )
})

test('素材清单：limit 夹取、关键词过滤、非 GET 405', async () => {
  const { root } = harness0()
  const { route } = harness(root)

  const huge = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/catalog?limit=9999' }), huge)
  assert.equal(JSON.parse(String(huge.captured.body)).items.length, 2)

  const zero = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/catalog?limit=0' }), zero)
  assert.equal(JSON.parse(String(zero.captured.body)).items.length, 1)

  const filtered = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/catalog?q=%E5%93%AD' }), filtered)
  const filteredBody = JSON.parse(String(filtered.captured.body))
  assert.equal(filteredBody.items.length, 1)
  assert.equal(filteredBody.items[0].id, 'ku-1')

  const post = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/catalog', method: 'POST' }), post)
  assert.equal(post.captured.status, 405)
})

/** fixture() 的别名（保持上面的测试读起来短一点）。 */
function harness0() {
  return fixture()
}

// ---------------------------------------------------------------- 下一轮指定

test('next-latch：GET 初始为 null，POST 设置/清除，非法输入被拒', async () => {
  const { root } = fixture()
  const { route, getState } = harness(root)

  const initial = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/latch' }), initial)
  assert.equal(JSON.parse(String(initial.captured.body)).latch, null)

  const set = fakeRes()
  await route.handler(
    fakeReq({
      url: '/api/dsh-memes-reply/latch',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'dianzan' }),
    }),
    set,
  )
  assert.equal(set.captured.status, 200)
  assert.equal(JSON.parse(String(set.captured.body)).latch, 'dianzan')
  assert.equal(getState().global.latch, 'dianzan')

  const readBack = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/latch' }), readBack)
  assert.equal(JSON.parse(String(readBack.captured.body)).latch, 'dianzan')

  const clear = fakeRes()
  await route.handler(
    fakeReq({
      url: '/api/dsh-memes-reply/latch',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: null }),
    }),
    clear,
  )
  assert.equal(JSON.parse(String(clear.captured.body)).latch, null)
  assert.equal(getState().global.latch, undefined)
})

test('next-latch：未知 id / 坏 JSON / 非 JSON 请求头 / 错误方法', async () => {
  const { root } = fixture()
  const { route } = harness(root)
  const post = (body, headers = { 'content-type': 'application/json' }) =>
    fakeReq({ url: '/api/dsh-memes-reply/latch', method: 'POST', headers, body })

  const unknown = fakeRes()
  await route.handler(post(JSON.stringify({ id: 'nope' })), unknown)
  assert.equal(unknown.captured.status, 400)
  assert.match(String(unknown.captured.body), /unknown sticker/)

  const badJson = fakeRes()
  await route.handler(post('{not json'), badJson)
  assert.equal(badJson.captured.status, 400)

  const badType = fakeRes()
  await route.handler(post(JSON.stringify({ id: 'dianzan' }), { 'content-type': 'text/plain' }), badType)
  assert.equal(badType.captured.status, 400)

  const badShape = fakeRes()
  await route.handler(post(JSON.stringify({ id: 'Dianzan!' })), badShape)
  assert.equal(badShape.captured.status, 400)

  const wrongMethod = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/latch', method: 'DELETE' }), wrongMethod)
  assert.equal(wrongMethod.captured.status, 405)
})

// ---------------------------------------------------------------- 状态行

test('/stats 返回计数、生效路径与当前指定', async () => {
  const { root } = fixture()
  const { route, getState } = harness(root)

  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/sticker/dianzan.gif' }), fakeRes())
  getState().global.latch = 'ku-1'

  const res = fakeRes()
  await route.handler(fakeReq({ url: '/api/dsh-memes-reply/stats' }), res)
  const body = JSON.parse(String(res.captured.body))
  assert.equal(res.captured.status, 200)
  assert.equal(body.ready, true)
  assert.equal(body.entries, 2)
  assert.equal(body.served, 1)
  assert.equal(body.lastId, 'dianzan')
  assert.equal(body.latch, 'ku-1')
  assert.equal(body.totalBytes, 140)
})
