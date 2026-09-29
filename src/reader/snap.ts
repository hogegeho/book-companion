import type { PdfRect } from './coords.ts'
import { lineJoiner, sameLine, union, type TextChar } from './selection.ts'

// なぞった範囲を「程よい単位」に吸着させる。指で文字単位に狙うのは難しいので、
//   1. 語の切れ目まで広げ、後ろに続く助詞・助動詞（ひらがなだけの短い語）と句読点も付けて文節くらいにする
//   2. 文頭・文末まで一語ほどしか残っていなければ、文の端まで広げる
// 語と文の切れ目は Intl.Segmenter（日本語は辞書による単語分割）に任せる。

/** 文節の後ろに付けてよい、ひらがなだけの語の長さ（「ゆっくり」のような内容語までは付けない） */
const MAX_TRAILING_KANA = 3
/** 文節の後ろに付ける、ひらがなの合計の上限 */
const MAX_TRAILING_KANA_TOTAL = 6
/** 文の端までこの数の語しか残っていなければ、文の端まで広げる */
const SENTENCE_SNAP_WORDS = 1
/** 文への吸着は、文の語の半分以上を選んでいるときだけ（短い語句を文に広げない） */
const SENTENCE_SNAP_MIN_COVERAGE = 0.5

const HIRAGANA_ONLY = /^[\p{Script=Hiragana}ー]+$/u
const CLOSING_PUNCT = /^[、。，．,.!?！？:;：；…」』）)\]】〕"'”’]+$/u

interface Seg {
  start: number
  end: number
  text: string
  wordLike: boolean
}

const isParticleLike = (s: Seg) => s.wordLike && HIRAGANA_ONLY.test(s.text) && s.text.length <= MAX_TRAILING_KANA
/** 文節の数え方に使う「内容のある語」（助詞・助動詞らしいものは数えない） */
const isContent = (s: Seg) => s.wordLike && !isParticleLike(s)

function segments(text: string, granularity: 'word' | 'sentence', locale: string): Seg[] {
  const out: Seg[] = []
  for (const s of new Intl.Segmenter(locale, { granularity }).segment(text)) {
    out.push({ start: s.index, end: s.index + s.segment.length, text: s.segment, wordLike: !!s.isWordLike })
  }
  return out
}

/** ページの文字を一つの文字列にする。行が変わるところは、欧文なら空白、和文なら何も挟まない。 */
export function pageText(chars: readonly TextChar[]) {
  const runRects = new Map<number, PdfRect[]>()
  for (const c of chars) {
    const list = runRects.get(c.run)
    if (list) list.push(c.rect)
    else runRects.set(c.run, [c.rect])
  }
  const runBox = new Map([...runRects].map(([run, rects]) => [run, union(rects)]))

  let text = ''
  const charStart: number[] = []
  chars.forEach((c, i) => {
    const prev = chars[i - 1]
    if (prev && prev.run !== c.run && !sameLine(runBox.get(prev.run)!, runBox.get(c.run)!)) {
      text += lineJoiner(text, c.text)
    }
    charStart.push(text.length)
    text += c.text
  })
  return { text, charStart }
}

export class Snapper {
  private readonly text: string
  private readonly charStart: number[]
  private readonly words: Seg[]
  private readonly sentences: Seg[]

  constructor(chars: readonly TextChar[], locale = 'ja') {
    const { text, charStart } = pageText(chars)
    this.text = text
    this.charStart = charStart
    this.words = segments(text, 'word', locale)
    this.sentences = segments(text, 'sentence', locale)
  }

  private wordAt(offset: number) {
    return this.words.findIndex((w) => offset >= w.start && offset < w.end)
  }

  /** 文字の範囲 [from, to]（chars の添字、両端を含む）を吸着させる */
  snap([from, to]: readonly [number, number]): [number, number] {
    const words = this.words
    let wFrom = this.wordAt(this.charStart[from]!)
    let wTo = this.wordAt(this.charStart[to]!)
    if (wFrom < 0 || wTo < 0) return [from, to]

    // 頭：前の文節の助詞や句読点・空白から始めてしまった分は落とす
    const prevOf = (i: number) => words[i - 1]
    if (isParticleLike(words[wFrom]!) && prevOf(wFrom) && isContent(prevOf(wFrom)!)) {
      while (wFrom < wTo && (isParticleLike(words[wFrom]!) || !words[wFrom]!.wordLike)) wFrom++
    }
    while (wFrom < wTo && !words[wFrom]!.wordLike) wFrom++

    // 尾：後ろに続く助詞・助動詞と閉じの句読点を付けて文節にする
    while (wTo > wFrom && !words[wTo]!.wordLike) wTo--
    let kana = 0
    while (wTo + 1 < words.length) {
      const next = words[wTo + 1]!
      if (isParticleLike(next) && kana + next.text.length <= MAX_TRAILING_KANA_TOTAL && !/[\p{Script=Latin}]/u.test(next.text)) {
        kana += next.text.length
        wTo++
      } else if (CLOSING_PUNCT.test(next.text)) {
        wTo++
      } else break
    }

    let start = words[wFrom]!.start
    let end = words[wTo]!.end // 含まない

    // 文の端まで一語ほどしか残っていなければ、文の端まで広げる
    const sentence = (offset: number) => this.sentences.find((s) => offset >= s.start && offset < s.end)
    const contentIn = (a: number, b: number) => words.filter((w) => w.start >= a && w.end <= b && isContent(w)).length

    // 前の文の終わり・次の文の始まりにはみ出した分（内容語が一語以下）は落とす
    const first = sentence(start)
    if (first && end > first.end && contentIn(start, first.end) <= SENTENCE_SNAP_WORDS) start = first.end
    const last = sentence(end - 1)
    if (last && start < last.start && contentIn(last.start, end) <= SENTENCE_SNAP_WORDS) end = last.start
    while (start < end && /\s/.test(this.text[start]!)) start++
    while (end > start && /\s/.test(this.text[end - 1]!)) end--
    const sFrom = sentence(start)
    if (sFrom) {
      const total = contentIn(sFrom.start, sFrom.end)
      const chosen = contentIn(start, Math.min(end, sFrom.end))
      if (contentIn(sFrom.start, start) <= SENTENCE_SNAP_WORDS && chosen >= total * SENTENCE_SNAP_MIN_COVERAGE) {
        start = sFrom.start
      }
    }
    const sTo = sentence(end - 1)
    if (sTo) {
      const total = contentIn(sTo.start, sTo.end)
      const chosen = contentIn(Math.max(start, sTo.start), end)
      if (contentIn(end, sTo.end) <= SENTENCE_SNAP_WORDS && chosen >= total * SENTENCE_SNAP_MIN_COVERAGE) {
        end = sTo.end
      }
    }
    // 文の端の空白は含めない
    while (start < end && /\s/.test(this.text[start]!)) start++
    while (end > start && /\s/.test(this.text[end - 1]!)) end--

    return [this.charIndexAtOrAfter(start), this.charIndexBefore(end)]
  }

  private charIndexAtOrAfter(offset: number) {
    const i = this.charStart.findIndex((s) => s >= offset)
    return i < 0 ? this.charStart.length - 1 : i
  }

  private charIndexBefore(offset: number) {
    for (let i = this.charStart.length - 1; i >= 0; i--) if (this.charStart[i]! < offset) return i
    return 0
  }
}
