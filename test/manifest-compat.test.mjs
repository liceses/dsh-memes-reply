/**
 * 清单兼容门禁：`@deepseek-ai/dsh-*` peer 必须容纳**受支持的每个** dsh 运行时。
 *
 * 为什么值得为它写测试：2026-10-01 桌面端升到 0.2.0-rc.2 后，插件管理页直接拒绝安装 ——
 * 因为 peer 写的是三版本析取（`0.1.5-rc.1 || 0.1.6-alpha.2 || 0.1.7-rc.2`），
 * 后来收敛成 `^0.1.7-rc.1` 也一样被拒：`^` 的上界是 `0.2.0`（不含），
 * 而 `semver.satisfies('0.2.0-rc.2', '^0.1.7-rc.1', { includePrerelease: true })` 是 false。
 *
 * 判据与宿主启动期/安装前检查**逐字一致**（`dsh-app-boot` 的 `evaluatePluginCompatibility`）：
 *   - 只看名字是 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-*` 的 peer；
 *   - `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`；
 *   - `engines.dsh` **不参与**那道闸门（它只是元数据）。
 *
 * 于是这条测试的作用是：下次再加一个要支持的运行时版本，先在这里失败，
 * 而不是等用户在插件管理页看到「与当前 DSH 不兼容」。
 * 规则与出处见 `docs/dsh-0.2.0-compat.md`。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'

const ROOT = process.cwd()
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/** 本插件承诺同时被接纳的运行时：CLI/web profile 与桌面端各自落在这些版本上。 */
const SUPPORTED_RUNTIMES = ['0.1.7-rc.1', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2']

/** 0.1.7 起从 SDK 里消失、不允许再出现在 peer 里的包。 */
const REMOVED_PACKAGES = [
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-agent-presets',
  '@deepseek-ai/dsh-code-runtime',
]

const DSH_PEERS = Object.entries(manifest.peerDependencies ?? {}).filter(
  ([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'),
)

test('peerDependencies 里有 dsh 运行时 peer（否则这道闸门形同不存在）', () => {
  assert.ok(DSH_PEERS.length > 0, 'peerDependencies 里没有任何 @deepseek-ai/dsh-* 条目')
})

test('每个 dsh-* peer 都容纳受支持的每个运行时（与宿主 gate 同一条判据）', () => {
  for (const runtime of SUPPORTED_RUNTIMES) {
    for (const [name, range] of DSH_PEERS) {
      assert.equal(
        semver.satisfies(runtime, range, { includePrerelease: true }),
        true,
        `${name} 的范围 "${range}" 不接纳 dsh ${runtime} —— 宿主启动期与插件管理页会直接拒绝`,
      )
    }
  }
})

test('dsh-* peer 不写 ^ / ~（跨小版本会撞预发布上界）', () => {
  for (const [name, range] of DSH_PEERS) {
    assert.equal(
      /[\^~]/.test(range),
      false,
      `${name} 的范围 "${range}" 用了 ^/~：跨小版本请写显式区间，例如 >=0.1.7-rc.1 <0.3`,
    )
  }
})

test('peer 里没有 0.1.7 起已消失的包', () => {
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    assert.equal(
      REMOVED_PACKAGES.includes(name),
      false,
      `peer 里还有已消失的 ${name}：任何宿主都拿不到它，只会让加载永久 pending`,
    )
  }
})

test('客户端 inject 里没有已消失的包', () => {
  const inject = manifest.dsh?.client?.inject ?? []
  for (const name of inject) {
    assert.equal(REMOVED_PACKAGES.includes(name), false, `dsh.client.inject 里还有已消失的 ${name}`)
  }
})
