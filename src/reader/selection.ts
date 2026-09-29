import type { PdfPoint, PdfRect } from './coords.ts'

/** 文字層の1文字。run は文字層の span（テキストの一続き）の番号で、読む順に並ぶ。 */
export interface TextChar {
  text: string
  rect: PdfRect
  run: number
}

/** なぞって選んだ一節 */
export interface Passage {
  page: number
  text: string
  /** 行ごとの矩形（pt） */
  rects: PdfRect[]
}

/**
 * 指のぶれをどこまで許すか。行の太さ（横書きなら文字の高さ）に対する割合で、行と直交する向きの距離。
 * 行と行のあいだは近い方の行に割り当てるので、隣の行を二重に拾うことはない。人の確認①で調整する。
 */
export const PERPENDICULAR_SLOP = 0.4
/** なぞった線を調べる間隔（pt） */
const SAMPLE_STEP_PT = 1

type Dir = 'h' | 'v'

interface Run {
  dir: Dir
  /** run 全体の外接矩形 */
  box: PdfRect
  /** chars 配列での範囲 [from, to] */
  from: number
  to: number
}

/** 行に沿う向きの座標と、直交する向きの座標 */
const along = (dir: Dir, [x, y]: PdfPoint) => (dir === 'h' ? x : -y)
const across = (dir: Dir, [x, y]: PdfPoint) => (dir === 'h' ? y : x)
const alongRange = (dir: Dir, r: PdfRect): [number, number] => (dir === 'h' ? [r[0], r[2]] : [-r[3], -r[1]])
const acrossRange = (dir: Dir, r: PdfRect): [number, number] => (dir === 'h' ? [r[1], r[3]] : [r[0], r[2]])
const distToRange = (v: number, [lo, hi]: [number, number]) => (v < lo ? lo - v : v > hi ? v - hi : 0)

const union = (rects: PdfRect[]): PdfRect => [
  Math.min(...rects.map((r) => r[0])),
  Math.min(...rects.map((r) => r[1])),
  Math.max(...rects.map((r) => r[2])),
  Math.max(...rects.map((r) => r[3])),
]

function buildRuns(chars: readonly TextChar[]): Run[] {
  const runs: Run[] = []
  let from = 0
  for (let i = 1; i <= chars.length; i++) {
    if (i < chars.length && chars[i]!.run === chars[from]!.run) continue
    const slice = chars.slice(from, i)
    const a = slice[0]!.rect
    const b = slice[slice.length - 1]!.rect
    const dx = Math.abs((a[0] + a[2]) / 2 - (b[0] + b[2]) / 2)
    const dy = Math.abs((a[1] + a[3]) / 2 - (b[1] + b[3]) / 2)
    // 1文字だけの run は横書き扱い
    runs.push({ dir: dy > dx ? 'v' : 'h', box: union(slice.map((c) => c.rect)), from, to: i - 1 })
    from = i
  }
  return runs
}

/**
 * なぞった線から「最初に触れた文字」と「最後に触れた文字」を追う。pointermove ごとに新しい線分だけ調べる。
 * 線上の各点は、行に沿う範囲に入っている行のうち直交方向に最も近い一行だけに割り当てる。
 */
export class StrokeHitTester {
  readonly chars: readonly TextChar[]
  first: number | null = null
  last: number | null = null
  private readonly runs: Run[]

  constructor(chars: readonly TextChar[]) {
    this.chars = chars
    this.runs = buildRuns(chars)
  }

  /** 点が触れている文字（無ければ null） */
  charAt(p: PdfPoint): number | null {
    let best: Run | null = null
    let bestDist = Infinity
    for (const run of this.runs) {
      if (distToRange(along(run.dir, p), alongRange(run.dir, run.box)) > 0) continue
      const [lo, hi] = acrossRange(run.dir, run.box)
      const d = distToRange(across(run.dir, p), [lo, hi])
      if (d <= (hi - lo) * PERPENDICULAR_SLOP && d < bestDist) {
        best = run
        bestDist = d
      }
    }
    if (!best) return null
    // run の中で、行に沿う向きに最も近い文字
    const a = along(best.dir, p)
    let hit = best.from
    let hitDist = Infinity
    for (let i = best.from; i <= best.to; i++) {
      const d = distToRange(a, alongRange(best.dir, this.chars[i]!.rect))
      if (d < hitDist) {
        hit = i
        hitDist = d
      }
    }
    return hit
  }

  private addPoint(p: PdfPoint) {
    const i = this.charAt(p)
    if (i === null) return
    if (this.first === null) this.first = i
    this.last = i
  }

  addSegment(a: PdfPoint, b: PdfPoint) {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SAMPLE_STEP_PT))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      this.addPoint([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }

  addStroke(points: readonly PdfPoint[]) {
    if (points.length > 0) this.addPoint(points[0]!)
    for (let i = 1; i < points.length; i++) this.addSegment(points[i - 1]!, points[i]!)
  }

  /** 選ばれた範囲（読む順）。何にも触れていなければ null */
  get range(): [number, number] | null {
    if (this.first === null || this.last === null) return null
    return [Math.min(this.first, this.last), Math.max(this.first, this.last)]
  }

  passage() {
    return passageFromRange(this.chars, this.range)
  }
}

/** 二つの行が同じ行か（横書きなら縦方向に半分以上重なる） */
function sameLine(a: PdfRect, b: PdfRect) {
  const overlap = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
  return overlap > 0.5 * Math.min(a[3] - a[1], b[3] - b[1])
}

/**
 * 読む順の範囲 [from, to] から一節を作る。run ごとに矩形を一つにまとめ、行が変わるところは改行でつなぐ。
 */
export function passageFromRange(
  chars: readonly TextChar[],
  range: readonly [number, number] | null,
): { text: string; rects: PdfRect[] } {
  if (!range) return { text: '', rects: [] }
  const pieces: { text: string; rect: PdfRect }[] = []
  let start = range[0]
  for (let i = range[0] + 1; i <= range[1] + 1; i++) {
    if (i <= range[1] && chars[i]!.run === chars[start]!.run) continue
    const slice = chars.slice(start, i)
    const text = slice.map((c) => c.text).join('')
    if (text.trim()) pieces.push({ text, rect: union(slice.map((c) => c.rect)) })
    start = i
  }
  let text = ''
  pieces.forEach((p, i) => {
    if (i > 0) text += sameLine(pieces[i - 1]!.rect, p.rect) ? '' : '\n'
    text += p.text
  })
  return { text: text.trim(), rects: pieces.map((p) => p.rect) }
}

export function selectByStroke(chars: readonly TextChar[], stroke: readonly PdfPoint[]) {
  const tester = new StrokeHitTester(chars)
  tester.addStroke(stroke)
  return tester.passage()
}
