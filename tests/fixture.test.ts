// @vitest-environment node
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, test } from 'vitest'
import {
  BOOK_TITLE,
  FIXTURE_PATH,
  MATH_PAGE,
  OUTLINE,
  buildFixturePdf,
  markerText,
} from '../scripts/make-fixture.mjs'

type TextItem = { str: string }

async function open() {
  // pdf.js は渡したバッファを手放すので毎回コピーを渡す
  return getDocument({ data: new Uint8Array(readFileSync(FIXTURE_PATH))}).promise
}

async function pageText(page: number) {
  const doc = await open()
  const content = await (await doc.getPage(page)).getTextContent()
  return content.items.map((it) => (it as TextItem).str).join(' ')
}

describe('fixture PDF', () => {
  test('生成スクリプトは毎回同じバイト列を作り、追跡中のファイルと一致する', () => {
    const a = buildFixturePdf()
    const b = buildFixturePdf()
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    expect(Buffer.from(a).equals(readFileSync(FIXTURE_PATH))).toBe(true)
  })

  test('複数ページで、書名を持つ', async () => {
    const doc = await open()
    expect(doc.numPages).toBe(8)
    const { info } = await doc.getMetadata()
    expect((info as { Title?: string }).Title).toBe(BOOK_TITLE)
  })

  test('章立て（アウトライン）が2階層で入っている', async () => {
    const doc = await open()
    const outline = await doc.getOutline()
    expect(outline.map((o) => o.title)).toEqual(OUTLINE.map((o) => o.title))
    expect(outline.map((o) => o.items.map((i) => i.title))).toEqual(OUTLINE.map((o) => o.children.map((c) => c.title)))
    // 行き先のページ番号も合っている
    for (const [i, chapter] of OUTLINE.entries()) {
      const dest = outline[i]!.dest as unknown[]
      expect(await doc.getPageIndex(dest[0] as never)).toBe(chapter.page - 1)
    }
  })

  test('各ページの文字層から既知の文字列が取れる', async () => {
    for (let p = 1; p <= 8; p++) {
      expect(await pageText(p)).toContain(markerText(p))
    }
  })

  test('数式のページがある（Symbol フォントの記号を含む）', async () => {
    const text = await pageText(MATH_PAGE)
    expect(text).toContain('∫')
    expect(text).toContain('Σ')
    expect(text).toMatch(/[αβπ]/)
  })
})
