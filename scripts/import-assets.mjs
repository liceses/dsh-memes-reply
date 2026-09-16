#!/usr/bin/env node
/**
 * dsh-memes-reply · 素材导入
 *
 * 把任意一组「蓝色大肥鱼_<语义>_<时间戳>.gif」表情包压缩成可分发副本，并生成
 * `index.json`（运行时唯一事实源）。零依赖：只用 node 内置模块 + PATH 上的
 * ffmpeg / ffprobe。
 *
 * 用法示例：
 *   node scripts/import-assets.mjs --dry-run                       # 只看会做什么
 *   node scripts/import-assets.mjs --out ~/.dsh/memes-reply/assets  # 压缩副本进 DSH_HOME
 *   node scripts/import-assets.mjs --also-package                   # 同时写进仓库 assets/
 *   node scripts/import-assets.mjs --format webp                      # 动画 WebP（默认保留全部帧）
 *   node scripts/import-assets.mjs --format webp --fps 25             # 动画 WebP + 降到 25fps（体积约省 1/3）
 *   node scripts/import-assets.mjs --only 点赞 --only Bug             # 只处理指定语义
 *   node scripts/import-assets.mjs --reindex --also-package           # 只重算元数据，不重新编码
 *   node scripts/import-assets.mjs --thumbs --also-package            # 只为现有产物补缩略图（设置面板预览墙用）
 *
 * 设计取舍：
 *  - 原图是 500x500 @ 50fps、单张最大 8.4 MB。50fps 对卡通贴纸是浪费，默认阶梯
 *    从 320px/25fps 开始逐级降级，直到单张 <= --max-bytes（默认 400 KB）。
 *  - 阶梯只对「压不下去」的图生效，因此绝大多数图保持 320px/25fps 的最好档位。
 *  - 索引里同时记录压缩参数与 sha256：前者可复查画质取舍，后者做 HTTP ETag。
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const REPO = resolve(HERE, '..')
const DEFAULT_SRC = 'D:/Pictures/image_ACG/蓝色大肥鱼表情包'
const STICKER_RE = /^蓝色大肥鱼_(.*)_(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\.gif$/i

/**
 * GIF 质量阶梯：从「最好」到「最小」。
 * 320px 是首选：前端 markdown 图片的 CSS 是 `width:auto; max-width:100%`
 * （`._image_kcgor_284`），所以 320px 的图按 320px 显示，不会被放大；再大纯属浪费。
 * 帧率是体积的主要杠杆（原图 50fps，对卡通贴纸是浪费）：先用 12fps 保住 320px 尺寸，
 * 只有实在压不下去的图才退尺寸。
 */
const GIF_LADDER = [
  { size: 320, fps: 20, colors: 128, dither: 'bayer:bayer_scale=3' },
  { size: 320, fps: 15, colors: 96, dither: 'bayer:bayer_scale=3' },
  { size: 320, fps: 12, colors: 96, dither: 'bayer:bayer_scale=3' },
  { size: 320, fps: 12, colors: 64, dither: 'none' },
  { size: 280, fps: 12, colors: 64, dither: 'none' },
  { size: 240, fps: 10, colors: 48, dither: 'none' },
]
/** WebP 降级阶梯（默认保留全部帧：只有尺寸/质量降级）。 */
const WEBP_LADDER = [
  { size: 320, quality: 60 },
  { size: 320, quality: 50 },
  { size: 320, quality: 40 },
  { size: 280, quality: 40 },
  { size: 240, quality: 35 },
  { size: 200, quality: 30 },
]
/** 每种格式的默认单张上限（可用 --max-bytes 覆盖）。 */
const DEFAULT_MAX_BYTES = { gif: 320 * 1024, webp: 700 * 1024 }
/** 搜索起点：先按这一档编码，再据此向上（有富余）或向下（超标）探。 */
const BASELINE_STEP = 2
/** 向上试探的门槛：编码结果不超过目标体积的这个比例，才值得试更好的一档。 */
const UPGRADE_HEADROOM = 0.7

/** 解析命令行参数。 */
function parseArgs(argv) {
  const opts = {
    src: DEFAULT_SRC,
    out: join(homedir(), '.dsh', 'memes-reply', 'assets'),
    packageDir: null,
    format: 'gif',
    maxBytes: null,
    fps: null,
    only: [],
    pin: null,
    dryRun: false,
    reindex: false,
    thumbs: false,
    force: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${a} 需要一个值`)
      return v
    }
    if (a === '--src') opts.src = next()
    else if (a === '--out') opts.out = next()
    else if (a === '--also-package') opts.packageDir = join(REPO, 'assets')
    else if (a === '--package-dir') opts.packageDir = next()
    else if (a === '--format') opts.format = next()
    else if (a === '--max-bytes') opts.maxBytes = Number(next())
    else if (a === '--fps') opts.fps = Number(next())
    else if (a === '--pin') opts.pin = Number(next())
    else if (a === '--only') opts.only.push(next())
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--reindex') opts.reindex = true
    else if (a === '--thumbs') opts.thumbs = true
    else if (a === '--force') opts.force = true
    else throw new Error(`未知参数：${a}`)
  }
  if (opts.format !== 'gif' && opts.format !== 'webp') throw new Error('--format 只支持 gif | webp')
  if (opts.maxBytes === null) opts.maxBytes = DEFAULT_MAX_BYTES[opts.format]
  if (opts.fps !== null && (!Number.isFinite(opts.fps) || opts.fps < 0)) throw new Error('--fps 需要非负整数（0 = 保留全部帧）')
  opts.src = resolve(opts.src.replace(/^~(?=$|\/)/, homedir()))
  opts.out = resolve(opts.out.replace(/^~(?=$|\/)/, homedir()))
  return opts
}

/** 跑一个子进程并返回 stdout（失败抛错，stderr 附上）。 */
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true })
  if (r.error) throw new Error(`${cmd} 无法执行：${r.error.message}`)
  if (r.status !== 0) throw new Error(`${cmd} 退出码 ${r.status}：${(r.stderr || '').trim().split('\n').slice(-3).join(' | ')}`)
  return r.stdout ?? ''
}

/** ffprobe 读输出文件的尺寸/帧数/时长。`-count_frames` 是必须的：动画 WebP 只在
 * `nb_read_frames` 里有帧数，且 `format.duration` 为空——这时用 帧数/帧率 反推时长。 */
function probe(file) {
  const out = run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=width,height,nb_frames,nb_read_frames,avg_frame_rate',
    '-show_entries', 'format=duration',
    '-of', 'json', file,
  ])
  const j = JSON.parse(out)
  const s = j.streams?.[0] ?? {}
  const [num, den] = String(s.avg_frame_rate ?? '0/1').split('/').map(Number)
  const fps = den ? Number((num / den).toFixed(2)) : 0
  const frames = Number(s.nb_read_frames ?? s.nb_frames ?? 0)
  const reported = Number(j.format?.duration ?? 0)
  const durationMs = reported > 0 ? Math.round(reported * 1000) : fps > 0 ? Math.round((frames / fps) * 1000) : 0
  return {
    w: Number(s.width ?? 0),
    h: Number(s.height ?? 0),
    frames,
    fps,
    durationMs,
  }
}

/** 从文件名解析出语义与序号。 */
function parseName(file) {  const m = file.match(STICKER_RE)
  const raw = m ? m[1] : file.replace(/\.gif$/i, '')
  const seqM = raw.match(/^(.*?)\s*(\d+)$/)
  return {
    semantic: (seqM ? seqM[1] : raw).trim(),
    seq: seqM ? Number(seqM[2]) : null,
    date: m ? m[2] : null,
  }
}

/** 一档压缩参数 → ffmpeg 命令行。`fpsOverride` 为 --fps 给的全局覆盖（0 = 保留全部帧）。 */
function encodeTo(srcFile, dstFile, format, step, fpsOverride = null) {
  const fps = fpsOverride !== null && fpsOverride > 0 ? fpsOverride : (step.fps ?? 0)
  const fpsFilter = fps > 0 ? `fps=${fps},` : ''
  const common = ['-y', '-v', 'error', '-i', srcFile]
  if (format === 'gif') {
    const vf = `${fpsFilter}scale=${step.size}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${step.colors}[p];[b][p]paletteuse=dither=${step.dither}`
    run('ffmpeg', [...common, '-vf', vf, '-loop', '0', '-an', dstFile])
  } else {
    run('ffmpeg', [...common, '-vf', `${fpsFilter}scale=${step.size}:-1:flags=lanczos`, '-c:v', 'libwebp_anim', '-loop', '0', '-q:v', String(step.quality), '-an', dstFile])
  }
}

/**
 * 只重建索引，**不重新编码**：
 *  - 元数据（尺寸/帧数/时长/字节/sha256）从现有文件重算；
 *  - 标签/别名从 `sticker-map.json` 重新套用。
 * 用途：改了 probe 逻辑，或只想改标签——改完 30 秒生效，不必再压十几分钟。
 */
function reindex(opts) {
  const indexPath = join(opts.out, 'index.json')
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))
  const map = JSON.parse(readFileSync(join(HERE, 'sticker-map.json'), 'utf8'))
  delete map._comment
  let metaChanged = 0
  let tagsChanged = 0
  const missing = new Set()

  for (const entry of index.sticker) {
    const file = join(opts.out, entry.file)
    const bytes = readFileSync(file)
    const info = probe(file)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (
      entry.bytes !== bytes.length ||
      entry.sha256 !== sha256 ||
      entry.frames !== info.frames ||
      entry.durationMs !== info.durationMs ||
      entry.w !== info.w ||
      entry.h !== info.h
    ) {
      metaChanged += 1
    }
    entry.bytes = bytes.length
    entry.sha256 = sha256
    Object.assign(entry, info)

    const mapped = map[entry.name]
    if (mapped === undefined) {
      missing.add(entry.name)
      continue
    }
    const base = mapped.id
    const tags = [entry.name, ...(mapped.tags ?? [])]
    const aliases = [...new Set([...(mapped.aliases ?? []), base, entry.id])]
    if (JSON.stringify(tags) !== JSON.stringify(entry.tags) || JSON.stringify(aliases) !== JSON.stringify(entry.aliases)) {
      tagsChanged += 1
    }
    entry.tags = tags
    entry.aliases = aliases
  }

  index.generatedAt = new Date().toISOString()
  const json = `${JSON.stringify(index, null, 2)}\n`
  writeFileSync(indexPath, json)
  if (opts.packageDir) writeFileSync(join(opts.packageDir, 'index.json'), json)
  const total = index.sticker.reduce((n, s) => n + s.bytes, 0)
  console.log(`重算索引：${index.sticker.length} 条 · 元数据更新 ${metaChanged} 条 · 标签更新 ${tagsChanged} 条`)
  console.log(`合计 ${(total / 1024 / 1024).toFixed(1)} MB · 均值 ${Math.round(total / index.sticker.length / 1024)} KB`)
  if (missing.size > 0) console.log(`⚠ sticker-map.json 缺少 ${missing.size} 条语义：${[...missing].join('、')}`)
  console.log(`索引：${indexPath}${opts.packageDir ? ` + ${join(opts.packageDir, 'index.json')}` : ''}`)
}

/**
 * 缩略图：设置面板预览墙用。首帧、160px 宽、静态 WebP（十几 KB），
 * 因此"12 格预览墙"总共只有 ~200 KB，而不是 12 × 560 KB 的动画。
 * 全尺寸动画只在用户点选后加载一张。
 */
function makeThumb(srcFile, dstFile) {
  run('ffmpeg', [
    '-y', '-v', 'error', '-i', srcFile,
    '-frames:v', '1',
    '-vf', 'scale=160:-1:flags=lanczos',
    '-c:v', 'libwebp', '-q:v', '70', '-an',
    dstFile,
  ])
}

/** 缩略图文件名（与 id 对齐，扩展名固定 webp）。 */
function thumbNameFor(entry) {
  return `${entry.id}.webp`
}

/**
 * 为索引里的每条生成/补齐缩略图，并把 `thumb` 字段写回索引（含包内副本）。
 * 已存在且未 --force 就跳过，所以可以反复跑。
 */
function ensureThumbs(opts, index) {
  const thumbDir = join(opts.out, 'thumb')
  mkdirSync(thumbDir, { recursive: true })
  if (opts.packageDir) mkdirSync(join(opts.packageDir, 'thumb'), { recursive: true })

  let made = 0
  let kept = 0
  const failed = []
  for (const entry of index.sticker) {
    const name = thumbNameFor(entry)
    const dst = join(thumbDir, name)
    if (!opts.force && existsSync(dst)) {
      entry.thumb = name
      kept += 1
      continue
    }
    try {
      makeThumb(join(opts.out, entry.file), dst)
      entry.thumb = name
      made += 1
    } catch (error) {
      failed.push({ id: entry.id, error: String(error?.message ?? error) })
    }
  }

  const json = `${JSON.stringify(index, null, 2)}\n`
  writeFileSync(join(opts.out, 'index.json'), json)
  if (opts.packageDir) {
    writeFileSync(join(opts.packageDir, 'index.json'), json)
    for (const entry of index.sticker) {
      if (entry.thumb === undefined || entry.thumb === null) continue
      const from = join(thumbDir, entry.thumb)
      const to = join(opts.packageDir, 'thumb', entry.thumb)
      if (existsSync(from) && resolve(from) !== resolve(to)) writeFileSync(to, readFileSync(from))
    }
  }
  console.log(`\n缩略图：新生成 ${made} 张 · 复用 ${kept} 张${failed.length > 0 ? ` · 失败 ${failed.length} 张` : ''}`)
  for (const f of failed.slice(0, 5)) console.log(`  ✗ ${f.id}: ${f.error}`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.reindex) {
    reindex(opts)
    if (opts.thumbs) ensureThumbs(opts, JSON.parse(readFileSync(join(opts.out, 'index.json'), 'utf8')))
    return
  }
  if (opts.thumbs && !opts.force && existsSync(join(opts.out, 'index.json'))) {
    // 纯 --thumbs：只为现有产物补缩略图，不重新编码。
    const index = JSON.parse(readFileSync(join(opts.out, 'index.json'), 'utf8'))
    console.log(`只为现有索引补缩略图：${index.sticker.length} 条 · ${opts.out}`)
    ensureThumbs(opts, index)
    return
  }
  const map = JSON.parse(readFileSync(join(HERE, 'sticker-map.json'), 'utf8'))
  delete map._comment

  if (!existsSync(opts.src)) throw new Error(`素材目录不存在：${opts.src}`)
  const all = readdirSync(opts.src).filter((f) => /\.gif$/i.test(f))

  // 语义 → 文件列表（决定多版本是否带序号后缀）
  const bySemantic = new Map()
  for (const f of all) {
    const { semantic, seq, date } = parseName(f)
    if (!bySemantic.has(semantic)) bySemantic.set(semantic, [])
    bySemantic.get(semantic).push({ file: f, seq, date })
  }

  // --only：ASCII 键按 id 精确匹配（含多版本后缀），其它按中文语义子串匹配。
  const idsOf = (s) => {
    const base = map[s]?.id
    if (base === undefined) return []
    const list = bySemantic.get(s) ?? []
    return list.length > 1 ? list.map((v) => (v.seq !== null ? `${base}-${v.seq}` : base)) : [base]
  }
  const wanted = [...bySemantic.keys()].filter((s) => {
    if (opts.only.length === 0) return true
    return opts.only.some((k) => (/^[a-z0-9-]+$/.test(k) ? idsOf(s).includes(k) : s.includes(k)))
  })

  const missing = wanted.filter((s) => map[s] === undefined)
  if (missing.length > 0) {
    throw new Error(`sticker-map.json 缺少 ${missing.length} 条语义，请补齐后重跑：\n  ${missing.join('\n  ')}`)
  }

  const fullLadder = opts.format === 'gif' ? GIF_LADDER : WEBP_LADDER
  if (opts.pin !== null && (!Number.isInteger(opts.pin) || opts.pin < 1 || opts.pin > fullLadder.length)) {
    throw new Error(`--pin 需要 1..${fullLadder.length} 之间的整数（当前格式的阶梯档数）`)
  }
  // --pin 用于出样张：固定用某一档，不按体积降级。
  const ladder = opts.pin === null ? fullLadder : [fullLadder[opts.pin - 1]]
  const ext = opts.format
  console.log(`素材目录 : ${opts.src}`)
  console.log(`输出目录 : ${opts.out}`)
  if (opts.packageDir) console.log(`同时写包 : ${opts.packageDir}`)
  console.log(`格式/目标: ${opts.format} · 单张 <= ${Math.round(opts.maxBytes / 1024)} KB · 阶梯 ${ladder.length} 档 · 帧率 ${opts.fps === null || opts.fps === 0 ? (opts.format === 'webp' ? '保留全部帧' : '按阶梯') : `${opts.fps}fps`}`)
  console.log(`本次处理 : ${wanted.length} / ${bySemantic.size} 个语义（${all.length} 个文件）\n`)

  if (!opts.dryRun) {
    mkdirSync(opts.out, { recursive: true })
    if (opts.packageDir) mkdirSync(opts.packageDir, { recursive: true })
  }

  const stickers = []
  const oversize = []
  const failed = []
  const ladderHits = new Array(ladder.length).fill(0)
  const tmp = join(opts.out, '.tmp')

  for (const semantic of wanted) {
    const versions = bySemantic.get(semantic).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    for (const v of versions) {
      const base = map[semantic]
      const id = versions.length > 1 && v.seq !== null ? `${base.id}-${v.seq}` : base.id
      const srcPath = join(opts.src, v.file)
      const outName = `${id}.${ext}`
      const outPath = join(opts.out, outName)

      if (opts.dryRun) {
        console.log(`  ${id.padEnd(28)} <- ${v.file}`)
        continue
      }

      let encode = null
      let bytes = 0
      try {
        mkdirSync(tmp, { recursive: true })
        const staged = join(tmp, outName)
        /** 按第 i 档编码一次，返回体积与（达标时的）字节内容。 */
        const attempt = (i) => {
          rmSync(staged, { force: true })
          encodeTo(srcPath, staged, opts.format, ladder[i], opts.fps)
          const size = statSync(staged).size
          return { i, size, buf: size <= opts.maxBytes ? readFileSync(staged) : null }
        }

        const start = opts.pin === null ? Math.min(BASELINE_STEP, ladder.length - 1) : 0
        let chosen = attempt(start)
        if (chosen.buf !== null) {
          // 达标：若还有富余，向上试更好的一档，直到不达标为止。
          for (let j = start - 1; j >= 0 && chosen.size < opts.maxBytes * UPGRADE_HEADROOM; j--) {
            const better = attempt(j)
            if (better.buf === null) break
            chosen = better
          }
        } else {
          // 超标：向下退档，直到达标（或退到底）。
          for (let j = start + 1; j < ladder.length; j++) {
            const smaller = attempt(j)
            chosen = smaller
            if (smaller.buf !== null) break
          }
          if (chosen.buf === null) oversize.push({ id, bytes: chosen.size })
        }

        bytes = chosen.size
        encode = { ...ladder[chosen.i], bytes, step: chosen.i + 1 }
        ladderHits[chosen.i]++
        const buf = chosen.buf ?? readFileSync(staged)
        writeFileSync(outPath, buf)
        rmSync(staged, { force: true })

        const info = probe(outPath)
        const sha256 = createHash('sha256').update(buf).digest('hex')
        stickers.push({
          id,
          name: semantic,
          file: outName,
          source: v.file,
          seq: v.seq,
          tags: [semantic, ...(base.tags ?? [])],
          aliases: [...new Set([...(base.aliases ?? []), base.id, id])],
          bytes,
          sha256,
          ...info,
          encode,
        })
        const pct = Math.round((bytes / statSync(srcPath).size) * 100)
        process.stdout.write(`  ${id.padEnd(28)} ${String(Math.round(bytes / 1024)).padStart(5)} KB (${String(pct).padStart(3)}% of orig, 第 ${encode.step} 档)\n`)
      } catch (error) {
        failed.push({ id, file: v.file, error: String(error?.message ?? error) })
        process.stdout.write(`  ${id.padEnd(28)} 失败：${String(error?.message ?? error)}\n`)
      }
    }
  }

  if (opts.dryRun) {
    console.log('\n--dry-run：未写任何文件。')
    return
  }
  rmSync(tmp, { recursive: true, force: true })

  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    generator: 'scripts/import-assets.mjs',
    source: opts.src,
    format: opts.format,
    maxBytes: opts.maxBytes,
    ladder,
    sticker: stickers,
  }
  if (opts.thumbs) {
    for (const entry of stickers) entry.thumb = thumbNameFor(entry)
    ensureThumbs(opts, index)
  }
  const indexJson = JSON.stringify(index, null, 2) + '\n'
  writeFileSync(join(opts.out, 'index.json'), indexJson)
  if (opts.packageDir) {
    writeFileSync(join(opts.packageDir, 'index.json'), indexJson)
    for (const s of stickers) {
      const from = join(opts.out, s.file)
      const to = join(opts.packageDir, s.file)
      if (resolve(from) !== resolve(to)) writeFileSync(to, readFileSync(from))
    }
  }

  const totalBytes = stickers.reduce((n, s) => n + s.bytes, 0)
  console.log(`\n完成：${stickers.length} 个文件，合计 ${(totalBytes / 1024 / 1024).toFixed(1)} MB`)
  console.log(`阶梯命中：${ladderHits.map((n, i) => `第${i + 1}档 ${n}`).join(' · ')}`)
  if (oversize.length > 0) {
    console.log(`\n⚠ 即使退到最后一档仍超过 ${Math.round(opts.maxBytes / 1024)} KB（共 ${oversize.length} 张）：`)
    for (const o of oversize) console.log(`  ${o.id.padEnd(28)} ${Math.round(o.bytes / 1024)} KB`)
  }
  if (failed.length > 0) {
    console.log(`\n✗ 失败 ${failed.length} 个：`)
    for (const f of failed) console.log(`  ${f.id} <- ${f.file}: ${f.error}`)
  }
  console.log(`\n索引：${join(opts.out, 'index.json')}${opts.packageDir ? ` + ${join(opts.packageDir, 'index.json')}` : ''}`)
}

main().catch((error) => {
  console.error(`\n导入失败：${error?.message ?? error}`)
  process.exitCode = 1
})
