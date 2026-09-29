import { db as defaultDb, type Book, type BookDB } from './db/db.ts'
import { opfsStore, type FileStore } from './storage/opfs.ts'

export interface LibraryDeps {
  db: BookDB
  store: FileStore
  now: () => number
}

const defaults: LibraryDeps = { db: defaultDb, store: opfsStore, now: Date.now }

export async function sha256Hex(data: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** ファイル名から拡張子を落として書名の代わりにする */
export function titleFromFileName(name: string) {
  return name.replace(/\.pdf$/i, '').trim() || '無題の本'
}

/**
 * PDF を端末内に保存し、本として登録する。すでにある本なら、読み位置はそのまま開いた時刻だけ更新する。
 */
export async function importBook(
  bytes: Uint8Array,
  title: string,
  deps: LibraryDeps = defaults,
): Promise<Book> {
  const id = await sha256Hex(bytes)
  const now = deps.now()
  const existing = await deps.db.books.get(id)
  if (existing) {
    await deps.db.books.update(id, { lastOpenedAt: now })
    return { ...existing, lastOpenedAt: now }
  }
  const book: Book = {
    id,
    title,
    opfsPath: `books/${id}.pdf`,
    lastPage: 1,
    addedAt: now,
    lastOpenedAt: now,
  }
  await deps.store.write(book.opfsPath, bytes)
  await deps.db.books.put(book)
  return book
}

/** 最後に開いた本（無ければ undefined） */
export async function lastOpenedBook(deps: LibraryDeps = defaults) {
  return deps.db.books.orderBy('lastOpenedAt').last()
}

export async function openBook(book: Book, deps: LibraryDeps = defaults) {
  const now = deps.now()
  await deps.db.books.update(book.id, { lastOpenedAt: now })
  return deps.store.read(book.opfsPath)
}

export async function saveLastPage(bookId: string, page: number, deps: LibraryDeps = defaults) {
  await deps.db.books.update(bookId, { lastPage: page })
}
