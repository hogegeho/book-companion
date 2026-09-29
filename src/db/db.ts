import Dexie, { type EntityTable } from 'dexie'

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

export class BookDB extends Dexie {
  books!: EntityTable<Book, 'id'>

  constructor(name = 'book-companion') {
    super(name)
    this.version(1).stores({
      books: 'id, addedAt, lastOpenedAt',
    })
  }
}

export const db = new BookDB()
