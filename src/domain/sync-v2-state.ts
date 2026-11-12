/** Persistent, account-scoped state for the opt-in versioned sync protocol. */
export interface VersionedRecord {
  kind: string
  id: string
  payload: Record<string, unknown> | null
  updatedAt: number
  deleted?: boolean
  bookId?: string | number
  periodKey?: string
}
export interface RemoteRecord extends VersionedRecord { version: number; ownerId?: number }
export interface BaseRecord { version: number; fingerprint: string }
export interface PendingOperation extends VersionedRecord { operationId: string; baseVersion: number; generation?: number }
export interface VersionedMeta {
  schema: 2
  generations: Record<string, number>
  bases: Record<string, BaseRecord>
  pending: Record<string, PendingOperation>
  conflicts: Record<string, string>
  archives?: Array<{ at: number; key: string; local: VersionedRecord; remote: RemoteRecord | null }>
}

export const recordKey = (record: Pick<VersionedRecord, 'kind' | 'id'>) => JSON.stringify([record.kind, String(record.id)])
function markAmbiguous(meta: VersionedMeta, records: VersionedRecord[]): void {
  const seen = new Set<string>()
  for (const record of records) {
    const key = recordKey(record)
    if (seen.has(key)) meta.conflicts[key] = '存在同编号的多条记录，请先核对身份'
    seen.add(key)
  }
}
const ignored = new Set(['ownerId', 'memberNo', 'sequenceNo', 'displayId'])
function canonical(value: unknown, top = false): unknown {
  if (Array.isArray(value)) return value.map(v => canonical(v))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, val]) => val !== undefined && !(top && ignored.has(key)))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, val]) => [key, canonical(val)]))
}
export const fingerprint = (r: Pick<VersionedRecord, 'kind' | 'payload' | 'deleted'>) => {
  const payload = r.deleted ? null : canonical(r.payload, true)
  // The legacy default book is constructed independently on each device with
  // a new createTime; that display timestamp is not a change to its contents.
  if (r.kind === 'book' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const book = payload as Record<string, unknown>
    if (book.accountBookId === 1 && book.accountBookName === '日常账本' && !book.bookId) delete book.createTime
  }
  return JSON.stringify({ deleted: !!r.deleted, payload })
}
export const emptyMeta = (): VersionedMeta => ({ schema: 2, generations: {}, bases: {}, pending: {}, conflicts: {} })
export function bookOf(record: VersionedRecord): string | undefined {
  const id = record.bookId ?? record.payload?.bookId
  return id == null || id === '' || String(id) === '0' ? undefined : String(id)
}

/** Bootstrap only establishes baselines proven identical. Differences remain local. */
export function bootstrapMeta(local: VersionedRecord[], remote: RemoteRecord[], generations: Record<string, number>): VersionedMeta {
  const meta = emptyMeta()
  meta.generations = { ...generations }
  markAmbiguous(meta, local)
  markAmbiguous(meta, remote)
  const remoteByKey = new Map(remote.map(r => [recordKey(r), r]))
  for (const item of local) {
    const key = recordKey(item)
    if (meta.conflicts[key]) continue
    const server = remoteByKey.get(key)
    if (server) {
      if (fingerprint(item) === fingerprint(server)) meta.bases[key] = { version: server.version, fingerprint: fingerprint(item) }
      else meta.conflicts[key] = '升级前本地与云端内容不同，请核对'
    } else {
      const book = bookOf(item)
      // Generation zero also includes history from before this protocol existed.
      // A local-only ledger record might predate a legacy clear, so never infer it is new.
      if (book && ['bill', 'transfer', 'lend', 'refund', 'reimbursement', 'cycle'].includes(item.kind))
        meta.conflicts[key] = '升级前的本地记录没有云端基准，无法确认是否早于账本清空，请核对'
    }
  }
  return meta
}

/** A pending operation keeps its original base and exact payload across retries. */
export function queueChanges(meta: VersionedMeta, records: VersionedRecord[], newId: () => string): void {
  markAmbiguous(meta, records)
  for (const item of records) {
    const key = recordKey(item)
    if (meta.pending[key] || meta.conflicts[key]) continue
    const base = meta.bases[key]
    if (base && base.fingerprint === fingerprint(item)) continue
    const book = bookOf(item)
    if (book && meta.generations[book] == null) { meta.conflicts[key] = '账本代次未知，请联网核对'; continue }
    meta.pending[key] = { ...structuredClone(item), operationId: newId(), baseVersion: base?.version ?? 0,
      ...(book ? { generation: meta.generations[book] } : {}) }
  }
}

/** Only acknowledge the exact operation that was sent; later edits remain dirty. */
export function acknowledge(meta: VersionedMeta, key: string, operationId: string, version: number): void {
  const pending = meta.pending[key]
  if (!pending || pending.operationId !== operationId) return
  meta.bases[key] = { version, fingerprint: fingerprint(pending) }
  delete meta.pending[key]
  delete meta.conflicts[key]
}

/** Never replace a local draft with a remote version that it did not observe. */
export function reconcileRemote(meta: VersionedMeta, records: RemoteRecord[], local: VersionedRecord[]): RemoteRecord[] {
  markAmbiguous(meta, records)
  markAmbiguous(meta, local)
  const localByKey = new Map(local.map(r => [recordKey(r), r]))
  const accepted: RemoteRecord[] = []
  for (const remote of records) {
    const key = recordKey(remote)
    const own = localByKey.get(key)
    const base = meta.bases[key]
    if (meta.pending[key] || meta.conflicts[key]) continue
    if (own) {
      const ownHash = fingerprint(own)
      if (!base && ownHash !== fingerprint(remote)) {
        meta.conflicts[key] = '本地与云端记录不同，请核对'
        continue
      }
      if (base && ownHash !== base.fingerprint) {
        if (remote.version !== base.version) meta.conflicts[key] = '本地和云端都已修改，请核对'
        continue
      }
    }
    meta.bases[key] = { version: remote.version, fingerprint: fingerprint(remote) }
    accepted.push(remote)
  }
  return accepted
}

/** Do not advance a book's generation while it contains unresolved local drafts. */
export function advanceGenerations(meta: VersionedMeta, generations: Record<string, number>, local: VersionedRecord[]): void {
  const busy = new Set<string>()
  for (const item of local) {
    const key = recordKey(item)
    const base = meta.bases[key]
    if (meta.pending[key] || meta.conflicts[key] || !base || base.fingerprint !== fingerprint(item)) {
      const book = bookOf(item)
      if (book) busy.add(book)
    }
  }
  for (const [book, generation] of Object.entries(generations)) if (!busy.has(book)) meta.generations[book] = generation
}
