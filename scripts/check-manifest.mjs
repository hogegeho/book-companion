#!/usr/bin/env node
// Web App Manifest を検証する。
//   node scripts/check-manifest.mjs                 # dist/ を検証（ビルド後）
//   node scripts/check-manifest.mjs https://…/       # 配信中のサイトを検証
// 見るもの：index.html から manifest へのリンク、W3C 仕様の各メンバーの型と値、
// Chrome のインストール条件（name/short_name, start_url, display, 192px と 512px のアイコン）、
// アイコン画像が実在し、宣言どおりの画素数の PNG であること、start_url が scope の内側であること。
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const target = process.argv[2] ?? 'dist'
const isUrl = /^https?:\/\//.test(target)
const siteRoot = isUrl ? new URL(target.endsWith('/') ? target : `${target}/`) : null

async function load(pathOrUrl) {
  if (isUrl) {
    const res = await fetch(pathOrUrl)
    if (!res.ok) throw new Error(`${pathOrUrl}: HTTP ${res.status}`)
    return { bytes: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') ?? '' }
  }
  return { bytes: await readFile(pathOrUrl), type: '' }
}

// dist/ 内のファイルは配信時の URL（base 付き）で扱い、base を剥がして読む
const BASE = '/book-companion/'
const fakeOrigin = new URL(`http://local${BASE}`)
const root = siteRoot ?? fakeOrigin
const fetchUrl = (url) => (isUrl ? url.href : resolve(target, decodeURIComponent(url.pathname.slice(BASE.length))))

const errors = []
const check = (cond, msg) => {
  if (!cond) errors.push(msg)
}

const html = (await load(fetchUrl(new URL('index.html', root)))).bytes.toString('utf8')
const link = html.match(/<link[^>]+rel=["']manifest["'][^>]*>/i)?.[0]
if (!link) {
  console.error('index.html has no <link rel="manifest">')
  process.exit(1)
}
const manifestUrl = new URL(link.match(/href=["']([^"']+)["']/)[1], root)
const { bytes, type } = await load(fetchUrl(manifestUrl))
if (isUrl) check(/application\/(manifest\+)?json/.test(type), `manifest content-type is ${type}`)

let m
try {
  m = JSON.parse(bytes.toString('utf8'))
} catch (e) {
  console.error(`manifest is not valid JSON: ${e.message}`)
  process.exit(1)
}

const isStr = (v) => typeof v === 'string' && v.trim().length > 0
const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

check(isStr(m.name), 'name must be a non-empty string')
check(isStr(m.short_name), 'short_name must be a non-empty string')
check((m.short_name?.length ?? 0) <= 15, 'short_name should be short (<= 15 chars)')
check(isStr(m.start_url), 'start_url is required')
check(['fullscreen', 'standalone', 'minimal-ui'].includes(m.display), 'display must be fullscreen, standalone or minimal-ui')
check(m.id === undefined || isStr(m.id), 'id must be a string')
check(m.lang === undefined || /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(m.lang), 'lang must be a BCP47 tag')
check(m.theme_color === undefined || color.test(m.theme_color), 'theme_color must be a hex color')
check(m.background_color === undefined || color.test(m.background_color), 'background_color must be a hex color')
const orientations = ['any', 'natural', 'landscape', 'landscape-primary', 'landscape-secondary', 'portrait', 'portrait-primary', 'portrait-secondary']
check(m.orientation === undefined || orientations.includes(m.orientation), 'orientation is not a valid value')

const start = new URL(m.start_url ?? '', manifestUrl)
const scope = new URL(m.scope ?? '.', manifestUrl)
check(start.origin === root.origin, 'start_url must be same-origin')
check(start.href.startsWith(scope.href), `start_url ${start.pathname} is outside scope ${scope.pathname}`)

check(Array.isArray(m.icons) && m.icons.length > 0, 'icons must be a non-empty array')
const sizesSeen = { any: new Set(), maskable: new Set() }
for (const icon of m.icons ?? []) {
  const where = `icon ${icon.src}`
  check(isStr(icon.src), `${where}: src is required`)
  check(/^\d+x\d+( \d+x\d+)*$|^any$/.test(icon.sizes ?? ''), `${where}: sizes is invalid`)
  const purposes = (icon.purpose ?? 'any').split(/\s+/)
  check(purposes.every((p) => ['any', 'maskable', 'monochrome'].includes(p)), `${where}: purpose is invalid`)
  let img
  try {
    img = await load(fetchUrl(new URL(icon.src, manifestUrl)))
  } catch (e) {
    errors.push(`${where}: cannot load (${e.message})`)
    continue
  }
  const png = img.bytes
  const isPng = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  check(isPng, `${where}: not a PNG`)
  check(icon.type === undefined || icon.type === 'image/png', `${where}: type should be image/png`)
  if (isPng) {
    const w = png.readUInt32BE(16)
    const h = png.readUInt32BE(20)
    check(icon.sizes?.split(' ').includes(`${w}x${h}`), `${where}: declared ${icon.sizes} but image is ${w}x${h}`)
    for (const p of purposes) sizesSeen[p]?.add(w)
  }
}
check(sizesSeen.any.has(192), 'needs a 192x192 icon with purpose "any"')
check(sizesSeen.any.has(512), 'needs a 512x512 icon with purpose "any"')
check(sizesSeen.maskable.size > 0, 'should have a maskable icon')

if (errors.length) {
  console.error(`manifest ${manifestUrl.href} failed:\n` + errors.map((e) => `  - ${e}`).join('\n'))
  process.exit(1)
}
console.log(`ok: ${isUrl ? manifestUrl.href : fetchUrl(manifestUrl)} (${m.icons.length} icons)`)
