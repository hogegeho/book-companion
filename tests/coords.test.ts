// @vitest-environment node
// 段3 完了条件：座標変換の往復（倍率 1.0／1.5／2.0 で誤差 0.5pt 以内）。viewport は fixture の実ページから作る。
import { readFileSync } from 'node:fs'
import { getDocument, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, test } from 'vitest'
import { FIXTURE_PATH } from '../scripts/make-fixture.mjs'
import {
  clientRectToPdf,
  clientToPdf,
  pdfRectToLocal,
  pdfToClient,
  pdfToLocal,
  type PdfPoint,
  type PdfRect,
} from '../src/reader/coords.ts'

const TOLERANCE_PT = 0.5
const SCALES = [1.0, 1.5, 2.0]
const ROTATIONS = [0, 90, 180, 270]
// ページ要素が画面のどこにあってもよいよう、半端な位置に置く
const ORIGIN = { left: 173.37, top: 58.91 }

let page: PDFPageProxy
beforeAll(async () => {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(FIXTURE_PATH)) }).promise
  page = await doc.getPage(1)
})

// ページ全体に散らした点（端・隅を含む）
const samplePoints = (): PdfPoint[] => {
  const pts: PdfPoint[] = []
  for (let x = 0; x <= 595; x += 595 / 7) for (let y = 0; y <= 842; y += 842 / 9) pts.push([x, y])
  pts.push([64.3, 761.2], [301.77, 412.05], [594.99, 0.01])
  return pts
}

describe.each(SCALES)('倍率 %s', (scale) => {
  test.each(ROTATIONS)('回転 %s°：PDF → 画面 → PDF の往復が 0.5pt 以内', (rotation) => {
    const vp = page.getViewport({ scale, rotation })
    for (const p of samplePoints()) {
      const [cx, cy] = pdfToClient(vp, ORIGIN, p)
      const back = clientToPdf(vp, ORIGIN, cx, cy)
      expect(Math.abs(back[0] - p[0])).toBeLessThanOrEqual(TOLERANCE_PT)
      expect(Math.abs(back[1] - p[1])).toBeLessThanOrEqual(TOLERANCE_PT)
    }
  })

  test('画面の点は 1px 単位に丸めても 0.5pt 以内に戻る（指の座標は px で来る）', () => {
    const vp = page.getViewport({ scale })
    for (const p of samplePoints()) {
      const [cx, cy] = pdfToClient(vp, ORIGIN, p)
      // 実機の pointer 座標は 1/devicePixelRatio 単位。ここでは厳しめに 1/scale px に丸める
      const step = 1 / scale
      const back = clientToPdf(vp, ORIGIN, Math.round(cx / step) * step, Math.round(cy / step) * step)
      expect(Math.abs(back[0] - p[0])).toBeLessThanOrEqual(TOLERANCE_PT)
      expect(Math.abs(back[1] - p[1])).toBeLessThanOrEqual(TOLERANCE_PT)
    }
  })

  test('矩形の往復も 0.5pt 以内', () => {
    const vp = page.getViewport({ scale })
    const r: PdfRect = [64.2, 700.4, 250.9, 713.6]
    const local = pdfRectToLocal(vp, r)
    const client = {
      left: local.left + ORIGIN.left,
      top: local.top + ORIGIN.top,
      right: local.left + local.width + ORIGIN.left,
      bottom: local.top + local.height + ORIGIN.top,
    }
    const back = clientRectToPdf(vp, ORIGIN, client)
    back.forEach((v, i) => expect(Math.abs(v - r[i]!)).toBeLessThanOrEqual(TOLERANCE_PT))
  })

  test('向きが合っている：PDF の左上は画面の左上、y は下向きに増える', () => {
    const vp = page.getViewport({ scale })
    expect(pdfToLocal(vp, [0, 842])).toEqual([0, 0])
    const [x, y] = pdfToLocal(vp, [595, 0])
    expect(x).toBeCloseTo(595 * scale, 6)
    expect(y).toBeCloseTo(842 * scale, 6)
  })
})

test('同じ PDF 座標は、倍率を変えると画面上で倍率どおりに動く', () => {
  const p: PdfPoint = [120, 500]
  const at = (s: number) => pdfToLocal(page.getViewport({ scale: s }), p)
  const [x1, y1] = at(1)
  const [x2, y2] = at(2)
  expect(x2).toBeCloseTo(x1 * 2, 6)
  expect(y2).toBeCloseTo(y1 * 2, 6)
})
