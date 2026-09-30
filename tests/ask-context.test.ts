// @vitest-environment node
// 段5 完了条件：文脈組み立てのスナップショット。現在ページより後ろの文字が含まれないことを明示的に検査する。
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, expect, test } from 'vitest'
import { FIXTURE_PATH, MARKERS, markerText } from '../scripts/make-fixture.mjs'
import { buildAskRequest, buildGapRequest, type AskInput } from '../src/ai/context.ts'

const SETTINGS = { model: 'test-model', maxTokens: 1234, effort: 'low' as const }
const pages: string[] = []

beforeAll(async () => {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(FIXTURE_PATH)) }).promise
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    pages.push(tc.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''))
  }
})

const CURRENT = 3

function input(): AskInput {
  return {
    bookTitle: 'テスト用の本 Fixture Book',
    chapter: 'Chapter 1 Reading Slowly',
    section: '1.2 Building a Model',
    page: CURRENT,
    passageText: 'the old question is a map.',
    passageImage: 'iVBORw0KGgoFAKE',
    surrounding: 'When you return to a passage you questioned before, the old question is a map.',
    pageText: pages[CURRENT - 1]!,
    pastQuestions: [
      // 後ろのページ（p.5）で聞いた問いは送らない
      { page: 5, question: 'EMBER の式は？', answerSpeech: 'Formulas compress an argument into a line.' },
      { page: 2, question: 'モデルとは？', answerSpeech: '先を予測できる理解のこと。' },
      { page: 1, question: 'なぜゆっくり？', answerSpeech: 'ずれに気づくため。' },
    ],
    question: 'どういう意味？',
  }
}

test('質問の文脈：スナップショット', () => {
  expect(buildAskRequest(input(), SETTINGS)).toMatchSnapshot()
})

test('現在ページより後ろの文字は含まれない（後ろのページの文字・目印・後ろで聞いた問い）', () => {
  const sent = JSON.stringify(buildAskRequest(input(), SETTINGS))
  // 現在ページの文字は入っている
  expect(sent).toContain(markerText(CURRENT))
  for (let p = CURRENT + 1; p <= pages.length; p++) {
    expect(sent, `p.${p} の目印`).not.toContain(MARKERS[p - 1])
    // 後ろのページの本文の行も一つも入っていない
    for (const line of pages[p - 1]!.split('\n').map((l) => l.trim()).filter((l) => l.length > 20)) {
      expect(sent, `p.${p} の行`).not.toContain(line)
    }
  }
  expect(sent).not.toContain('EMBER の式は？')
  expect(sent).not.toContain('Formulas compress')
})

test('過去の問いは最大5件、現在ページまでのものだけ', () => {
  const many = { ...input(), pastQuestions: Array.from({ length: 8 }, (_, i) => ({ page: 1, question: `問${i}`, answerSpeech: '答' })) }
  const text = JSON.stringify(buildAskRequest(many, SETTINGS))
  expect(text).toContain('問4')
  expect(text).not.toContain('問5')
})

test('画像が無ければ画像のブロックを付けない', () => {
  const r = buildAskRequest({ ...input(), passageImage: null }, SETTINGS)
  expect(r.messages[0]!.content.every((b) => b.type === 'text')).toBe(true)
})

test('まとめの「抜け一つ」の文脈：スナップショット（書き直さない約束を含む）', () => {
  const r = buildGapRequest(
    { bookTitle: '本', section: '1.2 Building a Model', sectionText: pages[1]! + pages[2]!, summary: '問いを持って読む。' },
    SETTINGS,
  )
  expect(r.system).toContain('書き直さない')
  expect(r.system).toContain('一つだけ')
  expect(r).toMatchSnapshot()
})
