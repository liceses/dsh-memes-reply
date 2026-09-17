/**
 * dsh-memes-reply — 贴纸层/探针诊断报告：`node scripts/probe-report.mjs`
 *
 * 只读 `/stats`，把 host 决策轨迹与客户端回执按"这一版到底跑没跑、节点有没有渲染、
 * 选的是哪张、有没有被折进过程展示"分组打印出来。
 *
 * 为什么要有它：浏览器控制台宿主看不到，客户端的每一条结论都必须经 `/debug` 回传，
 * 而这个脚本就是把那些回执读成人话的唯一入口（v1.0 §15 的教训）。
 *
 * 用法：
 *   node scripts/probe-report.mjs            # 打最近 60 条
 *   node scripts/probe-report.mjs 200        # 打最近 200 条
 */

const BASE = process.env.DSH_MEMES_BASE ?? 'http://127.0.0.1:3080/api/dsh-memes-reply'
const limit = Number(process.argv[2] ?? 60)

const response = await fetch(`${BASE}/stats`)
if (!response.ok) {
  console.error(`取 /stats 失败：HTTP ${response.status}`)
  process.exit(1)
}
const stats = await response.json()
const trace = Array.isArray(stats.trace) ? stats.trace : []

console.log(
  `素材 ${stats.entries} 张 · 形态 ${stats.form} · 服务 ${stats.served} 次 · ` +
    `待取位 ${stats.autoLast === null ? '空' : stats.autoLast?.id ?? '?'} · 轨迹 ${trace.length} 条`,
)

const pick = (kind) => trace.filter((entry) => entry.kind === kind)
const note = (entry) => entry.note ?? ''

/** 客户端是否真的加载了这一版。 */
const apply = pick('client:client-apply').at(-1)
console.log(`\n① 浏览器半边是否加载：${apply === undefined ? '（没有回执 → 页面还没刷/加载失败）' : note(apply)}`)

/** 探针定义有没有注册上。 */
const installed = pick('client:sticker-node-installed').at(-1)
const vocab = pick('client:sticker-node-vocab').at(-1)
const registerFailed = pick('client:sticker-node-register-failed').at(-1)
console.log(
  `② 贴纸层（v2.0）：${
    installed !== undefined ? `✅ ${note(installed)}` : registerFailed !== undefined ? `❌ ${note(registerFailed)}` : '（无回执）'
  }${vocab === undefined ? '' : ` · 词表 ${note(vocab)}`}`,
)

/** 贴纸节点：渲染了几轮、选了什么、生成中/落定。 */
const nodes = pick('client:sticker-node')
const streaming = nodes.filter((entry) => note(entry).includes('phase=streaming'))
const settled = nodes.filter((entry) => note(entry).includes('phase=settled'))
console.log(`③ 贴纸节点：共 ${nodes.length} 条回执 · 生成中 ${streaming.length} · 已落定 ${settled.length}`)
for (const entry of [...streaming.slice(-2), ...settled.slice(-3)]) {
  console.log(`   · turn=${entry.turn ?? '?'} ${note(entry)}`)
}

/** P2：有没有被折进"过程展示"。 */
const folded = nodes.filter((entry) => !note(entry).includes('过程成员=no'))
console.log(`④ 被折进过程展示的贴纸节点：${folded.length} 条${folded.length === 0 ? '（✅ 全部独立）' : ''}`)
const noChoice = settled.filter((entry) => note(entry).includes('选中=无'))
console.log(`⑤ 落定但没选中贴纸的回合：${noChoice.length} 条（静音/关开关/词表空都会这样）`)

/** 临时探针（验证已通过，M2.0f 删除）。 */
const probe = pick('client:probe-phase')
const probeRegistered = pick('client:probe-registered').at(-1)
if (probe.length > 0 || probeRegistered !== undefined) {
  console.log(`⑥ 临时探针：${probeRegistered === undefined ? '未注册' : note(probeRegistered)} · ${probe.length} 条回执`)
}

const tail = trace.slice(-limit)
console.log(`\n—— 最近 ${tail.length} 条 ——`)
for (const entry of tail) {
  const who = entry.sessionId === undefined ? '' : ` sess=${String(entry.sessionId).slice(-6)}`
  const turn = entry.turn === undefined ? '' : ` turn=${entry.turn}`
  console.log(`${entry.kind}${turn}${who}${note(entry) === '' ? '' : ` · ${note(entry)}`}`)
}
