import { useRef, type PointerEvent } from 'react'

/** pointerup から click が届くまでの猶予。この間の click は、同じ操作の二重発火として捨てる。 */
const CLICK_DEDUP_MS = 800

/**
 * 指・ペンのタップでは click を待たずに pointerup で動かすボタン用のハンドラ。
 * Chrome はなぞり（touch-action: none の上でのドラッグ）の直後、最初のタップの click を出さないことがあるため。
 * マウスとキーボードは従来どおり click で動く。
 */
export function useTap(action: () => void) {
  const pointer = useRef<number | null>(null)
  const firedAt = useRef(-Infinity)
  return {
    onPointerDown: (e: PointerEvent) => {
      pointer.current = e.pointerType === 'mouse' ? null : e.pointerId
    },
    onPointerUp: (e: PointerEvent) => {
      if (pointer.current !== e.pointerId) return
      pointer.current = null
      firedAt.current = performance.now()
      action()
    },
    // 指が滑ってスクロールなどに変わったら、タップではない
    onPointerCancel: () => {
      pointer.current = null
    },
    onClick: () => {
      if (performance.now() - firedAt.current < CLICK_DEDUP_MS) return
      action()
    },
  }
}
