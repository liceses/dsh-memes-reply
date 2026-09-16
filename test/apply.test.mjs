/**
 * 装配级集成测试：用**桩服务**把 `apply()` 真跑一遍，验证四样东西都挂上了，
 * 并且把「工具选图 → 产出 URL → 路由出字节 → 每轮限额 → /fish 开关」这条链
 * 在进程内走通。不需要起 HTTP 服务，也不碰正在运行的 GUI。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

// 把 DSH_HOME 指到临时目录：测试绝不读写用户真实的状态文件
// （每轮限额的"最近用过"会写 state.json，串了就测不准了）。
process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'memes-home-'))

import { apply, inject, name } from '../lib/index.js'
import { HINT_SECTION, HINT_TEXT } from '../lib/prompt.js'

/** 找到实际生效的索引（DSH_HOME 已被指到临时目录，所以这里基本只会命中包内 assets）。 */
function locateIndex() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  for (const path of [join(home, 'memes-reply', 'assets', 'index.json'), join(process.cwd(), 'assets', 'index.json')]) {
    if (existsSync(path)) return path
  }
  return undefined
}

/** 假 fs：真的读磁盘，方便验证"文件存在才产出 URL"。 */
const fakeFs = {
  async resolve(path) {
    return { targetKey: `k:${path}`, displayPath: path }
  },
  async stat(target) {
    try {
      const info = statSync(target.displayPath)
      if (!info.isFile()) return undefined
      return { version: `v${info.mtimeMs}`, type: 'file', size: info.size }
    } catch {
      return undefined
    }
  },
  async readBytes(target) {
    return new Uint8Array(readFileSync(target.displayPath))
  },
}

/** 造一个假 ctx，记录所有注册。 */
function makeHarness() {
  const routes = []
  const tools = []
  const commands = []
  const listeners = []
  const disposers = []
  const promptSections = []
  // 用盒子装，闭包里赋值才能被外面看到。
  const box = { settings: undefined, watch: undefined }
  const ctx = {
    settings: {
      register: (ns, schema, options) => {
        box.settings = { ns, options, hasSchema: schema !== undefined }
        return {
          get: () => ({}),
          watch: (listener) => {
            box.watch = listener
          },
        }
      },
    },
    webServer: {
      port: 3080,
      register: (route) => {
        routes.push(route)
        return () => {}
      },
    },
    get: (service) => {
      if (service === 'tools') return { register: (tool) => (tools.push(tool), () => {}) }
      if (service === 'commands') return { register: (command) => (commands.push(command), () => {}) }
      if (service === 'fs') return fakeFs
      if (service === 'systemPrompt') {
        return {
          getSectionOrder: (orderName) => (orderName === 'TOOLS_SDK' ? 5000 : 0),
          section: (section) => {
            promptSections.push(section)
            return () => {}
          },
        }
      }
      return undefined
    },
    on: (eventName, listener) => {
      listeners.push({ eventName, listener })
      return () => {}
    },
    effect: (callback) => {
      const value = callback()
      if (typeof value === 'function') disposers.push(value)
      return value
    },
    logger: { info: () => {}, warn: () => {} },
  }
  return {
    ctx,
    routes,
    tools,
    commands,
    listeners,
    promptSections,
    settings: box,
    /** 模拟设置面板改配置（触发 host 侧 scope.watch）。 */
    setConfig: (next) => box.watch?.(next),
  }
}

/** 假请求/响应；`body` 会在下一个微任务里喂给监听器。 */
function call(route, url, method = 'GET', headers = {}, body = null) {
  const captured = { status: 0, headers: {}, body: null }
  const res = {
    writeHead: (status, h) => {
      captured.status = status
      captured.headers = h ?? {}
    },
    end: (body) => {
      captured.body = body ?? null
    },
  }
  const listeners = new Map()
  const req = {
    url,
    method,
    headers: { host: '127.0.0.1:3080', ...headers },
    setEncoding: () => {},
    on: (event, listener) => {
      listeners.set(event, listener)
      return req
    },
    destroy: () => {},
  }
  queueMicrotask(() => {
    if (body !== null) listeners.get('data')?.(body)
    listeners.get('end')?.()
  })
  return route.handler(req, res).then(() => captured)
}

test('apply()：路由 / 工具 / 命令 / 设置 / 事件 全部挂上', () => {
  const h = makeHarness()
  apply(h.ctx)

  assert.equal(name, 'memes-reply')
  assert.deepEqual(inject, ['webServer', 'settings'])

  assert.equal(h.routes.length, 1)
  assert.equal(h.routes[0].kind, 'prefix')
  assert.equal(h.routes[0].path, '/api/dsh-memes-reply')

  assert.equal(h.tools.length, 1)
  assert.equal(h.tools[0].name, 'use_sticker')
  assert.equal(typeof h.tools[0].execute, 'function')
  assert.equal(typeof h.tools[0].output.render, 'function')

  assert.equal(h.commands.length, 1)
  assert.equal(h.commands[0].name, 'fish')
  assert.equal(typeof h.commands[0].handler, 'function')

  assert.equal(h.settings.settings.ns, 'dsh-memes-reply')
  assert.equal(h.settings.settings.options.applies, 'live')
  assert.equal(h.settings.settings.hasSchema, true)

  // autoMode 默认 keyword，所以模型流观察者也会挂上（turn-stopping 用它做自动贴纸决策）。
  const events = h.listeners.map((entry) => entry.eventName).sort()
  assert.deepEqual(events, ['agent/pre-step', 'agent/turn-stopping', 'llm/stream'])
})

test('系统提示提示：只在工具可用且未静音时输出一行', async () => {
  const h = makeHarness()
  apply(h.ctx)

  // 注册了一个段，顺序锚在所有内置工具说明之后（TOOLS_SDK 之前）。
  assert.equal(h.promptSections.length, 1)
  const section = h.promptSections[0]
  assert.equal(section.name, HINT_SECTION)
  assert.ok(section.order < 5000 && section.order > 2900, `顺序应落在内置工具段之后，实际 ${section.order}`)

  // 默认：开着 + 工具已注册 + 未静音 → 输出提示。
  const session = { id: 'session-hint' }
  assert.equal(section.text({ agent: session }), HINT_TEXT)
  // 没有 agent 的根装配也给提示（那时没有会话可静音）。
  assert.equal(section.text({}), HINT_TEXT)

  // 本会话 /fish off → 不再输出（提示不该鼓励一个会被拒的调用）。
  await h.commands[0].handler({ agent: session, rawInput: ' off', commandId: 'c', attachments: [], signal: new AbortController().signal })
  assert.equal(section.text({ agent: session }), '')
  // 别的会话不受影响。
  assert.equal(section.text({ agent: { id: 'session-other' } }), HINT_TEXT)

  // 总开关关掉 → 全局不再输出。
  h.setConfig({ enabled: false })
  assert.equal(section.text({ agent: { id: 'session-other' } }), '')
})

test('工具 → URL → 路由字节：整条链走通，且每轮只准一张', async (t) => {
  const index = locateIndex()
  if (index === undefined) {
    t.skip('还没有 index.json，先运行 node scripts/import-assets.mjs')
    return
  }
  const h = makeHarness()
  apply(h.ctx)
  const tool = h.tools[0]
  const route = h.routes[0]
  const session = { id: 'session-test' }
  const exec = { agent: session, name: 'use_sticker', callId: 'call-1', arguments: {}, signal: new AbortController().signal }

  // 1) 第一轮：选图成功，产出绝对 URL 的 markdown 片段。
  const first = await tool.execute({ mood: '点赞' }, exec)
  assert.equal(first.ok, true, `应该选到贴纸：${JSON.stringify(first)}`)
  assert.equal(first.id, 'dianzan')
  // 扩展名取决于素材格式（gif/webp），不是契约；契约是"绝对 http URL + 该 id"。
  assert.match(first.markdown, /^!\[\]\(http:\/\/127\.0\.0\.1:3080\/api\/dsh-memes-reply\/sticker\/dianzan\.(gif|webp)\)$/)
  assert.equal(tool.output.render({ mood: '点赞' }, first)[0].type, 'text')
  assert.match(tool.output.render({ mood: '点赞' }, first)[0].text, /dianzan\.(gif|webp)/)

  // 2) 同一轮第二次：被限额挡住，而且**不产出 URL**。
  // 没有观测到轮次边界时会走 60 秒窗口那条兜底文案，两种都算拦住。
  const second = await tool.execute({ mood: '哭' }, exec)
  assert.equal(second.ok, false)
  assert.match(String(second.reason), /已经贴过/)
  assert.equal(second.markdown, undefined)

  // 3) 路由真的能出字节（走假 fs 读真文件）。
  const served = await call(route, first.url.replace('http://127.0.0.1:3080', ''))
  assert.equal(served.status, 200)
  assert.match(String(served.headers['Content-Type']), /^image\/(gif|webp)$/)
  const magic = Buffer.from(served.body.subarray(0, 6)).toString('latin1')
  assert.ok(magic === 'GIF89a' || magic.startsWith('RIFF'), `未知图片格式：${magic}`)

  // 4) 条件请求 304。
  const cached = await call(route, first.url.replace('http://127.0.0.1:3080', ''), 'GET', { 'if-none-match': served.headers.ETag })
  assert.equal(cached.status, 304)

  // 5) 进入下一轮：限额解除（模拟 host 的 agent/pre-step 观察）。
  const preStep = h.listeners.find((entry) => entry.eventName === 'agent/pre-step')
  await preStep.listener({ agent: session, turn: 8 }, () => Promise.resolve({ kind: 'allow' }))
  const third = await tool.execute({ mood: '哭' }, exec)
  assert.equal(third.ok, true)
  assert.ok(String(third.id).startsWith('ku'))

  // 6) /fish off 之后不再贴图。
  const command = h.commands[0]
  const off = await command.handler({ agent: session, rawInput: ' off', commandId: 'c', attachments: [], signal: new AbortController().signal })
  assert.equal(off.kind, 'success')
  await preStep.listener({ agent: session, turn: 9 }, () => Promise.resolve({ kind: 'allow' }))
  const muted = await tool.execute({ mood: '点赞' }, exec)
  assert.equal(muted.ok, false)
  assert.match(String(muted.reason), /静音/)

  // 7) /fish on 恢复，并且 /fish <id> 能指定下一轮。
  const on = await command.handler({ agent: session, rawInput: ' on', commandId: 'c', attachments: [], signal: new AbortController().signal })
  assert.equal(on.kind, 'success')
  await preStep.listener({ agent: session, turn: 10 }, () => Promise.resolve({ kind: 'allow' }))
  const latch = await command.handler({ agent: session, rawInput: ' bug', commandId: 'c', attachments: [], signal: new AbortController().signal })
  assert.equal(latch.kind, 'success')
  assert.match(String(latch.text), /bug/)
  const latched = await tool.execute({ mood: '随便什么' }, exec)
  assert.equal(latched.ok, true)
  assert.equal(latched.id, 'bug')

  // 8) /fish list 能列清单。
  const listed = await command.handler({ agent: session, rawInput: ' list 哭', commandId: 'c', attachments: [], signal: new AbortController().signal })
  assert.equal(listed.kind, 'success')
  assert.match(String(listed.text), /ku/)
})

test('设置面板的「下一轮用这张」：全局 latch 被下一次工具调用消费并清空', async (t) => {
  if (locateIndex() === undefined) {
    t.skip('还没有 index.json')
    return
  }
  const h = makeHarness()
  apply(h.ctx)
  const tool = h.tools[0]
  const route = h.routes[0]
  const session = { id: 'session-panel' }
  const exec = { agent: session, name: 'use_sticker', callId: 'call-9', arguments: {}, signal: new AbortController().signal }
  const preStep = h.listeners.find((entry) => entry.eventName === 'agent/pre-step')
  const nextTurn = (turn) => preStep.listener({ agent: session, turn }, () => Promise.resolve({ kind: 'allow' }))

  // 1) 面板写全局指定（走真实路由的分支）。
  const posted = await call(
    route,
    '/api/dsh-memes-reply/latch',
    'POST',
    { 'content-type': 'application/json' },
    JSON.stringify({ id: 'mojing-fanguang' }),
  )
  assert.equal(posted.status, 200)
  assert.equal(JSON.parse(String(posted.body)).latch, 'mojing-fanguang')

  // 2) 状态行能看到它。
  const stats = await call(route, '/api/dsh-memes-reply/stats')
  assert.equal(JSON.parse(String(stats.body)).latch, 'mojing-fanguang')

  // 3) 下一轮工具调用必须用它（哪怕模型给的关键词完全不相干）。
  await nextTurn(21)
  const used = await tool.execute({ mood: '随便什么' }, exec)
  assert.equal(used.ok, true)
  assert.equal(used.id, 'mojing-fanguang')

  // 4) 用完即清。
  const after = await call(route, '/api/dsh-memes-reply/latch')
  assert.equal(JSON.parse(String(after.body)).latch, null)

  // 5) 会话指定优先于全局指定。
  await call(route, '/api/dsh-memes-reply/latch', 'POST', { 'content-type': 'application/json' }, JSON.stringify({ id: 'dianzan' }))
  await command1(h, session, ' bug')
  await nextTurn(22)
  const sessionWins = await tool.execute({ mood: '随便什么' }, exec)
  assert.equal(sessionWins.ok, true)
  assert.equal(sessionWins.id, 'bug')
})

/** 跑一条 /fish 命令（本文件内多处要用）。 */
function command1(harness, agent, rawInput) {
  return harness.commands[0].handler({ agent, rawInput, commandId: 'c', attachments: [], signal: new AbortController().signal })
}

test('长短语能命中；命中不了时给出可执行的重试建议', async (t) => {
  if (locateIndex() === undefined) {
    t.skip('还没有 index.json')
    return
  }
  const h = makeHarness()
  apply(h.ctx)
  const tool = h.tools[0]
  const session = { id: 'session-phrase' }
  const exec = { agent: session, name: 'use_sticker', callId: 'call-p', arguments: {}, signal: new AbortController().signal }
  const preStep = h.listeners.find((entry) => entry.eventName === 'agent/pre-step')
  const nextTurn = (turn) => preStep.listener({ agent: session, turn }, () => Promise.resolve({ kind: 'allow' }))

  // 真实现场：模型把 mood 传成语境短语。
  await nextTurn(31)
  const phrase = await tool.execute({ mood: '扒源码收工' }, exec)
  assert.equal(phrase.ok, true, `「扒源码收工」应该能落到收工/庆祝一类：${JSON.stringify(phrase)}`)
  assert.ok(['qingzhu', 'tingzhi-gongzuo'].includes(phrase.id), `实际落到 ${phrase.id}`)

  // 兜底关闭（默认）时，完全不匹配的词应返回**可执行**的失败：提"可以重试"并给保证命中的词。
  await nextTurn(32)
  const miss = await tool.execute({ mood: '这波操作我服了' }, exec)
  assert.equal(miss.ok, false)
  assert.match(String(miss.reason), /重试/)
  assert.match(String(miss.reason), /收工/)
  assert.equal(miss.markdown, undefined)
})

test('设置里的兜底贴纸：匹配不上时保证还有鱼，并如实说明是兜底', async (t) => {
  if (locateIndex() === undefined) {
    t.skip('还没有 index.json')
    return
  }
  const h = makeHarness()
  apply(h.ctx)
  const tool = h.tools[0]
  const session = { id: 'session-fallback' }
  const exec = { agent: session, name: 'use_sticker', callId: 'call-f', arguments: {}, signal: new AbortController().signal }
  const preStep = h.listeners.find((entry) => entry.eventName === 'agent/pre-step')
  await preStep.listener({ agent: session, turn: 41 }, () => Promise.resolve({ kind: 'allow' }))
  h.setConfig({ fallback: 'dianzan' })

  const result = await tool.execute({ mood: '这波操作我服了' }, exec)
  assert.equal(result.ok, true)
  assert.equal(result.id, 'dianzan')
  assert.equal(result.fallback, true)
  const text = tool.output.render({ mood: '这波操作我服了' }, result)[0].text
  assert.match(text, /兜底/)
  assert.match(text, /dianzan\.(gif|webp)/)
})

test('预览墙数据：catalog 返回缩略图/全尺寸 URL 与总数', async (t) => {
  if (locateIndex() === undefined) {
    t.skip('还没有 index.json')
    return
  }
  const h = makeHarness()
  apply(h.ctx)
  const route = h.routes[0]

  const res = await call(route, '/api/dsh-memes-reply/catalog?limit=6&seed=1')
  assert.equal(res.status, 200)
  const body = JSON.parse(String(res.body))
  assert.equal(body.ok, true)
  assert.equal(body.ready, true)
  assert.equal(body.items.length, 6)
  assert.equal(body.total >= 100, true, `素材应该上百张，实际 ${body.total}`)
  for (const item of body.items) {
    assert.match(item.id, /^[a-z0-9][a-z0-9-]*$/)
    assert.match(item.url, /\/api\/dsh-memes-reply\/sticker\//)
    if (item.thumb !== null) assert.match(item.thumb, /\/api\/dsh-memes-reply\/thumb\//)
  }

  // 真缩略图能取到字节（跑过 --thumbs 就有；没有则允许 404，但要给出修复命令）。
  const withThumb = body.items.find((item) => item.thumb !== null)
  if (withThumb !== undefined) {
    const thumbRes = await call(route, withThumb.thumb.replace('http://127.0.0.1:3080', ''))
    assert.equal(thumbRes.status, 200)
    assert.equal(String(thumbRes.headers['Content-Type']), 'image/webp')
  }
})

/** 造一路假模型流。 */
async function* streamOf(chunks) {
  for (const chunk of chunks) yield chunk
}

test('形态 sticker：模型挑的那张走贴纸层，正文里零 URL', async (t) => {
  if (locateIndex() === undefined) {
    t.skip('还没有 index.json')
    return
  }
  const h = makeHarness()
  apply(h.ctx)
  h.setConfig({ form: 'sticker' })
  const route = h.routes[0]
  const session = { id: 'session-dock' }
  const exec = { agent: session, name: 'use_sticker', callId: 'call-dock', arguments: {}, signal: new AbortController().signal }
  const preStep = h.listeners.find((entry) => entry.eventName === 'agent/pre-step')
  await preStep.listener({ agent: session, turn: 12 }, () => Promise.resolve({ kind: 'allow' }))

  const result = await h.tools[0].execute({ mood: '点赞' }, exec)
  assert.equal(result.ok, true)
  assert.equal(result.dock, true, '形态 sticker 应走贴纸层')
  assert.equal(result.markdown, undefined, '不该产出正文用的 markdown')
  assert.equal(result.url, undefined)

  const text = h.tools[0].output.render({ mood: '点赞' }, result)[0].text
  assert.match(text, /输入框上方/)
  assert.doesNotMatch(text, /!\[\]\(/)

  // 贴纸层的数据来自待取位（reason=model）
  const pending = await call(route, '/api/dsh-memes-reply/auto/pending?sessionId=session-dock&since=0')
  const body = JSON.parse(String(pending.body))
  assert.equal(body.event?.id, 'dianzan')
  assert.equal(body.event.reason, 'model')

  // 同一轮随后的自动贴纸不会再补一张
  const llm = h.listeners.find((entry) => entry.eventName === 'llm/stream')
  const stop = h.listeners.find((entry) => entry.eventName === 'agent/turn-stopping')
  const tapped = llm.listener({ sessionId: 'session-dock' }, () => streamOf([{ type: 'text-delta', text: '全部通过了' }]))
  for await (const _chunk of tapped) {
    // 跑完即可
  }
  stop.listener({ agent: session, turn: 12 })
  const after = await call(route, '/api/dsh-memes-reply/auto/pending?sessionId=session-dock&since=1')
  assert.equal(JSON.parse(String(after.body)).event, null, '模型已贴过，自动路径不该再补')
})

test('B-auto 整链：模型流 → 轮结束 → 待取位（不问模型也贴）', async (t) => {
  if (locateIndex() === undefined) {
    t.skip('还没有 index.json')
    return
  }
  const h = makeHarness()
  apply(h.ctx)
  const route = h.routes[0]
  const llm = h.listeners.find((entry) => entry.eventName === 'llm/stream')
  assert.ok(llm !== undefined, 'autoMode 默认 keyword，应该挂上 llm/stream 观察者')
  const stop = h.listeners.find((entry) => entry.eventName === 'agent/turn-stopping')

  /** 每个会话自己的轮询游标（生产里由客户端组件持有）。 */
  const cursors = new Map()
  const preStep = h.listeners.find((entry) => entry.eventName === 'agent/pre-step')

  /** 先开轮（pre-step，让 host 知道轮次号），再喂一段助手正文，然后**在 turn-stopping 之前**取一次待取位。 */
  const runTurn = async (sessionId, turn, text) => {
    await preStep.listener({ agent: { id: sessionId }, turn }, () => Promise.resolve({ kind: 'allow' }))
    const tapped = llm.listener({ sessionId }, () => streamOf([{ type: 'text-delta', text }, { type: 'usage' }]))
    for await (const _chunk of tapped) {
      // 只为把流跑完
    }
    // 关键：此刻 turn-stopping 还没发生 —— 早发布应该已经就位（这是气泡角贴纸能及时渲染的前提）。
    const early = await poll(sessionId)
    stop.listener({ agent: { id: sessionId }, turn })
    return early
  }

  /** 按游标取一次待取位。 */
  const poll = async (sessionId) => {
    const since = cursors.get(sessionId) ?? 0
    const res = await call(route, `/api/dsh-memes-reply/auto/pending?sessionId=${sessionId}&since=${since}`)
    const body = JSON.parse(String(res.body))
    cursors.set(sessionId, body.seq)
    return body
  }

  // 1) 命中「修好了」→ 自动贴 Bug（模型完全没参与），而且**在 turn-stopping 之前**就已发布
  const first = await runTurn('session-auto', 3, '这个问题终于修好了，可以收工')
  assert.equal(first.ok, true)
  assert.equal(first.event?.id, 'bug', `应命中 Bug，实际 ${JSON.stringify(first.event)}`)
  assert.equal(first.event.reason, 'keyword')
  assert.ok(String(first.event.url).includes('/api/dsh-memes-reply/sticker/'))

  // 诊断轨迹里必须留下"发布"和"最后一步"两条 —— 否则线上出问题时我无从归因
  const statsRes = await call(route, '/api/dsh-memes-reply/stats')
  const traceKinds = JSON.parse(String(statsRes.body)).trace.map((entry) => entry.kind)
  assert.ok(traceKinds.includes('host:final-step'), '应记录"最后一步"')
  assert.ok(traceKinds.includes('host:publish'), '应记录"已发布"')

  // 1b) 同一轮的兜底路径（turn-stopping）不得再补一张
  const again = await poll('session-auto')
  assert.equal(again.event, null, '同一轮必须幂等：兜底路径不该重复发布')

  // 2) 同一段话再来一轮：bug 进了 recent 冷却 → 换一张（收工/庆祝）
  const second = await runTurn('session-auto', 4, '这个问题终于修好了，可以收工')
  assert.notEqual(second.event?.id, 'bug', '同一张不该连着贴')

  // 3) 模型这一轮已经贴过 → 不补第二张
  const session = { id: 'session-auto-2' }
  const exec = { agent: session, name: 'use_sticker', callId: 'call-a', arguments: {}, signal: new AbortController().signal }
  await preStep.listener({ agent: session, turn: 7 }, () => Promise.resolve({ kind: 'allow' }))
  const manual = await h.tools[0].execute({ mood: 'bug' }, exec)
  assert.equal(manual.ok, true)
  const third = await runTurn('session-auto-2', 7, '又修好了一个 bug')
  assert.equal(third.event, null, '模型已贴过就不该再补')

  // 4) 本会话静音 → 不贴
  await h.commands[0].handler({ agent: { id: 'session-auto-3' }, rawInput: ' off', commandId: 'c', attachments: [], signal: new AbortController().signal })
  const muted = await runTurn('session-auto-3', 3, '修好了')
  assert.equal(muted.event, null)

  // 5) 总开关关掉 → 不贴
  h.setConfig({ enabled: false })
  const off = await runTurn('session-auto-4', 3, '修好了')
  assert.equal(off.event, null)

  // 6) every 模式：与语境无关，到点就贴 —— 而且要**在轮次开始时就贴**，不等正文。
  //    真事故：等流结束才发布时，客户端链式 select 在渲染那一刻仓里还是空的（轮询 800ms
  //    才拉一次，而渲染就发生在流结束后的几十毫秒内）→ 约 94% 的回合必然 miss。
  h.setConfig({ enabled: true, autoMode: 'every', autoEveryTurns: 3 })
  await preStep.listener({ agent: { id: 'session-auto-5' }, turn: 3 }, () => Promise.resolve({ kind: 'allow' }))
  const early = await poll('session-auto-5')
  assert.ok(early.event !== null, 'every 模式应在轮次开始（pre-step）就发布，而不是等流结束')
  assert.equal(early.event.reason, 'every')
  assert.equal(early.event.turn, 3)
  // 正文随后照常走一遍，也不该再补一张（同轮幂等）
  const every = await runTurn('session-auto-5', 3, '这段文字里没有任何情绪词')
  assert.equal(every.event, null, '同一轮不该重复发布')
  const notYet = await runTurn('session-auto-5', 4, '还是没有任何情绪词')
  assert.equal(notYet.event, null, '非整倍数轮不贴')
})
