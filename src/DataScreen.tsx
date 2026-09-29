import { useEffect, useState } from 'react'
import { BackupFormatError, backupToJson, clearRecords, exportData, importData, parseBackup, type Backup } from './data/backup.ts'

type Confirm = { kind: 'import'; backup: Backup; fileName: string } | { kind: 'clear' } | null

const counts = (b: Backup) =>
  `本 ${b.books.length}冊・印 ${b.highlights.length}・問い ${b.questions.length}・まとめ ${b.summaries.length}・読書記録 ${b.readingLog.length}`

/** 記録の書き出し・読み込み・全消去（全面に重ねる画面） */
export function DataScreen({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const download = async () => {
    const backup = await exportData()
    const blob = new Blob([backupToJson(backup)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `book-companion-${new Date(backup.exportedAt).toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage(`書き出しました（${counts(backup)}）。API キーは含みません。`)
  }

  return (
    <div className="screen" role="dialog" aria-modal="true" aria-labelledby="data-title">
      <header className="screen-header">
        <h2 id="data-title">データ</h2>
        <button type="button" onClick={onClose} autoFocus>
          閉じる
        </button>
      </header>
      <div className="screen-body">
        <p>
          印・問い・まとめ・読書記録を JSON で書き出し、別の端末や後日に読み込めます。本の PDF と API キーは含みません（PDF は同じファイルを開けば記録とつながります）。
        </p>

        <section className="data-actions">
          <button type="button" onClick={() => void download()}>
            書き出す
          </button>

          <label className="open-button">
            読み込む
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  setConfirm({ kind: 'import', backup: parseBackup(await file.text()), fileName: file.name })
                  setMessage(null)
                } catch (err) {
                  setMessage(err instanceof BackupFormatError ? `読み込めません：${err.message}` : String(err))
                }
              }}
            />
          </label>

          <button type="button" className="danger" onClick={() => setConfirm({ kind: 'clear' })}>
            記録をすべて消す
          </button>
        </section>

        {confirm && (
          <section className="confirm-box" role="alertdialog" aria-label="確認">
            {confirm.kind === 'import' ? (
              <p>
                「{confirm.fileName}」（{counts(confirm.backup)}）で、今の記録を<strong>置き換えます</strong>。よいですか？
              </p>
            ) : (
              <p>
                印・問い・まとめ・読書記録を<strong>すべて消します</strong>。本の PDF と API キーは残ります。よいですか？
              </p>
            )}
            <button
              type="button"
              className="danger"
              onClick={async () => {
                if (confirm.kind === 'import') await importData(confirm.backup)
                else await clearRecords()
                setConfirm(null)
                onChanged()
              }}
            >
              {confirm.kind === 'import' ? '置き換える' : '消す'}
            </button>{' '}
            <button type="button" onClick={() => setConfirm(null)}>
              やめる
            </button>
          </section>
        )}

        {message && <p role="status">{message}</p>}
      </div>
    </div>
  )
}
