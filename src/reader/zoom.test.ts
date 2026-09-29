import { expect, test } from 'vitest'
import { MAX_ZOOM, MIN_ZOOM, clampPage, fitPageScale, fitWidthScale, zoomIn, zoomOut } from './zoom.ts'

test('拡大・縮小は隣の段へ移り、端で止まる', () => {
  expect(zoomIn(1)).toBe(1.25)
  expect(zoomIn(1.1)).toBe(1.25)
  expect(zoomOut(1)).toBe(0.75)
  expect(zoomOut(1.1)).toBe(1)
  expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM)
  expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM)
})

test('幅に合わせた倍率は範囲内に収まる', () => {
  expect(fitWidthScale(611, 595)).toBe(1)
  expect(fitWidthScale(100, 595)).toBe(MIN_ZOOM)
  expect(fitWidthScale(10000, 595)).toBe(MAX_ZOOM)
})

test('ページ番号を範囲内に収める', () => {
  expect(clampPage(0, 8)).toBe(1)
  expect(clampPage(9, 8)).toBe(8)
  expect(clampPage(3.7, 8)).toBe(3)
  expect(clampPage(Number.NaN, 8)).toBe(1)
})

test('ページ全体：縦と横の両方に収まる倍率（横持ちでは縦で決まる）', () => {
  // オライリー本（504×662pt）を、横持ちタブレットの本の領域（約 800×800）に
  const s = fitPageScale(800, 800, 504, 662)
  expect(662 * s).toBeLessThanOrEqual(800 - 16)
  expect(504 * s).toBeLessThanOrEqual(800 - 16)
  expect(s).toBe(1.18)
  // 縦長の領域では幅で決まる
  expect(fitPageScale(400, 2000, 504, 662)).toBe(fitWidthScale(400, 504))
})
