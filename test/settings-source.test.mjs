/**
 * 设置来源延迟绑定句柄的单元测试。
 *
 * 为什么这组测试值得存在：2026-09-25 本插件在 DSH Desktop 0.1.7-rc.2 上把**整个应用**
 * 弄到打不开 —— 客户端入口的顶层 `inject` 里硬引了 `settingsScope`，而 0.1.7 已经
 * 没有这个服务（改名成 `configForms`）。cordis 的 loader 于是永久停在
 * `pending (waiting for service: settingsScope)`，浏览器报
 * `web boot: 1 entry did not activate`。
 *
 * 修法是把设置来源换成这个"永远存在、服务到了再挂上"的句柄。这组测试锁住它的三条性质：
 *   1. **没挂上时也是合法的 `SettingsScope`**（能读、能订阅、写入是安全空操作）；
 *   2. **引用稳定** —— `useSyncExternalStore` 要求每次读同一个引用，否则 React 死循环；
 *   3. **挂上之后行为与真服务一致**，解绑后干净回退。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLazyScope } from '../lib/settings-source.js'

/** 造一个假的官方设置服务。 */
function fakeLiveScope(initial) {
  let snapshot = {
    status: 'ready',
    value: initial,
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
    mode: 'host',
  }
  const listeners = new Set()
  const setCalls = []
  const unsetCalls = []
  return {
    setCalls,
    unsetCalls,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async set(field, value) {
      setCalls.push([field, value])
    },
    async unset(field) {
      unsetCalls.push(field)
    },
    /** 测试驱动：换快照并通知。 */
    push(next) {
      snapshot = { ...snapshot, ...next }
      for (const listener of [...listeners]) listener()
    },
    listenerCount: () => listeners.size,
  }
}

test('未挂载时是合法的 SettingsScope：快照 unavailable、value 为 undefined', () => {
  const scope = createLazyScope()
  assert.equal(scope.attached, false)
  const snapshot = scope.getSnapshot()
  assert.equal(snapshot.status, 'unavailable')
  assert.equal(snapshot.value, undefined)
  assert.equal(snapshot.writable, false)
})

test('未挂载时快照引用稳定（useSyncExternalStore 的硬要求）', () => {
  const scope = createLazyScope()
  // 连续读必须是同一个引用：每次返回新对象会让 React 认为 store 一直在变而无限重渲染。
  assert.equal(scope.getSnapshot(), scope.getSnapshot())
})

test('未挂载时 set / unset 是安全空操作，不抛错', async () => {
  const scope = createLazyScope()
  await scope.set('autoMode', 'jev')
  await scope.unset('autoMode')
  // 仍然是降级态，没有被写入带偏
  assert.equal(scope.getSnapshot().status, 'unavailable')
})

test('attach 立刻通知订阅者，并把读透传给真服务', () => {
  const scope = createLazyScope()
  const live = fakeLiveScope({ autoMode: 'jev' })
  let notified = 0
  scope.subscribe(() => {
    notified += 1
  })

  const detach = scope.attach(live)

  assert.equal(scope.attached, true)
  assert.equal(notified, 1, 'attach 本身是一次状态变化，必须通知订阅者')
  assert.deepEqual(scope.getSnapshot().value, { autoMode: 'jev' })
  detach()
})

test('真服务的快照变化会透传出来', () => {
  const scope = createLazyScope()
  const live = fakeLiveScope({ autoMode: 'keyword' })
  scope.attach(live)
  let notified = 0
  scope.subscribe(() => {
    notified += 1
  })

  live.push({ value: { autoMode: 'every' }, revision: 2 })

  assert.equal(notified, 1)
  assert.deepEqual(scope.getSnapshot().value, { autoMode: 'every' })
  assert.equal(scope.getSnapshot().revision, 2)
})

test('attach 后 set / unset 转发给真服务', async () => {
  const scope = createLazyScope()
  const live = fakeLiveScope({ autoMode: 'keyword' })
  scope.attach(live)

  await scope.set('autoMode', 'jev')
  await scope.unset('autoMode')

  assert.deepEqual(live.setCalls, [['autoMode', 'jev']])
  assert.deepEqual(live.unsetCalls, ['autoMode'])
})

test('detach 后回到 unavailable，且不再跟随真服务', () => {
  const scope = createLazyScope()
  const live = fakeLiveScope({ autoMode: 'jev' })
  const detach = scope.attach(live)
  detach()

  assert.equal(scope.attached, false)
  assert.equal(scope.getSnapshot().status, 'unavailable')

  live.push({ value: { autoMode: 'every' } })
  assert.equal(scope.getSnapshot().value, undefined, '解绑后不该再被真服务推动')
  assert.equal(live.listenerCount(), 0, '解绑要把订阅撤干净，不能泄漏')
})

test('重复 attach 会先撤掉上一个订阅（不泄漏）', () => {
  const scope = createLazyScope()
  const first = fakeLiveScope({ autoMode: 'keyword' })
  const second = fakeLiveScope({ autoMode: 'jev' })

  scope.attach(first)
  scope.attach(second)

  assert.equal(first.listenerCount(), 0, '上一个服务上的订阅必须被撤掉')
  assert.equal(second.listenerCount(), 1)
  assert.deepEqual(scope.getSnapshot().value, { autoMode: 'jev' }, '读的是最新挂上的那个')
})
