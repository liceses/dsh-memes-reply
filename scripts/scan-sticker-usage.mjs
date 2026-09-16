#!/usr/bin/env node
/**
 * dsh-memes-reply — 会话日志体检：贴纸到底有没有被用、提示有没有进到请求里。
 *
 *   node scripts/scan-sticker-usage.mjs [--limit 14]
 *
 * 背景：DSH 的会话日志（`<DSH_HOME>/sessions/<ws>/session-<id>/session.v3.jsonl.zstd`）
 * 是**每个事件各自成一个 zstd 帧**的，所以必须"按魔数切帧、逐帧解压再拼接"——
 * 单帧解压只能读到开头，会把统计结果算成 0（这个坑踩过）。
 *
 * 输出三列：
 *   提示    — 请求里有没有本插件的系统提示那一行（验证 prompt hint 是否生效）
 *   工具    — 请求的工具目录里有没有 use_sticker（= 工具对所有会话可用）
 *   调用    — 有没有真实调用记录（`"use_sticker","arguments"`）
 *   贴纸URL — 产物里有几个贴纸 URL（成功的调用一定会留下）
 *
 * 判断"模型到底用没用"看「调用」列，别被「工具」列的 0 骗了（那是没装插件的老会话）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit')
  return i >= 0 ? Number(process.argv[i + 1]) || 14 : 14
})()

/**
 * 检测"提示进了请求"的标记。
 *
 * 两个坑：
 *  1. 段名（`{"name":"dsh-memes-reply:hint"}`）**不会**出现在日志里——日志存的是
 *     装配后的纯文本提示，没有段结构；
 *  2. 拿提示正文当标记会假阳性——我自己在聊天/文件里引用过那句话（第一条就中过）。
 *
 * 所以用**邻接特征**：装配后的提示里，我们这一行紧跟着官方那句英文提示
 * （"When you successfully create or modify files…"）。聊天正文不会凑出这个组合。
 */
const HINT_MARK = /可以用 use_sticker 贴一张大肥鱼；一轮最多一张，用户说不要图时别贴。\\n\\nWhen you successfully create/

/** 弱信号：正文出现过（可能只是我在聊天里引用），单独标注为"?"。 */
const HINT_TEXT_MARK = '可以用 use_sticker 贴一张大肥鱼'

/** 按 zstd 魔数切帧，逐帧解压后拼接。 */
function decodeFrames(buf) {
  const offsets = []
  let i = buf.indexOf(MAGIC)
  while (i !== -1) {
    offsets.push(i)
    i = buf.indexOf(MAGIC, i + 4)
  }
  if (offsets.length === 0) return buf.toString('utf8')
  const parts = []
  for (let k = 0; k < offsets.length; k++) {
    const start = offsets[k]
    const end = k + 1 < offsets.length ? offsets[k + 1] : buf.length
    try {
      parts.push(zstdDecompressSync(buf.subarray(start, end)).toString('utf8'))
    } catch {
      // 坏帧跳过：日志是追加写的，最后几帧可能正在写。
    }
  }
  return parts.join('')
}

/** 找会话日志文件。 */
function logFile(dir) {
  for (const name of ['session.v3.jsonl.zstd', 'session.v3.jsonl']) {
    try {
      const path = join(dir, name)
      statSync(path)
      return path
    } catch {
      // 继续
    }
  }
  return undefined
}

const root = join(homedir(), '.dsh', 'sessions')
const targets = []
for (const workspace of readdirSync(root)) {
  let sessions = []
  try {
    sessions = readdirSync(join(root, workspace)).filter((name) => name.startsWith('session-'))
  } catch {
    continue
  }
  for (const session of sessions) {
    const file = logFile(join(root, workspace, session))
    if (file === undefined) continue
    targets.push({ workspace, session, file, mtime: statSync(file).mtime })
  }
}
targets.sort((a, b) => b.mtime - a.mtime)

console.log(`扫 ${targets.length} 个会话，列出最近 ${LIMIT} 个：\n`)
console.log(
  '时间'.padEnd(20) + 'workspace'.padEnd(34) + '提示'.padStart(6) + '工具'.padStart(6) + '调用'.padStart(6) + '贴纸URL'.padStart(9) + '  解出',
)
let called = 0
let hinted = 0
for (const target of targets.slice(0, LIMIT)) {
  const text = decodeFrames(readFileSync(target.file))
  const hint = HINT_MARK.test(text)
  const hintWeak = !hint && text.includes(HINT_TEXT_MARK)
  const offered = (text.match(/"name":"use_sticker"/g) ?? []).length
  const calls = (text.match(/"use_sticker"\s*,\s*"arguments"/g) ?? []).length
  const urls = (text.match(/\/api\/dsh-memes-reply\/sticker\//g) ?? []).length
  if (hint) hinted++
  if (calls > 0) called++
  console.log(
    new Date(target.mtime).toLocaleString('zh-CN', { hour12: false }).padEnd(20) +
      target.workspace.replace(/^--|--$/g, '').slice(0, 32).padEnd(34) +
      (hint ? '有' : hintWeak ? '?' : '-').padStart(6) +
      String(offered).padStart(6) +
      String(calls).padStart(6) +
      String(urls).padStart(9) +
      `  ${(text.length / 1024 / 1024).toFixed(1)} MB`,
  )
}
console.log(`\n最近 ${LIMIT} 个会话：提示命中 ${hinted} 个 · 真的调用过 ${called} 个`)
console.log('（提示列：「有」= 装配后的提示里确实带了我们那一行；「?」= 只见到正文，可能是我在聊天里引用过；「-」= 没有）')
console.log('（工具列有数字但调用列为 0 = 模型看见了却没用）')
