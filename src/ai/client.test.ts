import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { describe, expect, test, vi } from 'vitest'
import { callStructured, failureMessage, type MessagesClient } from './client.ts'
import type { BuiltRequest } from './context.ts'
import { AnswerSchema } from './schema.ts'

// テストでは Claude API を呼ばない。常にモックのクライアントを渡す。

const KEY = 'sk-ant-test-SECRET'
const REQ: BuiltRequest = {
  model: 'claude-opus-5-5',
  max_tokens: 100,
  system: 's',
  effort: 'low',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }],
}
const ANSWER = { speech: '一文', detail: '**補足**', figure: null, concepts: ['モデル'] }

const reply = (value: unknown, extra: object = {}) => ({
  stop_reason: 'end_turn',
  parsed_output: value,
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  ...extra,
})

function mockClient(...results: (unknown | Error)[]) {
  const parse = vi.fn(async (params: unknown) => {
    void params
    const r = results.shift()
    if (r instanceof Error) throw r
    return r
  })
  return { client: { beta: { messages: { parse } } } as unknown as MessagesClient, parse }
}

describe('callStructured', () => {
  test('返り値をスキーマで検証して返す。構造化出力とフォールバックを付けて呼ぶ', async () => {
    const { client, parse } = mockClient(reply(ANSWER))
    const r = await callStructured(KEY, REQ, AnswerSchema, client)
    expect(r).toEqual({ ok: true, value: ANSWER })
    const params = parse.mock.calls[0]![0] as Record<string, unknown>
    expect(params.model).toBe('claude-opus-5-5')
    expect(params.max_tokens).toBe(100)
    expect((params.output_config as { effort: string }).effort).toBe('low')
    expect(params.fallbacks).toBe('default')
    expect(JSON.stringify(params)).not.toContain(KEY)
  })

  test('フォールバック非対応のモデルには fallbacks を付けない', async () => {
    const { client, parse } = mockClient(reply(ANSWER))
    await callStructured(KEY, { ...REQ, model: 'claude-haiku-4-5' }, AnswerSchema, client)
    expect(parse.mock.calls[0]![0]).not.toHaveProperty('fallbacks')
  })

  test('壊れた JSON は一度だけ再試行し、直れば成功', async () => {
    const { client, parse } = mockClient(reply('{"speech": "途中で切', { parsed_output: null }), reply(ANSWER))
    expect(await callStructured(KEY, REQ, AnswerSchema, client)).toEqual({ ok: true, value: ANSWER })
    expect(parse).toHaveBeenCalledTimes(2)
  })

  test('二度壊れていたら、原文を付けて失敗を返す（三度目は呼ばない）', async () => {
    const { client, parse } = mockClient(
      reply('{"speech": 1', { parsed_output: null }),
      reply('{"speech": "形が違う"}', { parsed_output: { speech: '形が違う' } }),
    )
    const r = await callStructured(KEY, REQ, AnswerSchema, client)
    expect(r).toEqual({ ok: false, failure: { kind: 'broken', raw: '{"speech": "形が違う"}' } })
    expect(parse).toHaveBeenCalledTimes(2)
  })

  test('SDK が JSON の解析で投げても、壊れた答えとして一度だけ再試行する', async () => {
    const { client, parse } = mockClient(new SyntaxError('Unexpected end of JSON input'), reply(ANSWER))
    expect((await callStructured(KEY, REQ, AnswerSchema, client)).ok).toBe(true)
    expect(parse).toHaveBeenCalledTimes(2)
  })

  test('429 は上限・混雑として、retry-after の秒数を添えて返す（再試行はしない）', async () => {
    const err = new Anthropic.RateLimitError(429, { type: 'error' }, 'rate limited', new Headers({ 'retry-after': '20' }))
    const { client, parse } = mockClient(err)
    const r = await callStructured(KEY, REQ, AnswerSchema, client)
    expect(r).toEqual({ ok: false, failure: { kind: 'rate-limit', retryAfterSec: 20 } })
    expect(parse).toHaveBeenCalledTimes(1)
    expect(failureMessage((r as unknown as { failure: never }).failure)).toContain('20秒')
  })

  test('通信断は network として返す', async () => {
    const { client } = mockClient(new Anthropic.APIConnectionError({ message: 'Connection error.' }))
    expect(await callStructured(KEY, REQ, AnswerSchema, client)).toEqual({ ok: false, failure: { kind: 'network' } })
    const { client: c2 } = mockClient(new TypeError('Failed to fetch'))
    expect(await callStructured(KEY, REQ, AnswerSchema, c2)).toEqual({ ok: false, failure: { kind: 'network' } })
  })

  test('キーの誤り・断り・キー無し', async () => {
    const { client } = mockClient(new Anthropic.AuthenticationError(401, {}, `invalid x-api-key ${KEY}`, new Headers()))
    const r = await callStructured(KEY, REQ, AnswerSchema, client)
    expect(r).toEqual({ ok: false, failure: { kind: 'auth' } })
    expect(failureMessage((r as unknown as { failure: never }).failure)).not.toContain(KEY)

    const { client: c2 } = mockClient(reply(null, { stop_reason: 'refusal', parsed_output: null }))
    expect(await callStructured(KEY, REQ, AnswerSchema, c2)).toEqual({ ok: false, failure: { kind: 'refusal' } })

    const { client: c3, parse } = mockClient(reply(ANSWER))
    expect(await callStructured('', REQ, AnswerSchema, c3)).toEqual({ ok: false, failure: { kind: 'no-key' } })
    expect(parse).not.toHaveBeenCalled()
  })
})

describe('返り値のスキーマ', () => {
  test('figure は null か {title, size, kind}、size は inline/page だけ', () => {
    expect(AnswerSchema.safeParse(ANSWER).success).toBe(true)
    expect(AnswerSchema.safeParse({ ...ANSWER, figure: { title: '図', size: 'page', kind: 'flow' } }).success).toBe(true)
    expect(AnswerSchema.safeParse({ ...ANSWER, figure: { title: '図', size: 'huge', kind: 'flow' } }).success).toBe(false)
    expect(AnswerSchema.safeParse({ speech: 'x', detail: 'y' }).success).toBe(false)
  })

  test('構造化出力の JSON スキーマに変換できる', () => {
    const f = betaZodOutputFormat(AnswerSchema) as unknown as { type: string; schema: { required: string[] } }
    expect(f.type).toBe('json_schema')
    expect(f.schema.required).toEqual(expect.arrayContaining(['speech', 'detail', 'figure', 'concepts']))
  })
})
