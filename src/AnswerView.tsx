import Markdown from 'react-markdown'
import type { Answer } from './ai/schema.ts'

/** 二段の答え：読み上げ用の一文（speech）＋画面の補足（detail） */
export function AnswerView({ answer }: { answer: Answer }) {
  return (
    <div className="answer">
      <p className="answer-speech">{answer.speech}</p>
      {answer.detail && (
        <div className="answer-detail">
          {/* react-markdown は生の HTML を描かない */}
          <Markdown>{answer.detail}</Markdown>
        </div>
      )}
      {answer.figure && (
        <p className="answer-figure">
          図解の札：{answer.figure.title} <small>（図解は段8で開けるようになります）</small>
        </p>
      )}
      {answer.concepts.length > 0 && (
        <ul className="answer-concepts" aria-label="鍵になる概念">
          {answer.concepts.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
