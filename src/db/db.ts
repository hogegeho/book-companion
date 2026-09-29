import Dexie, { type EntityTable } from 'dexie'
import type { PdfRect } from '../reader/coords.ts'

export interface Book {
  /** PDF 本体の SHA-256（16進）。同じ本を二度開いても一冊として扱う。 */
  id: string
  title: string
  /** OPFS 内のパス */
  opfsPath: string
  /** 最後に開いていたページ（1 始まり） */
  lastPage: number
  addedAt: number
  /** 最後に開いた時刻。起動時にどの本を開き直すかに使う。 */
  lastOpenedAt: number
}

/** なぞって残した印。位置は PDF のユーザー空間座標（pt）＋ページ */
export interface Highlight {
  id: string
  bookId: string
  page: number
  rects: PdfRect[]
  text: string
  createdAt: number
}

/** 印について聞いた問い（段5で使う） */
export interface Question {
  id: string
  bookId: string
  highlightId: string
  chapter: string
  page: number
  question: string
  answer: unknown
  createdAt: number
}

/** 節ごとの自分の言葉のまとめ。id は `${bookId}:${sectionId}` で、一つの節に一つ */
export interface Summary {
  id: string
  bookId: string
  sectionId: string
  body: string
  /** AI の「抜けを一つだけ」指摘（段5で使う） */
  feedback: string | null
  updatedAt: number
}

/** ページを開いていた記録 */
export interface ReadingLogEntry {
  id?: number
  bookId: string
  page: number
  openedAt: number
  closedAt: number | null
}

export interface Setting {
  key: string
  value: unknown
}

/** 書き出しに含めない設定（端末の中だけに置く） */
export const SECRET_SETTING_KEYS: readonly string[] = ['apiKey']

export class BookDB extends Dexie {
  books!: EntityTable<Book, 'id'>
  highlights!: EntityTable<Highlight, 'id'>
  questions!: EntityTable<Question, 'id'>
  summaries!: EntityTable<Summary, 'id'>
  readingLog!: EntityTable<ReadingLogEntry, 'id'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = 'book-companion') {
    super(name)
    this.version(1).stores({
      books: 'id, addedAt, lastOpenedAt',
    })
    // v2（段4）：印・問い・まとめ・読書記録・設定。books はそのまま
    this.version(2).stores({
      books: 'id, addedAt, lastOpenedAt',
      highlights: 'id, bookId, [bookId+page], createdAt',
      questions: 'id, bookId, highlightId, [bookId+chapter], createdAt',
      summaries: 'id, bookId, [bookId+sectionId], updatedAt',
      readingLog: '++id, bookId, openedAt',
      settings: 'key',
    })
  }
}

export const db = new BookDB()
