/**
 * 索引完整性测试：对**真实**产物（`~/.dsh/memes-reply/assets` 或包内 `assets/`）做体检——
 * id 唯一且合法、文件都在、字节数与 sha256 与索引一致、必备字段齐全。
 * 没有索引时跳过（例如还没跑导入脚本），不算失败。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

/** 找到实际生效的索引。 */
function locate() {
  const home = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh')
  const candidates = [join(home, 'memes-reply', 'assets', 'index.json'), join(process.cwd(), 'assets', 'index.json')]
  for (const path of candidates) if (existsSync(path)) return path
  return undefined
}

test('索引与素材一致性', () => {
  const path = locate()
  if (path === undefined) {
    console.log('（跳过）没有找到 index.json，先运行 node scripts/import-assets.mjs')
    return
  }
  const index = JSON.parse(readFileSync(path, 'utf8'))
  const entries = index.sticker
  const root = dirname(path)

  assert.ok(Array.isArray(entries) && entries.length > 0, '索引里应该有贴纸')

  const seen = new Set()
  for (const entry of entries) {
    assert.match(entry.id, ID_RE, `id 形态不合法：${entry.id}`)
    assert.ok(!seen.has(entry.id), `id 重复：${entry.id}`)
    seen.add(entry.id)
    assert.ok(typeof entry.name === 'string' && entry.name !== '', `${entry.id} 缺少中文名`)
    assert.ok(Array.isArray(entry.tags) && entry.tags.length > 0, `${entry.id} 缺少标签`)
    assert.ok(Array.isArray(entry.aliases) && entry.aliases.includes(entry.id), `${entry.id} 的 aliases 应包含自身 id`)

    const file = join(root, entry.file)
    assert.ok(existsSync(file), `${entry.id} 的文件不存在：${entry.file}`)
    const bytes = readFileSync(file)
    assert.equal(bytes.length, entry.bytes, `${entry.id} 字节数与索引不一致`)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    assert.equal(sha256, entry.sha256, `${entry.id} sha256 与索引不一致`)

    const header = bytes.subarray(0, 6).toString('latin1')
    if (entry.file.endsWith('.gif')) assert.equal(header, 'GIF89a', `${entry.id} 不是 GIF89a`)
    if (entry.file.endsWith('.webp')) {
      assert.equal(bytes.subarray(0, 4).toString('latin1'), 'RIFF', `${entry.id} 不是 RIFF 容器`)
      assert.equal(bytes.subarray(8, 12).toString('latin1'), 'WEBP', `${entry.id} 不是 WebP`)
    }
    assert.ok(entry.w > 0 && entry.h > 0, `${entry.id} 尺寸缺失`)
    assert.ok(entry.frames > 0, `${entry.id} 帧数缺失`)
  }
  console.log(`索引体检通过：${entries.length} 张，来源 ${path}`)
})
