// @vitest-environment node
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { expect, test } from 'vitest'
import { FIXTURE_PATH } from '../scripts/make-fixture.mjs'
import { loadSections } from '../src/outline.ts'

test('fixture の節と、それぞれの終わりのページ', async () => {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(FIXTURE_PATH)) }).promise
  const s = await loadSections(doc as never)
  expect(s.map((x) => [x.id, x.title, x.startPage, x.endPage])).toEqual([
    ['0.0', '1.1 Why Read Slowly', 1, 1],
    ['0.1', '1.2 Building a Model', 2, 3],
    ['1.0', '2.1 Growth', 4, 4],
    ['1.1', '2.2 A Few Formulas', 5, 6],
    ['2.0', '3.1 In Your Own Words', 7, 7],
    ['2.1', '3.2 Finding the Gap', 8, 8],
  ])
})
