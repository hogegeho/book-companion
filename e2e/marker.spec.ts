import { expect, test, type Page } from '@playwright/test'
import { FIXTURE_PATH, markerText } from '../scripts/make-fixture.mjs'

type Box = { x: number; y: number; width: number; height: number }

const renderedPage = (page: Page) => page.locator('.pdf-page[data-rendered="true"]')

async function openFixture(page: Page) {
  await page.goto('./')
  await page.getByLabel('PDFを開く').setInputFiles(FIXTURE_PATH)
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '1')
}

/** 文字層で、ある文字列が描かれている範囲（client 座標） */
async function textBox(page: Page, needle: string): Promise<Box> {
  return page.evaluate((needle) => {
    for (const span of document.querySelectorAll('.textLayer span')) {
      const node = [...span.childNodes].find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined
      const i = node?.data.indexOf(needle) ?? -1
      if (node && i >= 0) {
        const range = document.createRange()
        range.setStart(node, i)
        range.setEnd(node, i + needle.length)
        const r = range.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }
    }
    throw new Error(`not in text layer: ${needle}`)
  }, needle)
}

/** 文字層で、ある文字列の各文字が描かれている範囲（client 座標） */
async function charBoxes(page: Page, needle: string): Promise<Box[]> {
  return page.evaluate((needle) => {
    for (const span of document.querySelectorAll('.textLayer span')) {
      const node = [...span.childNodes].find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined
      const at = node?.data.indexOf(needle) ?? -1
      if (node && at >= 0) {
        const range = document.createRange()
        return [...needle].map((_, i) => {
          range.setStart(node, at + i)
          range.setEnd(node, at + i + 1)
          const r = range.getBoundingClientRect()
          return { x: r.x, y: r.y, width: r.width, height: r.height }
        })
      }
    }
    throw new Error(`not in text layer: ${needle}`)
  }, needle)
}

const center = (b: Box): [number, number] => [b.x + b.width / 2, b.y + b.height / 2]
const contains = (b: Box, [x, y]: [number, number]) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height

/** 指でなぞる（CDP のタッチ入力。pointerType は touch になり、touch-action も効く） */
async function fingerDrag(page: Page, from: [number, number], to: [number, number], steps = 12) {
  const cdp = await page.context().newCDPSession(page)
  const at = (t: number) => ({ x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(0)] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(i / steps)] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/** 語の最初の文字の中心から最後の文字の中心までなぞる（フォント差に左右されない） */
async function traceWord(page: Page, word: string) {
  const chars = await charBoxes(page, word)
  await fingerDrag(page, center(chars[0]!), center(chars[chars.length - 1]!))
}

/** 印が "AMBER" の5文字の上にだけある：各文字の中心を含み、前後の文字（": " の空白と "."）の中心は含まない */
async function expectMarkOnAmber(page: Page) {
  const marks = await highlightBoxes(page)
  expect(marks).toHaveLength(1)
  const chars = await charBoxes(page, ' AMBER.')
  const [before, ...rest] = chars
  const after = rest.pop()!
  for (const c of rest) expect(contains(marks[0]!, center(c)), 'AMBER の各文字の上').toBe(true)
  expect(contains(marks[0]!, center(before!)), '前の空白は含まない').toBe(false)
  expect(contains(marks[0]!, center(after)), '後ろの "." は含まない').toBe(false)
  // 高さも行に合っている
  expectSameBox({ ...marks[0]!, x: 0, width: 1 }, { ...(await textBox(page, 'AMBER')), x: 0, width: 1 }, 2)
}

const highlightBoxes = (page: Page) =>
  page.locator('.marker-layer rect.passage').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }),
  )

function expectSameBox(actual: Box, expected: Box, tolerancePx: number) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerancePx)
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerancePx)
  expect(Math.abs(actual.x + actual.width - (expected.x + expected.width))).toBeLessThanOrEqual(tolerancePx)
  expect(Math.abs(actual.y + actual.height - (expected.y + expected.height))).toBeLessThanOrEqual(tolerancePx)
}

test('マーカーモードで擬似ドラッグ → 期待文字列が選ばれ、倍率を変えても線が同じ文字の上にある', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'マーカー' }).click()
  await expect(page.getByRole('button', { name: 'マーカー' })).toHaveAttribute('aria-pressed', 'true')

  // 目印の行の "AMBER" をなぞる
  await traceWord(page, 'AMBER')
  const card = page.getByRole('region', { name: '選んだ一節' })
  await expect(card.locator('blockquote')).toHaveText('AMBER')
  await expect(card).toContainText('p.1')

  // 印が "AMBER" の上にある
  await expectMarkOnAmber(page)

  // 拡大 → 描き直し後も、印は同じ文字の上
  for (const button of ['拡大', '拡大', '縮小', '縮小', '縮小']) {
    const before = await page.getByLabel('倍率').textContent()
    await page.getByRole('button', { name: button, exact: true }).click()
    await expect(page.getByLabel('倍率')).not.toHaveText(before!)
    await expect(renderedPage(page)).toBeVisible()
    await expectMarkOnAmber(page)
  }
})

test('二行にまたがってなぞると、読む順の範囲が選ばれる', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'マーカー' }).click()
  // 1ページ目の本文 1行目の "moves slowly" から 2行目の "careful reader" まで
  const a = await charBoxes(page, 'moves slowly')
  const b = await charBoxes(page, 'careful reader')
  await fingerDrag(page, center(a[0]!), center(b[b.length - 1]!), 20)
  const text = await page.getByRole('region', { name: '選んだ一節' }).locator('blockquote').textContent()
  expect(text).toBe('moves slowly is not wasting time. Each sentence is a small claim, and\na careful reader')
  expect(await highlightBoxes(page)).toHaveLength(2)
})

test('マーカーモードでないときは、なぞっても選ばれない（なぞった指でページも動かない）', async ({ page }) => {
  await openFixture(page)
  await traceWord(page, 'AMBER')
  await expect(page.getByRole('region', { name: '選んだ一節' })).toHaveCount(0)
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '1')
})

test('マーカーモード中も左端のタップでページを送れ、印は元のページにだけ出る', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'マーカー' }).click()
  await traceWord(page, 'AMBER')
  await expect(page.locator('.marker-layer rect.passage')).toHaveCount(1)

  const next = page.getByRole('navigation', { name: 'ページ送り（左端）' }).getByRole('button', { name: '次へ' })
  const box = (await next.boundingBox())!
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '2')
  await expect(page.locator('.marker-layer rect.passage')).toHaveCount(0)
  // 帯には選んだ一節が残っている
  await expect(page.getByRole('region', { name: '選んだ一節' }).locator('blockquote')).toHaveText('AMBER')

  // 2ページ目でも、なぞれば選び直せる
  await traceWord(page, 'BIRCH')
  await expect(page.getByRole('region', { name: '選んだ一節' }).locator('blockquote')).toHaveText('BIRCH')
  await expect(page.getByRole('region', { name: '選んだ一節' })).toContainText('p.2')
  expect(markerText(2)).toContain('BIRCH')
})

test('選択を消せる', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'マーカー' }).click()
  await traceWord(page, 'AMBER')
  await page.getByRole('button', { name: '選択を消す' }).click()
  await expect(page.getByRole('region', { name: '選んだ一節' })).toHaveCount(0)
  await expect(page.locator('.marker-layer rect.passage')).toHaveCount(0)
})
