import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import type { Book } from './db/db.ts'
import { useFullscreen } from './fullscreen.ts'
import { importBook, lastOpenedBook, openBook, saveLastPage, titleFromFileName } from './library.ts'
import { closePdf, openPdf, pdfTitle, type PDFDocumentProxy } from './pdf/pdfjs.ts'
import { Reader } from './reader/Reader.tsx'
import type { Passage } from './reader/selection.ts'
import { requestPersistentStorage } from './storage/opfs.ts'

type State =
  | { kind: 'loading' }
  | { kind: 'empty'; message?: string }
  | { kind: 'open'; book: Book; doc: PDFDocumentProxy }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const fileInput = useRef<HTMLInputElement>(null)
  const fullscreen = useFullscreen()
  // なぞって選んだ一節（段4で印として保存、段5で質問に使う）
  const [passage, setPassage] = useState<Passage | null>(null)

  // 起動時：最後に開いた本を開き直す
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const book = await lastOpenedBook()
      if (!book) return setState({ kind: 'empty' })
      const doc = await openPdf(await openBook(book))
      if (cancelled) return void closePdf(doc)
      setState({ kind: 'open', book, doc })
    })().catch((e) => {
      if (!cancelled) setState({ kind: 'empty', message: `前回の本を開けませんでした：${errorText(e)}` })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 開いている文書は、閉じたら（別の本に替えたら）片付ける
  const doc = state.kind === 'open' ? state.doc : null
  useEffect(() => () => void (doc && closePdf(doc)), [doc])

  const onFile = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let next: PDFDocumentProxy
    try {
      next = await openPdf(bytes.slice())
    } catch (e) {
      setState((s) => (s.kind === 'open' ? s : { kind: 'empty', message: `PDFとして読めませんでした：${errorText(e)}` }))
      return
    }
    try {
      const title = (await pdfTitle(next)) ?? titleFromFileName(file.name)
      const book = await importBook(bytes, title)
      void requestPersistentStorage()
      setPassage(null)
      setState({ kind: 'open', book, doc: next })
    } catch (e) {
      void closePdf(next)
      setState({ kind: 'empty', message: `本を保存できませんでした：${errorText(e)}` })
    }
  }

  const bookId = state.kind === 'open' ? state.book.id : null
  const onPageChange = useCallback(
    (page: number) => {
      if (bookId) void saveLastPage(bookId, page)
    },
    [bookId],
  )

  const openButton = (
    <label className="open-button">
      PDFを開く
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void onFile(file)
        }}
      />
    </label>
  )

  return (
    <div className="layout">
      <main className="book" aria-label="本">
        {state.kind === 'open' ? (
          <Reader
            key={state.book.id}
            book={state.book}
            doc={state.doc}
            onPageChange={onPageChange}
            passage={passage}
            onPassage={setPassage}
          />
        ) : (
          <div className="empty">
            {state.kind === 'loading' ? (
              <p className="placeholder">読み込み中…</p>
            ) : (
              <>
                {state.message && (
                  <p className="error" role="alert">
                    {state.message}
                  </p>
                )}
                <p className="placeholder">PDFを開くと、ここに本が表示されます。</p>
                {openButton}
              </>
            )}
          </div>
        )}
      </main>
      <aside className="ai-strip" aria-label="AIの帯">
        <header className="strip-header">
          <h1 className="app-title">Book Companion</h1>
          <div className="strip-actions">
            {/* 本を開いているあいだは、本側のツールバーを一行に収めるため「開く」をこちらに置く */}
            {state.kind === 'open' && openButton}
            {fullscreen.supported && (
              <button type="button" className="fullscreen-button" onClick={() => void fullscreen.toggle()}>
                {fullscreen.active ? '全画面を終わる' : '全画面'}
              </button>
            )}
          </div>
        </header>
        {passage ? (
          <section className="passage-card" aria-label="選んだ一節">
            <h2>
              選んだ一節 <small>p.{passage.page}</small>
            </h2>
            <blockquote>{passage.text}</blockquote>
            <button type="button" onClick={() => setPassage(null)}>
              選択を消す
            </button>
            <p className="placeholder">この一節について質問できるようになります（段5）。</p>
          </section>
        ) : (
          <p className="placeholder">「マーカー」を押して本をなぞると、その一節がここに出ます。</p>
        )}
      </aside>
    </div>
  )
}
