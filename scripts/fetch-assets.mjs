#!/usr/bin/env node
/**
 * dsh-memes-reply — 取素材（代码与素材分离的"取素材那一半"）。
 *
 * 仓库里**不再放素材**（87 MB 会被 git 依赖在解析阶段整仓下载，pnpm 60 秒超时必挂），
 * 素材改走 release 附件。clone 之后跑一次这个脚本即可：
 *
 *   node scripts/fetch-assets.mjs              # 下 release 附件 → ~/.dsh/memes-reply/assets
 *   node scripts/fetch-assets.mjs --dry-run    # 只看会做什么（校验 sha256，不落盘）
 *   node scripts/fetch-assets.mjs --from dist/memes-assets-v1.zip   # 用本地包（离线/自建）
 *   node scripts/fetch-assets.mjs --force      # 目标目录已有素材时覆盖
 *   node scripts/fetch-assets.mjs --manifest <文件>  # 用别的清单（自建镜像/测试）
 *
 * 校验：`scripts/assets-pack.json` 里的 sha256 + 字节数；解包后还要确认 index.json 能解析
 * 且贴纸数 > 0 —— 素材是下载来的，宁可失败也不要半份坏素材。
 */

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readZip, resolveInside } from './zip.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = resolve(arg('manifest', join(ROOT, 'scripts', 'assets-pack.json')))

/** 解析 `--key value`。 */
function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback
}
const flag = (name) => process.argv.includes(`--${name}`)

const dshHome = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh')
const dest = resolve(arg('dest', join(dshHome, 'memes-reply', 'assets')))
const manifest = (() => {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  } catch (error) {
    console.error(
      `读不到素材清单：${MANIFEST}\n` +
        `  （它是 scripts/pack-assets.mjs 生成的；如果你是从别处拿到的包，直接 --from <zip> 或 --url <地址> 跳过校验）\n` +
        `  原因：${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  }
})()
const localPack = arg('from', '')
const url = arg('url', manifest.url)
const dryRun = flag('dry-run')

/**
 * 下载素材包。
 *
 * 优先用 **curl**：它天然读 `http_proxy` / `https_proxy` / `all_proxy` 环境变量，
 * 而 Node 自带的 fetch（undici）**默认不走代理** —— 在这个环境里实测直连 57 KB/s、
 * 走代理 291 KB/s，87 MB 相差 20 分钟。curl 不可用时才退回 fetch。
 */
function download(url, target) {
  const probe = spawnSync('curl', ['--version'], { stdio: 'ignore' })
  if (probe.error === undefined && probe.status === 0) {
    const proxy = process.env.https_proxy ?? process.env.HTTPS_PROXY ?? process.env.all_proxy ?? process.env.ALL_PROXY
    if (proxy !== undefined && proxy !== '') console.log(`  用 curl 下载（代理 ${proxy}）`)
    else console.log('  用 curl 下载（未发现代理环境变量，将直连）')
    const started = Date.now()
    const result = spawnSync('curl', ['-L', '--fail', '--silent', '--show-error', '--output', target, url], {
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    if (result.status === 0) {
      const bytes = statSync(target).size
      const seconds = (Date.now() - started) / 1000
      console.log(`  下载完成 ${(bytes / 1024 / 1024).toFixed(1)} MB / ${seconds.toFixed(1)}s = ${(bytes / 1024 / seconds).toFixed(0)} KB/s`)
      return readFileSync(target)
    }
    console.log(`  curl 失败（exit ${result.status}），退回 node fetch 再试一次`)
  }
  return undefined
}

/** 拿素材包字节：本地文件或下载。 */
async function loadPack() {
  if (localPack !== '') {
    const path = resolve(localPack)
    console.log(`用本地包：${path}`)
    return readFileSync(path)
  }
  console.log(`下载素材包：${url}`)
  const scratch = join(mkdtempSync(join(tmpdir(), 'memes-assets-')), 'pack.zip')
  const viaCurl = download(url, scratch)
  if (viaCurl !== undefined) return viaCurl

  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(
      `下载失败 HTTP ${response.status}。\n` +
        `  可能是素材附件还没上传（见 README「素材与代码分离」），或网络需要代理：\n` +
        `  可以手动下载后跑 node scripts/fetch-assets.mjs --from <下载到的 zip>\n` +
        `  （node 的 fetch 不走代理；curl 会读 https_proxy 环境变量）`,
    )
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  console.log(`  下载完成 ${(buffer.length / 1024 / 1024).toFixed(1)} MB`)
  return buffer
}

const pack = await loadPack()
const sha256 = createHash('sha256').update(pack).digest('hex')

console.log(`  字节数 ${pack.length}（清单 ${manifest.bytes}）`)
console.log(`  sha256 ${sha256}`)
if (manifest.sha256 !== '' && manifest.sha256 !== sha256) {
  console.error(`\n校验失败：sha256 与清单不一致。\n  清单：${manifest.sha256}\n  实际：${sha256}`)
  process.exit(1)
}
if (manifest.bytes !== 0 && manifest.bytes !== pack.length) {
  console.error(`\n校验失败：字节数与清单不一致（清单 ${manifest.bytes}，实际 ${pack.length}）`)
  process.exit(1)
}

const entries = readZip(pack)
const indexEntry = entries.find((entry) => entry.name === 'index.json')
if (indexEntry === undefined) {
  console.error('\n包里没有 index.json —— 拒绝解包')
  process.exit(1)
}
let stickers = 0
try {
  const index = JSON.parse(indexEntry.data.toString('utf8'))
  stickers = Array.isArray(index.sticker) ? index.sticker.length : 0
} catch (error) {
  console.error(`\nindex.json 解析失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
if (stickers === 0) {
  console.error('\nindex.json 里一张贴纸都没有 —— 拒绝解包')
  process.exit(1)
}

const existing = statSync(dest, { throwIfNoEntry: false })
if (existing?.isDirectory() && !flag('force')) {
  const probe = readFileSync(join(dest, 'index.json'), { throwIfNoEntry: false })
  if (probe !== undefined) {
    console.log(`\n目标目录已有素材：${dest}`)
    console.log('  要覆盖就加 --force（不想动它就换个 --dest）')
    process.exit(0)
  }
}

if (dryRun) {
  console.log(`\n（--dry-run）校验通过：${entries.length} 个文件、贴纸 ${stickers} 张 → 将解到 ${dest}`)
  process.exit(0)
}

let written = 0
for (const entry of entries) {
  const target = resolveInside(dest, entry.name)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, entry.data)
  written++
}

console.log(`\n完成：解出 ${written} 个文件、贴纸 ${stickers} 张 → ${dest}`)
console.log('  重启 dsh（或刷新页面）即可用；不想重启就只是素材已就位，路由会按 mtime 重新读索引。')
