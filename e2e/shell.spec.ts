import { expect, test } from '@playwright/test'

test('アプリが開き、本とAIの帯が並ぶ', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('Book Companion')
  const book = page.getByRole('main', { name: '本' })
  const strip = page.getByRole('complementary', { name: 'AIの帯' })
  await expect(book).toBeVisible()
  await expect(strip).toBeVisible()
  // 左に本、右に帯
  const b = (await book.boundingBox())!
  const s = (await strip.boundingBox())!
  expect(b.x + b.width).toBeLessThanOrEqual(s.x + 1)
})

test('manifest がリンクされ、Service Worker が登録される', async ({ page }) => {
  await page.goto('./')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const res = await page.request.get(new URL(href!, page.url()).href)
  expect(res.ok()).toBe(true)
  const manifest = await res.json()
  expect(manifest.start_url).toBe('/book-companion/')

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(new URL(scope).pathname).toBe('/book-companion/')
})
