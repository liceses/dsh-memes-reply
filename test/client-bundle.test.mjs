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

/**
 * 静态门禁：**顶层 `inject` 只许放基线服务**。
 *
 * 为什么这条最要紧：2026-09-25 这里写着 `['slots', 'settingsScope']`，结果 DSH Desktop
 * 0.1.7-rc.2 **整个应用打不开** —— 0.1.7 已把客户端设置服务改名（`settingsScope` 在它的
 * app.asar 里 0 命中），拿不到该服务的条目永远 pending，浏览器报
 * `web boot: 1 entry did not activate`。
 *
 * cordis 的语义是"inject 里写了就一定要等到"，所以可选服务**只能**走
 * `ctx.inject([...], cb)` 受限 fiber，配 `src/settings-source.ts` 的降级句柄。
 */
test('客户端顶层 inject 只引基线服务（硬引可选服务会让整个应用起不来）', () => {
  const source = readFileSync(join(ROOT, 'src', 'client', 'index.tsx'), 'utf8')
  const match = source.match(/export const inject = (\[[^\]]*\])/)
  assert.ok(match !== null, 'src/client/index.tsx 里找不到 `export const inject = [...]`')
  const declared = JSON.parse(match[1].replace(/'/g, '"'))
  assert.deepEqual(
    declared,
    ['slots'],
    '顶层 inject 只应有 slots；可选服务（settingsScope / configForms / uiConversation …）改用受限 fiber',
  )
})

test('调试浮层打进了 bundle（不是只改了源码）', () => {
  const source = readFileSync(BUNDLE, 'utf8')
  assert.match(source, /dsh-memes-reply-jev-debug/, 'bundle 里没有调试浮层的座位 id')
  assert.match(source, /dsh-memes-reply-jev-chip/, 'bundle 里没有调试浮层的样式类')
})

/**
 * 静态门禁：**hook 不能出现在条件返回之后**。
 *
 * 为什么值得为它写一条测试：这个仓库没接 eslint-plugin-react-hooks，而这类错
 * 只在运行时炸（开关从关到开时 hook 数量变化 → "Rendered more hooks than during
 * the previous render"）。写 `jevpanel.tsx` 时就真踩过一次（`useMemo` 落在了
 * `if (!visible) return null` 之后），typecheck 与构建都不会拦。
 *
 * 做法刻意保守：只看"组件函数体里最后一个 hook 调用"与"第一个顶层 return null"的位置关系。
 */
test('客户端组件：没有 hook 落在条件返回之后（hooks 顺序门禁）', () => {
  const files = ['jevpanel.tsx', 'node.tsx', 'panel.tsx', 'pet.tsx']
  const HOOK = /^\s*(?:const|let|var)?[^\n]*\b(useState|useEffect|useMemo|useRef|useCallback|useSyncExternalStore|useLayoutEffect)\s*[(<]/gm
  for (const file of files) {
    const source = readFileSync(join(ROOT, 'src', 'client', file), 'utf8')
    const lines = source.split('\n')
    let lastHook = -1
    lines.forEach((line, index) => {
      // 注释里的 `useXxx(` 不算
      const code = line.replace(/\/\/.*$/, '')
      if (HOOK.test(code)) lastHook = index
      HOOK.lastIndex = 0
    })
    const firstConditionalReturn = lines.findIndex((line) => /^\s{2}if \(.*\) return null\b/.test(line))
    if (firstConditionalReturn < 0) continue
    assert.ok(
      lastHook < firstConditionalReturn,
      `${file}: 第 ${lastHook + 1} 行有 hook，却排在第 ${firstConditionalReturn + 1} 行的条件返回之后 —— 开关一变就炸`,
    )
  }
})
