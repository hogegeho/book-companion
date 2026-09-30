import { z } from 'zod'

/** 質問への答え（CLAUDE.md §4 の返り値） */
export const AnswerSchema = z.object({
  /** 読み上げ用の短い一文 */
  speech: z.string(),
  /** 画面に出す補足（Markdown 可） */
  detail: z.string(),
  figure: z
    .object({
      title: z.string(),
      size: z.enum(['inline', 'page']),
      kind: z.string(),
    })
    .nullable(),
  concepts: z.array(z.string()),
})
export type Answer = z.infer<typeof AnswerSchema>

/** まとめへの反応：抜けを一つだけ */
export const GapSchema = z.object({
  /** 抜けている大事な点を一つだけ。まとめを書き直さない */
  gap: z.string(),
})
export type Gap = z.infer<typeof GapSchema>
