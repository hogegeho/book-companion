import { afterEach, beforeEach, expect, test } from 'vitest'
import { BookDB } from '../db/db.ts'
import { BackupFormatError, backupToJson, clearRecords, exportData, importData, parseBackup } from './backup.ts'

let db: BookDB
beforeEach(async () => {
  db = new BookDB(`backup-${crypto.randomUUID()}`)
  await db.books.put({ id: 'b1', title: '読書論', opfsPath: 'books/b1.pdf', lastPage: 12, addedAt: 1, lastOpenedAt: 5 })
  await db.highlights.bulkPut([
    { id: 'h1', bookId: 'b1', page: 3, rects: [[60, 700, 200, 712]], text: 'ゆっくり読む', createdAt: 10 },
    { id: 'h2', bookId: 'b1', page: 12, rects: [[60, 500, 90, 512], [60, 484, 300, 496]], text: '二行の一節', createdAt: 11 },
  ])
  await db.questions.put({
    id: 'q1', bookId: 'b1', highlightId: 'h1', chapter: '第1章', page: 3, question: 'どういう意味？',
    answer: { speech: 'はい', detail: '…', figure: null, concepts: [] }, createdAt: 12,
  })
  await db.summaries.put({ id: 'b1:0.1', bookId: 'b1', sectionId: '0.1', body: '自分の言葉で', feedback: null, updatedAt: 13 })
  await db.readingLog.bulkAdd([
    { bookId: 'b1', page: 3, openedAt: 20, closedAt: 25 },
    { bookId: 'b1', page: 4, openedAt: 25, closedAt: null },
  ])
  await db.settings.bulkPut([
    { key: 'apiKey', value: 'sk-ant-secret-DO-NOT-EXPORT' },
    { key: 'model', value: 'claude-x' },
    { key: 'maxTokens', value: 800 },
  ])
})
afterEach(async () => {
  await db.delete()
})

const snapshot = async () => ({
  books: await db.books.toArray(),
  highlights: await db.highlights.toArray(),
  questions: await db.questions.toArray(),
  summaries: await db.summaries.toArray(),
  readingLog: await db.readingLog.toArray(),
  settings: (await db.settings.toArray()).filter((s) => s.key !== 'apiKey'),
})

test('書き出し → 全消去 → 読み込みで内容が一致し、API キーは書き出しに含まれない', async () => {
  const before = await snapshot()
  const json = backupToJson(await exportData(db, 99))
  expect(json).not.toContain('sk-ant-secret')
  expect(json).not.toContain('apiKey')

  await clearRecords(db)
  expect(await db.books.count()).toBe(0)
  expect(await db.highlights.count()).toBe(0)
  expect(await db.summaries.count()).toBe(0)
  expect(await db.readingLog.count()).toBe(0)
  expect(await db.settings.count()).toBe(1) // API キーだけは端末に残る

  await importData(parseBackup(json), db)
  expect(await snapshot()).toEqual(before)
  expect((await db.settings.get('apiKey'))?.value).toBe('sk-ant-secret-DO-NOT-EXPORT')
})

test('ファイルに API キーが紛れていても読み込まない（端末のキーを上書きしない）', async () => {
  const b = await exportData(db)
  b.settings.push({ key: 'apiKey', value: 'sk-ant-from-file' })
  await importData(parseBackup(backupToJson(b)), db)
  expect((await db.settings.get('apiKey'))?.value).toBe('sk-ant-secret-DO-NOT-EXPORT')
})

test('形の違うファイルは断り、今の記録は変えない', async () => {
  expect(() => parseBackup('not json')).toThrow(BackupFormatError)
  expect(() => parseBackup(JSON.stringify({ format: 'other' }))).toThrow(BackupFormatError)
  const bad = { ...(await exportData(db)), highlights: [{ id: 'x' }] }
  expect(() => parseBackup(JSON.stringify(bad))).toThrow(/highlights/)
  expect(await db.highlights.count()).toBe(2)
})
