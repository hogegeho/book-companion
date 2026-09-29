import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Book } from '../db/db.ts'
import type { PDFDocumentProxy } from '../pdf/pdfjs.ts'
import { PdfPage } from './PdfPage.tsx'
import { MAX_ZOOM, MIN_ZOOM, clampPage, fitWidthScale, zoomIn, zoomOut } from './zoom.ts'

interface Props {
  book: Book
  doc: PDFDocumentProxy
  onPageChange: (page: number) => void
  /** ツールバー左端に置くもの（「開く」ボタンなど） */
  toolbarStart?: ReactNode
}

type Zoom = { mode: 'fit' } | { mode: 'manual'; scale: number }

export function Reader({ book, doc, onPageChange, toolbarStart }: Props) {
  const numPages = doc.numPages
  const [page, setPage] = useState(() => clampPage(book.lastPage, numPages))
  const [zoom, setZoom] = useState<Zoom>({ mode: 'fit' })
  const [fitScale, setFitScale] = useState(1)
  // 入力中の文字（入力していないときは null で、今のページを出す）
  const [pageDraft, setPageDraft] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scale = zoom.mode === 'fit' ? fitScale : zoom.scale

  const goTo = useCallback((p: number) => setPage(clampPage(p, numPages)), [numPages])

  useEffect(() => {
    onPageChange(page)
    scrollRef.current?.scrollTo({ top: 0, left: 0 })
  }, [page, onPageChange])

  // 表示幅に合わせた倍率（ページごとに幅が違う本もあるので、今のページで測る）
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let pageWidth = 0
    let alive = true
    const update = () => {
      if (pageWidth) setFitScale(fitWidthScale(el.clientWidth, pageWidth))
    }
    doc.getPage(page).then((p) => {
      if (!alive) return
      pageWidth = p.getViewport({ scale: 1 }).width
      update()
    })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      alive = false
      ro.disconnect()
    }
  }, [doc, page])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, [contenteditable="true"]')) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(page + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goTo(page - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, page])

  return (
    <div className="reader">
      <div className="toolbar" role="toolbar" aria-label="本の操作">
        {toolbarStart}
        <span className="book-title" title={book.title}>
          {book.title}
        </span>
        <div className="toolbar-group">
          <button type="button" onClick={() => goTo(page - 1)} disabled={page <= 1} aria-label="前のページ">
            ‹
          </button>
          <form
            className="page-form"
            onSubmit={(e) => {
              e.preventDefault()
              const n = Number(pageDraft)
              if (pageDraft?.trim() && Number.isFinite(n)) goTo(n)
              setPageDraft(null)
            }}
          >
            <input
              aria-label="ページ番号"
              inputMode="numeric"
              value={pageDraft ?? String(page)}
              onChange={(e) => setPageDraft(e.target.value)}
              onBlur={() => setPageDraft(null)}
            />
            <span aria-label="全ページ数">/ {numPages}</span>
          </form>
          <button type="button" onClick={() => goTo(page + 1)} disabled={page >= numPages} aria-label="次のページ">
            ›
          </button>
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            onClick={() => setZoom({ mode: 'manual', scale: zoomOut(scale) })}
            disabled={scale <= MIN_ZOOM}
            aria-label="縮小"
          >
            −
          </button>
          <output aria-label="倍率">{Math.round(scale * 100)}%</output>
          <button
            type="button"
            onClick={() => setZoom({ mode: 'manual', scale: zoomIn(scale) })}
            disabled={scale >= MAX_ZOOM}
            aria-label="拡大"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom({ mode: 'fit' })}
            aria-pressed={zoom.mode === 'fit'}
          >
            幅に合わせる
          </button>
        </div>
      </div>
      <div className="page-scroll" ref={scrollRef}>
        <PdfPage doc={doc} pageNumber={page} scale={scale} />
      </div>
    </div>
  )
}
