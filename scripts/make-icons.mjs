#!/usr/bin/env node
// PWA のアイコン（PNG）と favicon（SVG）を生成する。依存なし・決定的。
//   node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons')

const BG = [0x2f, 0x48, 0x58]
const PAGE = [0xf4, 0xec, 0xd8]
const INK = [0xb8, 0xae, 0x96]
const MARK = [0xf2, 0xa5, 0x41]

// 開いた本（中心 0.5,0.5・幅 1 の正規化座標）。左右のページを四辺形で持つ。
const LEFT = [
  [0.0, 0.1],
  [0.5, 0.18],
  [0.5, 0.9],
  [0.0, 0.82],
]
const RIGHT = LEFT.map(([x, y]) => [1 - x, y])

const inQuad = (q, x, y) => {
  // 凸四辺形の内側判定（辺の外積の符号がそろうか）
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i]
    const [bx, by] = q[(i + 1) % 4]
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c)
      else if (Math.sign(c) !== sign) return false
    }
  }
  return true
}

/** 本の絵の色（正規化座標）。本の外なら null。 */
function bookColor(x, y) {
  const left = inQuad(LEFT, x, y)
  const right = inQuad(RIGHT, x, y)
  if (!left && !right) return null
  const px = left ? x : 1 - x // ページ内の横位置（0=外側, 0.5=のど）
  const slope = 0.16 * px // ページの傾き
  const ly = y - slope
  const inText = px > 0.08 && px < 0.42
  for (let i = 0; i < 5; i++) {
    const top = 0.26 + i * 0.1
    if (ly > top && ly < top + 0.035 && inText) {
      if (right && i === 2) return MARK // なぞった一行
      return INK
    }
  }
  return PAGE
}

/**
 * @param size 画素数
 * @param scale 本の大きさ（アイコンに対する比）
 * @param radius 背景の角丸（0 なら全面塗り＝maskable）
 */
function render(size, scale, radius) {
  const SS = 4
  const px = Buffer.alloc(size * size * 4)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sj = 0; sj < SS; sj++) {
        for (let si = 0; si < SS; si++) {
          const u = (i + (si + 0.5) / SS) / size
          const v = (j + (sj + 0.5) / SS) / size
          if (radius > 0) {
            const dx = Math.max(radius - u, 0, u - (1 - radius))
            const dy = Math.max(radius - v, 0, v - (1 - radius))
            if (dx * dx + dy * dy > radius * radius) continue
          }
          const bx = (u - 0.5) / scale + 0.5
          const by = (v - 0.5) / scale + 0.5
          const c = bookColor(bx, by) ?? BG
          r += c[0]; g += c[1]; b += c[2]; a += 255
        }
      }
      const n = SS * SS
      const o = (j * size + i) * 4
      const cov = a / 255
      px[o] = cov ? Math.round(r / cov) : 0
      px[o + 1] = cov ? Math.round(g / cov) : 0
      px[o + 2] = cov ? Math.round(b / cov) : 0
      px[o + 3] = Math.round(a / n)
    }
  }
  return encodePng(size, size, px)
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
function faviconSvg() {
  const pts = (q) => q.map(([x, y]) => `${(8 + x * 48).toFixed(1)},${(8 + y * 48).toFixed(1)}`).join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="${hex(BG)}"/>
  <polygon points="${pts(LEFT)}" fill="${hex(PAGE)}"/>
  <polygon points="${pts(RIGHT)}" fill="${hex(PAGE)}"/>
  <line x1="37" y1="37.5" x2="51" y2="35" stroke="${hex(MARK)}" stroke-width="3"/>
</svg>
`
}

mkdirSync(OUT, { recursive: true })
const files = {
  'icon-192.png': render(192, 0.72, 0.18),
  'icon-512.png': render(512, 0.72, 0.18),
  'maskable-512.png': render(512, 0.55, 0),
  'apple-touch-icon-180.png': render(180, 0.6, 0),
  'favicon.svg': faviconSvg(),
}
for (const [name, data] of Object.entries(files)) {
  writeFileSync(resolve(OUT, name), data)
  console.log(`wrote public/icons/${name}`)
}
