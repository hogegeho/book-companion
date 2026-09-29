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
