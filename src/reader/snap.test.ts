import { describe, expect, test } from 'vitest'
import type { PdfRect } from './coords.ts'
import { passageFromRange, type TextChar } from './selection.ts'
import { Snapper, pageText } from './snap.ts'

/** 1行を1つの run にして並べる（横書き、1文字 10pt、行送り 16pt）。行末の空白は PDF と同じく持たない */
function layoutLines(lines: string[]): TextChar[] {
  return lines.flatMap((l, line) =>
    [...l].map((ch, col) => ({
      text: ch,
      run: line,
      rect: [60 + col * 10, 700 - line * 16, 70 + col * 10, 712 - line * 16] as PdfRect,
    })),
  )
}

/** 和文は width 文字ずつ、欧文は語の切れ目で折る */
function layout(text: string, width: number): TextChar[] {
  const lines: string[] = []
  if (/[a-z]/i.test(text)) {
    let line = ''
    for (const w of text.split(' ')) {
      if (line && line.length + 1 + w.length > width) {
        lines.push(line)
        line = w
      } else line = line ? `${line} ${w}` : w
    }
    lines.push(line)
  } else {
    for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width))
  }
  return layoutLines(lines)
}

/** needle の最初の出現の [先頭, 末尾]（chars の添字）。needle の中の行の折り返しは pageText と同じく空白1つで表す */
function rangeOf(chars: TextChar[], needle: string): [number, number] {
  const { text, charStart } = pageText(chars)
  const at = text.indexOf(needle)
  if (at < 0) throw new Error(needle)
  const from = charStart.findIndex((o) => o >= at)
  let to = from
  while (to + 1 < charStart.length && charStart[to + 1]! < at + needle.length) to++
  return [from, to]
}

const snapText = (chars: TextChar[], range: [number, number]) =>
  passageFromRange(chars, new Snapper(chars).snap(range)).text

const JA = layout('本をゆっくり読む人は、時間を無駄にしていない。一つひとつの文は小さな主張であり、注意深い読み手はそれが前と合うかを確かめる。', 40)

describe('日本語：語・文節に吸着', () => {
  test('語の途中で止めても語の切れ目まで広げ、後ろの助詞・助動詞を付ける', () => {
    // 「無駄」の「無」だけ → 「無駄にしていない。」…ではなく、文への吸着はしない短い語句なので文節まで
    expect(snapText(JA, rangeOf(JA, '無'))).toBe('無駄にしていない。')
  })

  test('「小さな主」まで → 「小さな主張で」（ひらがなの付属語まで）', () => {
    expect(snapText(JA, rangeOf(JA, '小さな主'))).toBe('小さな主張であり、')
  })

  test('前の文節の助詞から始めてしまった分は落とす', () => {
    // 「は、時間を」から始めた → 「時間を」から
    expect(snapText(JA, rangeOf(JA, 'は、時間を'))).toBe('時間を')
  })

  test('「ゆっくり」のような内容語は、前の語の付属語として付けない', () => {
    expect(snapText(JA, rangeOf(JA, '本'))).toBe('本を')
  })

  test('文の大半をなぞり、文末まで一語ほど残したら文末まで広げる', () => {
    // 「一つひとつの文は…前と合うかを」まで（「確かめる。」を取りこぼし）
    expect(snapText(JA, rangeOf(JA, '一つひとつの文は小さな主張であり、注意深い読み手はそれが前と合うかを'))).toBe(
      '一つひとつの文は小さな主張であり、注意深い読み手はそれが前と合うかを確かめる。',
    )
  })

  test('文頭を一語取りこぼしても、文の大半なら文頭まで広げる', () => {
    expect(snapText(JA, rangeOf(JA, 'の文は小さな主張であり、注意深い読み手はそれが前と合うかを確かめる。'))).toBe(
      '一つひとつの文は小さな主張であり、注意深い読み手はそれが前と合うかを確かめる。',
    )
  })

  test('前の文の句点からはみ出して始めても、次の文から', () => {
    expect(snapText(JA, rangeOf(JA, 'い。一つひとつの文は小さな主張であり、注意深い読み手はそれが前と合うかを確かめる。'))).toBe(
      '一つひとつの文は小さな主張であり、注意深い読み手はそれが前と合うかを確かめる。',
    )
  })
})

const EN = layout(
  'A reader who moves slowly is not wasting time. Each sentence is a small claim, and a careful reader checks whether the claim fits with what came before.',
  40,
)

describe('英語：語・文に吸着', () => {
  test('語の途中から途中まで → 語の切れ目まで', () => {
    expect(snapText(EN, rangeOf(EN, 'oves slo'))).toBe('moves slowly')
  })

  test('語の後ろの句読点は付ける', () => {
    expect(snapText(EN, rangeOf(EN, 'small cla'))).toBe('small claim,')
  })

  test('短い語句は文に広げない', () => {
    expect(snapText(EN, rangeOf(EN, 'sentence is'))).toBe('sentence is')
  })

  test('行をまたいでも、文の大半なら文全体に（行末は空白でつなぐ）', () => {
    const text = snapText(EN, rangeOf(EN, 'ch sentence is a small claim, and a careful reader checks whether the claim fits with what came'))
    expect(text).toBe(
      'Each sentence is a small claim, and a careful reader checks whether the claim fits with what came before.',
    )
  })

  test('前の文の終わりからはみ出して始めても、次の文から', () => {
    const text = snapText(EN, rangeOf(EN, 'time. Each sentence is a small claim, and a careful reader checks whether the claim fits with what came before.'))
    expect(text).toBe(
      'Each sentence is a small claim, and a careful reader checks whether the claim fits with what came before.',
    )
  })
})

test('ページの文字列：欧文の行替えは空白、和文は何も挟まない', () => {
  expect(pageText(layoutLines(['abc', 'def'])).text).toBe('abc def')
  expect(pageText(layoutLines(['あいう', 'えおか'])).text).toBe('あいうえおか')
})

test('行末の語で止めても、次の行の句読点・付属語まで付ける', () => {
  const chars = layoutLines(['本をゆっくり読む人は、時間を無駄に', 'していない。'])
  expect(snapText(chars, rangeOf(chars, '無駄'))).toBe('無駄にしていない。')
})
