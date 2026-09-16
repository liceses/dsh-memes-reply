#!/usr/bin/env node
/**
 * dsh-memes-reply — 客户端 bundle 纯净化检查。
 *
 * 浏览器半边必须自洽：它只能 import 平台模块（react / client-* 服务），
 * 一旦把宿主侧的东西（schemastery、node:fs、dsh-settings…）打进去，
 * 轻则页面报错，重则把 Node 专有代码塞进浏览器。
 *
 * 这个脚本在 `npm test` 之前跑，断言三件事：
 *   1. `lib/client.js` 存在且是 __ModuleLoader__ 的 CJS closure 产物；
 *   2. 不含任何禁止出现的宿主依赖痕迹；
 *   3. 运行时 require 的模块全部在白名单里。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BUNDLE = join(ROOT, 'lib', 'client.js')

/** 允许被 require 的平台模块（其余一律视为越界）。 */
const ALLOWED_REQUIRES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-settings/client',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
]

/** 绝不能出现在浏览器 bundle 里的痕迹。 */
const FORBIDDEN = [
  { pattern: /schemastery/i, why: 'schemastery 是宿主侧依赖（设置 schema），不能进浏览器' },
  { pattern: /node:(fs|path|os|child_process|url)/, why: 'Node 内置模块不能进浏览器' },
  { pattern: /require\((["'])fs\1\)/, why: 'Node fs 不能进浏览器' },
  { pattern: /@deepseek-ai\/dsh-settings/, why: '宿主设置包不能进浏览器（client 走 settingsScope 服务）' },
  { pattern: /@deepseek-ai\/dsh-host-webserver/, why: '宿主 webServer 不能进浏览器' },
  { pattern: /__dirname|process\.cwd\(\)/, why: 'Node 专有全局' },
]

/** 收集 bundle 里出现的 require("...") 目标。 */
function collectRequires(source) {
  const found = new Set()
  const re = /require\(\s*(["'])([^"']+)\1\s*\)/g
  let match
  while ((match = re.exec(source)) !== null) found.add(match[2])
  return [...found]
}

if (!existsSync(BUNDLE)) {
  console.error(`✗ 客户端 bundle 缺失：${BUNDLE}（先跑 npm run build:client）`)
  process.exit(1)
}

const source = readFileSync(BUNDLE, 'utf8')
const problems = []

if (!source.includes('__ModuleLoader__.load')) {
  problems.push('缺少 __ModuleLoader__.load closure 包装（GUI 装载不了）')
}
if (!/id:\s*["']dsh-memes-reply["']/.test(source)) {
  problems.push('closure 里没有本插件的 id')
}
for (const { pattern, why } of FORBIDDEN) {
  if (pattern.test(source)) problems.push(`${why}（命中 ${pattern}）`)
}
const requires = collectRequires(source)
for (const specifier of requires) {
  if (!ALLOWED_REQUIRES.includes(specifier)) problems.push(`require 了白名单外的模块：${specifier}`)
}

if (problems.length > 0) {
  console.error('✗ 客户端 bundle 纯净化检查未通过：')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

const kb = Math.round(Buffer.byteLength(source) / 1024)
console.log(`✓ 客户端 bundle 纯净：lib/client.js（${kb} KB，require ${requires.length} 个平台模块：${requires.join(', ') || '无'}）`)
