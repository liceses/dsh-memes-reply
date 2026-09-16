/**
 * 贴纸落地仓单测：**按 seq 水线绑定**（与轮次号无关）、认领后稳定、收起、长回合不过期、订阅。
 *
 * 这个仓是"气泡角贴纸"能成立的关键 —— 链式座位的 select 必须是同步纯函数，
 * 只能靠它同步查到"这一轮该不该贴"。所以它的行为要钉死。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { STORE_TTL_MS, createStickerStore } from '../lib/store.js'

/** 造一张事件。 */
function event(turn, id = 'dianzan', sessionId = 's1') {
  return {
    seq: turn,
    sessionId,
    turn,
    id,
    name: id,
    url: `http://127.0.0.1:3080/api/dsh-memes-reply/sticker/${id}.webp`,
    thumb: null,
    reason: 'keyword',
    matched: '点赞',
    at: 1_000_000,
  }
}

test('编号恰巧一致：直接命中；反复问都返回同一张；收起后让位', () => {
  const store = createStickerStore(() => 1_000_000)
  assert.equal(store.peek(22, 500), null, '空仓必须让位（好让交付卡片渲染）')
  store.put(event(22))
  for (let i = 0; i < 5; i++) {
    assert.equal(store.peek(22, 500)?.id, 'dianzan', `第 ${i + 1} 次查询应仍然拿得到`)
  }
  store.dismiss(22)
  assert.equal(store.peek(22, 500), null, '收起后本轮让位')
})

/**
 * 真事故的回归：host 的轮次号与客户端的 `TurnLocation.turn` **差 2 且会漂移**
 * （trace 实证 `host:publish turn=22` 对 `client:select turn=20 miss`）。
 * 所以绑定必须走 seq 水线，而不是轮次号。
 */
test('编号不一致：按 seq 水线绑定，越过水线的第一条尾巴接手', () => {
  const store = createStickerStore(() => 1_000_000)
  // 客户端已经渲染过历史，水线停在 480
  assert.equal(store.peek(20, 480), null)
  // host 认为这是第 22 轮（客户端最终会把它渲染成第 21 轮）
  store.put(event(22, 'tanhao'))
  // 旧轮次（seq 在水线以下）不许借走
  assert.equal(store.peek(3, 100), null, '旧轮次的 seq 低于水线，不能借走新贴纸')
  assert.equal(store.peek(19, 479), null, '紧贴水线但没越过，也不该接手')
  // 越过水线的第一条尾巴 → 命中（与轮次号无关）
  assert.equal(store.peek(21, 500)?.id, 'tanhao', 'seq 越过水线的尾巴应接手')

  // 认领后：本轮稳定返回，别的轮次拿不到
  store.claim(21)
  assert.equal(store.peek(21, 500)?.id, 'tanhao')
  assert.equal(store.peek(22, 600), null, '已认领的贴纸不该被更新的轮次再拿走')
  assert.equal(store.size(), 1)
})

test('认领是搬家不是复制；收起只影响本轮', () => {
  const store = createStickerStore(() => 1_000_000)
  store.put(event(5, 'bug'))
  store.claim(4)
  assert.equal(store.peek(4, 100)?.id, 'bug')
  assert.equal(store.size(), 1)
  store.dismiss(4)
  assert.equal(store.peek(4, 100), null)
  assert.equal(store.size(), 0)
})

test('长回合不过期：30 分钟内一直等得到（every 模式在轮次开始就发布）', () => {
  let now = 1_000_000
  const store = createStickerStore(() => now)
  store.peek(20, 480)
  store.put(event(22, 'tanhao'))

  now += 10 * 60_000 // 一个跑了 10 分钟的长回合（多次工具调用）
  assert.equal(store.peek(21, 500)?.id, 'tanhao', '长回合里贴纸绝不能中途过期')

  const stale = createStickerStore(() => now)
  stale.peek(20, 480)
  stale.put(event(22, 'tanhao'))
  now += STORE_TTL_MS + 1000
  assert.equal(stale.peek(21, 500), null, '超过保留时长才允许自动清掉')
})

test('订阅：put/claim/dismiss 都会通知，退订后不再通知', () => {
  const store = createStickerStore(() => 1_000_000)
  let hits = 0
  const off = store.subscribe(() => {
    hits += 1
  })
  store.put(event(1))
  assert.equal(hits, 1)
  store.claim(1)
  assert.equal(hits, 2)
  store.dismiss(1)
  assert.equal(hits, 3)
  off()
  store.put(event(2))
  assert.equal(hits, 3, '退订之后不该再收到')
})

test('peek 是纯查询：不会把待绑定的那张"消费"掉', () => {
  const store = createStickerStore(() => 1_000_000)
  store.put(event(22))
  // 页面刚加载就收到事件时，第一条渲染的尾巴只用来立基线（否则最旧的那轮会抢走它）
  assert.equal(store.peek(3, 10), null, '第一条尾巴立基线，不接手')
  for (let i = 0; i < 5; i++) {
    assert.equal(store.peek(21, 500)?.id, 'dianzan', '渲染期反复调用必须一直给同一张')
  }
  // 但比水线更旧的轮次永远拿不到
  assert.equal(store.peek(3, 10), null)
})
