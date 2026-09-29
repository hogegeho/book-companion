import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { APP_VERSION } from './version.ts'

// jsdom では pdf.js と Service Worker を動かさない（描画と登録は E2E で確かめる）
vi.mock('./pdf/pdfjs.ts', () => ({ openPdf: vi.fn(), pdfTitle: vi.fn(), closePdf: vi.fn() }))
vi.mock('./pwa.ts', () => ({ checkForUpdate: vi.fn(async () => 'latest'), startServiceWorker: vi.fn() }))

const { default: App } = await import('./App.tsx')

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ version: '9.9.9', sha: 'abc1234', builtAt: '2026-09-30T00:00:00Z' }))),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

test('本とAIの帯を左右に並べ、本が無ければ「PDFを開く」を出す', async () => {
  render(<App />)
  expect(screen.getByRole('main', { name: '本' })).toBeTruthy()
  expect(screen.getByRole('complementary', { name: 'AIの帯' })).toBeTruthy()
  expect(await screen.findByLabelText('PDFを開く')).toBeTruthy()
})

test('版番号が見え、押すと変更履歴の画面が開き、閉じられる', async () => {
  render(<App />)
  const version = screen.getByRole('button', { name: /変更履歴を開く/ })
  expect(version.textContent).toContain(`v${APP_VERSION}`)

  fireEvent.click(version)
  const dialog = screen.getByRole('dialog', { name: '変更履歴' })
  expect(within(dialog).getByTestId('running-version').textContent).toContain(`v${APP_VERSION}`)
  // 公開中の最新版（version.json）と比べて、新しい版があると知らせる
  expect((await within(dialog).findByTestId('latest-version')).textContent).toContain('v9.9.9')
  expect(within(dialog).getByText('新しい版があります')).toBeTruthy()
  // 更新を確認
  fireEvent.click(within(dialog).getByRole('button', { name: '更新を確認' }))
  expect(await within(dialog).findByText('この端末の版が最新です。')).toBeTruthy()

  fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('前回と版が変わっていたら「更新しました」を一度だけ出す', () => {
  localStorage.setItem('lastSeenVersion', '0.0.1')
  const { unmount } = render(<App />)
  expect(screen.getByText(`v${APP_VERSION} に更新しました。`)).toBeTruthy()
  unmount()
  render(<App />)
  expect(screen.queryByText(`v${APP_VERSION} に更新しました。`)).toBeNull()
})

test('初めて開いたときは「更新しました」を出さない', () => {
  render(<App />)
  expect(screen.queryByText(/に更新しました/)).toBeNull()
})
