import type { PDFDocumentProxy } from 'pdfjs-dist'

/** 節。PDF のアウトラインのいちばん深い項目を節とする（未決事項：アウトラインの無い本の区切り方） */
export interface Section {
  /** アウトライン上の位置（例 "0.1"）。同じ本なら開き直しても変わらない */
  id: string
  title: string
  /** 属する章などの見出し（上の階層） */
  parents: string[]
  startPage: number
  /** 節の最後のページ。次の節がページの頭から始まればその前のページ、途中から始まればそのページ */
  endPage: number
}

/** ページの上からこの割合より下で始まる節は「ページの途中から」とみなす */
const TOP_OF_PAGE = 0.85

type OutlineItem = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>[number]

/** 行き先のページと、ページの頭から始まるか */
async function destOf(doc: PDFDocumentProxy, dest: OutlineItem['dest']): Promise<{ page: number; atTop: boolean } | null> {
  try {
    const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest
    const ref = explicit?.[0]
    if (ref == null) return null
    const page = typeof ref === 'number' ? ref + 1 : (await doc.getPageIndex(ref as never)) + 1
    // [ref, /XYZ, left, top, zoom] の top（PDF 座標、上向き）。無ければ頭から
    const kind = (explicit?.[1] as { name?: string } | undefined)?.name
    const top = kind === 'XYZ' || kind === 'FitH' || kind === 'FitBH' ? (explicit?.[kind === 'XYZ' ? 3 : 2] as number | null) : null
    if (top == null) return { page, atTop: true }
    const [, y0, , y1] = (await doc.getPage(page)).view
    return { page, atTop: top >= y0! + (y1! - y0!) * TOP_OF_PAGE }
  } catch {
    return null
  }
}

export async function loadSections(doc: PDFDocumentProxy): Promise<Section[]> {
  const outline = (await doc.getOutline()) ?? []
  const leaves: (Omit<Section, 'endPage'> & { atTop: boolean })[] = []
  const walk = async (items: OutlineItem[], path: string[], parents: string[]) => {
    for (const [i, item] of items.entries()) {
      const id = [...path, String(i)]
      if (item.items?.length) {
        await walk(item.items, id, [...parents, item.title])
      } else {
        const d = await destOf(doc, item.dest)
        if (d) leaves.push({ id: id.join('.'), title: item.title, parents, startPage: d.page, atTop: d.atTop })
      }
    }
  }
  await walk(outline, [], [])
  leaves.sort((a, b) => a.startPage - b.startPage)
  return leaves.map((s, i) => {
    const next = leaves[i + 1]
    const endPage = !next ? doc.numPages : Math.max(s.startPage, next.atTop ? next.startPage - 1 : next.startPage)
    return { id: s.id, title: s.title, parents: s.parents, startPage: s.startPage, endPage }
  })
}

/** そのページで終わる節 */
export const sectionsEndingAt = (sections: Section[], page: number) => sections.filter((s) => s.endPage === page)

/** そのページが属する節（複数あれば最後に始まったもの） */
export const sectionAt = (sections: Section[], page: number) =>
  [...sections].reverse().find((s) => s.startPage <= page && page <= s.endPage) ?? null
