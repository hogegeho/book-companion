import { TextLayer, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from 'pdfjs-dist'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MarkerLayer } from './MarkerLayer.tsx'
import type { Passage } from './selection.ts'
import './textLayer.css'

interface Props {
  doc: PDFDocumentProxy
  pageNumber: number
  scale: number
  markerMode: boolean
  /** このページの選択中の一節 */
  passage: Passage | null
  onPassage: (p: Passage) => void
}

/** 1ページを canvas と文字層で描き、その上にマーカーの層を重ねる。 */
export function PdfPage({ doc, pageNumber, scale, markerMode, passage, onPassage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState<{ n: number; page: PDFPageProxy } | null>(null)
  // 描き終えた／失敗した描画の鍵。今の鍵と一致するときだけ有効（effect の頭で状態を戻さずに済む）
  const key = `${pageNumber}@${scale}`
  const [renderedKey, setRenderedKey] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const rendered = renderedKey === key
  const error = failure?.key === key || failure?.key === `${pageNumber}@load` ? failure.message : null

  useEffect(() => {
    let cancelled = false
    doc.getPage(pageNumber).then(
      (page) => {
        if (!cancelled) setLoaded({ n: pageNumber, page })
      },
      (e: unknown) => {
        if (!cancelled) setFailure({ key: `${pageNumber}@load`, message: String(e) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [doc, pageNumber])

  const page = loaded?.n === pageNumber ? loaded.page : null
  const viewport = useMemo(() => page?.getViewport({ scale }) ?? null, [page, scale])

  useEffect(() => {
    if (!page || !viewport) return
    let cancelled = false
    const key = `${pageNumber}@${scale}`

    const canvas = canvasRef.current!
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    const renderTask: RenderTask = page.render({
      canvas,
      viewport,
      transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
    })

    const container = textRef.current!
    container.replaceChildren()
    const textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport,
    })

    Promise.all([renderTask.promise, textLayer.render()])
      .then(() => {
        if (!cancelled) setRenderedKey(key)
      })
      .catch((e: unknown) => {
        if (cancelled || (e instanceof Error && e.name === 'RenderingCancelledException')) return
        setFailure({ key, message: e instanceof Error ? e.message : String(e) })
      })

    return () => {
      cancelled = true
      renderTask.cancel()
      textLayer.cancel()
    }
  }, [page, viewport, pageNumber, scale])

  return (
    <div
      className={markerMode ? 'pdf-page marker-mode' : 'pdf-page'}
      data-page-number={pageNumber}
      data-rendered={rendered}
      style={
        {
          width: viewport ? Math.floor(viewport.width) : undefined,
          height: viewport ? Math.floor(viewport.height) : undefined,
          '--scale-factor': scale,
        } as React.CSSProperties
      }
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div ref={textRef} className="textLayer" />
      {viewport && (
        <MarkerLayer
          viewport={viewport}
          pageNumber={pageNumber}
          enabled={markerMode}
          textLayer={() => textRef.current}
          passage={passage}
          onPassage={onPassage}
        />
      )}
      {error && (
        <p className="pdf-page-error" role="alert">
          このページを描けませんでした：{error}
        </p>
      )}
    </div>
  )
}
