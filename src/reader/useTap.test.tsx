import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useTap } from './useTap.ts'

function TapButton({ action }: { action: () => void }) {
  return <button {...useTap(action)}>go</button>
}

test('指のタップは pointerup で一度だけ動く（あとから来る click は捨てる）', () => {
  const action = vi.fn()
  render(<TapButton action={action} />)
  const b = screen.getByRole('button')
  fireEvent.pointerDown(b, { pointerId: 7, pointerType: 'touch' })
  fireEvent.pointerUp(b, { pointerId: 7, pointerType: 'touch' })
  expect(action).toHaveBeenCalledTimes(1)
  fireEvent.click(b)
  expect(action).toHaveBeenCalledTimes(1)
})

test('click が来なくても指のタップで動く', () => {
  const action = vi.fn()
  render(<TapButton action={action} />)
  const b = screen.getByRole('button')
  fireEvent.pointerDown(b, { pointerId: 1, pointerType: 'touch' })
  fireEvent.pointerUp(b, { pointerId: 1, pointerType: 'touch' })
  expect(action).toHaveBeenCalledTimes(1)
})

test('指が滑って pointercancel になったら動かない', () => {
  const action = vi.fn()
  render(<TapButton action={action} />)
  const b = screen.getByRole('button')
  fireEvent.pointerDown(b, { pointerId: 2, pointerType: 'touch' })
  fireEvent.pointerCancel(b, { pointerId: 2, pointerType: 'touch' })
  fireEvent.pointerUp(b, { pointerId: 2, pointerType: 'touch' })
  expect(action).not.toHaveBeenCalled()
})

test('マウスとキーボードは click で動く', () => {
  const action = vi.fn()
  render(<TapButton action={action} />)
  const b = screen.getByRole('button')
  fireEvent.pointerDown(b, { pointerId: 3, pointerType: 'mouse' })
  fireEvent.pointerUp(b, { pointerId: 3, pointerType: 'mouse' })
  expect(action).not.toHaveBeenCalled()
  fireEvent.click(b)
  expect(action).toHaveBeenCalledTimes(1)
})
