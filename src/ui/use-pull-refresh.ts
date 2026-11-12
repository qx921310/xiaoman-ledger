import { useEffect, useRef, useState } from 'react'

/**
 * 下拉刷新（对应一木各页的 JellyRefreshLayout / pull_layout）。
 * 只在页面滚动到顶部时响应，触摸下拉超过阈值触发 onRefresh。
 * 不引入第三方库：这里只需要 touch 三段事件，成熟库反而更重。
 */
export function usePullRefresh(onRefresh: () => Promise<void> | void, threshold = 64) {
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0

    const onStart = (e: TouchEvent) => {
      if (busy || !atTop()) { startY.current = null; return }
      startY.current = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || busy) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) { setProgress(0); return }
      setProgress(Math.min(1, dy / threshold))
    }
    const onEnd = async () => {
      if (startY.current == null) return
      const reached = progress >= 1
      startY.current = null
      setProgress(0)
      if (!reached) return
      setBusy(true)
      try { await onRefresh() } finally { setBusy(false) }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [onRefresh, threshold, progress, busy])

  return { progress, busy }
}
