import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'
import type { BuiltRequest } from './context.ts'

// Claude API をブラウザから直接呼ぶ（キーは端末の中だけ）。
// 返り値は構造化出力（JSON スキーマ）で受け、zod で検証する。壊れていたら一度だけ再試行し、
// だめなら原文を返して失敗を示す。エラー文言にキーやヘッダを含めない。

/** 断られたら別のモデルで続ける（サーバー側のフォールバック）。対応するモデルだけに付ける */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export type AiFailure =
  | { kind: 'no-key' }
  | { kind: 'auth' }
  | { kind: 'rate-limit'; retryAfterSec: number | null }
  | { kind: 'network' }
  | { kind: 'refusal' }
  | { kind: 'broken'; raw: string }
  | { kind: 'api'; status: number | null }

export type AiResult<T> = { ok: true; value: T } | { ok: false; failure: AiFailure }

/** 画面に出す文言（キーなどの秘密は含めない） */
export function failureMessage(f: AiFailure): string {
  switch (f.kind) {
    case 'no-key':
      return '設定で API キーを入れてください。'
    case 'auth':
      return 'API キーが正しくないようです。設定を確かめてください。'
    case 'rate-limit':
      return `使用量の上限か混雑で断られました。${f.retryAfterSec ? `${f.retryAfterSec}秒ほど` : '少し'}待ってから、もう一度どうぞ。`
    case 'network':
      return '通信できませんでした。つながっているか確かめて、もう一度どうぞ。'
    case 'refusal':
      return 'この質問には答えられませんでした。聞き方を変えてみてください。'
    case 'broken':
      return '答えの形が崩れていました（原文をそのまま出します）。'
    case 'api':
      return `API でエラーが起きました${f.status ? `（${f.status}）` : ''}。`
  }
}

/** テストで差し替えるための最小の形 */
export interface MessagesClient {
  beta: { messages: { parse: (params: never) => Promise<unknown> } }
}

export function createClient(apiKey: string): MessagesClient {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true, // anthropic-dangerous-direct-browser-access: true を付ける
    maxRetries: 1,
    timeout: 120_000,
  }) as unknown as MessagesClient
}

interface ParsedLike {
  stop_reason?: string | null
  parsed_output?: unknown
  content?: { type: string; text?: string }[]
}

const rawText = (m: ParsedLike) =>
  (m.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')

function toFailure(e: unknown): AiFailure {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { kind: 'auth' }
  if (e instanceof Anthropic.RateLimitError) {
    const h = e.headers?.get?.('retry-after')
    const sec = h ? Number.parseInt(h, 10) : NaN
    return { kind: 'rate-limit', retryAfterSec: Number.isFinite(sec) ? sec : null }
  }
  if (e instanceof Anthropic.APIConnectionError) return { kind: 'network' }
  if (e instanceof Anthropic.APIError) return { kind: 'api', status: e.status ?? null }
  if (e instanceof TypeError) return { kind: 'network' } // fetch 自体の失敗
  return { kind: 'api', status: null }
}

/** 構造化出力で一回呼ぶ。壊れた JSON は一度だけ再試行する */
export async function callStructured<S extends z.ZodType>(
  apiKey: string,
  req: BuiltRequest,
  schema: S,
  client: MessagesClient = createClient(apiKey),
): Promise<AiResult<z.infer<S>>> {
  if (!apiKey) return { ok: false, failure: { kind: 'no-key' } }
  const params = {
    model: req.model,
    max_tokens: req.max_tokens,
    system: req.system,
    messages: req.messages,
    output_config: { effort: req.effort, format: betaZodOutputFormat(schema) },
    ...(FALLBACK_MODELS.has(req.model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  }

  let lastRaw = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    let m: ParsedLike
    try {
      m = (await client.beta.messages.parse(params as never)) as ParsedLike
    } catch (e) {
      // SDK の JSON 解析の失敗は「壊れた答え」として再試行、それ以外の API エラーはそのまま返す
      if (e instanceof SyntaxError || (e instanceof Error && e.name === 'AnthropicError' && /JSON|parse/i.test(e.message))) {
        lastRaw = ''
        continue
      }
      return { ok: false, failure: toFailure(e) }
    }
    if (m.stop_reason === 'refusal') return { ok: false, failure: { kind: 'refusal' } }
    const checked = schema.safeParse(m.parsed_output ?? safeJson(rawText(m)))
    if (checked.success) return { ok: true, value: checked.data }
    lastRaw = rawText(m)
  }
  return { ok: false, failure: { kind: 'broken', raw: lastRaw } }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
