// 位置は PDF のユーザー空間座標（pt）で持つ。画面との変換は pdf.js の viewport の
// convertToPdfPoint / convertToViewportPoint だけを通す（倍率・回転が変わっても線がずれないように）。

/** PDF のユーザー空間の点（pt、y は上向き） */
export type PdfPoint = readonly [x: number, y: number]
/** PDF のユーザー空間の矩形 [x1, y1, x2, y2]（pt、x1 <= x2, y1 <= y2） */
export type PdfRect = readonly [x1: number, y1: number, x2: number, y2: number]

/** pdf.js の PageViewport のうち、ここで使う部分 */
export interface ViewportLike {
  convertToPdfPoint(x: number, y: number): number[]
  convertToViewportPoint(x: number, y: number): number[]
}

/** ページ要素の左上（client 座標） */
export interface Origin {
  left: number
  top: number
}

/** ページ要素内の CSS px → PDF pt */
export function localToPdf(vp: ViewportLike, x: number, y: number): PdfPoint {
  const [px, py] = vp.convertToPdfPoint(x, y)
  return [px!, py!]
}

/** PDF pt → ページ要素内の CSS px */
export function pdfToLocal(vp: ViewportLike, [x, y]: PdfPoint): [number, number] {
  const [lx, ly] = vp.convertToViewportPoint(x, y)
  return [lx!, ly!]
}

export function clientToPdf(vp: ViewportLike, origin: Origin, clientX: number, clientY: number): PdfPoint {
  return localToPdf(vp, clientX - origin.left, clientY - origin.top)
}

export function pdfToClient(vp: ViewportLike, origin: Origin, p: PdfPoint): [number, number] {
  const [x, y] = pdfToLocal(vp, p)
  return [x + origin.left, y + origin.top]
}

const normalize = (ax: number, ay: number, bx: number, by: number): PdfRect => [
  Math.min(ax, bx),
  Math.min(ay, by),
  Math.max(ax, bx),
  Math.max(ay, by),
]

/** client 座標の矩形 → PDF 矩形（回転は 90° 単位なので対角の2点で足りる） */
export function clientRectToPdf(
  vp: ViewportLike,
  origin: Origin,
  r: { left: number; top: number; right: number; bottom: number },
): PdfRect {
  const [ax, ay] = clientToPdf(vp, origin, r.left, r.top)
  const [bx, by] = clientToPdf(vp, origin, r.right, r.bottom)
  return normalize(ax, ay, bx, by)
}

/** PDF 矩形 → ページ要素内の CSS px の矩形 */
export function pdfRectToLocal(vp: ViewportLike, [x1, y1, x2, y2]: PdfRect) {
  const [ax, ay] = pdfToLocal(vp, [x1, y1])
  const [bx, by] = pdfToLocal(vp, [x2, y2])
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  }
}
