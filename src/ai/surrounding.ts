// なぞった一節を含む文と、その前後の文を、ページの文字から取り出す（AI が選択のこぼれ・欠けを汲むため）。
// ページの文字と一節とは空白や改行の入り方が違うので、空白を除いて照らし合わせる。

const isSpace = (ch: string) => /\s/.test(ch)

/** 空白を除いた文字列と、その各文字が元の何文字目かの対応 */
function squeeze(s: string) {
  let text = ''
  const at: number[] = []
  for (let i = 0; i < s.length; i++) {
    if (isSpace(s[i]!)) continue
    text += s[i]
    at.push(i)
  }
  return { text, at }
}

export function surroundingSentences(pageText: string, passage: string, around = 1, locale = 'ja'): string {
  const page = squeeze(pageText)
  const needle = squeeze(passage).text
  if (!needle) return ''
  const hit = page.text.indexOf(needle)
  if (hit < 0) return ''
  const start = page.at[hit]!
  const end = page.at[hit + needle.length - 1]! + 1

  // 行の折り返し（改行）は文の切れ目ではないので、空白にならしてから文に分ける
  const flat = pageText.replace(/\s+/g, ' ')
  // flat と pageText の位置の対応（空白の連なりを1つにしたぶんずれる）
  const map: number[] = []
  for (let i = 0, j = 0; i < pageText.length; i++) {
    map.push(j)
    if (!(isSpace(pageText[i]!) && i + 1 < pageText.length && isSpace(pageText[i + 1]!))) j++
  }
  const s = map[start]!
  const e = map[end - 1]! + 1

  const sentences = [...new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(flat)]
  const first = sentences.findIndex((x) => x.index + x.segment.length > s)
  let last = sentences.findIndex((x) => x.index + x.segment.length >= e)
  if (last < 0) last = sentences.length - 1
  return sentences
    .slice(Math.max(0, first - around), last + around + 1)
    .map((x) => x.segment)
    .join('')
    .trim()
}
