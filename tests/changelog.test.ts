// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { CHANGELOG } from '../src/changelog.ts'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

test('いちばん上の変更履歴は package.json の版と一致する（版を上げたら履歴も書く）', () => {
  expect(CHANGELOG[0]!.version).toBe(pkg.version)
})

test('版は重複せず、新しい順に並び、日付と変更点を持つ', () => {
  const parse = (v: string) => v.split('.').map(Number)
  for (let i = 1; i < CHANGELOG.length; i++) {
    const [a, b] = [parse(CHANGELOG[i - 1]!.version), parse(CHANGELOG[i]!.version)]
    const cmp = a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!
    expect(cmp, `${CHANGELOG[i - 1]!.version} > ${CHANGELOG[i]!.version}`).toBeGreaterThan(0)
  }
  for (const e of CHANGELOG) {
    expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(e.changes.length).toBeGreaterThan(0)
  }
})
