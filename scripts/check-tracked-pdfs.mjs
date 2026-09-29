#!/usr/bin/env node
// fixtures/ 以外で追跡されている PDF が無いことを確かめる（CI で実行）。
import { execFileSync } from 'node:child_process'

const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--', '*.pdf', '*.PDF'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
const outside = tracked.filter((p) => !/^fixtures\/[^/]+\.pdf$/i.test(p))
if (outside.length) {
  console.error('PDF tracked outside fixtures/:\n' + outside.map((p) => `  ${p}`).join('\n'))
  process.exit(1)
}
console.log(`ok: ${tracked.length} PDF(s) tracked, all under fixtures/`)
