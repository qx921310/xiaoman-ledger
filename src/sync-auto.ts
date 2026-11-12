/**
 * 自动同步：本地写入后防抖推送，回到前台/恢复网络时补一次，
 * 可见状态下定时拉取。失败保留状态并在界面提示，不静默吞掉。
 */
import { onDirty } from './domain/dirty-bus'

export interface AutoSyncState {
  running: boolean
  pending: boolean
  lastOkAt: number | null
  lastError: string | null
  attempts: number
  /** 服务端拒绝/冲突的条数：>0 时界面不能显示"已同步" */
  incomplete: number
}

const DEBOUNCE_MS = 2500
const POLL_MS = 60_000
const RETRY_BASE_MS = 5_000
const RETRY_MAX_MS = 60_000

type SyncFn = () => Promise<unknown>

let state: AutoSyncState = { running: false, pending: false, lastOkAt: null, lastError: null, attempts: 0, incomplete: 0 }
const subs = new Set<(s: AutoSyncState) => void>()
let syncFn: SyncFn | null = null
let lastResult: unknown = null
let timer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let started = false
let inFlight: Promise<void> | null = null

function emit() { for (const fn of subs) fn(state) }
export function subscribeAutoSync(fn: (s: AutoSyncState) => void) {
  subs.add(fn); fn(state)
  return () => { subs.delete(fn) }
}
export function getAutoSyncState() { return state }
/** 最近一次同步的业务结果（供设置页展示推送/跳过/冲突明细） */
export function getLastSyncResult() { return lastResult }

function update(patch: Partial<AutoSyncState>) {
  state = { ...state, ...patch }
  emit()
}

async function runOnce() {
  if (!syncFn) return
  if (inFlight) { return inFlight }
  update({ running: true, pending: false })
  inFlight = (async () => {
    try {
      const r = (await syncFn!()) as { denied?: number; conflicts?: number } | undefined
      lastResult = r
      const incomplete = Number(r?.denied ?? 0) + Number(r?.conflicts ?? 0)
      update({ running: false, lastOkAt: Date.now(), lastError: null, attempts: 0, incomplete })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const attempts = state.attempts + 1
      update({ running: false, lastError: msg, attempts })
      // 指数退避重试，最长 60s
      const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempts - 1))
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = setTimeout(() => { retryTimer = null; void runOnce() }, delay)
    } finally {
      inFlight = null
      if (state.pending) schedule(0)
    }
  })()
  return inFlight
}

/** 本地写入后调用：短暂防抖，避免每次输入都打一次同步 */
export function schedule(delay = DEBOUNCE_MS) {
  update({ pending: true })
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void runOnce() }, delay)
}

/** 立即同步（设置页「立即同步」按钮用） */
export async function syncNowImmediate(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null }
  await runOnce()
}

export interface StartOptions {
  sync: SyncFn
  pollMs?: number
  debounceMs?: number
  now?: () => number
}

/** 启动自动同步；重复调用是幂等的 */
export function startAutoSync(opts: StartOptions) {
  syncFn = opts.sync
  if (started) return stopAutoSync
  started = true

  const off = onDirty(() => schedule(opts.debounceMs ?? DEBOUNCE_MS))

  const onOnline = () => { if (typeof navigator === 'undefined' || navigator.onLine !== false) schedule(0) }
  const onVisible = () => {
    if (typeof document === 'undefined') return
    if (document.visibilityState === 'visible') schedule(0)
  }
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)

  const pollMs = opts.pollMs ?? POLL_MS
  if (pollMs > 0 && typeof setInterval !== 'undefined') {
    pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      schedule(0)
    }, pollMs)
  }

  return () => { off(); stopAutoSync(); window.removeEventListener?.('online', onOnline); document.removeEventListener?.('visibilitychange', onVisible) }
}

export function stopAutoSync() {
  started = false
  syncFn = null
  if (timer) { clearTimeout(timer); timer = null }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  update({ pending: false, running: false })
}

/** 仅供测试：清空调度状态与定时器 */
export function __resetForTest() {
  if (timer) { clearTimeout(timer); timer = null }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  inFlight = null
  started = false
  syncFn = null
  state = { running: false, pending: false, lastOkAt: null, lastError: null, attempts: 0, incomplete: 0 }
}
