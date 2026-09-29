import { clientRectToPdf, type Origin, type ViewportLike } from './coords.ts'
import type { TextChar } from './selection.ts'

/**
 * 文字層の DOM から1文字ずつの位置を集め、PDF 座標にする。
 * pdf.js は span を canvas 上の文字に合うよう伸縮しているので、Range で測れば描かれた文字の位置になる。
 */
export function collectTextChars(container: HTMLElement, vp: ViewportLike, origin: Origin): TextChar[] {
  const chars: TextChar[] = []
  const range = document.createRange()
  let run = 0
  for (const span of container.querySelectorAll('span')) {
    if (span.getAttribute('role') === 'img') continue
    const texts = [...span.childNodes].filter((n): n is Text => n.nodeType === Node.TEXT_NODE)
    if (texts.length === 0) continue
    for (const node of texts) {
      const s = node.data
      for (let i = 0; i < s.length; ) {
        const cp = s.codePointAt(i)!
        const len = cp > 0xffff ? 2 : 1
        range.setStart(node, i)
        range.setEnd(node, i + len)
        const r = range.getBoundingClientRect()
        if (r.width > 0 || r.height > 0) {
          chars.push({ text: s.slice(i, i + len), rect: clientRectToPdf(vp, origin, r), run })
        }
        i += len
      }
    }
    run++
  }
  return chars
}
