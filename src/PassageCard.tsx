import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { failureMessage, type AiFailure } from './ai/client.ts'
import { QUICK_QUESTIONS } from './ai/quickQuestions.ts'
import type { Answer } from './ai/schema.ts'
import { AnswerView } from './AnswerView.tsx'
import type { Question } from './db/db.ts'
import type { Passage } from './reader/selection.ts'
import { questionsForHighlight } from './records.ts'


interface Props {
  passage: Passage
  /** API キーがあるか（無ければ質問の欄の代わりに設定への案内を出す） */
  canAsk: boolean
  onAsk: (question: string) => Promise<{ ok: true } | { ok: false; failure: AiFailure }>
  onClose: () => void
  onDelete: () => void
  onOpenSettings: () => void
}

export function PassageCard({ passage, canAsk, onAsk, onClose, onDelete, onOpenSettings }: Props) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<AiFailure | null>(null)
  const history = useLiveQuery(
    (): Promise<Question[]> => (passage.highlightId ? questionsForHighlight(passage.highlightId) : Promise.resolve([])),
    [passage.highlightId],
  )

  const ask = async (q: string) => {
    const question = q.trim()
    if (!question || pending) return
    setPending(question)
    setFailure(null)
    const r = await onAsk(question)
    setPending(null)
    if (r.ok) setDraft('')
    else setFailure(r.failure)
  }

  return (
    <section className="passage-card" aria-label="選んだ一節">
      <div className="card-head">
        <h2>
          選んだ一節 <small>p.{passage.page}</small>
        </h2>
        <div className="card-actions">
          <button type="button" onClick={onClose}>
            閉じる
          </button>
          <button type="button" onClick={onDelete}>
            この印を消す
          </button>
        </div>
      </div>
      <blockquote>{passage.text}</blockquote>

      {history?.map((q) => (
        <article key={q.id} className="qa" aria-label={`問い：${q.question}`}>
          <p className="qa-question">Q. {q.question}</p>
          <AnswerView answer={q.answer as Answer} />
        </article>
      ))}

      {canAsk ? (
        <form
          className="ask"
          aria-label="質問する"
          onSubmit={(e) => {
            e.preventDefault()
            void ask(draft)
          }}
        >
          <div className="quick-questions">
            {QUICK_QUESTIONS.map((q) => (
              <button key={q} type="button" disabled={!!pending || !passage.highlightId} onClick={() => void ask(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="ask-row">
            <input
              aria-label="自分の言葉で質問"
              placeholder="自分の言葉で質問…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!!pending}
            />
            <button type="submit" disabled={!!pending || !draft.trim() || !passage.highlightId}>
              送る
            </button>
          </div>
          {pending && (
            <p className="ask-status" role="status">
              「{pending}」を考えています…
            </p>
          )}
          {failure && (
            <div className="ask-error" role="alert">
              <p>{failureMessage(failure)}</p>
              {failure.kind === 'broken' && failure.raw && <pre className="raw">{failure.raw}</pre>}
            </div>
          )}
        </form>
      ) : (
        <p className="placeholder">
          質問するには{' '}
          <button type="button" className="link-button" onClick={onOpenSettings}>
            設定
          </button>{' '}
          で API キーを入れてください。
        </p>
      )}
    </section>
  )
}
