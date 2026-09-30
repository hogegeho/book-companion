import { pdfRectToLocal, type PdfRect, type ViewportLike } from './coords.ts'
import { union } from './selection.ts'

/** 切り出しの余白（pt）。数式の上付き・下付きがはみ出しても入るように少し広げる */
const MARGIN_PT = 6
/** 送る画像の長辺の上限（px） */
const MAX_SIDE = 1200

/**
 * なぞった範囲の外接矩形を少し広げて、描いてある canvas から PNG で切り出す（base64、data: なし）。
 * 数式は文字層で崩れるので、文字と一緒に画像も送る。
 */
export function cropPassage(canvas: HTMLCanvasElement, viewport: ViewportLike & { width: number }, rects: readonly PdfRect[]): string | null {
  if (rects.length === 0 || canvas.width === 0) return null
  const [x1, y1, x2, y2] = union([...rects])
  const box = pdfRectToLocal(viewport, [x1 - MARGIN_PT, y1 - MARGIN_PT, x2 + MARGIN_PT, y2 + MARGIN_PT])
  const k = canvas.width / viewport.width // CSS px → canvas の画素
  const sx = Math.max(0, Math.floor(box.left * k))
  const sy = Math.max(0, Math.floor(box.top * k))
  const sw = Math.min(canvas.width - sx, Math.ceil(box.width * k))
  const sh = Math.min(canvas.height - sy, Math.ceil(box.height * k))
  if (sw <= 0 || sh <= 0) return null
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh))
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(sw * scale))
  out.height = Math.max(1, Math.round(sh * scale))
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height)
  return out.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}
