import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { ChangelogScreen } from './ChangelogScreen.tsx'
import { askAboutPassage, askSummaryGap } from './ai/ask.ts'
import { DataScreen } from './DataScreen.tsx'
import { PassageCard } from './PassageCard.tsx'
import { SettingsScreen } from './SettingsScreen.tsx'
import { useSettings } from './settings.ts'
import { SummaryCard } from './SummaryCard.tsx'
import type { Book } from './db/db.ts'
import { useFullscreen } from './fullscreen.ts'
import { importBook, lastOpenedBook, openBook, saveLastPage, titleFromFileName } from './library.ts'
import { loadSections, sectionsEndingAt, type Section } from './outline.ts'
import { closePdf, openPdf, pdfTitle, type PDFDocumentProxy } from './pdf/pdfjs.ts'
import { addHighlight, deleteHighlight, startPageView } from './records.ts'
import { Reader } from './reader/Reader.tsx'
import type { Passage } from './reader/selection.ts'
import { requestPersistentStorage } from './storage/opfs.ts'
import { APP_VERSION, versionLabel } from './version.ts'

type State =
  | { kind: 'loading' }
  | { kind: 'empty'; message?: string }
  | { kind: 'open'; book: Book; doc: PDFDocumentProxy }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const LAST_SEEN_VERSION_KEY = 'lastSeenVersion'

/** 前回開いたときから版が変わっていれば、その旨を一度だけ知らせる */
function consumeVersionChange(): boolean {
  try {
    const last = localStorage.getItem(LAST_SEEN_VERSION_KEY)
    localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION)
    return last !== null && last !== APP_VERSION
  } catch {
    return false
  }
}

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const fileInput = useRef<HTMLInputElement>(null)
  const fullscreen = useFullscreen()
  // なぞって選んだ一節（段4で印として保存、段5で質問に使う）
  const [passage, setPassage] = useState<Passage | null>(null)
  const [showChangelog, setShowChangelog] = useState(false)
  const [showData, setShowData] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const settings = useSettings()
  const canAsk = !!settings?.apiKey
  const [currentPage, setCurrentPage] = useState<number | null>(null)
  // 開いている本の節（アウトラインから）。文書ごとに読み直す
  const [sections, setSections] = useState<{ doc: PDFDocumentProxy; list: Section[] } | null>(null)
  // 本の操作を置く場所（帯の中）。Reader が portal で描く
  const [controlsTarget, setControlsTarget] = useState<HTMLElement | null>(null)
  const [updated, setUpdated] = useState(consumeVersionChange)
  const closeChangelog = useCallback(() => setShowChangelog(false), [])
  const closeData = useCallback(() => setShowData(false), [])
  const closeSettings = useCallback(() => setShowSettings(false), [])

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

  useEffect(() => {
    if (!doc) return
    let alive = true
    loadSections(doc).then(
      (list) => alive && setSections({ doc, list }),
      () => alive && setSections({ doc, list: [] }),
    )
    return () => {
      alive = false
    }
  }, [doc])

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
      setCurrentPage(page)
      if (bookId) void saveLastPage(bookId, page)
    },
    [bookId],
  )

  // 読書記録：開いているページを、開いた時刻・離れた時刻とともに残す。
  // アプリを裏に回したら閉じ、戻ったら新しく始める
  useEffect(() => {
    if (!bookId || currentPage === null) return
    let close: Promise<() => Promise<void>> | null = null
    const start = () => {
      close ??= startPageView(bookId, currentPage)
    }
    const stop = () => {
      const c = close
      close = null
      void c?.then((f) => f())
    }
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop())
    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [bookId, currentPage])

  // なぞった一節は、そのまま印として残す
  const onPassage = useCallback(
    async (p: Passage) => {
      if (!bookId) return
      setPassage(p)
      const h = await addHighlight(bookId, p)
      setPassage((cur) => (cur === p ? { ...p, highlightId: h.id } : cur))
    },
    [bookId],
  )

  const endingSections =
    state.kind === 'open' && sections?.doc === state.doc && currentPage !== null
      ? sectionsEndingAt(sections.list, currentPage)
      : []

  const sectionList = state.kind === 'open' && sections?.doc === state.doc ? sections.list : []

  const ask = async (question: string) => {
    if (state.kind !== 'open' || !passage?.highlightId || !settings) return { ok: false as const, failure: { kind: 'no-key' as const } }
    const { result } = await askAboutPassage({
      doc: state.doc,
      book: state.book,
      sections: sectionList,
      passage: { ...passage, highlightId: passage.highlightId },
      question,
      settings,
    })
    return result.ok ? { ok: true as const } : { ok: false as const, failure: result.failure }
  }

  const openButton = (
    <label className="open-button">
      {state.kind === 'open' ? '開く' : 'PDFを開く'}
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
            onPassage={(p) => void onPassage(p)}
            controlsTarget={controlsTarget}
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
          <h1 className="visually-hidden">Book Companion</h1>
          <span className="strip-book-title" title={state.kind === 'open' ? state.book.title : undefined}>
            {state.kind === 'open' ? state.book.title : 'Book Companion'}
          </span>
          <div className="strip-actions">
            {/* 本を開いているあいだは「開く」もこちらに置く（空のときは本の側に大きく出す） */}
            {state.kind === 'open' && openButton}
            {fullscreen.supported && (
              <button type="button" className="fullscreen-button" onClick={() => void fullscreen.toggle()}>
                {fullscreen.active ? '全画面を終わる' : '全画面'}
              </button>
            )}
            <button type="button" onClick={() => setShowSettings(true)}>
              設定
            </button>
          </div>
        </header>
        <div className="strip-controls" ref={setControlsTarget} />
        {passage ? (
          <PassageCard
            key={passage.highlightId ?? 'pending'}
            passage={passage}
            canAsk={canAsk}
            onAsk={ask}
            onClose={() => setPassage(null)}
            onDelete={() => {
              if (passage.highlightId) void deleteHighlight(passage.highlightId)
              setPassage(null)
            }}
            onOpenSettings={() => setShowSettings(true)}
          />
        ) : (
          <p className="placeholder">「マーカー」を押して本をなぞると、その一節が印として残り、ここで質問できます。</p>
        )}
        {state.kind === 'open' &&
          endingSections.map((sec) => (
            <SummaryCard
              key={`${state.book.id}:${sec.id}`}
              bookId={state.book.id}
              section={sec}
              onAskGap={
                canAsk && settings && currentPage !== null
                  ? async (summary) => {
                      const r = await askSummaryGap({ doc: state.doc, book: state.book, section: sec, currentPage, summary, settings })
                      return r.ok ? { ok: true as const } : { ok: false as const, failure: r.failure }
                    }
                  : undefined
              }
            />
          ))}
        <footer className="strip-footer">
          {updated && (
            <p className="update-notice" role="status">
              v{APP_VERSION} に更新しました。
              <button type="button" className="link-button" onClick={() => (setShowChangelog(true), setUpdated(false))}>
                変更点を見る
              </button>
            </p>
          )}
          <div className="footer-links">
            <button type="button" className="version-button" onClick={() => setShowData(true)}>
              データ
            </button>
            <button
              type="button"
              className="version-button"
              onClick={() => setShowChangelog(true)}
              aria-label={`版 ${versionLabel()}。変更履歴を開く`}
            >
              {versionLabel()}
            </button>
          </div>
        </footer>
      </aside>
      {showChangelog && <ChangelogScreen onClose={closeChangelog} />}
      {/* 読み込み・全消去のあとは、記録を読み直すため起動し直す */}
      {showData && <DataScreen onClose={closeData} onChanged={() => window.location.reload()} />}
      {showSettings && <SettingsScreen onClose={closeSettings} />}
    </div>
  )
}
