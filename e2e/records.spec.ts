import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { FIXTURE_PATH } from '../scripts/make-fixture.mjs'

const renderedPage = (page: Page) => page.locator('.pdf-page[data-rendered="true"]')

async function openFixture(page: Page) {
  await page.goto('./')
  await page.getByLabel('PDFを開く').setInputFiles(FIXTURE_PATH)
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '1')
}

async function goToPage(page: Page, n: number) {
  await page.getByLabel('ページ番号').fill(String(n))
  await page.getByLabel('ページ番号').press('Enter')
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', String(n))
}

/** 文字の中心から中心へ指でなぞる */
async function traceWord(page: Page, word: string) {
  const [a, b] = await page.evaluate((word) => {
    for (const span of document.querySelectorAll('.textLayer span')) {
      const node = [...span.childNodes].find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined
      const at = node?.data.indexOf(word) ?? -1
      if (node && at >= 0) {
        const r = document.createRange()
        const c = (i: number) => {
          r.setStart(node, at + i)
          r.setEnd(node, at + i + 1)
          const b = r.getBoundingClientRect()
          return [b.x + b.width / 2, b.y + b.height / 2]
        }
        return [c(0), c(word.length - 1)]
      }
    }
    throw new Error(word)
  }, word)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a![0]!, y: a![1]! }] })
  for (let i = 1; i <= 10; i++) {
    const t = i / 10
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: a![0]! + (b![0]! - a![0]!) * t, y: a![1]! + (b![1]! - a![1]!) * t }],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

const summaryBox = (page: Page, section: string) =>
  page.getByRole('region', { name: `節のまとめ：${section}` }).getByRole('textbox')

async function writeSummary(page: Page, section: string, text: string) {
  await summaryBox(page, section).fill(text)
  await expect(page.getByRole('region', { name: `節のまとめ：${section}` }).getByRole('status')).toHaveText('保存しました')
}

test('まとめは節の終わりのページに出て、節に紐づいて再表示される', async ({ page }) => {
  await openFixture(page)
  // 1.1 は 1ページで終わる。1.2 は 2〜3ページで、2ページには出ない
  await expect(page.getByRole('region', { name: '節のまとめ：1.1 Why Read Slowly' })).toBeVisible()
  await goToPage(page, 2)
  await expect(page.getByRole('region', { name: /節のまとめ/ })).toHaveCount(0)

  await goToPage(page, 3)
  await writeSummary(page, '1.2 Building a Model', '問いを持って読むと、本文の部品どうしの関係が見えてくる。')
  await goToPage(page, 6)
  await expect(summaryBox(page, '2.2 A Few Formulas')).toHaveValue('')
  await writeSummary(page, '2.2 A Few Formulas', '式は自分で小さな値を入れて確かめる。')

  await goToPage(page, 3)
  await expect(summaryBox(page, '1.2 Building a Model')).toHaveValue('問いを持って読むと、本文の部品どうしの関係が見えてくる。')
  await page.reload()
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '3')
  await expect(summaryBox(page, '1.2 Building a Model')).toHaveValue('問いを持って読むと、本文の部品どうしの関係が見えてくる。')
  await goToPage(page, 6)
  await expect(summaryBox(page, '2.2 A Few Formulas')).toHaveValue('式は自分で小さな値を入れて確かめる。')
})

test('書き出し → 全消去 → 読み込みで、印・まとめ・読み位置が戻り、API キーは書き出されない', async ({ page }, testInfo) => {
  await openFixture(page)
  // 端末に API キーがある状態にする（設定画面は段5なので、直接入れる）
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('book-companion')
        req.onsuccess = () => {
          const tx = req.result.transaction('settings', 'readwrite')
          tx.objectStore('settings').put({ key: 'apiKey', value: 'sk-ant-e2e-secret' })
          tx.oncomplete = () => (req.result.close(), resolve())
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      }),
  )

  await page.getByRole('button', { name: 'マーカー' }).click()
  await traceWord(page, 'AMBER')
  await expect(page.getByRole('region', { name: '選んだ一節' })).toBeVisible()
  await goToPage(page, 3)
  await writeSummary(page, '1.2 Building a Model', 'モデルは先を予測できるもの。')

  // 書き出す
  await page.getByRole('button', { name: 'データ' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '書き出す' }).click()])
  const file = testInfo.outputPath('backup.json')
  await download.saveAs(file)
  const json = readFileSync(file, 'utf8')
  expect(json).not.toContain('sk-ant-e2e-secret')
  expect(json).not.toContain('apiKey')
  const backup = JSON.parse(json)
  expect(backup.highlights).toHaveLength(1)
  expect(backup.highlights[0].text).toBe('AMBER.')
  expect(backup.summaries[0].body).toBe('モデルは先を予測できるもの。')
  expect(backup.books[0].lastPage).toBe(3)

  // 全消去（起動し直すと、本の記録が無いので空の画面になる）
  await page.getByRole('button', { name: '記録をすべて消す' }).click()
  await page.getByRole('alertdialog', { name: '確認' }).getByRole('button', { name: '消す' }).click()
  await expect(page.getByText('PDFを開くと、ここに本が表示されます。')).toBeVisible()

  // 読み込む（PDF 本体は端末に残っているので、本と読み位置がそのまま戻る）
  await page.getByRole('button', { name: 'データ' }).click()
  await page.getByLabel('読み込む').setInputFiles(file)
  await page.getByRole('alertdialog', { name: '確認' }).getByRole('button', { name: '置き換える' }).click()
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '3')
  await expect(summaryBox(page, '1.2 Building a Model')).toHaveValue('モデルは先を予測できるもの。')
  await goToPage(page, 1)
  await expect(page.locator('.marker-layer rect.saved')).toHaveCount(1)

  // API キーは端末に残っている（消去でも消さず、読み込みでも上書きしない）
  const key = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('book-companion')
        req.onsuccess = () => {
          const get = req.result.transaction('settings').objectStore('settings').get('apiKey')
          get.onsuccess = () => (req.result.close(), resolve(get.result?.value))
        }
      }),
  )
  expect(key).toBe('sk-ant-e2e-secret')
})
