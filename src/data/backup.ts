import { z } from 'zod'
import { db as defaultDb, SECRET_SETTING_KEYS, type BookDB } from '../db/db.ts'

// 記録の書き出し・読み込み。PDF 本体（OPFS）は含めない。API キーなど秘密の設定も含めない。

export const BACKUP_FORMAT = 'book-companion-backup'
export const BACKUP_VERSION = 1

const rect = z.tuple([z.number(), z.number(), z.number(), z.number()])

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.number(),
  books: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      opfsPath: z.string(),
      lastPage: z.number(),
      addedAt: z.number(),
      lastOpenedAt: z.number(),
    }),
  ),
  highlights: z.array(
    z.object({
      id: z.string(),
      bookId: z.string(),
      page: z.number(),
      rects: z.array(rect),
      text: z.string(),
      createdAt: z.number(),
    }),
  ),
  questions: z.array(
    z.object({
      id: z.string(),
      bookId: z.string(),
      highlightId: z.string(),
      chapter: z.string(),
      page: z.number(),
      question: z.string(),
      answer: z.unknown(),
      createdAt: z.number(),
    }),
  ),
  summaries: z.array(
    z.object({
      id: z.string(),
      bookId: z.string(),
      sectionId: z.string(),
      body: z.string(),
      feedback: z.string().nullable(),
      updatedAt: z.number(),
    }),
  ),
  readingLog: z.array(
    z.object({
      id: z.number().optional(),
      bookId: z.string(),
      page: z.number(),
      openedAt: z.number(),
      closedAt: z.number().nullable(),
    }),
  ),
  settings: z.array(z.object({ key: z.string(), value: z.unknown() })),
})

export type Backup = z.infer<typeof backupSchema>

const RECORD_TABLES = ['books', 'highlights', 'questions', 'summaries', 'readingLog'] as const

const isSecret = (key: string) => SECRET_SETTING_KEYS.includes(key)

export async function exportData(db: BookDB = defaultDb, now = Date.now()): Promise<Backup> {
  return db.transaction('r', [...RECORD_TABLES.map((t) => db[t]), db.settings], async () => ({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    books: await db.books.toArray(),
    highlights: (await db.highlights.toArray()) as Backup['highlights'],
    questions: await db.questions.toArray(),
    summaries: await db.summaries.toArray(),
    readingLog: await db.readingLog.toArray(),
    settings: (await db.settings.toArray()).filter((s) => !isSecret(s.key)),
  }))
}

export function backupToJson(b: Backup) {
  return JSON.stringify(b, null, 2)
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupFormatError'
  }
}

/** JSON を検証する。形が違えば BackupFormatError */
export function parseBackup(json: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new BackupFormatError('JSON として読めませんでした')
  }
  const r = backupSchema.safeParse(raw)
  if (!r.success) throw new BackupFormatError(`書き出しファイルの形ではありません（${r.error.issues[0]?.path.join('.') || '全体'}）`)
  return r.data
}

/** 記録をすべて消す。秘密の設定（API キー）と PDF 本体は残す */
export async function clearRecords(db: BookDB = defaultDb) {
  await db.transaction('rw', [...RECORD_TABLES.map((t) => db[t]), db.settings], async () => {
    await Promise.all(RECORD_TABLES.map((t) => db[t].clear()))
    await db.settings.filter((s) => !isSecret(s.key)).delete()
  })
}

/** 読み込む。今の記録は置き換える（秘密の設定はそのまま残し、ファイルにあっても使わない） */
export async function importData(backup: Backup, db: BookDB = defaultDb) {
  await db.transaction('rw', [...RECORD_TABLES.map((t) => db[t]), db.settings], async () => {
    await clearRecords(db)
    await db.books.bulkPut(backup.books)
    await db.highlights.bulkPut(backup.highlights as never)
    await db.questions.bulkPut(backup.questions)
    await db.summaries.bulkPut(backup.summaries)
    await db.readingLog.bulkPut(backup.readingLog)
    await db.settings.bulkPut(backup.settings.filter((s) => !isSecret(s.key)))
  })
}
