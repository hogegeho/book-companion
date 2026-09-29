import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

// ビルド済みの成果物（vite preview）を相手にする。Service Worker も本番と同じ形で動く。
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/book-companion/`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // 対象端末は横向きの Android タブレット
      name: 'tablet-landscape',
      use: { ...devices['Galaxy Tab S9 landscape'] },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/book-companion/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
