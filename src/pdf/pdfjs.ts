import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

// scripts/copy-pdfjs-assets.mjs が public/pdfjs/ に置く資材
const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`

export type { PDFDocumentProxy }

/** PDF を開く。data は pdf.js に渡すと使えなくなるので、呼び手が持ち続けたい場合はコピーを渡す。 */
export function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({
    data,
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  }).promise
}

/** 文書情報の書名（無ければ null） */
export async function pdfTitle(doc: PDFDocumentProxy): Promise<string | null> {
  const { info } = await doc.getMetadata()
  const title = (info as { Title?: unknown }).Title
  return typeof title === 'string' && title.trim() ? title.trim() : null
}

/** 文書を閉じ、worker 側の資源も手放す */
export function closePdf(doc: PDFDocumentProxy) {
  return doc.loadingTask.destroy()
}
