import { registerSW } from 'virtual:pwa-register'

// Service Worker の登録と、新しい版の確認。
// 新しい版の確認はふつう「ページを読み込んだとき」だけなので、ホーム画面のアプリを開きっぱなしだと古い版が動き続ける。
// そこで前面に戻るたびと一定間隔で確かめる。新しい版が入ると autoUpdate が読み込み直す。

const CHECK_INTERVAL_MS = 60 * 60 * 1000

let registration: ServiceWorkerRegistration | undefined

export function startServiceWorker() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg
      if (!reg) return
      const check = () => {
        if (navigator.onLine) reg.update().catch(() => {})
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      setInterval(check, CHECK_INTERVAL_MS)
    },
  })
}

export type UpdateCheck = 'updating' | 'latest' | 'offline' | 'unavailable'

/** 今すぐ新しい版を確かめる。見つかれば読み込み直しが始まる */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!registration) return 'unavailable'
  if (!navigator.onLine) return 'offline'
  try {
    await registration.update()
  } catch {
    return 'offline'
  }
  return registration.installing || registration.waiting ? 'updating' : 'latest'
}
