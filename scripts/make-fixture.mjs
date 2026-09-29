#!/usr/bin/env node
// テスト用PDF（fixtures/fixture-book.pdf）を生成する。
// 依存なしで PDF の構文を直接書き出す。日付・乱数を使わないので、同じ入力から常に同じバイト列になる。
// 本文はこのリポジトリのために書いたもの（CC0）。
//
//   node scripts/make-fixture.mjs          # 書き出す
//   node scripts/make-fixture.mjs --check  # 追跡中のファイルと一致するか確かめる（一致しなければ exit 1）

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FIXTURE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/fixture-book.pdf')

const PAGE_W = 595
const PAGE_H = 842
const MARGIN_X = 64
const WRAP = 82 // Helvetica 11pt で本文幅に収まる目安の文字数

/** 各ページの「目印」。E2E やテストが文字層から拾う既知の文字列。 */
export const MARKERS = ['AMBER', 'BIRCH', 'CEDAR', 'DAHLIA', 'EMBER', 'FJORD', 'GARNET', 'HARBOR']
export const markerText = (page) => `Fixture marker for page ${page}: ${MARKERS[page - 1]}.`

export const BOOK_TITLE = 'テスト用の本 Fixture Book'

/** 章と節（アウトライン）。page は 1 始まり。 */
export const OUTLINE = [
  {
    title: 'Chapter 1 Reading Slowly',
    page: 1,
    children: [
      { title: '1.1 Why Read Slowly', page: 1 },
      { title: '1.2 Building a Model', page: 2 },
    ],
  },
  {
    title: 'Chapter 2 Numbers on the Page',
    page: 4,
    children: [
      { title: '2.1 Growth', page: 4 },
      { title: '2.2 A Few Formulas', page: 5 },
    ],
  },
  {
    title: 'Chapter 3 Summaries',
    page: 7,
    children: [
      { title: '3.1 In Your Own Words', page: 7 },
      { title: '3.2 Finding the Gap', page: 8 },
    ],
  },
]

/** ページで数式を含むもの（1 始まり）。 */
export const MATH_PAGE = 5

// ---- 本文 ---------------------------------------------------------------

const P = {
  slow1:
    'A reader who moves slowly is not wasting time. Each sentence is a small claim, and a careful reader checks whether the claim fits with what came before. When it does not fit, that friction is useful: it marks the place where understanding is about to change.',
  slow2:
    'Speed hides these moments. Skimming produces a feeling of familiarity without the structure underneath it. The goal of this book is to make the slow path lighter, not shorter.',
  model1:
    'To build a model of a text is to hold its parts in relation. Which idea depends on which? What would break if one sentence were removed? A model is something you can run forward: given a new case, it predicts what the author would say.',
  model2:
    'Questions are the tool for building such a model. A good question names a specific passage and asks how it connects to something else. A vague question gets a vague answer.',
  model3:
    'When you return to a passage you questioned before, the old question is a map. It shows where you were confused and what resolved the confusion. Keeping those questions next to the text turns a single reading into a record you can revisit.',
  model4:
    'The end of a section is a natural place to stop and check. Can you say, without looking, what the section claimed and why? If not, the model is not yet built.',
  growth1:
    'Many books explain change with numbers. A quantity that grows by the same fraction each step grows faster and faster in absolute terms, even though the rule never changes.',
  growth2:
    'Suppose a value doubles every step. After ten steps it is about a thousand times larger. After twenty steps it is about a million times larger. The rule is simple; the consequences are not.',
  formula1:
    'Formulas compress an argument into a line. The text layer of a PDF often breaks them apart, so a reader who marks a formula should also see it as an image.',
  formula2:
    'Each of these lines rewards slow reading. Try to say in words what each symbol stands for before moving on.',
  formula3:
    'A formula is only understood when you can use it. Pick a small value of n, compute both sides of the sum by hand, and check that they agree. The check takes a minute and leaves a trace in memory that rereading does not.',
  formula4:
    'If a step in a derivation is not clear, mark it and ask about that step alone. Asking about the whole page at once tends to produce a summary rather than an explanation.',
  words1:
    'Writing a summary in your own words is harder than reading one written by someone else. That difficulty is the point. The effort of choosing words forces you to decide what mattered.',
  words2:
    'A summary does not need to be complete. It needs to be yours. Three honest sentences are worth more than a paragraph copied from the text.',
  gap1:
    'After you write a summary, it helps to learn what you left out. Not a rewrite, and not a list of every omission: one gap, the most important one, is enough to act on.',
  gap2:
    'Then go back to the text and find where that idea lives. Reading it a second time, with a question in mind, is different from reading it the first time.',
}

// ---- 描画命令 -----------------------------------------------------------

const escapeText = (s) => {
  for (const ch of s) {
    if (ch.charCodeAt(0) > 0x7e || ch.charCodeAt(0) < 0x20) throw new Error(`non-ASCII in page text: ${JSON.stringify(ch)}`)
  }
  return s.replace(/[\\()]/g, (c) => `\\${c}`)
}

const wrap = (text, width = WRAP) => {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

/** 1ページ分の内容ストリームを組み立てる小さな書き手。 */
class PageWriter {
  constructor() {
    this.ops = []
    this.y = PAGE_H - 80
  }
  text(font, size, x, y, s) {
    this.ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${escapeText(s)}) Tj ET`)
  }
  heading(s, size = 20) {
    this.text('F2', size, MARGIN_X, this.y, s)
    this.y -= size * 1.8
  }
  para(s) {
    for (const line of wrap(s)) {
      this.text('F1', 11, MARGIN_X, this.y, line)
      this.y -= 16
    }
    this.y -= 10
  }
  gap(h) {
    this.y -= h
  }
  footer(page) {
    this.text('F1', 9, PAGE_W / 2 - 12, 40, `- ${page} -`)
  }
  /** 文字列の並びを一つのテキストオブジェクトで書く。[font, size, rise, str|hex] */
  runs(x, y, parts) {
    const body = parts
      .map(([font, size, rise, s, hex]) => {
        const str = hex ? `<${hex}>` : `(${escapeText(s)})`
        return `/${font} ${size} Tf ${rise} Ts ${str} Tj`
      })
      .join(' ')
    this.ops.push(`BT ${x} ${y} Td ${body} 0 Ts ET`)
  }
  line(x1, y1, x2, y2, w = 0.8) {
    this.ops.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`)
  }
  toString() {
    return this.ops.join('\n') + '\n'
  }
}

// Symbol フォントの文字コード（Adobe Symbol encoding）
const SYM = { integral: 'F2', Sigma: '53', alpha: '61', beta: '62', pi: '70', le: 'A3' }

function mathBlock(w) {
  const x = MARGIN_X + 40
  // (1) ∫_0^1 x^2 dx = 1/3
  let y = w.y
  w.runs(x, y, [
    ['F3', 22, -4, '', SYM.integral],
    ['F1', 8, -8, '0'],
    ['F1', 8, 12, '1'],
    ['F4', 13, 0, ' x'],
    ['F1', 9, 6, '2'],
    ['F4', 13, 0, ' dx'],
    ['F1', 13, 0, ' = '],
  ])
  const fx = x + 72
  w.text('F1', 12, fx + 3, y + 8, '1')
  w.line(fx, y + 4, fx + 12, y + 4)
  w.text('F1', 12, fx + 3, y - 8, '3')
  w.text('F1', 11, PAGE_W - MARGIN_X - 20, y, '(1)')
  w.gap(48)

  // (2) Σ_{k=1}^{n} k = n(n+1)/2
  y = w.y
  w.runs(x, y, [
    ['F3', 20, 0, '', SYM.Sigma],
    ['F4', 8, -9, 'k'],
    ['F1', 8, -9, '=1'],
    ['F4', 8, 14, 'n'],
    ['F4', 13, 0, '  k'],
    ['F1', 13, 0, ' = '],
  ])
  const fx2 = x + 70
  w.runs(fx2, y + 8, [
    ['F4', 12, 0, 'n'],
    ['F1', 12, 0, '('],
    ['F4', 12, 0, 'n'],
    ['F1', 12, 0, ' + 1)'],
  ])
  w.line(fx2, y + 4, fx2 + 44, y + 4)
  w.text('F1', 12, fx2 + 18, y - 8, '2')
  w.text('F1', 11, PAGE_W - MARGIN_X - 20, y, '(2)')
  w.gap(48)

  // (3) e^{i π} + 1 = 0,  α ≤ β
  y = w.y
  w.runs(x, y, [
    ['F4', 13, 0, 'e'],
    ['F4', 9, 6, 'i'],
    ['F3', 9, 6, '', SYM.pi],
    ['F1', 13, 0, ' + 1 = 0,     '],
    ['F3', 13, 0, '', SYM.alpha],
    ['F1', 13, 0, ' '],
    ['F3', 13, 0, '', SYM.le],
    ['F1', 13, 0, ' '],
    ['F3', 13, 0, '', SYM.beta],
  ])
  w.text('F1', 11, PAGE_W - MARGIN_X - 20, y, '(3)')
  w.gap(40)
}

function buildPages() {
  const pages = []
  const page = (fill) => {
    const w = new PageWriter()
    fill(w)
    const n = pages.length + 1
    w.gap(6)
    w.text('F1', 11, MARGIN_X, w.y, markerText(n))
    w.footer(n)
    pages.push(w.toString())
  }

  page((w) => {
    w.heading('Chapter 1 Reading Slowly', 24)
    w.heading('1.1 Why Read Slowly', 15)
    w.para(P.slow1)
    w.para(P.slow2)
  })
  page((w) => {
    w.heading('1.2 Building a Model', 15)
    w.para(P.model1)
    w.para(P.model2)
  })
  page((w) => {
    w.para(P.model3)
    w.para(P.model4)
  })
  page((w) => {
    w.heading('Chapter 2 Numbers on the Page', 24)
    w.heading('2.1 Growth', 15)
    w.para(P.growth1)
    w.para(P.growth2)
  })
  page((w) => {
    w.heading('2.2 A Few Formulas', 15)
    w.para(P.formula1)
    w.gap(10)
    mathBlock(w)
    w.para(P.formula2)
  })
  page((w) => {
    w.para(P.formula3)
    w.para(P.formula4)
  })
  page((w) => {
    w.heading('Chapter 3 Summaries', 24)
    w.heading('3.1 In Your Own Words', 15)
    w.para(P.words1)
    w.para(P.words2)
  })
  page((w) => {
    w.heading('3.2 Finding the Gap', 15)
    w.para(P.gap1)
    w.para(P.gap2)
  })
  return pages
}

// ---- PDF の組み立て ------------------------------------------------------

const utf16Hex = (s) => {
  let hex = 'FEFF'
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')
  return `<${hex}>`
}

export function buildFixturePdf() {
  const contents = buildPages()
  const objs = [] // objs[i] は オブジェクト番号 i+1 の本体
  const alloc = () => {
    objs.push(null)
    return objs.length
  }
  const set = (n, body) => {
    objs[n - 1] = body
  }

  const catalog = alloc()
  const pagesRoot = alloc()
  const outlinesRoot = alloc()
  const info = alloc()
  const fonts = {
    F1: ['Helvetica', true],
    F2: ['Helvetica-Bold', true],
    F3: ['Symbol', false],
    F4: ['Times-Italic', true],
  }
  const fontRefs = {}
  for (const [name, [base, winAnsi]] of Object.entries(fonts)) {
    const n = alloc()
    fontRefs[name] = n
    set(n, `<< /Type /Font /Subtype /Type1 /BaseFont /${base}${winAnsi ? ' /Encoding /WinAnsiEncoding' : ''} >>`)
  }
  const fontDict = Object.entries(fontRefs)
    .map(([k, n]) => `/${k} ${n} 0 R`)
    .join(' ')

  const pageRefs = contents.map((stream) => {
    const pageN = alloc()
    const contentN = alloc()
    set(contentN, `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`)
    set(
      pageN,
      `<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << ${fontDict} >> >> /Contents ${contentN} 0 R >>`,
    )
    return pageN
  })
  set(pagesRoot, `<< /Type /Pages /Kids [${pageRefs.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`)

  // アウトライン（2階層）
  const dest = (page) => `[${pageRefs[page - 1]} 0 R /XYZ 0 ${PAGE_H} null]`
  const writeLevel = (items, parent) => {
    const nums = items.map(() => alloc())
    let total = 0
    items.forEach((item, i) => {
      const fields = [`/Title (${escapeText(item.title)})`, `/Parent ${parent} 0 R`, `/Dest ${dest(item.page)}`]
      if (i > 0) fields.push(`/Prev ${nums[i - 1]} 0 R`)
      if (i < items.length - 1) fields.push(`/Next ${nums[i + 1]} 0 R`)
      if (item.children?.length) {
        const child = writeLevel(item.children, nums[i])
        fields.push(`/First ${child.first} 0 R /Last ${child.last} 0 R /Count ${child.count}`)
        total += child.count
      }
      set(nums[i], `<< ${fields.join(' ')} >>`)
      total += 1
    })
    return { first: nums[0], last: nums[nums.length - 1], count: total }
  }
  const top = writeLevel(OUTLINE, outlinesRoot)
  set(outlinesRoot, `<< /Type /Outlines /First ${top.first} 0 R /Last ${top.last} 0 R /Count ${top.count} >>`)

  set(catalog, `<< /Type /Catalog /Pages ${pagesRoot} 0 R /Outlines ${outlinesRoot} 0 R /PageMode /UseOutlines >>`)
  set(info, `<< /Title ${utf16Hex(BOOK_TITLE)} /Producer (book-companion scripts/make-fixture.mjs) >>`)

  // 本体を書き、xref を作る
  let out = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n'
  const offsets = []
  objs.forEach((body, i) => {
    if (body == null) throw new Error(`object ${i + 1} was never set`)
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefAt = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
  const id = createHash('md5').update(out, 'latin1').digest('hex').toUpperCase()
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R /ID [<${id}> <${id}>] >>\n`
  out += `startxref\n${xrefAt}\n%%EOF\n`
  return new Uint8Array(Buffer.from(out, 'latin1'))
}

// ---- CLI -----------------------------------------------------------------

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bytes = buildFixturePdf()
  if (process.argv.includes('--check')) {
    let current
    try {
      current = readFileSync(FIXTURE_PATH)
    } catch {
      console.error(`missing: ${FIXTURE_PATH}`)
      process.exit(1)
    }
    if (!Buffer.from(bytes).equals(current)) {
      console.error('fixture is out of date: run `npm run fixtures`')
      process.exit(1)
    }
    console.log('fixture is up to date')
  } else {
    mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
    writeFileSync(FIXTURE_PATH, bytes)
    const sha = createHash('sha256').update(bytes).digest('hex')
    console.log(`wrote ${FIXTURE_PATH} (${bytes.length} bytes, sha256 ${sha})`)
  }
}
