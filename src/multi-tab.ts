/**
 * 多标签页协调：同一浏览器开多个标签时，后写的会覆盖前一个标签的本地数据。
 * 做法：监听 storage 事件，别的标签改了数据就重新水合；本标签有未提交改动时先不抢。
 */
const TAB_ID = Math.random().toString(36).slice(2, 10)
const WRITER_KEY = 'xiaoman-tab-writer'

export interface MultiTabOptions {
  /** 从 localStorage 重新加载状态 */
  rehydrate: () => Promise<unknown> | void
  /** 本标签是否有待同步/正在同步的改动 */
  isBusy: () => boolean
  /** 数据键前缀（默认 xiaoman-data） */
  prefix?: string
  /** 收到别的标签的写入（用于提示/触发同步） */
  onExternalWrite?: () => void
}

export interface MultiTabHandle { stop: () => void }

/** 是否应该因为别的标签写入而重新水合 */
export function shouldReload(busy: boolean, writerTabId: string, selfTabId = TAB_ID) {
  if (writerTabId === selfTabId) return false   // 自己写的，忽略
  if (busy) return false                        // 本地有未提交改动，别抢
  return true
}

export function startMultiTab(opts: MultiTabOptions): MultiTabHandle {
  const prefix = opts.prefix ?? 'xiaoman-data'
  const onStorage = (e: StorageEvent) => {
    if (!e.key) return
    if (e.key === WRITER_KEY) {
      if (shouldReload(opts.isBusy(), e.newValue ?? '')) {
        opts.onExternalWrite?.()
        void opts.rehydrate()
      }
      return
    }
    if (!e.key.startsWith(prefix)) return
    // 数据本身变了但没有 writer 标记：保守起见也刷新
    if (shouldReload(opts.isBusy(), '')) {
      opts.onExternalWrite?.()
      void opts.rehydrate()
    }
  }
  window.addEventListener('storage', onStorage)
  return { stop: () => window.removeEventListener('storage', onStorage) }
}

/** 本标签写入后广播，供其他标签判断 */
export function announceWrite() {
  try { localStorage.setItem(WRITER_KEY, TAB_ID) } catch { /* 隐私模式忽略 */ }
}

export const tabId = TAB_ID
