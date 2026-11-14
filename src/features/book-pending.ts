import { books as bookApi, getCurrentUid } from '../auth'
import { useLedger } from '../store'

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
  sending?: { operationId: string; patch: Record<string, unknown>; baseUpdatedAt: number | null }
  /** 与别的设备冲突，等待用户核对（不会再自动补传） */
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
async function migrateLegacy(uid: number): Promise<void> {
  if (!uid) return
  const rawScoped = localStorage.getItem(legacyScopedKey(uid))
  const rawGlobal = localStorage.getItem(LEGACY_GLOBAL_KEY)
  if (!rawScoped && !rawGlobal) return
  const ownBooks = new Set(useLedger.getState().accountBooks.map((b) => String(b.bookId)))
  const parsed: Record<string, PendingBookPatch> = {}
  for (const raw of [rawScoped, rawGlobal]) {
    if (!raw) continue
    try {
      const value = JSON.parse(raw) as Record<string, unknown>
      for (const [bookId, entry] of Object.entries(value)) {
        if (!ownBooks.has(bookId)) continue          // 归属未确认的条目留在旧键里
        const e = entry as Partial<PendingBookPatch>
        parsed[bookId] = 'patch' in (e as object)
          ? { bookId, uid, patch: (e.patch ?? {}) as Record<string, unknown>, baseUpdatedAt: e.baseUpdatedAt ?? null, at: e.at ?? 0, operationId: e.operationId, sending: e.sending, conflict: e.conflict }
          : { bookId, uid, patch: (entry ?? {}) as Record<string, unknown>, baseUpdatedAt: null, at: 0 }
      }
    } catch { /* 坏的旧数据忽略 */ }
  }
  if (!Object.keys(parsed).length) return

  const written = new Set<string>()
  await withStore('readwrite', async (store) => {
    for (const [bookId, entry] of Object.entries(parsed)) {
      const key = keyOf(uid, bookId)
      const existing = await readOne(store, key)
      if (existing) continue                          // 已在库里：不覆盖更新的草稿，旧条目必须保留
      await req(store.put({ ...entry, key }))
      written.add(bookId)
    }
  })
  // 事务已提交成功，才清理已落库的条目；未确认归属或未迁移的必须留在旧键里
  try {
    const leftover = JSON.parse(rawScoped || '{}') as Record<string, unknown>
    // 只清理「确实写入 IndexedDB」的条目；被跳过（已有草稿）或未确认归属的一律保留
    for (const bookId of written) delete leftover[bookId]
    if (Object.keys(leftover).length > 0) localStorage.setItem(legacyScopedKey(uid), JSON.stringify(leftover))
    else localStorage.removeItem(legacyScopedKey(uid))
  } catch {
    localStorage.removeItem(legacyScopedKey(uid))
  }
  const remaining: Record<string, unknown> = {}
  if (rawGlobal) {
    try {
      const value = JSON.parse(rawGlobal) as Record<string, unknown>
      for (const [bookId, entry] of Object.entries(value)) {
        // 未确认归属、或本次因已有草稿被跳过的一律保留，只有确实写进 IndexedDB 的才清理
        if (!ownBooks.has(bookId) || !written.has(bookId)) remaining[bookId] = entry
      }
    } catch { /* 忽略 */ }
  }
  if (Object.keys(remaining).length) localStorage.setItem(LEGACY_GLOBAL_KEY, JSON.stringify(remaining))
  else localStorage.removeItem(LEGACY_GLOBAL_KEY)
}

/** 记录一次失败的账本保存，等待联网后补传 */
export async function queueBookPatch(bookId: string, patch: Record<string, unknown>, baseUpdatedAt: number | null): Promise<void> {
  const uid = getCurrentUid()
  await migrateLegacy(uid)
  return withStore('readwrite', async (store) => {
    if (getCurrentUid() !== uid) throw new Error('账号已切换，请重新操作')
    const key = keyOf(uid, bookId)
    const existing = await readOne(store, key)
    const record: StoredRecord = {
      key, bookId, uid,
      patch: { ...(existing?.patch ?? {}), ...patch },
      baseUpdatedAt: existing?.baseUpdatedAt ?? baseUpdatedAt ?? null,
      at: Date.now(),
      operationId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      // 在途快照不可被新编辑覆盖：A 已发出但响应丢失时，必须能用原 opId + 原 payload 重放
      sending: existing?.sending,
      conflict: existing?.conflict
    }
    await req(store.put(record))
  })
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
  return withStore('readwrite', async (store) => {
    const key = keyOf(uid, bookId)
    const current = await readOne(store, key)
    if (!current) return
    if (!expected) return
    if (!sameContent(stripKey(current), expected)) return
    await req(store.delete(key))
  })
}

export async function markBookPatchConflict(bookId: string): Promise<void> {
  const uid = getCurrentUid()
  return withStore('readwrite', async (store) => {
    const key = keyOf(uid, bookId)
    const current = await readOne(store, key)
    if (!current) return
    await req(store.put({ ...current, conflict: true }))
  })
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

/**
 * 补传：带 baseUpdatedAt 与 operationId 走服务端幂等接口。
 * 冲突不静默丢弃：保留草稿并标记 conflict，交由用户核对。
 */
export async function flushBookPatches(): Promise<{ sent: number; conflicted: number }> {
  const uid = getCurrentUid()
  await migrateLegacy(uid)
  let sent = 0
  let conflicted = 0
  // 每一轮扫描一遍队列；请求期间又产生的新编辑会在下一轮被处理。
  // 注意：不能递归调用自己，否则在支持 Web Locks 的浏览器里会重入同一把锁而死锁。
  for (let round = 0; round < 5; round++) {
    if (getCurrentUid() !== uid) break
    const { roundSent, roundConflicted, roundFollowUp } = await flushRound(uid)
    sent += roundSent
    conflicted += roundConflicted
    if (!roundFollowUp) break
  }
  return { sent, conflicted }
}

/** 扫描一轮队列：领取发送快照 → 发请求 → 用短事务确认结果 */
async function flushRound(uid: number): Promise<{ roundSent: number; roundConflicted: number; roundFollowUp: boolean }> {
  {
    let sent = 0
    let conflicted = 0
    let followUp = false
    const rows = await listAll(uid)
    for (const row of rows) {
      if (getCurrentUid() !== uid) break
      if (row.conflict) continue
      // 在事务里领取发送快照：两个标签页同时补传时只有一方能拿到，另一方会看到 sending
      const claimed = await withStore('readwrite', async (store) => {
        const key = keyOf(uid, row.bookId)
        const current = await readOne(store, key)
        if (!current || current.conflict) return undefined
        const LEASE_MS = 60_000
        const prev = current.sending as { operationId?: string; patch?: Record<string, unknown>; baseUpdatedAt?: number | null; startedAt?: number } | undefined
        if (prev?.startedAt && Date.now() - prev.startedAt < LEASE_MS) return undefined
        if (prev?.operationId && prev.patch) {
          // 上次会话已在途中：先原样重放原快照（同 operationId + 同 payload），
          // 不能拿用户这期间的新编辑去替换，否则会丢请求并制造假冲突
          await req(store.put({ ...current, sending: { ...prev, startedAt: Date.now() } }))
          return { operationId: prev.operationId, patch: prev.patch, baseUpdatedAt: prev.baseUpdatedAt ?? null }
        }
        const operationId = current.operationId
          ?? globalThis.crypto?.randomUUID?.()
          ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const sending = { operationId, patch: current.patch, baseUpdatedAt: current.baseUpdatedAt, startedAt: Date.now() }
        await req(store.put({ ...current, operationId, sending }))
        return { operationId, patch: current.patch, baseUpdatedAt: current.baseUpdatedAt }
      })
      if (!claimed) continue
      if (getCurrentUid() !== uid) break
      try {
        const result = await bookApi.update(row.bookId, {
          ...claimed.patch, baseUpdatedAt: claimed.baseUpdatedAt, operationId: claimed.operationId
        })
        const serverBook = result?.books?.find((b: { bookId?: string }) => String(b.bookId) === row.bookId)
        if (serverBook) {
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
          if (!current) return false
          const samePatch = JSON.stringify(current.patch ?? {}) === JSON.stringify(claimed.patch ?? {})
          if (samePatch) {
            await req(store.delete(key))
            return false
          }
          // 请求期间又改了：保留新内容，推进基准版本，稍后再补一次
          const updated = result?.operationUpdatedAt ?? serverBook?.updatedAt
          await req(store.put({
            ...current,
            baseUpdatedAt: typeof updated === 'number' ? updated : current.baseUpdatedAt,
            sending: undefined
          }))
          return true
        })
        if (more) followUp = true
        sent++
      } catch (e) {
        const code = (e as { errorCode?: string }).errorCode
        if (code === 'BOOK_CONFLICT' || code === 'OPERATION_ID_REUSED') {
          // 冲突或回执对不上：保留本地草稿，等用户核对，不覆盖也不丢弃
          await withStore('readwrite', async (store) => {
            const key = keyOf(uid, row.bookId)
            const current = await readOne(store, key)
            if (!current) return
            await req(store.put({ ...current, conflict: true, sending: undefined }))
          })
          conflicted++
        } else {
          // 离线/网络错误：保留原快照并要求立刻重放（startedAt=0），
          // 重放保证同一 operationId + 同一 payload，服务端可幂等去重
          await withStore('readwrite', async (store) => {
            const key = keyOf(uid, row.bookId)
            const current = await readOne(store, key)
            if (!current) return
            const prev = current.sending as { operationId?: string; patch?: Record<string, unknown>; baseUpdatedAt?: number | null } | undefined
            const keep = prev?.operationId && prev.patch
              ? { ...prev, startedAt: 0 }
              : current.sending
            await req(store.put({ ...current, sending: keep }))
          })
        }
      }
    }
    return { roundSent: sent, roundConflicted: conflicted, roundFollowUp: followUp }
  }
}

export async function conflictOf(bookId: string): Promise<PendingBookPatch | undefined> {
  const entry = await getBookPatch(bookId)
  return entry?.conflict ? entry : undefined
}

/** 用户选择「以本地为准」：拉服务端最新版本后覆盖式提交 */
export async function resolveConflictKeepLocal(bookId: string): Promise<boolean> {
  const uid = getCurrentUid()
  const entry = await getBookPatch(bookId)
  if (!entry) return false
  try {
    const fresh = await bookApi.list()
    if (getCurrentUid() !== uid) return false
    const serverBook = (fresh?.books ?? []).find((b: { bookId?: string }) => String(b.bookId) === bookId)
    if (!serverBook || !Number.isFinite(serverBook.updatedAt)) return false
    await bookApi.update(bookId, {
      ...entry.patch, baseUpdatedAt: serverBook.updatedAt,
      operationId: globalThis.crypto?.randomUUID?.() ?? undefined
    })
    await clearBookPatch(bookId, entry)
    return true
  } catch {
    return false
  }
}

/** 用户选择「以服务端为准」：先确认能读到云端内容，再放弃本地草稿 */
export async function resolveConflictUseServer(bookId: string) {
  const uid = getCurrentUid()
  const entry = await getBookPatch(bookId)
  if (!entry) return null
  const fresh = await bookApi.list()
  if (getCurrentUid() !== uid) return null
  const book = (fresh?.books ?? []).find((b: { bookId?: string }) => String(b.bookId) === bookId)
  if (!book) return null
  await clearBookPatch(bookId, entry)
  return book
}

export async function hasPendingBookPatches(): Promise<boolean> {
  return (await listAll(getCurrentUid())).length > 0
}
