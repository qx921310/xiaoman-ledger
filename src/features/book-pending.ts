import { books as bookApi, getCurrentUid } from '../auth'
import { useLedger } from '../store'
import { captureSessionEpoch } from '../domain/session-epoch'

type BookSession = ReturnType<typeof captureSessionEpoch>

function assertBookSession(session: BookSession, uid: number) {
  session.assertCurrent()
  if (getCurrentUid() !== uid) throw new DOMException('登录账号已变更', 'AbortError')
}

function isAbort(error: unknown) {
  return (error as { name?: string })?.name === 'AbortError'
}

/**
 * 账本改动的离线补传队列。
 *
 * 存储：IndexedDB（不是 localStorage）。
 *  · 队列的「读取 → 合并 → 写回」放在同一个 readwrite 事务里，跨标签页天然串行，
 *    不会出现两个标签页同时读到旧值再互相覆盖；
 *  · 不依赖 Web Locks：领取发送快照本身在 IndexedDB 事务里完成，
 *    微信内置浏览器等没有 locks 的环境照常可用；
 *  · 网络请求一律在事务之外，收到回执后再开一个短事务确认结果。
 *
 * 可靠性：
 *  · 每个待发送请求带 operationId，重试沿用同一 body；服务端有回执表，重复请求返回原确认；
 *  · 服务端错误码 BOOK_CONFLICT 表示别的设备已更新 → 保留本地草稿并标记冲突，等用户核对；
 *  · 回执只保留 90 天。设备离线更久时无法证明请求是否已生效，因此同样保留草稿并标记冲突，
 *    绝不把它当成新操作直接覆盖。
 */

const DB_NAME = 'xiaoman-book-queue'
const STORE = 'patches'
const LEGACY_GLOBAL_KEY = 'xiaoman-book-pending'
const legacyScopedKey = (uid: number) => `${LEGACY_GLOBAL_KEY}:${uid || 'anon'}`

export interface PendingBookPatch {
  bookId: string
  uid: number
  patch: Record<string, unknown>
  /** 入队时服务端的更新时间，补传时作为并发基准 */
  baseUpdatedAt: number | null
  at: number
  operationId?: string
  /** 已发出的那次请求（重试必须沿用同一 body，服务端才能识别为重放） */
  sending?: { operationId: string; patch: Record<string, unknown>; baseUpdatedAt: number | null; startedAt?: number }
  /** 网络失败后的退避；断网时按 failures 指数退避，不占用旧请求的快照身份 */
  retry?: { at: number; failures: number }
  /** 服务端明确拒绝或迁移来源冲突，等待用户处理，不自动重试 */
  error?: string
  /** scoped/global 两份旧草稿不同；用户作出取舍后才允许清理原始旧键 */
  migrationConflict?: boolean
  conflict?: boolean
}

interface StoredRecord extends PendingBookPatch { key: string }

const keyOf = (uid: number, bookId: string) => `${uid}:${bookId}`

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('uid', 'uid', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

/** 在单个事务里完成「读 + 改 + 写」，跨标签页原子 */
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  if (typeof indexedDB === 'undefined') throw new Error('当前浏览器无法安全保存账本设置')
  const db = await openDb()
  if (!db) throw new Error('当前浏览器无法安全保存账本设置')
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    let settled = false
    let payload: T
    Promise.resolve(work(store)).then((value) => {
      payload = value
    }).catch((e) => {
      settled = true
      try { tx.abort() } catch { /* 已结束 */ }
      reject(e)
    })
    tx.oncomplete = () => { if (!settled) resolve(payload) }
    tx.onerror = () => { if (!settled) reject(tx.error ?? new Error('账本队列写入失败')) }
    tx.onabort = () => { if (!settled) reject(tx.error ?? new Error('账本队列写入被中止')) }
  })
}

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  r.onsuccess = () => resolve(r.result)
  r.onerror = () => reject(r.error ?? new Error('IndexedDB 请求失败'))
})

async function readOne(store: IDBObjectStore, key: string): Promise<StoredRecord | undefined> {
  const value = await req(store.get(key))
  return value as StoredRecord | undefined
}

/** 旧 localStorage 队列迁移：先确认写入成功，再清理旧数据 */
async function migrateLegacy(uid: number, session: BookSession): Promise<void> {
  if (!uid) return
  assertBookSession(session, uid)
  const rawScoped = localStorage.getItem(legacyScopedKey(uid))
  const rawGlobal = localStorage.getItem(LEGACY_GLOBAL_KEY)
  if (!rawScoped && !rawGlobal) return
  const ownBooks = new Set(useLedger.getState().accountBooks.map((b) => String(b.bookId)))
  type Candidate = {
    entry: PendingBookPatch
    scoped?: unknown
    global?: unknown
    different: boolean
  }
  const parsed: Record<string, Candidate> = {}
  const fingerprint = (entry: PendingBookPatch) => JSON.stringify({
    patch: entry.patch, baseUpdatedAt: entry.baseUpdatedAt,
    operationId: entry.operationId, sending: entry.sending, conflict: entry.conflict
  })

  // scoped 优先；global 只补充不存在的旧草稿。内容不同时绝不覆盖或清理任何来源。
  for (const [source, raw] of [['scoped', rawScoped], ['global', rawGlobal]] as const) {
    if (!raw) continue
    try {
      const value = JSON.parse(raw) as Record<string, unknown>
      for (const [bookId, original] of Object.entries(value)) {
        if (!ownBooks.has(bookId)) continue          // 归属未确认的条目留在旧键里
        const e = original as Partial<PendingBookPatch>
        const entry: PendingBookPatch = 'patch' in (e as object)
          ? { bookId, uid, patch: (e.patch ?? {}) as Record<string, unknown>, baseUpdatedAt: e.baseUpdatedAt ?? null,
              at: e.at ?? 0, operationId: e.operationId, sending: e.sending, conflict: e.conflict,
              retry: e.retry, error: e.error, migrationConflict: e.migrationConflict }
          : { bookId, uid, patch: (original ?? {}) as Record<string, unknown>, baseUpdatedAt: null, at: 0 }
        const previous = parsed[bookId]
        if (!previous) {
          parsed[bookId] = { entry, [source]: original, different: false } as Candidate
        } else {
          previous[source] = original
          const different = fingerprint(previous.entry) !== fingerprint(entry)
          previous.different ||= different
          previous.entry.migrationConflict ||= different
          previous.entry.conflict ||= different
          if (different) previous.entry.error = '账号专属队列与全局队列内容不同，请核对后选择保留哪一份'
          // previous.entry 保持 scoped 候选，不用 global 后写覆盖。
        }
      }
    } catch { /* 坏的旧数据忽略 */ }
  }
  if (!Object.keys(parsed).length) return

  const written = new Set<string>()
  await withStore('readwrite', async (store) => {
    for (const [bookId, candidate] of Object.entries(parsed)) {
      assertBookSession(session, uid)
      const key = keyOf(uid, bookId)
      const existing = await readOne(store, key)
      assertBookSession(session, uid)
      if (existing) {
        if (fingerprint(existing) === fingerprint(candidate.entry)) {
          // 已持久化的 IDB 与旧来源可证明等价，允许清理成功迁移的来源。
          written.add(bookId)
        } else {
          // 内容不同的两份都要留住证据；不能等 IDB 上传删除后又把旧草稿当成新任务复活。
          await req(store.put({
            ...existing,
            conflict: true,
            migrationConflict: true,
            error: '旧 localStorage 队列与 IndexedDB 草稿内容不同，请核对后选择保留哪一份'
          }))
        }
        continue
      }
      await req(store.put({ ...candidate.entry, migrationConflict: candidate.different || undefined, key }))
      written.add(bookId)
    }
  })
  assertBookSession(session, uid)

  // 只有「确实落库且两个来源内容一致」的条目才可清理。来源冲突必须等用户明确取舍。
  const removable = (source: 'scoped' | 'global') => new Set(
    Object.entries(parsed).filter(([bookId, c]) => written.has(bookId) && !c.different && c[source] !== undefined)
      .map(([bookId]) => bookId)
  )
  const scopedWritten = removable('scoped')
  try {
    const leftover = JSON.parse(rawScoped || '{}') as Record<string, unknown>
    for (const bookId of scopedWritten) delete leftover[bookId]
    if (Object.keys(leftover).length > 0) localStorage.setItem(legacyScopedKey(uid), JSON.stringify(leftover))
    else localStorage.removeItem(legacyScopedKey(uid))
  } catch {
    // localStorage 写回失败不能顺手删除 scoped 中尚未迁移的内容。
  }
  const globalWritten = removable('global')
  const remaining: Record<string, unknown> = {}
  if (rawGlobal) {
    try {
      const value = JSON.parse(rawGlobal) as Record<string, unknown>
      for (const [bookId, entry] of Object.entries(value)) {
        if (!ownBooks.has(bookId) || !globalWritten.has(bookId)) remaining[bookId] = entry
      }
    } catch { /* 忽略 */ }
  }
  if (Object.keys(remaining).length) localStorage.setItem(LEGACY_GLOBAL_KEY, JSON.stringify(remaining))
  else localStorage.removeItem(LEGACY_GLOBAL_KEY)
}

/** 记录一次失败的账本保存，等待联网后补传 */
export async function queueBookPatch(bookId: string, patch: Record<string, unknown>, baseUpdatedAt: number | null): Promise<void> {
  const uid = getCurrentUid()
  const session = captureSessionEpoch()
  const owner = useLedger.getState().accountBooks.find((b) => String(b.bookId) === bookId)
  if (owner?.role === 'silent') throw new Error('当前账本只读，不能修改账本设置')
  await migrateLegacy(uid, session)
  await withStore('readwrite', async (store) => {
    assertBookSession(session, uid)
    const key = keyOf(uid, bookId)
    const existing = await readOne(store, key)
    assertBookSession(session, uid)
    const record: StoredRecord = {
      key, bookId, uid,
      patch: { ...(existing?.patch ?? {}), ...patch },
      baseUpdatedAt: existing?.baseUpdatedAt ?? baseUpdatedAt ?? null,
      at: Date.now(),
      operationId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      // 在途快照不可被新编辑覆盖：A 已发出但响应丢失时，必须能用原 opId + 原 payload 重放
      sending: existing?.sending,
      retry: undefined,
      error: undefined,
      conflict: existing?.conflict,
      migrationConflict: existing?.migrationConflict
    }
    await req(store.put(record))
  })
  void refreshBookPendingStatus()
}

export async function getBookPatch(bookId: string): Promise<PendingBookPatch | undefined> {
  const uid = getCurrentUid()
  return withStore('readonly', async (store) => {
    const record = await readOne(store, keyOf(uid, bookId))
    return record ? stripKey(record) : undefined
  })
}

/** 保存成功后清掉该账本的待补；只有内容仍是当时那一份才删，避免误删之后的新编辑 */
export async function clearBookPatch(bookId: string, expected: PendingBookPatch | undefined): Promise<void> {
  const uid = getCurrentUid()
  const session = captureSessionEpoch()
  await withStore('readwrite', async (store) => {
    const key = keyOf(uid, bookId)
    const current = await readOne(store, key)
    assertBookSession(session, uid)
    if (!current) return
    if (!expected) return
    if (!sameContent(stripKey(current), expected)) return
    await req(store.delete(key))
  })
  void refreshBookPendingStatus()
}

export async function markBookPatchConflict(bookId: string): Promise<void> {
  const uid = getCurrentUid()
  const session = captureSessionEpoch()
  await withStore('readwrite', async (store) => {
    const key = keyOf(uid, bookId)
    const current = await readOne(store, key)
    assertBookSession(session, uid)
    if (!current) return
    await req(store.put({ ...current, conflict: true, retry: undefined, error: '账本存在待核对冲突' }))
  })
  void refreshBookPendingStatus()
}

const stripKey = ({ key: _key, ...rest }: StoredRecord): PendingBookPatch => rest
const sameContent = (a: PendingBookPatch, b: PendingBookPatch) =>
  JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 })

async function listAll(uid: number): Promise<PendingBookPatch[]> {
  return withStore('readonly', async (store) => {
    const index = store.index('uid')
    const rows = await req(index.getAll(uid)) as StoredRecord[]
    return rows.map(stripKey)
  })
}

const LEASE_MS = 60_000
const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000

type RetrySchedule = {
  uid: number
  session: BookSession
  at: number
  timer: ReturnType<typeof setTimeout>
}
let retrySchedule: RetrySchedule | null = null
const activeFlushes = new Set<AbortSignal>()

function cancelScheduledFlush(session?: BookSession) {
  if (!retrySchedule) return
  if (session && retrySchedule.session.signal !== session.signal) return
  clearTimeout(retrySchedule.timer)
  retrySchedule = null
}

/** 保留当前会话最早的一次唤醒；新会话天然替换旧会话的定时任务。 */
function scheduleBookPatchRetry(uid: number, session: BookSession, at: number) {
  if (getCurrentUid() !== uid || session.signal.aborted) return
  try { assertBookSession(session, uid) } catch { return }
  if (retrySchedule?.session.signal === session.signal && retrySchedule.at <= at) return
  clearTimeout(retrySchedule?.timer)
  const timer = setTimeout(() => {
    retrySchedule = null
    if (getCurrentUid() !== uid || session.signal.aborted) return
    void flushBookPatches({ automatic: true }).catch(() => { /* 状态订阅会保留失败提示 */ })
  }, Math.max(0, at - Date.now()))
  // Node 测试环境不能被一个待重试定时器拖住进程；浏览器没有 unref。
  ;(timer as unknown as { unref?: () => void }).unref?.()
  retrySchedule = { uid, session, at, timer }
}

export interface BookPendingStatus {
  pending: number
  conflicts: number
  nextRetryAt: number | null
  error: string | null
  syncing: boolean
}

const EMPTY_PENDING_STATUS: BookPendingStatus = { pending: 0, conflicts: 0, nextRetryAt: null, error: null, syncing: false }
let pendingStatus = EMPTY_PENDING_STATUS
const pendingListeners = new Set<(status: BookPendingStatus) => void>()

export function getBookPendingStatus() { return pendingStatus }

/** 队列变化集中发布提示；不做逐秒倒计时，避免每秒重渲染整棵应用。 */
export async function refreshBookPendingStatus(): Promise<BookPendingStatus> {
  const uid = getCurrentUid()
  const session = captureSessionEpoch()
  if (!uid) {
    cancelScheduledFlush()
    pendingStatus = EMPTY_PENDING_STATUS
    pendingListeners.forEach((listener) => listener(pendingStatus))
    return pendingStatus
  }
  try {
    const rows = await listAll(uid)
    assertBookSession(session, uid)
    const active = rows.filter((row) => !row.conflict)
    const deadlines = active.flatMap((row) => {
      const dates: number[] = []
      if (row.retry?.at) dates.push(row.retry.at)
      if (row.sending?.startedAt) dates.push(row.sending.startedAt + LEASE_MS)
      return dates
    }).filter(Number.isFinite)
    const nextRetryAt = deadlines.length ? Math.min(...deadlines) : null
    if (nextRetryAt != null) scheduleBookPatchRetry(uid, session, nextRetryAt)
    else cancelScheduledFlush(session)
    pendingStatus = {
      pending: rows.length,
      conflicts: rows.filter((row) => row.conflict).length,
      nextRetryAt,
      error: rows.find((row) => row.error)?.error ?? null,
      syncing: activeFlushes.size > 0
    }
    pendingListeners.forEach((listener) => listener(pendingStatus))
  } catch (error) {
    if (!isAbort(error)) {
      pendingStatus = { ...pendingStatus, error: error instanceof Error ? error.message : '账本队列读取失败' }
      pendingListeners.forEach((listener) => listener(pendingStatus))
    }
  }
  return pendingStatus
}

export function subscribeBookPending(listener: (status: BookPendingStatus) => void) {
  pendingListeners.add(listener)
  listener(pendingStatus)
  void refreshBookPendingStatus()
  return () => { pendingListeners.delete(listener) }
}

/** 补传：带 baseUpdatedAt 与 operationId 走服务端幂等接口。
 * 冲突不静默丢弃：保留草稿并标记 conflict，交由用户核对。
 */
export interface BookFlushResult { sent: number; conflicted: number }
const flushInFlight = new WeakMap<AbortSignal, Promise<BookFlushResult>>()

export function flushBookPatches(options: { automatic?: boolean } = {}): Promise<BookFlushResult> {
  const uid = getCurrentUid()
  const session = captureSessionEpoch()
  const previous = flushInFlight.get(session.signal)
  if (previous) return previous
  cancelScheduledFlush(session)
  activeFlushes.add(session.signal)
  void refreshBookPendingStatus()

  const run = (async (): Promise<BookFlushResult> => {
    let sent = 0
    let conflicted = 0
    try {
      if (!uid) return { sent, conflicted }
      await migrateLegacy(uid, session)
      assertBookSession(session, uid)
      // 不把网络失败改成递归重试：统一由退避定时器唤醒，避免断网紧循环。
      let followUp = false
      for (let round = 0; round < 5; round++) {
        assertBookSession(session, uid)
        const result = await flushRound(uid, session, !!options.automatic)
        sent += result.roundSent
        conflicted += result.roundConflicted
        followUp = result.roundFollowUp
        if (!followUp) break
      }
      if (followUp) scheduleBookPatchRetry(uid, session, Date.now())
    } catch (error) {
      // 中止只保留旧账号/旧会话的草稿；其 operationId 与 payload 均不改写。
      if (!isAbort(error)) throw error
    } finally {
      activeFlushes.delete(session.signal)
      void refreshBookPendingStatus()
    }
    return { sent, conflicted }
  })()
  const tracked = run.finally(() => { if (flushInFlight.get(session.signal) === tracked) flushInFlight.delete(session.signal) })
  flushInFlight.set(session.signal, tracked)
  return tracked
}

/** 扫描一轮队列：领取发送快照 → 发请求 → 用短事务确认结果 */
async function flushRound(uid: number, session: BookSession, automatic: boolean)
  : Promise<{ roundSent: number; roundConflicted: number; roundFollowUp: boolean }> {
  let sent = 0
  let conflicted = 0
  let followUp = false
  const rows = await listAll(uid)
  assertBookSession(session, uid)
  for (const row of rows) {
    assertBookSession(session, uid)
    if (row.conflict) continue
    // 在事务里领取发送快照：两个标签页同时补传时只有一方能拿到，另一方会看到 sending。
    const claimed = await withStore('readwrite', async (store) => {
      const key = keyOf(uid, row.bookId)
      const current = await readOne(store, key)
      assertBookSession(session, uid)
      if (!current || current.conflict) return undefined
      if (automatic && current.retry?.at && current.retry.at > Date.now()) {
        scheduleBookPatchRetry(uid, session, current.retry.at)
        return undefined
      }
      const prev = current.sending
      if (prev?.startedAt && Date.now() - prev.startedAt < LEASE_MS) {
        // 崩溃恢复时即使租约未到期，也要为到期时间主动安排唤醒。
        scheduleBookPatchRetry(uid, session, prev.startedAt + LEASE_MS)
        return undefined
      }
      if (prev?.operationId && prev.patch) {
        // 响应丢失/页面中断：先原样重放原快照，绝不与后续 B 草稿混合。
        await req(store.put({ ...current, sending: { ...prev, startedAt: Date.now() }, retry: undefined, error: undefined }))
        return { operationId: prev.operationId, patch: prev.patch,
          baseUpdatedAt: prev.baseUpdatedAt ?? null, failures: current.retry?.failures ?? 0 }
      }
      const operationId = current.operationId
        ?? globalThis.crypto?.randomUUID?.()
        ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const sending = { operationId, patch: current.patch, baseUpdatedAt: current.baseUpdatedAt, startedAt: Date.now() }
      await req(store.put({ ...current, operationId, sending, retry: undefined, error: undefined }))
      return { operationId, patch: current.patch, baseUpdatedAt: current.baseUpdatedAt,
        failures: current.retry?.failures ?? 0 }
    })
    assertBookSession(session, uid)
    if (!claimed) continue
    try {
      const result = await bookApi.update(row.bookId, {
        ...claimed.patch, baseUpdatedAt: claimed.baseUpdatedAt, operationId: claimed.operationId
      }, session.signal)
      assertBookSession(session, uid)
      const serverBook = result?.books?.find((b: { bookId?: string }) => String(b.bookId) === row.bookId)
      if (serverBook) {
        // 当前会话校验之后才能写全局 store；旧账号/旧会话的回执到此已无效。
        useLedger.getState().updateBookMeta(row.bookId, {
          accountBookName: serverBook.name,
          icon: serverBook.icon ?? undefined,
          showTransfer: serverBook.showTransfer !== 0 && serverBook.showTransfer !== false,
          showStock: serverBook.showStock !== 0 && serverBook.showStock !== false,
          hidden: !!serverBook.hidden,
          updateTime: serverBook.updatedAt ?? undefined
        })
      }
      const more = await withStore('readwrite', async (store) => {
        const key = keyOf(uid, row.bookId)
        const current = await readOne(store, key)
        assertBookSession(session, uid)
        if (!current) return false
        const samePatch = JSON.stringify(current.patch ?? {}) === JSON.stringify(claimed.patch ?? {})
        if (samePatch) {
          await req(store.delete(key))
          return false
        }
        // 请求期间又改了：保留新内容，推进基准版本，稍后再补一次。
        const updated = result?.operationUpdatedAt ?? serverBook?.updatedAt
        await req(store.put({
          ...current,
          baseUpdatedAt: typeof updated === 'number' ? updated : current.baseUpdatedAt,
          sending: undefined,
          retry: undefined,
          error: undefined
        }))
        return true
      })
      assertBookSession(session, uid)
      if (more) followUp = true
      sent++
    } catch (error) {
      assertBookSession(session, uid)   // AbortError 直接向上，不覆盖原发送快照
      const e = error as Error & { errorCode?: string; status?: number }
      const status = e.status
      const retryable = !e.errorCode && (status == null || status === 429 || status >= 500)
      if (!retryable) {
        // 冲突或服务端明确拒绝：保留草稿及原因，等待用户核对，不自动烧额度。
        await withStore('readwrite', async (store) => {
          const key = keyOf(uid, row.bookId)
          const current = await readOne(store, key)
          assertBookSession(session, uid)
          if (!current) return
          await req(store.put({ ...current, conflict: true, sending: undefined,
            retry: undefined, error: e.message || '服务端拒绝了这次账本修改' }))
        })
        conflicted++
        continue
      }

      // 网络/5xx：原快照保留，退避到期后以相同 operationId + payload 重放。
      let retryAt = Date.now() + RETRY_BASE_MS
      await withStore('readwrite', async (store) => {
        const key = keyOf(uid, row.bookId)
        const current = await readOne(store, key)
        assertBookSession(session, uid)
        if (!current) return
        const prev = current.sending
        const keep = prev?.operationId && prev.patch ? { ...prev, startedAt: 0 } : current.sending
        const failures = claimed.failures + 1
        const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(5, claimed.failures))
        retryAt = Date.now() + delay
        await req(store.put({ ...current, sending: keep, error: undefined,
          retry: { at: retryAt, failures } }))
      })
      scheduleBookPatchRetry(uid, session, retryAt)
    }
  }
  return { roundSent: sent, roundConflicted: conflicted, roundFollowUp: followUp }
}

export async function conflictOf(bookId: string): Promise<PendingBookPatch | undefined> {
  const entry = await getBookPatch(bookId)
  return entry?.conflict ? entry : undefined
}

/** 迁移冲突只有在用户明确选择保留哪一份后，才可丢弃旧键中的两个候选。 */
function discardLegacyMigrationConflict(uid: number, bookId: string, entry: PendingBookPatch) {
  if (!entry.migrationConflict) return
  for (const key of [legacyScopedKey(uid), LEGACY_GLOBAL_KEY]) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const value = JSON.parse(raw) as Record<string, unknown>
      delete value[bookId]
      if (Object.keys(value).length) localStorage.setItem(key, JSON.stringify(value))
      else localStorage.removeItem(key)
    } catch { /* 无法安全清理时保留原数据，供下次核对 */ }
  }
}

/** 用户选择「以本地为准」：拉服务端最新版本后覆盖式提交 */
export async function resolveConflictKeepLocal(bookId: string): Promise<boolean> {
  const uid = getCurrentUid()
  const session = captureSessionEpoch()
  const entry = await getBookPatch(bookId)
  if (!entry) return false
  try {
    assertBookSession(session, uid)
    const fresh = await bookApi.list(session.signal)
    assertBookSession(session, uid)
    const serverBook = (fresh?.books ?? []).find((b: { bookId?: string }) => String(b.bookId) === bookId)
    if (!serverBook || !Number.isFinite(serverBook.updatedAt)) return false
    await bookApi.update(bookId, {
      ...entry.patch, baseUpdatedAt: serverBook.updatedAt,
      operationId: globalThis.crypto?.randomUUID?.() ?? undefined
    }, session.signal)
    assertBookSession(session, uid)
    await clearBookPatch(bookId, entry)
    assertBookSession(session, uid)
    discardLegacyMigrationConflict(uid, bookId, entry)
    void refreshBookPendingStatus()
    return true
  } catch {
    return false
  }
}

/** 用户选择「以服务端为准」：先确认能读到云端内容，再放弃本地草稿 */
export async function resolveConflictUseServer(bookId: string) {
  const uid = getCurrentUid()
  const session = captureSessionEpoch()
  const entry = await getBookPatch(bookId)
  if (!entry) return null
  try {
    assertBookSession(session, uid)
    const fresh = await bookApi.list(session.signal)
    assertBookSession(session, uid)
    const book = (fresh?.books ?? []).find((b: { bookId?: string }) => String(b.bookId) === bookId)
    if (!book) return null
    await clearBookPatch(bookId, entry)
    assertBookSession(session, uid)
    discardLegacyMigrationConflict(uid, bookId, entry)
    void refreshBookPendingStatus()
    return book
  } catch {
    return null
  }
}

export async function hasPendingBookPatches(): Promise<boolean> {
  return (await listAll(getCurrentUid())).length > 0
}
