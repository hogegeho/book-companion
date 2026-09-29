import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

// jsdom では pdf.js を動かさない（描画は E2E で確かめる）
vi.mock('./pdf/pdfjs.ts', () => ({ openPdf: vi.fn(), pdfTitle: vi.fn(), closePdf: vi.fn() }))

const { default: App } = await import('./App.tsx')

test('本とAIの帯を左右に並べ、本が無ければ「PDFを開く」を出す', async () => {
  render(<App />)
  expect(screen.getByRole('main', { name: '本' })).toBeTruthy()
  expect(screen.getByRole('complementary', { name: 'AIの帯' })).toBeTruthy()
  expect(await screen.findByLabelText('PDFを開く')).toBeTruthy()
})
