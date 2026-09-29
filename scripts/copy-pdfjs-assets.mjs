#!/usr/bin/env node
// pdf.js が実行時に取りに行く資材（CMap・標準フォント・wasm・ICC）を public/pdfjs/ へ写す。
// 日本語の本は埋め込みの無いフォントで CMap を要することが多い。dev/build の前に自動で走る。
import { cpSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const src = dirname(require.resolve('pdfjs-dist/package.json'))
const dest = resolve(dirname(fileURLToPath(import.meta.url)), '../public/pdfjs')

rmSync(dest, { recursive: true, force: true })
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(resolve(src, dir), resolve(dest, dir), { recursive: true })
}
console.log(`copied pdf.js assets to ${dest}`)
