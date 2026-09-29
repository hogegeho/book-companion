import Dexie from 'dexie'
import { expect, test } from 'vitest'
import { BookDB } from './db.ts'

test('移行：v1（books だけ）の DB を v2 で開くと、本はそのまま残り、新しい表が使える', async () => {
  const name = `migrate-${crypto.randomUUID()}`
  const v1 = new Dexie(name)
  v1.version(1).stores({ books: 'id, addedAt, lastOpenedAt' })
  const book = { id: 'abc', title: '本', opfsPath: 'books/abc.pdf', lastPage: 7, addedAt: 1, lastOpenedAt: 2 }
  await v1.table('books').put(book)
  v1.close()

  const v2 = new BookDB(name)
  await v2.open()
  expect(v2.verno).toBe(2)
  expect(await v2.books.get('abc')).toEqual(book)
  await v2.highlights.put({ id: 'h1', bookId: 'abc', page: 7, rects: [[1, 2, 3, 4]], text: 'x', createdAt: 3 })
  expect(await v2.highlights.where('[bookId+page]').equals(['abc', 7]).count()).toBe(1)
  await v2.delete()
})
