import { describe, expect, test } from 'vitest'
import type { PdfRect } from './coords.ts'
import { passageFromRange, selectByStroke, type TextChar } from './selection.ts'

/** 横書きの1行を等幅で並べる。baseline は行の下端（pt）。 */
function line(text: string, run: number, x0: number, bottom: number, w = 6, h = 12): TextChar[] {
  return [...text].map((ch, i) => ({ text: ch, run, rect: [x0 + i * w, bottom, x0 + (i + 1) * w, bottom + h] as PdfRect }))
}

// 3行（行送り 16pt、文字の高さ 12pt）
const L1 = line('To build a model', 0, 60, 700)
const L2 = line('of a text is to', 1, 60, 684)
const L3 = line('hold its parts.', 2, 60, 668)
const PAGE = [...L1, ...L2, ...L3]
const midY = (l: TextChar[]) => (l[0]!.rect[1] + l[0]!.rect[3]) / 2
const cx = (l: TextChar[], i: number) => (l[i]!.rect[0] + l[i]!.rect[2]) / 2

describe('なぞりで一節を選ぶ', () => {
  test('一語の上をなぞるとその語が選ばれる', () => {
    // "model" は L1 の 11..15 文字目
    const r = selectByStroke(PAGE, [
      [cx(L1, 11), midY(L1)],
      [cx(L1, 15), midY(L1)],
    ])
    expect(r.text).toBe('model')
    expect(r.rects).toHaveLength(1)
    expect(r.rects[0]).toEqual([L1[11]!.rect[0], 700, L1[15]!.rect[2], 712])
  })

  test('指が行から少しずれても（行の高さの 0.4 まで）同じ行を拾う', () => {
    const r = selectByStroke(PAGE, [
      [cx(L1, 0), midY(L1) + 10],
      [cx(L1, 7), midY(L1) + 10],
    ])
    expect(r.text).toBe('To build')
  })

  test('行と行のあいだをなぞると、近い方の一行だけを拾う（二行を同時に拾わない）', () => {
    const nearL2 = (midY(L1) + midY(L2)) / 2 - 1
    const r = selectByStroke(PAGE, [
      [cx(L2, 0), nearL2],
      [cx(L2, 3), nearL2],
    ])
    expect(r.text).toBe('of a')
  })

  test('行から大きく外れたところは何も拾わない', () => {
    const r = selectByStroke(PAGE, [
      [cx(L1, 0), midY(L1) + 30],
      [cx(L1, 10), midY(L1) + 30],
    ])
    expect(r.text).toBe('')
  })

  test('語のすきま（空白）や途中のぶれは、最初と最後の当たりのあいだとして埋める', () => {
    // 手前から "build" を斜めに外れつつ "model" の上で終わる
    const r = selectByStroke(PAGE, [
      [cx(L1, 3), midY(L1)],
      [cx(L1, 6), midY(L1) + 20], // 一度行から大きく外れる
      [cx(L1, 13), midY(L1)],
    ])
    expect(r.text).toBe('build a mod')
  })

  test('複数行を折り返しながらなぞると、最初に触れた文字から最後の文字まで読む順に選ぶ', () => {
    // 行末から次の行頭へ戻る斜めの動きで前の行の文字をかすめても、範囲は変わらない
    const r = selectByStroke(PAGE, [
      [cx(L1, 11), midY(L1)],
      [cx(L1, 15), midY(L1)],
      [cx(L2, 0), midY(L2)],
      [cx(L2, 3), midY(L2)],
    ])
    expect(r.text).toBe('model\nof a')
    expect(r.rects).toHaveLength(2)
  })

  test('始まりと終わりだけで、あいだの行は丸ごと入る', () => {
    const r = selectByStroke(PAGE, [
      [cx(L1, 11), midY(L1)],
      [cx(L3, 3), midY(L3)],
    ])
    expect(r.text).toBe('model\nof a text is to\nhold')
    expect(r.rects).toHaveLength(3)
  })

  test('なぞる向きが逆（右から左）でも同じ文字列になる', () => {
    const r = selectByStroke(PAGE, [
      [cx(L3, 13), midY(L3)],
      [cx(L3, 9), midY(L3)],
    ])
    expect(r.text).toBe('parts')
  })

  test('縦書きの行は、行と直交する向き（左右）にぶれを許す', () => {
    const col: TextChar[] = [...'読書の記録'].map((ch, i) => ({
      text: ch,
      run: 0,
      rect: [300, 700 - (i + 1) * 12, 312, 700 - i * 12] as PdfRect,
    }))
    const r = selectByStroke(col, [
      [310 + 4, 694],
      [310 + 4, 666],
    ])
    expect(r.text).toBe('読書の')
  })

  test('当たりが無ければ空', () => {
    expect(passageFromRange(PAGE, null)).toEqual({ text: '', rects: [] })
  })
})
