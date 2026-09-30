import type { PDFDocumentProxy } from 'pdfjs-dist'

/** ページの文字（行末は改行） */
export async function pageText(doc: PDFDocumentProxy, page: number): Promise<string> {
  const tc = await (await doc.getPage(page)).getTextContent()
  return tc.items
    .map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : ''))
    .join('')
    .trim()
}

/** from〜to ページの文字（to は含む）。呼び手は to を現在ページ以下にすること */
export async function pagesText(doc: PDFDocumentProxy, from: number, to: number): Promise<string> {
  const out: string[] = []
  for (let p = from; p <= to; p++) out.push(await pageText(doc, p))
  return out.join('\n\n')
}
