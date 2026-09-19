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
  // 0.1.6a2 统一插件管理后配置面板挂在插件管理页的 `plugins.bundle.config`
  //（键 = 组合包名）；rc7 时代的 `settings.plugin.item` 槽位已不存在。
  // 适配层的注释里会引用旧槽位作为对照（故意的），所以断言前先剥掉注释，
  // 只检查**代码**里还在不在注册旧槽位。
  assert.match(source, /"plugins\.bundle\.config"/, 'bundle 里没有注册 plugins.bundle.config')
  assert.match(source, /data-plugin-config-page/, 'bundle 里没有配置页外壳')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
  assert.doesNotMatch(code, /settings\.plugin\.item/, '代码里仍在注册已移除的 settings.plugin.item')
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
