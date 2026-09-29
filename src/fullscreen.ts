import { useCallback, useSyncExternalStore } from 'react'

// 全画面の状態。Fullscreen API で入った全画面と、ホーム画面から display: fullscreen で起動した場合の両方を扱う。

const fullscreenMode = () => window.matchMedia?.('(display-mode: fullscreen)')

function subscribe(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange)
  const mq = fullscreenMode()
  mq?.addEventListener('change', onChange)
  return () => {
    document.removeEventListener('fullscreenchange', onChange)
    mq?.removeEventListener('change', onChange)
  }
}

const snapshot = () => {
  if (document.fullscreenElement) return 'api'
  if (fullscreenMode()?.matches) return 'app'
  return 'none'
}

export function useFullscreen() {
  const state = useSyncExternalStore(subscribe, snapshot, () => 'none' as const)
  // API が使えない環境（iOS Safari の一部など）ではボタンごと隠す。アプリとして全画面起動しているときも不要。
  const supported = document.fullscreenEnabled === true && state !== 'app'

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    } catch {
      // 利用者の操作以外から呼ばれた等で断られても、読書は続けられるので黙って戻る
    }
  }, [])

  return { supported, active: state === 'api', toggle }
}
