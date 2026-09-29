import { useEffect, useRef, useState } from 'react'
import type { Section } from './outline.ts'
import { getSummary, saveSummary } from './records.ts'

const SAVE_DELAY_MS = 600

/** 節の終わりに出す「自分の言葉でまとめ」。書いたそばから節に紐づけて保存する */
export function SummaryCard({ bookId, section }: { bookId: string; section: Section }) {
  // null＝読み込み中
  const [draft, setDraft] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    void getSummary(bookId, section.id).then((s) => alive && setDraft(s?.body ?? ''))
    return () => {
      alive = false
    }
  }, [bookId, section.id])

  const flush = async () => {
    clearTimeout(timer.current)
    const body = pending.current
    if (body === null) return
    pending.current = null
    await saveSummary(bookId, section.id, body)
    setStatus('saved')
  }

  // 節を離れる（ページを送る）ときも、書きかけを保存する
  useEffect(
    () => () => {
      void flush()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookId, section.id],
  )

  const id = `summary-${section.id}`
  return (
    <section className="summary-card" aria-label={`節のまとめ：${section.title}`}>
      <h2>
        <label htmlFor={id}>この節のまとめ</label>
        <small>{section.title}</small>
      </h2>
      <textarea
        id={id}
        rows={5}
        disabled={draft === null}
        value={draft ?? ''}
        placeholder="この節で何が言われていたか、本を見ずに自分の言葉で。"
        onChange={(e) => {
          setDraft(e.target.value)
          pending.current = e.target.value
          setStatus('saving')
          clearTimeout(timer.current)
          timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
        }}
        onBlur={() => void flush()}
      />
      <p className="summary-status" role="status">
        {status === 'saving' ? '書いています…' : status === 'saved' ? '保存しました' : ''}
      </p>
      <p className="placeholder">AIは書き直さず、抜けを一つだけ指摘します（段5）。</p>
    </section>
  )
}
