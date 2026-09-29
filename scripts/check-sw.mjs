#!/usr/bin/env node
// ビルドした Service Worker が、新しい版をすぐ有効にする設定になっているか確かめる。
// （skipWaiting / clientsClaim が無いと、開いているアプリが古い版のまま止まる）
import { readFileSync } from 'node:fs'

const sw = readFileSync(process.argv[2] ?? 'dist/sw.js', 'utf8')
const count = (re) => (sw.match(re) ?? []).length
// 「SKIP_WAITING のメッセージを受けたら skipWaiting」だけでは足りない（誰もメッセージを送らない）。無条件の呼び出しが要る
const unconditionalSkip = count(/skipWaiting\(\)/g) - count(/SKIP_WAITING/g)
const problems = []
if (unconditionalSkip < 1) problems.push('skipWaiting() is only called on a SKIP_WAITING message')
if (!sw.includes('clientsClaim()')) problems.push('clientsClaim() is missing')
if (problems.length) {
  console.error(`sw.js: ${problems.join('; ')}`)
  process.exit(1)
}
console.log('ok: sw.js calls skipWaiting() and clientsClaim()')
