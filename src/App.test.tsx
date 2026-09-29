import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App.tsx'

test('本とAIの帯を左右に並べる', () => {
  render(<App />)
  expect(screen.getByRole('main', { name: '本' })).toBeTruthy()
  expect(screen.getByRole('complementary', { name: 'AIの帯' })).toBeTruthy()
})
