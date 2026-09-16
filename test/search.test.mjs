/**
 * 检索单测：情绪词 → 贴纸 id。这些用例同时是"标签表质量"的回归测试——
 * 改 scripts/sticker-map.json 后重跑导入，这里会告诉你有没有把语义改坏。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { searchStickers, scoreEntry, tokenize } from '../lib/search.js'
import { createStickerTool } from '../lib/tool.js'
import { RETRY_WORDS } from '../lib/config.js'
import { HINT_TEXT } from '../lib/prompt.js'

/** 只为构造工具定义用的空壳账本。 */
const trackStub = {
  setTurn: () => {},
  closeTurn: () => {},
  turnOf: () => undefined,
  usedInCurrentTurn: () => false,
  markUsed: () => {},
  lastUsedAt: () => 0,
  stats: () => ({ sessions: 0, turnsObserved: 0 }),
}

/** 手工小索引（不依赖磁盘）。 */
const ENTRIES = [
  { id: 'dianzan', name: '点赞', tags: ['点赞', '好评'], aliases: ['like', 'thumbsup', 'nice'], source: '', file: 'dianzan.gif', seq: null, bytes: 1, sha256: '', w: 1, h: 1, frames: 1, fps: 1, durationMs: 1, encode: null },
  { id: 'ku-1', name: '哭', tags: ['哭', '难过'], aliases: ['cry', 'sad'], source: '', file: 'ku-1.gif', seq: 1, bytes: 1, sha256: '', w: 1, h: 1, frames: 1, fps: 1, durationMs: 1, encode: null },
  { id: 'bug', name: 'Bug', tags: ['Bug', '虫子', '报错'], aliases: ['bug', 'error', 'debug'], source: '', file: 'bug.gif', seq: null, bytes: 1, sha256: '', w: 1, h: 1, frames: 1, fps: 1, durationMs: 1, encode: null },
]

test('tokenize 切分与去重', () => {
  assert.deepEqual(tokenize('  点赞  '), ['点赞'])
  assert.deepEqual(tokenize('bug/error'), ['bug/error', 'bug', 'error'])
  assert.deepEqual(tokenize(''), [])
})

test('精确 id 得分最高', () => {
  assert.ok(scoreEntry(ENTRIES[0], tokenize('dianzan')) > 0)
  assert.equal(searchStickers(ENTRIES, 'dianzan')[0].entry.id, 'dianzan')
})

test('中文情绪词命中', () => {
  assert.equal(searchStickers(ENTRIES, '点赞')[0].entry.id, 'dianzan')
  assert.equal(searchStickers(ENTRIES, '难过')[0].entry.id, 'ku-1')
  assert.equal(searchStickers(ENTRIES, '报错')[0].entry.id, 'bug')
})

test('英文别名命中', () => {
  assert.equal(searchStickers(ENTRIES, 'thumbsup')[0].entry.id, 'dianzan')
  assert.equal(searchStickers(ENTRIES, 'sad')[0].entry.id, 'ku-1')
  assert.equal(searchStickers(ENTRIES, 'debug')[0].entry.id, 'bug')
})

test('无匹配返回空数组（调用方据此让模型换词）', () => {
  assert.deepEqual(searchStickers(ENTRIES, '量子力学'), [])
})

test('真实索引：常见情绪词都能落到某张图上', () => {
  const file = join(homedir(), '.dsh', 'memes-reply', 'assets', 'index.json')
  const packaged = join(process.cwd(), 'assets', 'index.json')
  const chosen = existsSync(file) ? file : existsSync(packaged) ? packaged : undefined
  if (chosen === undefined) {
    console.log('（跳过）还没有生成 index.json')
    return
  }
  const entries = JSON.parse(readFileSync(chosen, 'utf8')).sticker
  const cases = [
    ['点赞', 'dianzan'],
    ['哭了', 'ku'],
    ['生气', 'shengqi'],
    ['摸鱼', 'gongzuo-xiaoshui'],
    ['bug', 'bug'],
    ['思考', 'sikao'],
    ['庆祝', 'qingzhu'],
    ['要钱', 'yaomi'],
    ['得意', 'mojing-fanguang'],
    ['感谢', 'aixin'],
    ['无聊', 'dai'],
    ['破防', 'ziwoanwei'],
  ]
  for (const [query, expected] of cases) {
    const hit = searchStickers(entries, query, 1)[0]
    assert.ok(hit !== undefined, `「${query}」应该能命中某张贴纸`)
    assert.ok(
      hit.entry.id === expected || hit.entry.id.startsWith(`${expected}-`),
      `「${query}」应落在 ${expected} 家族，实际 ${hit.entry.id}`,
    )
  }
})

/**
 * 回归：工具描述里举给模型看的例子，必须真的检索得到。
 * 这条测试的来由是一次真实事故——描述里写着"例如：得意"，而 `得意` 当时一张都命中不了。
 */
test('真实索引：工具描述里的示例词都能命中', () => {
  const file = join(homedir(), '.dsh', 'memes-reply', 'assets', 'index.json')
  const packaged = join(process.cwd(), 'assets', 'index.json')
  const chosen = existsSync(file) ? file : existsSync(packaged) ? packaged : undefined
  if (chosen === undefined) {
    console.log('（跳过）还没有生成 index.json')
    return
  }
  const entries = JSON.parse(readFileSync(chosen, 'utf8')).sticker
  const tool = createStickerTool({
    config: () => ({}),
    index: () => undefined,
    tracker: trackStub,
    state: { read: () => ({ version: 1, sessions: {} }), write: () => {} },
    origin: () => 'http://127.0.0.1:3080',
    exists: async () => true,
  })
  const example = /例如：([^。]+)。/.exec(tool.description)
  assert.ok(example !== null, '工具描述里应该保留"例如：…。"这一段，测试靠它抽取示例词')
  const words = example[1]
    .split('、')
    .map((word) => word.trim())
    .filter((word) => word !== '')
  assert.ok(words.length >= 4, `示例词太少：${words.join('、')}`)
  for (const word of words) {
    assert.ok(searchStickers(entries, word, 1).length > 0, `工具描述里举的例子「${word}」检索不到，请给它补标签`)
  }
})

/**
 * 回归：**系统提示里**举给模型看的场景短语，也必须真的检索得到。
 *
 * 这条测试的来由是第二次真实事故：提示里写了「任务收工」，模型于是把 mood 传成
 * `扒源码收工`——整串在关键词表里一个都匹配不上，那一轮就没贴上。
 * 教训统一成一条纪律：**凡是展示给模型看的词，都必须能被自己的检索器命中。**
 */
test('真实索引：系统提示里的场景短语都能命中', () => {
  const file = join(homedir(), '.dsh', 'memes-reply', 'assets', 'index.json')
  const packaged = join(process.cwd(), 'assets', 'index.json')
  const chosen = existsSync(file) ? file : existsSync(packaged) ? packaged : undefined
  if (chosen === undefined) {
    console.log('（跳过）还没有生成 index.json')
    return
  }
  const entries = JSON.parse(readFileSync(chosen, 'utf8')).sticker
  const scenarios = /（([^）]+)）/.exec(HINT_TEXT)
  assert.ok(scenarios !== null, '提示里应保留「（场景、场景…）」结构，测试靠它抽取场景词')
  const phrases = scenarios[1]
    .split('、')
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase !== '')
  assert.ok(phrases.length >= 3, `场景词太少：${phrases.join('、')}`)
  for (const phrase of phrases) {
    assert.ok(searchStickers(entries, phrase, 1).length > 0, `提示里写的场景「${phrase}」检索不到，请补标签`)
  }

  // 真实现场那句 + 失败时给模型的重试词，都必须能命中。
  assert.ok(searchStickers(entries, '扒源码收工', 1).length > 0, '真实现场「扒源码收工」应能落到收工/庆祝一类')
  for (const word of RETRY_WORDS) {
    assert.ok(searchStickers(entries, word, 1).length > 0, `失败提示里建议的重试词「${word}」检索不到`)
  }

  // 反向：完全无关的联想不该乱命中（宁可返回空，也不要乱贴）。
  assert.deepEqual(searchStickers(entries, '这波操作我服了', 1), [])
})
