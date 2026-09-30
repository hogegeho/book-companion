import { useLiveQuery } from 'dexie-react-hooks'
import { db as defaultDb, type BookDB } from './db/db.ts'

export type Effort = 'low' | 'medium' | 'high'

export interface AiSettings {
  /** 端末の中（IndexedDB）にだけ置く。書き出し・ログ・エラーに出さない */
  apiKey: string
  /** モデル名は設定値（ハードコードしない）。既定は下の DEFAULTS */
  model: string
  /** 1回あたりの出力の上限（考える分も含む） */
  maxTokens: number
  effort: Effort
}

export const DEFAULT_SETTINGS: AiSettings = {
  apiKey: '',
  model: 'claude-opus-5-5',
  maxTokens: 8000,
  effort: 'low',
}

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AiSettings)[]

export async function loadSettings(db: BookDB = defaultDb): Promise<AiSettings> {
  const rows = await db.settings.bulkGet(KEYS)
  const s = { ...DEFAULT_SETTINGS } as Record<string, unknown>
  rows.forEach((r, i) => {
    if (r && r.value !== undefined && r.value !== null && r.value !== '') s[KEYS[i]!] = r.value
  })
  return s as unknown as AiSettings
}

export async function saveSettings(patch: Partial<AiSettings>, db: BookDB = defaultDb) {
  await db.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })))
}

export function useSettings() {
  return useLiveQuery(() => loadSettings(), [])
}
