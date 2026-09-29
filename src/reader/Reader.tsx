import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Book } from '../db/db.ts'
import type { PDFDocumentProxy } from '../pdf/pdfjs.ts'
import { PdfPage } from './PdfPage.tsx'
import type { Passage } from './selection.ts'
import { useTap } from './useTap.ts'
import { MAX_ZOOM, MIN_ZOOM, clampPage, fitPageScale, fitWidthScale, zoomIn, zoomOut } from './zoom.ts'

interface Props {
  book: Book
  doc: PDFDocumentProxy
  onPageChange: (page: number) => void
  /** 選んでいる一節（別のページのものでもよい。そのページでだけ印を出す） */
  passage: Passage | null
  onPassage: (p: Passage) => void
  /** 操作（ページ番号・倍率・マーカー）を置く場所。本の領域を広く取るため、AIの帯の中に置く */
  controlsTarget: HTMLElement | null
}

type Zoom = { mode: 'page' } | { mode: 'width' } | { mode: 'manual'; scale: number }

export function Reader({ book, doc, onPageChange, passage, onPassage, controlsTarget }: Props) {
  const numPages = doc.numPages
  const [page, setPage] = useState(() => clampPage(book.lastPage, numPages))
  // 既定はページ全体が収まる倍率（横持ちのタブレットで縦がはみ出さない）
  const [zoom, setZoom] = useState<Zoom>({ mode: 'page' })
  const [markerMode, setMarkerMode] = useState(false)
  const [fit, setFit] = useState({ page: 1, width: 1 })
  // 入力中の文字（入力していないときは null で、今のページを出す）
  const [pageDraft, setPageDraft] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scale = zoom.mode === 'manual' ? zoom.scale : fit[zoom.mode]

  const goTo = useCallback((p: number) => setPage(clampPage(p, numPages)), [numPages])
  const edgePrev = useTap(() => goTo(page - 1))
  const edgeNext = useTap(() => goTo(page + 1))

  useEffect(() => {
    onPageChange(page)
    scrollRef.current?.scrollTo({ top: 0, left: 0 })
  }, [page, onPageChange])

  // 表示領域に合わせた倍率（ページごとに大きさが違う本もあるので、今のページで測る）
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let size: { w: number; h: number } | null = null
    let alive = true
    const update = () => {
      if (!size) return
      setFit({
        page: fitPageScale(el.clientWidth, el.clientHeight, size.w, size.h),
        width: fitWidthScale(el.clientWidth, size.w),
      })
    }
    doc.getPage(page).then((p) => {
      if (!alive) return
      const vp = p.getViewport({ scale: 1 })
      size = { w: vp.width, h: vp.height }
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

  const controls = (
    <div className="toolbar" role="toolbar" aria-label="本の操作">
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
          onClick={() => setZoom({ mode: 'page' })}
          aria-pressed={zoom.mode === 'page'}
          aria-label="ページ全体"
          title="ページ全体が収まる大きさ"
        >
          全体
        </button>
        <button
          type="button"
          onClick={() => setZoom({ mode: 'width' })}
          aria-pressed={zoom.mode === 'width'}
          aria-label="幅に合わせる"
          title="幅に合わせる"
        >
          ↔
        </button>
      </div>
      <button
        type="button"
        className="marker-toggle"
        onClick={() => setMarkerMode((m) => !m)}
        aria-pressed={markerMode}
        title="オンのあいだ、指でなぞった一節を選ぶ"
      >
        マーカー
      </button>
    </div>
  )

  return (
    <div className="reader">
      {controlsTarget && createPortal(controls, controlsTarget)}
      <div className="page-area">
        <div className="page-scroll" ref={scrollRef}>
          <PdfPage
            doc={doc}
            pageNumber={page}
            scale={scale}
            markerMode={markerMode}
            passage={passage?.page === page ? passage : null}
            onPassage={onPassage}
          />
        </div>
        {/*
          タブレットを両手で持ったまま左手の親指で送れるよう、左端に透明な押し場所を重ねる。
          表示幅は削らない。ほぼ使う「次へ」を広く（下 2/3）、「前へ」を上 1/3 に。
        */}
        <nav className="edge-turn" aria-label="ページ送り（左端）">
          <button type="button" className="edge-prev" {...edgePrev} disabled={page <= 1}>
            <span aria-hidden="true">‹</span>
            <span className="visually-hidden">前へ</span>
          </button>
          <button type="button" className="edge-next" {...edgeNext} disabled={page >= numPages}>
            <span aria-hidden="true">›</span>
            <span className="visually-hidden">次へ</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
