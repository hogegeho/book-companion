/** 倍率の段階。「+」「−」で隣の段へ移る。 */
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 3
export const ZOOM_STEPS: readonly number[] = [MIN_ZOOM, 0.75, 1, 1.25, 1.5, 2, 2.5, MAX_ZOOM]

export function zoomIn(scale: number) {
  return ZOOM_STEPS.find((s) => s > scale + 1e-6) ?? MAX_ZOOM
}

export function zoomOut(scale: number) {
  return [...ZOOM_STEPS].reverse().find((s) => s < scale - 1e-6) ?? MIN_ZOOM
}

/** ページのまわりの余白（上下左右の合計、CSS px）。.page-scroll の padding と合わせる */
export const PAGE_PADDING = 16

const clampScale = (s: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.floor(s * 100) / 100))

/** 表示幅に合わせた倍率。極端な値にならないよう段の範囲に収める。 */
export function fitWidthScale(containerWidth: number, pageWidthPt: number, padding = PAGE_PADDING) {
  return clampScale((containerWidth - padding) / pageWidthPt)
}

/** ページ全体（縦も横も）が収まる倍率 */
export function fitPageScale(
  containerWidth: number,
  containerHeight: number,
  pageWidthPt: number,
  pageHeightPt: number,
  padding = PAGE_PADDING,
) {
  return clampScale(Math.min((containerWidth - padding) / pageWidthPt, (containerHeight - padding) / pageHeightPt))
}

export function clampPage(page: number, numPages: number) {
  if (!Number.isFinite(page)) return 1
  return Math.min(numPages, Math.max(1, Math.trunc(page)))
}
