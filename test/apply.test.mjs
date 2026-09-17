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

  // v2.0：宿主不再观察任何 host 事件 —— 贴纸的决策搬到了浏览器半边（会话事件的纯函数），
  // 所以"agent/pre-step / agent/turn-stopping / llm/stream"这一整套都已经退役。
  assert.deepEqual(h.listeners.map((entry) => entry.eventName), [])
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

test('工具 → 字节：点名选图、路由真的出字节、304 命中、静音与指定都生效', async (t) => {
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

  // 1) 按情绪词点名：v2.0 的工具只回 id/name —— **不产出任何 URL/markdown**，
  //    渲染是浏览器半边的事（它从会话日志里读这次调用的实参）。
  const first = await tool.execute({ mood: '点赞' }, exec)
  assert.equal(first.ok, true, `应该选到贴纸：${JSON.stringify(first)}`)
  assert.equal(first.id, 'dianzan')
  assert.equal(first.markdown, undefined, 'v2.0 不再产出正文片段')
  assert.equal(first.url, undefined, 'URL 由客户端拼（它知道当前 origin）')
  const rendered = tool.output.render({ mood: '点赞' }, first)[0]
  assert.equal(rendered.type, 'text')
  assert.match(rendered.text, /已选定贴纸/)
  assert.doesNotMatch(rendered.text, /!\[\]\(/, '不该教模型写图片')

  // 2) 客户端拼 URL 的方式（与 `/vocab` 给的形状一致）：相对路径 + 该 id 的文件扩展名。
  const located = JSON.parse(readFileSync(index, 'utf8'))
  const entry = located.sticker.find((item) => item.id === first.id)
  assert.ok(entry !== undefined, '选中的 id 必须在索引里')
  const ext = entry.file.slice(entry.file.lastIndexOf('.') + 1)
  const url = `/api/dsh-memes-reply/sticker/${first.id}.${ext}`

  // 3) 路由真的能出字节（走假 fs 读真文件）。
  const served = await call(route, url)
  assert.equal(served.status, 200)
  assert.match(String(served.headers['Content-Type']), /^image\/(gif|webp)$/)
  const magic = Buffer.from(served.body.subarray(0, 6)).toString('latin1')
  assert.ok(magic === 'GIF89a' || magic.startsWith('RIFF'), `未知图片格式：${magic}`)

  // 4) 条件请求 304。
  const cached = await call(route, url, 'GET', { 'if-none-match': served.headers.ETag })
  assert.equal(cached.status, 304)

  // 5) 同一轮再点名一次不再被拦：**"一轮一张"现在是结构性的**（一轮只有一个节点，
  //    渲染器只认最后一次点名），所以工具层不该再造一个账本。
  const second = await tool.execute({ mood: '哭' }, exec)
  assert.equal(second.ok, true)
  assert.ok(String(second.id).startsWith('ku'))

  // 6) /fish off 之后不再选图。
  const command = h.commands[0]
  const off = await command.handler({ agent: session, rawInput: ' off', commandId: 'c', attachments: [], signal: new AbortController().signal })
  assert.equal(off.kind, 'success')
  const muted = await tool.execute({ mood: '点赞' }, exec)
  assert.equal(muted.ok, false)
  assert.match(String(muted.reason), /静音/)

  // 7) /fish on 恢复，并且 /fish <id> 能指定下一轮。
  const on = await command.handler({ agent: session, rawInput: ' on', commandId: 'c', attachments: [], signal: new AbortController().signal })
  assert.equal(on.kind, 'success')
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

  // 3) 下一次点名必须用它（哪怕模型给的关键词完全不相干）。
  const used = await tool.execute({ mood: '随便什么' }, exec)
  assert.equal(used.ok, true)
  assert.equal(used.id, 'mojing-fanguang')

  // 4) 用完即清。
  const after = await call(route, '/api/dsh-memes-reply/latch')
  assert.equal(JSON.parse(String(after.body)).latch, null)

  // 5) 会话指定优先于全局指定。
  await call(route, '/api/dsh-memes-reply/latch', 'POST', { 'content-type': 'application/json' }, JSON.stringify({ id: 'dianzan' }))
  await command1(h, session, ' bug')
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

  // 真实现场：模型把 mood 传成语境短语。
  const phrase = await tool.execute({ mood: '扒源码收工' }, exec)
  assert.equal(phrase.ok, true, `「扒源码收工」应该能落到收工/庆祝一类：${JSON.stringify(phrase)}`)
  assert.ok(['qingzhu', 'tingzhi-gongzuo'].includes(phrase.id), `实际落到 ${phrase.id}`)

  // 兜底关闭（默认）时，完全不匹配的词应返回**可执行**的失败：提"可以重试"并给保证命中的词。
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
  h.setConfig({ fallback: 'dianzan' })

  const result = await tool.execute({ mood: '这波操作我服了' }, exec)
  assert.equal(result.ok, true)
  assert.equal(result.id, 'dianzan')
  assert.equal(result.fallback, true)
  const text = tool.output.render({ mood: '这波操作我服了' }, result)[0].text
  assert.match(text, /兜底/)
  assert.doesNotMatch(text, /!\[\]\(/, 'v2.0 不再往正文塞图片')
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

test('/vocab 与 /session-state：客户端派生的两份输入都从真实索引/状态里出来', async (t) => {
  if (locateIndex() === undefined) {
    t.skip('还没有 index.json')
    return
  }
  const h = makeHarness()
  apply(h.ctx)
  const route = h.routes[0]

  // 词表：全量 + 每条都带派生需要的检索字段与全尺寸 URL（**不带 thumb**）。
  const vocab = await call(route, '/api/dsh-memes-reply/vocab')
  assert.equal(vocab.status, 200)
  const vocabBody = JSON.parse(String(vocab.body))
  assert.equal(vocabBody.ready, true)
  assert.equal(vocabBody.total >= 100, true)
  assert.equal(vocabBody.items.length, vocabBody.total, '词表是全量，不分页')
  for (const item of vocabBody.items) {
    assert.match(item.id, /^[a-z0-9][a-z0-9-]*$/)
    assert.ok(Array.isArray(item.tags) && item.tags.length > 0, `${item.id} 缺 tags`)
    assert.ok(Array.isArray(item.aliases), `${item.id} 缺 aliases`)
    assert.match(item.url, /\/api\/dsh-memes-reply\/sticker\//)
    assert.equal(item.thumb, undefined, '贴纸层永远用会动的那张')
  }

  // 会话态：静音/冷却/指定 —— 用真命令写进去，再从这里读回来。
  const session = { id: 'session-state-probe' }
  await command1(h, session, ' off')
  await command1(h, session, ' bug')
  const state = await call(route, `/api/dsh-memes-reply/session-state?sessionId=${session.id}`)
  assert.equal(state.status, 200)
  const stateBody = JSON.parse(String(state.body))
  assert.equal(stateBody.muted, true)
  assert.equal(stateBody.sessionLatch, 'bug')
  assert.ok(Array.isArray(stateBody.recent))
})

