/**
 * 客户端产物检查：GUI 能不能装载这个 bundle，以及它有没有被宿主依赖污染。
 *
 * 纯净化规则本体在 `scripts/check-client-purity.mjs`（构建链也用它），
 * 这里再断言包装与清单，形成"构建产物契约"。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const BUNDLE = join(ROOT, 'lib', 'client.js')

test('client bundle 存在且是 __ModuleLoader__ 的 CJS closure', () => {
  if (!existsSync(BUNDLE)) {
    assert.fail('lib/client.js 不存在：先跑 npm run build')
  }
  const source = readFileSync(BUNDLE, 'utf8')
  assert.match(source, /__ModuleLoader__\.load\(/, '缺少 __ModuleLoader__.load 包装')
  assert.match(source, /id:\s*["']dsh-memes-reply["']/, 'closure 里没有本插件 id')
  assert.match(source, /settings\.plugin\.item/, 'bundle 里没有注册 settings.plugin.item')
  assert.match(source, /\/api\/dsh-memes-reply/, 'bundle 里没有引用本插件的同源路由')
})

test('纯净化检查脚本通过（宿主依赖不得进浏览器）', () => {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-client-purity.mjs')], { encoding: 'utf8' })
  assert.equal(result.status, 0, `纯净化检查失败：\n${result.stdout}${result.stderr}`)
  assert.match(result.stdout, /✓/)
})

test('package.json 声明了客户端半边', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.equal(manifest.dsh?.client?.platform, 'web')
  assert.deepEqual(manifest.dsh?.client?.inject, ['@deepseek-ai/dsh-client-runtime'])
  assert.equal(manifest.exports?.['./client']?.default, './lib/client.js')
  assert.ok(manifest.files.includes('lib/client.js'), 'files 里要带上 lib/client.js')
})
