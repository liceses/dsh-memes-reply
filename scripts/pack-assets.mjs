#!/usr/bin/env node
/**
 * dsh-memes-reply — 把素材目录打成**发布附件**（代码与素材分离的"素材那一半"）。
 *
 *   node scripts/pack-assets.mjs                 # 打包 assets/ → dist/memes-assets-v1.zip
 *   node scripts/pack-assets.mjs --from <目录>    # 换素材源（默认 assets/）
 *   node scripts/pack-assets.mjs --out <文件>     # 换输出位置
 *
 * 打完会刷新 `scripts/assets-pack.json`（url / sha256 / 字节数 / 文件数），
 * `fetch-assets.mjs` 就靠它校验下载到的包，不需要额外传参数。
 *
 * 为什么要分离：git 依赖（`github:owner/repo#sha`）在**解析阶段**就要下载整仓 tarball。
 * 素材 87 MB 时，pnpm 默认 60 秒 fetch 超时永远下不完（实测走代理 291 KB/s ≈ 5 分钟），
 * 于是安装必然失败。代码留在仓库、素材走 release 附件后，仓库只剩几百 KB，秒装。
 *
 * 上传（打完之后）：
 *   gh release create assets-v1 dist/memes-assets-v1.zip -t "素材包 v1" -n "157 张动画 WebP + 缩略图"
 *   # 没有 gh 就在 GitHub 网页上手动传；文件名必须与 assets-pack.json 里的 url 一致
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeZip } from './zip.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 解析 `--key value` 形式的参数。 */
function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback
}

const from = resolve(arg('from', join(ROOT, 'assets')))
const out = resolve(arg('out', join(ROOT, 'dist', 'memes-assets-v1.zip')))
/** 清单写哪（测试用临时路径，避免污染仓库里那份）。 */
const manifestPath = resolve(arg('manifest', join(ROOT, 'scripts', 'assets-pack.json')))
/** 发布附件的固定地址（`releases/latest/download/<文件名>`）。 */
const releaseFile = 'memes-assets-v1.zip'

/** 递归收集文件（顺序固定 → 字节可复现）。 */
function walk(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path, base))
    else if (entry.isFile()) out.push({ name: relative(base, path).split('\\').join('/'), data: readFileSync(path) })
  }
  return out
}

if (!statSync(from, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`素材目录不存在：${from}\n（先在包目录跑 node scripts/import-assets.mjs --format webp --also-package --thumbs）`)
  process.exit(1)
}

const entries = walk(from)
if (entries.length === 0) {
  console.error(`素材目录是空的：${from}`)
  process.exit(1)
}
const hasIndex = entries.some((entry) => entry.name === 'index.json')
if (!hasIndex) {
  console.error('素材目录里没有 index.json —— 这个包取回去也不能用')
  process.exit(1)
}

const zip = writeZip(entries)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, zip)

const sha256 = createHash('sha256').update(zip).digest('hex')
const bytes = zip.length
const stickers = (() => {
  try {
    const index = JSON.parse(entries.find((entry) => entry.name === 'index.json').data.toString('utf8'))
    return Array.isArray(index.sticker) ? index.sticker.length : 0
  } catch {
    return 0
  }
})()

console.log(`打包 ${entries.length} 个文件（贴纸 ${stickers} 张）`)
console.log(`  → ${out}`)
console.log(`  ${(bytes / 1024 / 1024).toFixed(1)} MB · sha256 ${sha256}`)

const manifestPathFinal = manifestPath
const manifest = {
  version: 1,
  url: `https://github.com/liceses/dsh-memes-reply/releases/latest/download/${releaseFile}`,
  sha256,
  bytes,
  files: entries.length,
  stickers,
  note: '由 scripts/pack-assets.mjs 生成；上传 release 附件后把 sha256 保持与包一致，fetch-assets.mjs 会校验',
}
writeFileSync(manifestPathFinal, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`  → ${manifestPathFinal}（已刷新 sha256）`)
console.log('\n下一步：把这个 zip 传到 release（文件名要与 url 一致）：')
console.log(`  gh release create assets-v1 "${out}" -t "素材包 v1" -n "${stickers} 张动画 WebP + 缩略图"`)
