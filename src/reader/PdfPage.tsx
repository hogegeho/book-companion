import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'
import './textLayer.css'

interface Props {
  doc: PDFDocumentProxy
  pageNumber: number
  scale: number
}

/** 1ページを canvas と文字層で描く。 */
export function PdfPage({ doc, pageNumber, scale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  // 描き終えた／失敗した描画の鍵。今の鍵と一致するときだけ有効（effect の頭で状態を戻さずに済む）
  const key = `${pageNumber}@${scale}`
  const [renderedKey, setRenderedKey] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const rendered = renderedKey === key
  const error = failure?.key === key ? failure.message : null

  useEffect(() => {
    let cancelled = false
    let renderTask: RenderTask | null = null
    let textLayer: TextLayer | null = null
    const key = `${pageNumber}@${scale}`

    ;(async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const width = Math.floor(viewport.width)
      const height = Math.floor(viewport.height)
      setSize({ width, height })

      const canvas = canvasRef.current!
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      renderTask = page.render({
        canvas,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      })

      const container = textRef.current!
      container.replaceChildren()
      textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport,
      })
      await Promise.all([renderTask.promise, textLayer.render()])
      if (!cancelled) setRenderedKey(key)
    })().catch((e: unknown) => {
      if (cancelled || (e instanceof Error && e.name === 'RenderingCancelledException')) return
      setFailure({ key, message: e instanceof Error ? e.message : String(e) })
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
    }
  }, [doc, pageNumber, scale])

  return (
    <div
      className="pdf-page"
      data-page-number={pageNumber}
      data-rendered={rendered}
      style={
        {
          width: size?.width,
          height: size?.height,
          '--scale-factor': scale,
        } as React.CSSProperties
      }
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div ref={textRef} className="textLayer" />
      {error && (
        <p className="pdf-page-error" role="alert">
          このページを描けませんでした：{error}
        </p>
      )}
    </div>
  )
}
