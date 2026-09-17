/**
 * 活体探针（手动运行，不是单元测试）：
 *   node test/live-probe.mjs [port]
 *
 * 打的是**正在运行的 dsh Web GUI**，一次性验证验收清单：
 *   1. 客户端 bundle 是否可装载（/plugins/dsh-memes-reply/client.js）
 *   2. 贴纸字节 + ETag 304
 *   3. 缩略图（设置面板预览墙）
 *   4. 素材清单 /catalog
 *   5. 「下一轮用这张」/latch 的读写
 *   6. /stats（状态行）
 *
 * 比肉眼刷页面更快定位问题：新加的端点若 404 "unknown memes-reply route"，
 * 说明运行中的进程还是旧代码 —— 需要重启一次 dsh web。
 */
const port = Number(process.argv[2] ?? 3080)
const base = `http://127.0.0.1:${port}`

/** 打一个 URL 并打印状态/头/长度。 */
async function probe(path, init) {
  try {
    const res = await fetch(base + path, init)
    const buf = await res.arrayBuffer()
    const magic = buf.byteLength >= 6 ? Buffer.from(buf.slice(0, 6)).toString('latin1') : ''
    const short = path.length > 48 ? `${path.slice(0, 45)}...` : path
    console.log(
      `${String(res.status).padEnd(4)} ${short.padEnd(50)} ct=${String(res.headers.get('content-type') ?? '-').padEnd(28)} len=${String(buf.byteLength).padEnd(8)} etag=${res.headers.get('etag') ?? '-'} ${magic}`,
    )
    return { res, buf }
  } catch (error) {
    console.log(`ERR  ${path.padEnd(50)} ${error?.message ?? error}`)
    return undefined
  }
}

console.log('—— 客户端半边 ——')
// 客户端 bundle 的真实地址是"带 rev 的组合 URL"（`/plugins/??<id>/client.js&rev=<hash>`），
// dsh-client-modules 只按精确 URL 命中，所以裸路径必然 404 —— 这不是故障。
// 半边是否活着，用 cordis Inspect 看 `settings.plugin.item` 的占用者里有没有 dsh-memes-reply。
const client = await probe('/plugins/dsh-memes-reply/client.js')
if (client !== undefined && client.res.status === 404) {
  console.log('     （裸路径 404 属正常：真实地址是带 rev 的组合 URL，见上）')
}

console.log('\n—— 图片字节 ——')
const first = await probe('/api/dsh-memes-reply/sticker/dianzan.gif')
if (first !== undefined && first.res.ok) {
  const etag = first.res.headers.get('etag')
  if (etag !== null) await probe('/api/dsh-memes-reply/sticker/dianzan.gif', { headers: { 'if-none-match': etag } })
}
await probe('/api/dsh-memes-reply/thumb/dianzan.webp')
await probe('/api/dsh-memes-reply/sticker/nope.gif')

console.log('\n—— 面板数据 ——')
const catalog = await probe('/api/dsh-memes-reply/catalog?limit=3&seed=0')
if (catalog !== undefined && catalog.res.ok) {
  const body = JSON.parse(Buffer.from(catalog.buf).toString('utf8'))
  console.log(`     items=${body.items?.length} total=${body.total} 第一张=${body.items?.[0]?.id} thumb=${body.items?.[0]?.thumb ? 'ok' : 'null'}`)
}

const latched = await probe('/api/dsh-memes-reply/latch', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: 'dianzan' }),
})
if (latched !== undefined && latched.res.ok) {
  console.log(`     POST /latch -> ${Buffer.from(latched.buf).toString('utf8')}`)
  await probe('/api/dsh-memes-reply/latch')
  await probe('/api/dsh-memes-reply/latch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: null }),
  })
}

console.log('\n—— 客户端派生的两份输入（v2.0）——')
const vocab = await probe('/api/dsh-memes-reply/vocab')
if (vocab !== undefined && vocab.res.ok) {
  const body = JSON.parse(Buffer.from(vocab.buf).toString('utf8'))
  console.log(`     /vocab -> ready=${body.ready} total=${body.total} 首条=${body.items?.[0]?.id ?? '?'}`)
} else {
  console.log('     ⚠️ /vocab 404 —— 宿主还没重启（贴纸层会退回打包词表，仍可工作）')
}
const sessionState = await probe('/api/dsh-memes-reply/session-state?sessionId=probe')
if (sessionState !== undefined && sessionState.res.ok) {
  console.log(`     /session-state -> ${Buffer.from(sessionState.buf).toString('utf8')}`)
} else {
  console.log('     ⚠️ /session-state 404 —— 宿主还没重启（静音/冷却/指定暂不生效）')
}

console.log('\n—— 常驻挂件 ——')
const petRead = await probe('/api/dsh-memes-reply/layout')
if (petRead !== undefined && petRead.res.ok) {
  console.log(`     GET /layout -> ${Buffer.from(petRead.buf).toString('utf8')}`)
}
const petWrite = await probe('/api/dsh-memes-reply/layout', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ right: 28, bottom: 104 }),
})
if (petWrite !== undefined && petWrite.res.ok) {
  console.log(`     POST /layout -> ${Buffer.from(petWrite.buf).toString('utf8')}`)
}

console.log('\n—— 状态行 ——')
const stats = await probe('/api/dsh-memes-reply/stats')
if (stats !== undefined && stats.res.ok) {
  console.log('    ', Buffer.from(stats.buf).toString('utf8'))
}
