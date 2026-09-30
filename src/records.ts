import { db as defaultDb, type BookDB, type Highlight, type Question } from './db/db.ts'
import type { Passage } from './reader/selection.ts'

// 印・まとめ・読書記録の読み書き。db は差し替えられる（テスト用）

export async function addHighlight(bookId: string, passage: Passage, db: BookDB = defaultDb, now = Date.now()): Promise<Highlight> {
  const h: Highlight = {
    id: crypto.randomUUID(),
    bookId,
    page: passage.page,
    rects: passage.rects.map((r) => [...r] as unknown as Highlight['rects'][number]),
    text: passage.text,
    createdAt: now,
  }
  await db.highlights.put(h)
  return h
}

export async function deleteHighlight(id: string, db: BookDB = defaultDb) {
  await db.transaction('rw', db.highlights, db.questions, async () => {
    await db.highlights.delete(id)
    await db.questions.where('highlightId').equals(id).delete()
  })
}

export function highlightsOnPage(bookId: string, page: number, db: BookDB = defaultDb) {
  return db.highlights.where('[bookId+page]').equals([bookId, page]).sortBy('createdAt')
}

export const summaryId = (bookId: string, sectionId: string) => `${bookId}:${sectionId}`

export function getSummary(bookId: string, sectionId: string, db: BookDB = defaultDb) {
  return db.summaries.get(summaryId(bookId, sectionId))
}

/** まとめを保存する。本文が空になったら消す */
export async function saveSummary(bookId: string, sectionId: string, body: string, db: BookDB = defaultDb, now = Date.now()) {
  const id = summaryId(bookId, sectionId)
  if (!body.trim()) {
    await db.summaries.delete(id)
    return
  }
  const prev = await db.summaries.get(id)
  await db.summaries.put({ id, bookId, sectionId, body, feedback: prev?.feedback ?? null, updatedAt: now })
}

/** ページを開いた記録を始める。返り値を呼ぶと閉じた時刻を書く */
export async function startPageView(bookId: string, page: number, db: BookDB = defaultDb, now = Date.now) {
  const id = await db.readingLog.add({ bookId, page, openedAt: now(), closedAt: null })
  return async () => {
    await db.readingLog.update(id, { closedAt: now() })
  }
}

export async function addQuestion(q: Omit<Question, 'id' | 'createdAt'>, db: BookDB = defaultDb, now = Date.now()): Promise<Question> {
  const full: Question = { ...q, id: crypto.randomUUID(), createdAt: now }
  await db.questions.put(full)
  return full
}

export function questionsForHighlight(highlightId: string, db: BookDB = defaultDb) {
  return db.questions.where('highlightId').equals(highlightId).sortBy('createdAt')
}

/** 同じ章の最近の問い（新しい順）。現在ページより後ろのものは除く */
export async function recentQuestionsInChapter(bookId: string, chapter: string, uptoPage: number, limit = 5, db: BookDB = defaultDb) {
  const all = await db.questions.where('[bookId+chapter]').equals([bookId, chapter]).toArray()
  return all
    .filter((q) => q.page <= uptoPage)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
}

export async function saveSummaryFeedback(bookId: string, sectionId: string, feedback: string, db: BookDB = defaultDb) {
  await db.summaries.update(summaryId(bookId, sectionId), { feedback })
}
