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

test('「全画面」でブラウザの枠を隠し、もう一度押すと戻る', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '全画面', exact: true }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true)
  await page.getByRole('button', { name: '全画面を終わる' }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await expect(page.getByRole('button', { name: '全画面', exact: true })).toBeVisible()
})

test('manifest はホーム画面からの起動を全画面にする', async ({ page }) => {
  await page.goto('./')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifest = await (await page.request.get(new URL(href!, page.url()).href)).json()
  expect(manifest.display).toBe('fullscreen')
})

test('版番号が見え、変更履歴の画面で公開中の版と比べられる', async ({ page }) => {
  await page.goto('./')
  const version = page.getByRole('button', { name: /変更履歴を開く/ })
  await expect(version).toBeVisible()
  const label = (await version.textContent())!
  expect(label).toMatch(/^v\d+\.\d+\.\d+ · \w+$/)

  // version.json が出ていて、画面の版と一致する
  const res = await page.request.get('version.json')
  expect(res.ok()).toBe(true)
  const latest = await res.json()
  expect(label).toBe(`v${latest.version} · ${latest.sha}`)

  await version.click()
  const dialog = page.getByRole('dialog', { name: '変更履歴' })
  await expect(dialog.getByTestId('running-version')).toHaveText(label)
  await expect(dialog.getByTestId('latest-version')).toHaveText(label)
  await expect(dialog.getByText(`v${latest.version}`, { exact: false }).first()).toBeVisible()
  await dialog.getByRole('button', { name: '更新を確認' }).click()
  await expect(dialog.getByRole('status')).toHaveText('この端末の版が最新です。')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
