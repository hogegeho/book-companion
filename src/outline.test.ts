import type { PDFDocumentProxy } from 'pdfjs-dist'
import { expect, test } from 'vitest'
import { loadSections, sectionAt, sectionsEndingAt } from './outline.ts'

/** アウトラインだけを持つ偽の文書。dest は [ページ番号-1, {name:'XYZ'}, left, top, zoom] */
function fakeDoc(numPages: number, outline: unknown[]): PDFDocumentProxy {
  return {
    numPages,
    getOutline: async () => outline,
    getDestination: async () => null,
    getPageIndex: async () => 0,
    getPage: async () => ({ view: [0, 0, 504, 662] }),
  } as unknown as PDFDocumentProxy
}
const xyz = (page: number, top: number) => [page - 1, { name: 'XYZ' }, 0, top, null]
const item = (title: string, dest: unknown, items: unknown[] = []) => ({ title, dest, items })

test('いちばん深い項目を節にし、次の節が頭から始まればその前のページで終わる', async () => {
  const doc = fakeDoc(10, [
    item('第1章', xyz(1, 662), [item('1.1', xyz(1, 662)), item('1.2', xyz(3, 662))]),
    item('第2章', xyz(6, 662), [item('2.1', xyz(6, 662))]),
  ])
  const s = await loadSections(doc)
  expect(s.map((x) => [x.id, x.title, x.startPage, x.endPage])).toEqual([
    ['0.0', '1.1', 1, 2],
    ['0.1', '1.2', 3, 5],
    ['1.0', '2.1', 6, 10],
  ])
  expect(s[1]!.parents).toEqual(['第1章'])
  expect(sectionsEndingAt(s, 5).map((x) => x.title)).toEqual(['1.2'])
  expect(sectionAt(s, 4)?.title).toBe('1.2')
})

test('次の節がページの途中から始まるなら、前の節はそのページで終わる（オライリー本など）', async () => {
  const doc = fakeDoc(8, [item('A', xyz(1, 662)), item('B', xyz(4, 300)), item('C', xyz(6, 650))])
  const s = await loadSections(doc)
  expect(s.map((x) => [x.title, x.startPage, x.endPage])).toEqual([
    ['A', 1, 4],
    ['B', 4, 5],
    ['C', 6, 8],
  ])
  expect(sectionsEndingAt(s, 4).map((x) => x.title)).toEqual(['A'])
})

test('アウトラインが無ければ節は無い', async () => {
  expect(await loadSections(fakeDoc(3, []))).toEqual([])
})
