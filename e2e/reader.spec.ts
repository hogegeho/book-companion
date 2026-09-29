import { expect, test, type Page } from '@playwright/test'
import { FIXTURE_PATH, markerText } from '../scripts/make-fixture.mjs'

const renderedPage = (page: Page) => page.locator('.pdf-page[data-rendered="true"]')

async function openFixture(page: Page) {
  await page.goto('./')
  await page.getByLabel('PDFを開く').setInputFiles(FIXTURE_PATH)
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '1')
}

test('fixture を開く → 3ページ目へ → 再読み込み → 3ページ目が出る', async ({ page }) => {
  await openFixture(page)
  await expect(page.getByText('テスト用の本 Fixture Book')).toBeVisible()
  await expect(page.getByLabel('全ページ数')).toHaveText('/ 8')

  // ボタンとキーボード、両方でページを送る
  await page.getByRole('button', { name: '次のページ' }).click()
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '2')
  await page.keyboard.press('ArrowRight')
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '3')
  await expect(page.getByLabel('ページ番号')).toHaveValue('3')

  await page.reload()
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '3')
  await expect(page.locator('.textLayer')).toContainText(markerText(3))
})

test('文字層から既知の文字列が取れる', async ({ page }) => {
  await openFixture(page)
  const textLayer = page.locator('.textLayer')
  await expect(textLayer).toContainText(markerText(1))
  await expect(textLayer).toContainText('Chapter 1 Reading Slowly')

  // ページ番号を直接入れて飛ぶ
  await page.getByLabel('ページ番号').fill('5')
  await page.getByLabel('ページ番号').press('Enter')
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '5')
  await expect(textLayer).toContainText(markerText(5))
  await expect(textLayer).toContainText('∫')
})

test('拡大縮小すると canvas と文字層が一緒に大きさを変える', async ({ page }) => {
  await openFixture(page)
  const pdfPage = renderedPage(page)
  const marker = page.locator('.textLayer span', { hasText: markerText(1) })

  await page.getByRole('button', { name: '幅に合わせる' }).click()
  const before = (await pdfPage.boundingBox())!
  const markerBefore = (await marker.boundingBox())!

  await page.getByRole('button', { name: '拡大' }).click()
  await expect(pdfPage).toHaveAttribute('data-rendered', 'true')
  const scaleText = await page.getByLabel('倍率').textContent()
  const after = (await pdfPage.boundingBox())!
  const markerAfter = (await marker.boundingBox())!

  expect(after.width).toBeGreaterThan(before.width)
  // 文字層の文字も同じ比率で動く（ページ左上からの相対位置が保たれる）
  const k = after.width / before.width
  expect((markerAfter.x - after.x) / (markerBefore.x - before.x)).toBeCloseTo(k, 1)
  expect((markerAfter.y - after.y) / (markerBefore.y - before.y)).toBeCloseTo(k, 1)

  // canvas の画素数も倍率に追従する
  const canvasWidth = await pdfPage.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width)
  const dpr = await page.evaluate(() => window.devicePixelRatio)
  expect(canvasWidth).toBe(Math.floor((595 * Number.parseInt(scaleText!)) / 100 * dpr))
})

test('PDFでないファイルは断る', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('PDFを開く').setInputFiles({ name: 'note.pdf', mimeType: 'application/pdf', buffer: Buffer.from('hello') })
  await expect(page.getByRole('alert')).toContainText('PDFとして読めませんでした')
})

test('左端の透明な押し場所をタップしてページを送り・戻す（表示幅は削らない）', async ({ page }) => {
  await openFixture(page)
  const edge = page.getByRole('navigation', { name: 'ページ送り（左端）' })
  const next = edge.getByRole('button', { name: '次へ' })
  const prev = edge.getByRole('button', { name: '前へ' })

  // 本の表示部分の左端に重なっていて、ページのスクロール領域の幅を削っていない
  const scroll = (await page.locator('.page-scroll').boundingBox())!
  const nextBox = (await next.boundingBox())!
  const prevBox = (await prev.boundingBox())!
  expect(Math.abs(nextBox.x - scroll.x)).toBeLessThan(1)
  expect(nextBox.x + nextBox.width).toBeLessThan(scroll.x + scroll.width)
  const main = (await page.getByRole('main', { name: '本' }).boundingBox())!
  expect(Math.abs(scroll.width - main.width)).toBeLessThan(1)
  // 「次へ」は「前へ」より広く、下側にある
  expect(nextBox.height).toBeGreaterThan(prevBox.height)
  expect(nextBox.y).toBeGreaterThan(prevBox.y)

  // 指でタップ
  await page.touchscreen.tap(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2)
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '2')
  await page.touchscreen.tap(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2)
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '3')
  await page.touchscreen.tap(prevBox.x + prevBox.width / 2, prevBox.y + prevBox.height / 2)
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '2')
})

test('既定は「ページ全体」：横持ちでページが縦にも横にも収まり、操作はAIの帯にある', async ({ page }) => {
  await openFixture(page)
  await expect(page.getByRole('button', { name: 'ページ全体' })).toHaveAttribute('aria-pressed', 'true')
  const scroll = page.locator('.page-scroll')
  const fits = await scroll.evaluate((el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth)
  expect(fits).toBe(true)

  // ページ番号・倍率・マーカーは帯の中、本の領域には無い
  const strip = page.getByRole('complementary', { name: 'AIの帯' })
  await expect(strip.getByRole('toolbar', { name: '本の操作' })).toBeVisible()
  await expect(strip.getByLabel('ページ番号')).toBeVisible()
  await expect(page.getByRole('main', { name: '本' }).getByRole('toolbar')).toHaveCount(0)

  // 幅に合わせると大きくなり、全体に戻せる
  const before = (await renderedPage(page).boundingBox())!.width
  await page.getByRole('button', { name: '幅に合わせる' }).click()
  await expect.poll(async () => (await renderedPage(page).boundingBox())?.width ?? 0).toBeGreaterThan(before)
  await page.getByRole('button', { name: 'ページ全体' }).click()
  await expect.poll(async () => Math.round((await renderedPage(page).boundingBox())?.width ?? 0)).toBe(Math.round(before))
})
