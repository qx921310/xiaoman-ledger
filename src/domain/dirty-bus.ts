/**
 * 脏标记总线：store 写数据时打标记，同步层消费。
 * 单独成文件是为了避免 store ⇄ sync 的循环依赖。
 */
let remoteDepth = 0
const listeners = new Set<() => void>()

/** 正在应用远端数据：此时的写入不算本地改动 */
export function isApplyingRemote() { return remoteDepth > 0 }
export function beginRemote() { remoteDepth++ }
export function endRemote() { remoteDepth = Math.max(0, remoteDepth - 1) }

/** 本地有写入，需要同步 */
export function markDirty() {
  if (remoteDepth > 0) return
  for (const fn of listeners) fn()
}

/** 订阅「本地变脏」事件，返回取消函数 */
export function onDirty(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
