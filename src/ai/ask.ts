import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Book, Question } from '../db/db.ts'
import { sectionAt, type Section } from '../outline.ts'
import { pagesText, pageText } from '../pdf/text.ts'
import type { Passage } from '../reader/selection.ts'
import { addQuestion, recentQuestionsInChapter, saveSummaryFeedback } from '../records.ts'
import type { AiSettings } from '../settings.ts'
import { callStructured, type AiResult, type MessagesClient } from './client.ts'
import { buildAskRequest, buildGapRequest, PAST_QUESTIONS_LIMIT } from './context.ts'
import { AnswerSchema, GapSchema, type Answer } from './schema.ts'
import { surroundingSentences } from './surrounding.ts'

/** 章の名前：節の一つ上の見出し（無ければ節そのもの） */
export const chapterOf = (section: Section | null) => section?.parents[0] ?? section?.title ?? ''

/** なぞった一節について聞き、うまくいけば問いと答えを保存する */
export async function askAboutPassage(opts: {
  doc: PDFDocumentProxy
  book: Book
  sections: Section[]
  passage: Passage & { highlightId: string }
  question: string
  settings: AiSettings
  client?: MessagesClient
}): Promise<{ result: AiResult<Answer>; saved: Question | null }> {
  const { doc, book, sections, passage, question, settings } = opts
  const section = sectionAt(sections, passage.page)
  const chapter = chapterOf(section)
  // 送るのは、なぞったページ（＝今読んでいるページ）の文字だけ
  const text = await pageText(doc, passage.page)
  const past = await recentQuestionsInChapter(book.id, chapter, passage.page, PAST_QUESTIONS_LIMIT)
  const req = buildAskRequest(
    {
      bookTitle: book.title,
      chapter,
      section: section?.title ?? '',
      page: passage.page,
      passageText: passage.text,
      passageImage: passage.image ?? null,
      surrounding: surroundingSentences(text, passage.text),
      pageText: text,
      pastQuestions: past.map((q) => ({
        page: q.page,
        question: q.question,
        answerSpeech: (q.answer as Answer | null)?.speech ?? '',
      })),
      question,
    },
    settings,
  )
  const result = await callStructured(settings.apiKey, req, AnswerSchema, opts.client)
  if (!result.ok) return { result, saved: null }
  const saved = await addQuestion({
    bookId: book.id,
    highlightId: passage.highlightId,
    chapter,
    page: passage.page,
    question,
    answer: result.value,
  })
  return { result, saved }
}

/** 節のまとめに「抜けを一つだけ」もらい、まとめに紐づけて保存する */
export async function askSummaryGap(opts: {
  doc: PDFDocumentProxy
  book: Book
  section: Section
  /** 今読んでいるページ（ここより後ろの文字は送らない） */
  currentPage: number
  summary: string
  settings: AiSettings
  client?: MessagesClient
}) {
  const { doc, book, section, currentPage, summary, settings } = opts
  const sectionText = await pagesText(doc, section.startPage, Math.min(section.endPage, currentPage))
  const req = buildGapRequest({ bookTitle: book.title, section: section.title, sectionText, summary }, settings)
  const result = await callStructured(settings.apiKey, req, GapSchema, opts.client)
  if (result.ok) await saveSummaryFeedback(book.id, section.id, result.value.gap)
  return result
}
