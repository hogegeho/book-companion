import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useFullscreen } from './fullscreen.ts'

function Probe() {
  const fs = useFullscreen()
  return fs.supported ? <button onClick={() => void fs.toggle()}>{fs.active ? 'on' : 'off'}</button> : <p>unsupported</p>
}

function stubFullscreen(enabled: boolean, displayModeFullscreen = false) {
  let element: Element | null = null
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => enabled })
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element })
  document.documentElement.requestFullscreen = vi.fn(async () => {
    element = document.documentElement
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  document.exitFullscreen = vi.fn(async () => {
    element = null
    document.dispatchEvent(new Event('fullscreenchange'))
  })
  window.matchMedia = vi.fn(
    () => ({ matches: displayModeFullscreen, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('全画面に入り、もう一度押すと抜ける', async () => {
  stubFullscreen(true)
  render(<Probe />)
  const button = screen.getByRole('button')
  expect(button.textContent).toBe('off')
  await act(async () => button.click())
  expect(document.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' })
  expect(button.textContent).toBe('on')
  await act(async () => button.click())
  expect(document.exitFullscreen).toHaveBeenCalled()
  expect(button.textContent).toBe('off')
})

test('Fullscreen API が無い環境ではボタンを出さない', () => {
  stubFullscreen(false)
  render(<Probe />)
  expect(screen.getByText('unsupported')).toBeTruthy()
})

test('ホーム画面から全画面で起動しているときはボタンを出さない', () => {
  stubFullscreen(true, true)
  render(<Probe />)
  expect(screen.getByText('unsupported')).toBeTruthy()
})
