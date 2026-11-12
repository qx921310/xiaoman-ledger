/** In-flight work is valid only for the account session that started it. */
let epoch = 0
let controller = new AbortController()

export function advanceSessionEpoch() {
  controller.abort()
  controller = new AbortController()
  epoch++
}

export function captureSessionEpoch() {
  const captured = epoch
  const signal = controller.signal
  return {
    signal,
    assertCurrent() {
      if (captured !== epoch || signal.aborted) throw new DOMException('登录会话已变更', 'AbortError')
    }
  }
}
