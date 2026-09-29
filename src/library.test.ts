import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { BookDB } from './db/db.ts'
import { importBook, lastOpenedBook, openBook, saveLastPage, sha256Hex, titleFromFileName, type LibraryDeps } from './library.ts'
import type { FileStore } from './storage/opfs.ts'

class MemoryStore implements FileStore {
  files = new Map<string, Uint8Array>()
  async write(path: string, data: Uint8Array) {
    this.files.set(path, data.slice())
  }
  async read(path: string) {
    const f = this.files.get(path)
    if (!f) throw new Error(`not found: ${path}`)
    return f.slice()
  }
}

let deps: LibraryDeps & { store: MemoryStore }
let clock = 1000

beforeEach(() => {
  clock = 1000
  deps = { db: new BookDB(`test-${crypto.randomUUID()}`), store: new MemoryStore(), now: () => clock++ }
})
afterEach(async () => {
  await deps.db.delete()
})

const bytes = (...xs: number[]) => new Uint8Array(xs)

describe('library', () => {
  test('本を取り込むと、PDF本体が保存され、1ページ目から始まる', async () => {
    const data = bytes(1, 2, 3)
    const book = await importBook(data, 'ある本', deps)
    expect(book.id).toBe(await sha256Hex(data))
    expect(book.opfsPath).toBe(`books/${book.id}.pdf`)
    expect(book.lastPage).toBe(1)
    expect(deps.store.files.get(book.opfsPath)).toEqual(data)
    expect(await deps.db.books.get(book.id)).toEqual(book)
  })

  test('同じ本をもう一度開いても一冊のままで、読み位置は残る', async () => {
    const first = await importBook(bytes(9, 9), 'A', deps)
    await saveLastPage(first.id, 5, deps)
    const again = await importBook(bytes(9, 9), 'A (copy)', deps)
    expect(await deps.db.books.count()).toBe(1)
    expect(again.lastPage).toBe(5)
    expect(again.title).toBe('A')
    expect(again.lastOpenedAt).toBeGreaterThan(first.lastOpenedAt)
  })

  test('最後に開いた本を返し、開き直すと本体が読める', async () => {
    expect(await lastOpenedBook(deps)).toBeUndefined()
    const a = await importBook(bytes(1), 'A', deps)
    const b = await importBook(bytes(2), 'B', deps)
    expect((await lastOpenedBook(deps))?.id).toBe(b.id)
    expect(await openBook(a, deps)).toEqual(bytes(1))
    expect((await lastOpenedBook(deps))?.id).toBe(a.id)
  })

  test('ファイル名から書名を作る', () => {
    expect(titleFromFileName('読書論.PDF')).toBe('読書論')
    expect(titleFromFileName('.pdf')).toBe('無題の本')
  })
})
