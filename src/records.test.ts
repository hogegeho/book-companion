import { afterEach, beforeEach, expect, test } from 'vitest'
import { BookDB } from './db/db.ts'
import { addHighlight, deleteHighlight, getSummary, highlightsOnPage, saveSummary, startPageView } from './records.ts'

let db: BookDB
beforeEach(() => {
  db = new BookDB(`records-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await db.delete()
})

test('印を残し、ページごとに取り出し、消すと紐づく問いも消える', async () => {
  const h = await addHighlight('b1', { page: 2, text: 'AMBER.', rects: [[1, 2, 3, 4]] }, db, 5)
  await addHighlight('b1', { page: 3, text: 'x', rects: [[1, 2, 3, 4]] }, db, 6)
  await db.questions.put({ id: 'q', bookId: 'b1', highlightId: h.id, chapter: '', page: 2, question: '?', answer: null, createdAt: 7 })
  expect((await highlightsOnPage('b1', 2, db)).map((x) => x.text)).toEqual(['AMBER.'])
  await deleteHighlight(h.id, db)
  expect(await highlightsOnPage('b1', 2, db)).toEqual([])
  expect(await db.questions.count()).toBe(0)
})

test('まとめは節に紐づいて保存され、空にすると消える', async () => {
  await saveSummary('b1', '0.1', '一行目', db, 1)
  await saveSummary('b1', '1.0', '別の節', db, 2)
  await saveSummary('b1', '0.1', '書き直した', db, 3)
  expect((await getSummary('b1', '0.1', db))?.body).toBe('書き直した')
  expect((await getSummary('b1', '1.0', db))?.body).toBe('別の節')
  expect(await getSummary('b2', '0.1', db)).toBeUndefined()
  await saveSummary('b1', '0.1', '  ', db, 4)
  expect(await getSummary('b1', '0.1', db)).toBeUndefined()
})

test('ページを開いていた時間を記録する', async () => {
  let t = 100
  const close = await startPageView('b1', 4, db, () => t)
  t = 160
  await close()
  expect(await db.readingLog.toArray()).toEqual([{ id: 1, bookId: 'b1', page: 4, openedAt: 100, closedAt: 160 }])
})
