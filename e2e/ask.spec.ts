import { expect, test, type Page, type Route } from '@playwright/test'
import { FIXTURE_PATH } from '../scripts/make-fixture.mjs'

// Claude API は呼ばない。api.anthropic.com への通信は page.route で受けて、決めた答えを返す。

const renderedPage = (page: Page) => page.locator('.pdf-page[data-rendered="true"]')
const FAKE_KEY = 'sk-ant-test-0000'

async function openFixture(page: Page) {
  await page.goto('./')
  await page.getByLabel('PDFを開く').setInputFiles(FIXTURE_PATH)
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '1')
}

async function setApiKey(page: Page) {
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByPlaceholder('sk-ant-…').fill(FAKE_KEY)
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('保存しました')
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click()
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

const message = (json: unknown) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-test',
  content: [{ type: 'text', text: JSON.stringify(json) }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
})

/** 届いた要求を記録し、reply の返す内容で答える */
async function mockApi(page: Page, reply: (route: Route) => Promise<void>) {
  const requests: { headers: Record<string, string>; body: string }[] = []
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    requests.push({ headers: route.request().headers(), body: route.request().postData() ?? '' })
    await reply(route)
  })
  return requests
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-expose-headers': '*',
}

test('なぞって定型の質問を押すと、二段の答えが帯に出る', async ({ page }) => {
  const requests = await mockApi(page, (route) =>
    route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify(
        message({ speech: 'AMBER は目印の語です。', detail: '**目印**として置かれた語。', figure: null, concepts: ['目印'] }),
      ),
    }),
  )
  await openFixture(page)
  await setApiKey(page)
  await page.getByRole('button', { name: 'マーカー' }).click()
  await traceWord(page, 'AMBER')
  const card = page.getByRole('region', { name: '選んだ一節' })
  await card.getByRole('button', { name: 'どういう意味？' }).click()

  const qa = card.getByRole('article', { name: '問い：どういう意味？' })
  await expect(qa.locator('.answer-speech')).toHaveText('AMBER は目印の語です。')
  await expect(qa.locator('.answer-detail strong')).toHaveText('目印')
  await expect(qa.getByRole('list', { name: '鍵になる概念' })).toHaveText('目印')

  expect(requests).toHaveLength(1)
  expect(requests[0]!.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  expect(requests[0]!.headers['x-api-key']).toBe(FAKE_KEY)
  expect(requests[0]!.body).toContain('AMBER')
  expect(requests[0]!.body).toContain('どういう意味？')
})

test('429 は待ってからもう一度と伝え、キーを画面に出さない', async ({ page }) => {
  await mockApi(page, (route) =>
    route.fulfill({
      status: 429,
      headers: { ...CORS, 'retry-after': '1' },
      contentType: 'application/json',
      body: JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'rate limited' } }),
    }),
  )
  await openFixture(page)
  await setApiKey(page)
  await page.getByRole('button', { name: 'マーカー' }).click()
  await traceWord(page, 'AMBER')
  const card = page.getByRole('region', { name: '選んだ一節' })
  await card.getByLabel('自分の言葉で質問').fill('これは何？')
  await card.getByRole('button', { name: '送る' }).click()
  await expect(card.getByRole('alert')).toContainText('1秒ほど待ってから')
  await expect(page.locator('body')).not.toContainText(FAKE_KEY)
  // 書いた質問は消えずに残る
  await expect(card.getByLabel('自分の言葉で質問')).toHaveValue('これは何？')
})

test('通信断は、つながりを確かめるよう伝える', async ({ page }) => {
  await mockApi(page, (route) => route.abort('internetdisconnected'))
  await openFixture(page)
  await setApiKey(page)
  await page.getByRole('button', { name: 'マーカー' }).click()
  await traceWord(page, 'AMBER')
  const card = page.getByRole('region', { name: '選んだ一節' })
  await card.getByRole('button', { name: '具体例は？' }).click()
  await expect(card.getByRole('alert')).toContainText('通信できませんでした')
})

test('まとめに「抜けを一つ」もらい、節に紐づいて残る', async ({ page }) => {
  const requests = await mockApi(page, (route) =>
    route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify(message({ gap: 'ゆっくり読む理由が抜けています。' })),
    }),
  )
  await openFixture(page)
  await setApiKey(page)
  const region = page.getByRole('region', { name: '節のまとめ：1.1 Why Read Slowly' })
  await region.getByRole('textbox').fill('ゆっくり読むとよい。')
  await region.getByRole('button', { name: '抜けを一つ聞く' }).click()
  await expect(region.getByLabel('抜けの指摘')).toContainText('ゆっくり読む理由が抜けています。')
  expect(requests[0]!.body).toContain('ゆっくり読むとよい。')

  await page.reload()
  await expect(renderedPage(page)).toHaveAttribute('data-page-number', '1')
  await expect(page.getByRole('region', { name: '節のまとめ：1.1 Why Read Slowly' }).getByLabel('抜けの指摘')).toContainText(
    'ゆっくり読む理由が抜けています。',
  )
})

test('API キーが無ければ、質問欄の代わりに設定への案内を出す', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'マーカー' }).click()
  await traceWord(page, 'AMBER')
  const card = page.getByRole('region', { name: '選んだ一節' })
  await expect(card.getByRole('form', { name: '質問する' })).toHaveCount(0)
  await expect(card).toContainText('API キーを入れてください')
})
