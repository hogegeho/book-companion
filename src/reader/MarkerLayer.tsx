import { useRef, useState, type PointerEvent } from 'react'
import { clientToPdf, pdfRectToLocal, pdfToLocal, type PdfPoint, type PdfRect, type ViewportLike } from './coords.ts'
import { StrokeHitTester, type Passage } from './selection.ts'
import { collectTextChars } from './textChars.ts'

/** これより動かなければ「なぞり」ではなく「タップ」とみなす（CSS px） */
export const TAP_SLOP_PX = 10

interface Props {
  viewport: ViewportLike & { width: number; height: number }
  pageNumber: number
  /** マーカーモードのときだけ指を受け付ける */
  enabled: boolean
  /** 文字層の要素（なぞり始めに文字の位置を集める） */
  textLayer: () => HTMLElement | null
  /** このページの選択中の一節 */
  passage: Passage | null
  onPassage: (p: Passage) => void
}

interface Stroke {
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  points: PdfPoint[]
  tester: StrokeHitTester
}

/** なぞりの入力と、選んだ一節の印を描く層。印は PDF 座標で持ち、描くたびに今の viewport で変換する。 */
export function MarkerLayer({ viewport, pageNumber, enabled, textLayer, passage, onPassage }: Props) {
  const stroke = useRef<Stroke | null>(null)
  const [live, setLive] = useState<{ points: PdfPoint[]; rects: PdfRect[] } | null>(null)

  const cancel = () => {
    stroke.current = null
    setLive(null)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) {
      // 2本目の指（ピンチなど）が来たら、なぞりはやめる
      cancel()
      return
    }
    const container = textLayer()
    if (!container) return
    const origin = e.currentTarget.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = clientToPdf(viewport, origin, e.clientX, e.clientY)
    stroke.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      points: [p],
      tester: new StrokeHitTester(collectTextChars(container, viewport, origin)),
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = stroke.current
    if (!s || e.pointerId !== s.pointerId) return
    const origin = e.currentTarget.getBoundingClientRect()
    const p = clientToPdf(viewport, origin, e.clientX, e.clientY)
    s.tester.addSegment(s.points[s.points.length - 1]!, p)
    s.points.push(p)
    if (!s.moved && Math.hypot(e.clientX - s.startX, e.clientY - s.startY) >= TAP_SLOP_PX) s.moved = true
    if (s.moved) setLive({ points: [...s.points], rects: s.tester.passage().rects })
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = stroke.current
    if (!s || e.pointerId !== s.pointerId) return
    stroke.current = null
    setLive(null)
    if (!s.moved) return // タップは選択にしない
    const { text, rects } = s.tester.passage()
    if (text) onPassage({ page: pageNumber, text, rects })
  }

  const rects = live?.rects ?? passage?.rects ?? []
  const polyline = live?.points.map((p) => pdfToLocal(viewport, p).join(',')).join(' ')

  return (
    <div
      className="marker-layer"
      data-enabled={enabled}
      onPointerDown={enabled ? onPointerDown : undefined}
      onPointerMove={enabled ? onPointerMove : undefined}
      onPointerUp={enabled ? onPointerUp : undefined}
      onPointerCancel={enabled ? cancel : undefined}
      onLostPointerCapture={enabled ? cancel : undefined}
    >
      <svg width={viewport.width} height={viewport.height} aria-hidden="true">
        {rects.map((r, i) => {
          const { left, top, width, height } = pdfRectToLocal(viewport, r)
          return (
            <rect
              key={i}
              className={live ? 'passage live' : 'passage'}
              x={left}
              y={top}
              width={width}
              height={height}
              rx={2}
            />
          )
        })}
        {polyline && <polyline className="stroke" points={polyline} />}
      </svg>
    </div>
  )
}
