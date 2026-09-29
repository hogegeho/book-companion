import { useCallback, useEffect, useSyncExternalStore } from 'react'

// 全画面（Fullscreen API）。
// ホーム画面から起動したアプリでも、端末によってはステータスバーが残る（manifest の display: fullscreen が効かない）。
// そこでアプリとして起動しているときは、最初のタップで全画面に入る。全画面は利用者の操作からしか入れないため「最初のタップで」。

const INSTALLED_MODES = ['fullscreen', 'standalone', 'minimal-ui']

/** ホーム画面から起動したアプリとして動いているか */
export const isInstalledApp = () =>
  INSTALLED_MODES.some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches)

/** 「全画面を終わる」を押したら、この起動のあいだは自動で入り直さない */
let optedOut = false

function subscribe(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}

const snapshot = () => document.fullscreenElement !== null && document.fullscreenElement !== undefined

const enter = () => document.documentElement.requestFullscreen({ navigationUI: 'hide' })

export function useFullscreen() {
  const active = useSyncExternalStore(subscribe, snapshot, () => false)
  // API が使えない環境（iOS Safari の一部など）ではボタンごと隠す
  const supported = document.fullscreenEnabled === true

  // アプリとして起動しているときは、タップのたびに（全画面でなければ）全画面に入る。
  // バックグラウンドから戻ると全画面は解けるので、戻ってからの最初のタップでも入り直す。
  useEffect(() => {
    if (!supported) return
    const onPointerUp = (e: PointerEvent) => {
      if (optedOut || document.fullscreenElement || !isInstalledApp()) return
      // 全画面ボタン自身のタップは、ボタンの処理に任せる（ここで入るとボタンがすぐ抜けてしまう）
      if ((e.target as Element | null)?.closest?.('.fullscreen-button')) return
      enter().catch(() => {})
    }
    document.addEventListener('pointerup', onPointerUp, true)
    return () => document.removeEventListener('pointerup', onPointerUp, true)
  }, [supported])

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        optedOut = true
        await document.exitFullscreen()
      } else {
        optedOut = false
        await enter()
      }
    } catch {
      // 利用者の操作以外から呼ばれた等で断られても、読書は続けられるので黙って戻る
    }
  }, [])

  return { supported, active, toggle }
}

/** テスト用：起動し直した状態に戻す */
export function resetFullscreenOptOut() {
  optedOut = false
}
