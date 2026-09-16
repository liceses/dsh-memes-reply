/**
 * dsh-memes-reply — 模型工具 `use_sticker`。
 *
 * 这是整个功能的**唯一收口**：谁选图、贴几张、贴什么形态，全在这里决定。
 *  - 每轮最多一张：硬性拦在工具层，第二次调用直接返回"不要重试"，绝不产出 URL；
 *  - 形态分支：`inline` 返回可直接粘贴的 markdown 片段；`sticker`（M2）只登记、正文零 URL；
 *  - 文件必须真实存在才产出 URL：宁可让模型换一张，也不让正文出现破图。
 */

import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { StickerEntry, MemesConfig, PluginState, StickerForm } from './types.js'
import type { LoadedIndex } from './assets.js'
import { RETRY_WORDS } from './config.js'
import { markdownImage, stickerUrl, STICKER_ID_RE, TOOL_NAME } from './protocol.js'
import { searchStickers } from './search.js'
import { sessionState, globalLatch, setGlobalLatch } from './state.js'
import { FALLBACK_WINDOW_MS, type TurnTracker } from './turn.js'

/** 工具返回值（同时是 output.schema 的形状）。 */
export interface StickerToolValue {
  ok: boolean
  id?: string
  name?: string
  url?: string
  markdown?: string
  reason?: string
  candidates?: string[]
  /** true = 关键词没匹配上，用了设置里的兜底贴纸。 */
  fallback?: boolean
  /** true = 形态 sticker：已交给客户端贴纸层显示，正文里不要写 URL。 */
  dock?: boolean
}

/** 工具依赖。 */
export interface ToolDeps {
  config: () => MemesConfig
  index: () => LoadedIndex | undefined
  tracker: TurnTracker
  state: { read: () => PluginState; write: (state: PluginState) => void }
  /** 浏览器当前使用的 origin（从 Host 头学到；没学到就给本机默认值）。 */
  origin: () => string
  /** 贴纸文件是否真实可读（决定能不能产出 URL）。 */
  exists: (entry: StickerEntry) => Promise<boolean>
  /** 形态 sticker 时：把选中的贴纸交给客户端贴纸层（dock）显示。 */
  toDock: (entry: StickerEntry, sessionId: string) => void
}

/** 失败结果。 */
function fail(reason: string, candidates?: string[]): StickerToolValue {
  return candidates === undefined || candidates.length === 0 ? { ok: false, reason } : { ok: false, reason, candidates }
}

/** 工具描述（写给模型看的"礼节"；与系统提示里那一行提示配合起作用）。 */
const DESCRIPTION = [
  '贴一张蓝色大肥鱼表情包，给回复加一点情绪。',
  '合适的收尾可以贴一张：问题被修好、踩了坑、想夸一句、报告成功或失败、长任务收工。',
  'mood 必须传**短词**（2–4 个字的情绪词），不要传整句或长短语——长短语检索不到。',
  '一轮最多一张；不要用它代替文字回答；用户明确说不要图时不要用。',
  'mood 例如：得意、翻车、摸鱼、bug、思考、庆祝、收工、夸。',
].join('')

/** 构建工具定义（host 侧注册）。 */
export function createStickerTool(deps: ToolDeps): ToolDefinition {
  return {
    name: TOOL_NAME,
    description: DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        mood: {
          type: 'string',
          description: '2–4 个字的情绪词（不要整句），如 得意、翻车、摸鱼、bug、思考、收工',
        },
        id: {
          type: 'string',
          description: '可选：精确的贴纸 id（用户用 /fish list 看到的那些）。给 id 时可以不给 mood',
        },
      },
      // mood 与 id 至少给一个，所以这里不设必填。
      required: [],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          id: { type: 'string' },
          name: { type: 'string' },
          url: { type: 'string' },
          markdown: { type: 'string' },
          reason: { type: 'string' },
          candidates: { type: 'array', items: { type: 'string' } },
          fallback: { type: 'boolean' },
          dock: { type: 'boolean' },
        },
        required: ['ok'],
        additionalProperties: false,
      },
      render: (_args, value) => {
        const result = (value ?? {}) as unknown as StickerToolValue
        if (result.ok) {
          if (result.dock === true) {
            return [
              {
                type: 'text' as const,
                text:
                  `已选好贴纸《${result.name ?? result.id ?? ''}》，它会显示在输入框上方（贴纸层）。` +
                  `**正文里不要写任何图片 URL**，也不要再调用本工具。\n`,
              },
            ]
          }
          const lead =
            result.fallback === true
              ? `关键词没匹配上，用了兜底贴纸《${result.name ?? result.id ?? ''}》。`
              : `已选好贴纸《${result.name ?? result.id ?? ''}》。`
          return [
            {
              type: 'text' as const,
              text:
                lead +
                `把下面这一行**原样**放进你的回复里（放在句末，不要改 URL，不要再调用本工具）：\n\n${result.markdown ?? ''}\n`,
            },
          ]
        }
        const hint =
          result.candidates !== undefined && result.candidates.length > 0
            ? `\n相近的可选贴纸：${result.candidates.join('、')}`
            : ''
        return [{ type: 'text' as const, text: `没有贴纸可用：${result.reason ?? '未知原因'}${hint}` }]
      },
    },
    presentCall: (args) => {
      const mood = (args as { mood?: unknown } | null)?.mood
      return { card: 'generic' as const, title: `贴纸 · ${typeof mood === 'string' ? mood : '?'}` }
    },
    // 限额是共享状态，不能并行执行两次。
    isConcurrencySafe: () => false,
    timeoutMs: 5000,
    async execute(args: unknown, exec: ToolRunContext): Promise<StickerToolValue> {
      const input = (args ?? {}) as { mood?: unknown; id?: unknown }
      const cfg = deps.config()
      const index = deps.index()
      if (index === undefined) {
        return fail('素材索引还没生成，请先在插件目录运行 `node scripts/import-assets.mjs`')
      }
      if (!cfg.enabled) return fail('贴纸功能已被设置里的总开关关闭')

      const sessionId = exec.agent === undefined ? 'global' : String(exec.agent.id)
      const state = deps.state.read()
      const session = sessionState(state, sessionId)
      if (session.muted === true) return fail('本会话已用 /fish off 静音（要恢复请执行 /fish on）')

      const form: StickerForm = session.form ?? cfg.form

      // 每轮最多一张：观测到 turn 就按 turn 判，否则退化成 60 秒窗口。
      const turn = deps.tracker.turnOf(sessionId)
      if (turn !== undefined) {
        if (deps.tracker.usedInCurrentTurn(sessionId)) {
          return fail('本轮已经贴过一张了：一轮最多一张，请不要再调用，也不要重复那行图片')
        }
      } else if (Date.now() - deps.tracker.lastUsedAt(sessionId) < FALLBACK_WINDOW_MS) {
        return fail('刚刚已经贴过（未观测到轮次边界，按 60 秒窗口限制）：请勿连续贴图')
      }

      // 选图优先级：本会话 /fish 指定 > 设置面板的全局指定 > 显式 id > 关键词检索（带冷却过滤）。
      const mood = typeof input.mood === 'string' ? input.mood : ''
      let entry: StickerEntry | undefined
      let fromLatch = false
      if (session.latch !== undefined && session.latch !== '') {
        entry = index.byId.get(session.latch)
        fromLatch = entry !== undefined
      }
      if (entry === undefined) {
        const global = globalLatch(state)
        if (global !== null) {
          entry = index.byId.get(global)
          fromLatch = entry !== undefined
        }
      }
      if (entry === undefined && typeof input.id === 'string' && STICKER_ID_RE.test(input.id)) {
        entry = index.byId.get(input.id)
      }
      let candidates: string[] = []
      if (entry === undefined) {
        const hits = searchStickers(index.entries, mood, 8)
        candidates = hits.slice(0, 5).map((hit) => `${hit.entry.id}(${hit.entry.name})`)
        const recent = new Set(session.recent ?? [])
        const cooldown = Math.max(0, cfg.cooldownTurns)
        const fresh = cooldown > 0 ? hits.find((hit) => !recent.has(hit.entry.id)) : undefined
        entry = fresh?.entry ?? hits[0]?.entry
      }

      // 一个都没匹配上：先用设置里的兜底贴纸（默认关闭），否则回一条**可执行**的失败。
      let usedFallback = false
      if (entry === undefined) {
        const fallbackId = cfg.fallback.trim()
        if (fallbackId !== '' && index.byId.has(fallbackId)) {
          entry = index.byId.get(fallbackId)
          usedFallback = true
        }
      }
      if (entry === undefined) {
        // 关键：告诉模型**可以立刻重试**（失败的调用不消耗本轮额度），并给出保证能命中的词。
        return fail(
          `没有匹配「${mood}」。请用 mood 传一个 2–4 字短词**立刻重试**（本轮还没用过贴纸，可以重试）：` +
            `${RETRY_WORDS.join('、')}；或直接传 id（例如 dianzan，清单见 /fish list）`,
          candidates,
        )
      }

      if (!(await deps.exists(entry))) {
        return fail(`贴纸文件读不到（${entry.id}），已放弃；请不要在正文里写任何图片 URL`)
      }

      deps.tracker.markUsed(sessionId)
      session.latch = undefined
      if (fromLatch) setGlobalLatch(state, null)
      session.recent = [entry.id, ...(session.recent ?? []).filter((id) => id !== entry.id)].slice(0, 12)
      deps.state.write(state)

      // 形态 sticker：不往正文写 URL，改由客户端贴纸层（输入框上方的 dock）显示。
      if (form === 'sticker') {
        deps.toDock(entry, sessionId)
        return {
          ok: true,
          id: entry.id,
          name: entry.name,
          dock: true,
          ...(usedFallback ? { fallback: true } : {}),
        }
      }

      const url = stickerUrl(deps.origin(), entry)
      return {
        ok: true,
        id: entry.id,
        name: entry.name,
        url,
        markdown: markdownImage(url),
        ...(usedFallback ? { fallback: true } : {}),
      }
    },
  }
}
