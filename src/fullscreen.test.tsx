import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { resetFullscreenOptOut, useFullscreen } from './fullscreen.ts'

function Probe() {
  const fs = useFullscreen()
  return (
    <div>
      {fs.supported ? (
        <button className="fullscreen-button" onClick={() => void fs.toggle()}>
          {fs.active ? 'on' : 'off'}
        </button>
      ) : (
        <p>unsupported</p>
      )}
      <p data-testid="page">本のページ</p>
    </div>
  )
}

/** displayMode: 'browser'（Chrome のタブ）か、ホーム画面から起動したときの 'standalone' など */
function stubFullscreen(enabled: boolean, displayMode = 'browser') {
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
    (q: string) =>
      ({ matches: q === `(display-mode: ${displayMode})`, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  )
  return {
    /** OS 側で全画面が解けた（バックグラウンドへ行った等） */
    leaveBySystem: () => {
      element = null
      document.dispatchEvent(new Event('fullscreenchange'))
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  resetFullscreenOptOut()
})

test('ボタンで全画面に入り、もう一度押すと抜ける', async () => {
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

test('アプリとして起動しているときは、最初のタップで全画面に入る', async () => {
  stubFullscreen(true, 'standalone')
  render(<Probe />)
  expect(screen.getByRole('button').textContent).toBe('off')
  await act(async () => fireEvent.pointerUp(screen.getByTestId('page')))
  expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button').textContent).toBe('on')
})

test('バックグラウンドから戻って全画面が解けていたら、次のタップで入り直す', async () => {
  const fs = stubFullscreen(true, 'standalone')
  render(<Probe />)
  await act(async () => fireEvent.pointerUp(screen.getByTestId('page')))
  act(() => fs.leaveBySystem())
  expect(screen.getByRole('button').textContent).toBe('off')
  await act(async () => fireEvent.pointerUp(screen.getByTestId('page')))
  expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(2)
})

test('「全画面を終わる」を押したら、この起動のあいだは自動で入り直さない', async () => {
  stubFullscreen(true, 'standalone')
  render(<Probe />)
  await act(async () => fireEvent.pointerUp(screen.getByTestId('page')))
  await act(async () => screen.getByRole('button').click()) // 終わる
  await act(async () => fireEvent.pointerUp(screen.getByTestId('page')))
  expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button').textContent).toBe('off')
})

test('Chrome のタブ（アプリとして起動していない）では自動で入らない', async () => {
  stubFullscreen(true, 'browser')
  render(<Probe />)
  await act(async () => fireEvent.pointerUp(screen.getByTestId('page')))
  expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled()
})

test('全画面ボタン自身のタップでは自動で入らない（ボタンの処理に任せる）', async () => {
  stubFullscreen(true, 'standalone')
  render(<Probe />)
  await act(async () => fireEvent.pointerUp(screen.getByRole('button')))
  expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled()
})
