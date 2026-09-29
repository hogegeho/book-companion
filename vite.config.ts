/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages ではリポジトリ名の下に配信される
const BASE = '/book-companion/'

// 画面に出す版。package.json の version と、どのコミットから作ったか
const VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version
const GIT_SHA = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
})()
const BUILD_TIME = new Date().toISOString()

/** 公開中の版を端末から確かめられるよう、version.json を出す（Service Worker には入れない） */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: VERSION, sha: GIT_SHA, builtAt: BUILD_TIME }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
    __GIT_SHA__: JSON.stringify(GIT_SHA),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon-180.png'],
      manifest: {
        id: BASE,
        name: 'Book Companion — AIと一緒に読む',
        short_name: 'Book Companion',
        description: 'PDFの本をAIと並んで読むためのリーダー',
        lang: 'ja',
        start_url: BASE,
        scope: BASE,
        // ホーム画面から開いたときは、ステータスバーも隠して本に画面を使う
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#f4ecd8',
        theme_color: '#2f4858',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // pdf.js の worker（.mjs, 1MB 超）も先に取っておき、オフラインでも本が開けるようにする
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}'],
        globIgnores: ['pdfjs/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // CMap・標準フォントなどは数が多いので、使ったものだけ取っておく
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${BASE}pdfjs/`),
            handler: 'CacheFirst',
            options: { cacheName: 'pdfjs-assets', expiration: { maxEntries: 400 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
})
