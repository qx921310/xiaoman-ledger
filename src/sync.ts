import { useLedger } from './store'
import type { Bill } from './types'
import { periodKeyOf as cyclePeriodKey } from './domain/cycle-dedupe'
import { beginRemote, endRemote } from './domain/dirty-bus'
import { captureSessionEpoch } from './domain/session-epoch'
import { getCurrentUid } from './auth'
import { runVersionedSync } from './domain/sync-v2-runner'
import { bookOf, fingerprint, queueChanges, recordKey } from './domain/sync-v2-state'
import type { VersionedMeta, RemoteRecord } from './domain/sync-v2-state'

export interface SyncRecord {
  kind: string
  id: string
  /** 周期账单的期号：bookId|cycleId|日期，服务端据此保证同一期只落一条 */
  periodKey?: string
  payload: Record<string, unknown> | null
  updatedAt: number
  deleted?: boolean
  bookId?: string | number
}

/** kind → [store 里的集合名, 主键字段] */
export const KIND_MAP: Record<string, [string, string]> = {
  bill: ['bills', 'billId'],
  asset: ['assets', 'assetId'],
  transfer: ['transfers', 'transferId'],
  lend: ['lends', 'lendId'],
  cycle: ['cycles', 'cycleId'],
  tag: ['tags', 'tagId'],
  parent: ['parentCategories', 'id'],
  child: ['childCategories', 'id'],
  book: ['accountBooks', 'accountBookId'],
  reimbursement: ['reimbursements', 'reimbursementId'],
  refund: ['refunds', 'refundId'],
  budget: ['budgets', 'month'],
  // P0-1：新实体也要同步，否则换设备会丢
  splitGroup: ['splitGroups', 'splitGroupId'],
  splitMember: ['splitMembers', 'splitMemberId'],
  splitExpense: ['splitExpenses', 'splitExpenseId'],
  stockAsset: ['stockAssets', 'stockAssetId'],
  stockInfo: ['stockInfos', 'stockInfoId'],
  template: ['templates', 'templateId'],
  homeLoan: ['homeLoans', 'loanId'],
  instalment: ['instalments', 'instalmentId'],
  billGroup: ['billGroups', 'billGroupId'],
  billRelated: ['billRelated', 'relatedId'],
  dream: ['dreams', 'dreamId'],
  aiType: ['aiTypeRules', 'ruleId'],
  fixedDeposit: ['fixedDeposits', 'depositId'],
  assetFlow: ['assetFlows', 'flowId']
}

type Entity = Record<string, unknown>

const idOf = (kind: string, item: Entity) =>
  kind === 'budget'
    ? ((item.type ?? 'month') === 'custom' && item.budgetId != null
        ? `custom:${item.budgetId}`
        : `${item.type ?? 'month'}:${item.month}:${item.categoryId}`) : kind === 'bill' ? String(item.syncId ?? item.billId) : String(item[KIND_MAP[kind][1]])

export function collectRecords(): SyncRecord[] {
  const s = useLedger.getState() as unknown as Record<string, Entity[]> & { tombstones?: Array<Record<string, unknown>> }
  const out: SyncRecord[] = []
  for (const kind of Object.keys(KIND_MAP)) {
    const arr = (s[KIND_MAP[kind][0]] ?? []) as Entity[]
    for (const item of arr) {
      const payload: Entity = kind === 'asset'
        ? (({ assetNumber: _balance, ...rest }) => rest)(item)
        : item
      const record: SyncRecord = { kind, id: idOf(kind, item), payload, updatedAt: Number(item.updateTime ?? 0) }
      if (kind === 'bill') {
        const periodKey = cyclePeriodKey(item as unknown as Bill)
        if (periodKey) record.periodKey = periodKey
      }
      out.push(record)
    }
  }
  for (const t of (s.tombstones ?? [])) {
    out.push({
      kind: String(t.kind), id: String(t.id),
      bookId: t.bookId as string | number | undefined,
      payload: null, updatedAt: Number(t.updatedAt ?? 0), deleted: true
    })
  }
  return out
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch('/api' + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  const data = await res.json().catch(() => ({ code: 1, msg: '响应异常' }))
  if (data.code !== 0) throw new Error(data.msg || '同步失败')
  return data.result
}

const inFlight = new WeakMap<AbortSignal, ReturnType<typeof runVersionedSync>>()

// Tabs share the same outbox in localStorage; serialize its read/modify/write.
function withSyncLock<T>(session: ReturnType<typeof captureSessionEpoch>, work: () => Promise<T>): Promise<T> {
  const uid = getCurrentUid()
  if (typeof navigator === 'undefined' || !navigator.locks) return work()
  return navigator.locks.request<Promise<T>>(`xiaoman-sync-v2:${uid}`, { signal: session.signal }, async () => {
    session.assertCurrent()
    return work()
  }) as unknown as Promise<T>
}

export function getVersionedConflicts() {
  try {
    const raw = localStorage.getItem(`xiaoman-sync-v2:${getCurrentUid()}`)
    if (!raw) return []
    const meta = JSON.parse(raw) as VersionedMeta
    return Object.entries(meta.conflicts ?? {}).map(([key, reason]) => {
      const [kind, id] = JSON.parse(key) as [string, string]
      return { key, kind, id, reason }
    })
  } catch { return [] }
}

/** Includes unsent operations and archived conflict versions in a user-requested backup. */
export function getVersionedRecovery(): VersionedMeta | undefined {
  const raw = localStorage.getItem(`xiaoman-sync-v2:${getCurrentUid()}`)
  if (!raw) return undefined
  return JSON.parse(raw) as VersionedMeta
}

export async function previewVersionedConflict(key: string) {
  const session = captureSessionEpoch()
  const uid = getCurrentUid()
  const local = collectRecords().filter(r => recordKey(r) === key)
  if (local.length !== 1) throw new Error('本地记录身份不明确，请先导出备份')
  const pulled = await call('/data/pull', { signal: session.signal }) as { records: RemoteRecord[] }
  session.assertCurrent()
  if (getCurrentUid() !== uid || !Array.isArray(pulled.records)) throw new Error('会话或云端状态已变化，请重试')
  const remote = pulled.records.filter(r => recordKey(r) === key)
  if (remote.length > 1) throw new Error('云端存在同编号记录，请先导出备份')
  return { key, local: structuredClone(local[0]), remote: remote[0] ?? null }
}

/** Explicit user decision; saves both versions before retrying against the latest revision. */
export async function keepLocalConflict(key: string, preview: Awaited<ReturnType<typeof previewVersionedConflict>>) {
  const session = captureSessionEpoch()
  const uid = getCurrentUid()
  const ensure = () => {
    session.assertCurrent()
    if (getCurrentUid() !== uid) throw new DOMException('登录会话已变更', 'AbortError')
  }
  const active = inFlight.get(session.signal)
  if (active) await active
  ensure()
  const initial = collectRecords().filter(r => recordKey(r) === key)
  if (initial.length !== 1) throw new Error('本地记录身份不明确，不能自动处理；请先导出备份')
  const hash = fingerprint(initial[0])
  const run = withSyncLock(session, async () => {
    const pulled = await call('/data/pull', { signal: session.signal }) as { records: RemoteRecord[]; generations: Array<{ bookId: string; generation: number }> }
    ensure()
    if (!Array.isArray(pulled.records) || !Array.isArray(pulled.generations)) throw new Error('无法确认云端版本')
    const local = collectRecords()
    const matches = local.filter(r => recordKey(r) === key)
    if (matches.length !== 1 || fingerprint(matches[0]) !== hash) throw new Error('本地记录已变化，请重新核对')
    const raw = localStorage.getItem(`xiaoman-sync-v2:${uid}`)
    if (!raw) throw new Error('同步状态不存在，请先同步')
    const meta = JSON.parse(raw) as VersionedMeta
    if (!meta.conflicts[key]) throw new Error('该记录已不在待核对列表')
    const remote = pulled.records.filter(r => recordKey(r) === key)
    if (remote.length > 1) throw new Error('云端存在同编号记录，请先导出备份')
    if (preview.key !== key || fingerprint(matches[0]) !== fingerprint(preview.local) ||
      (remote[0]?.version ?? 0) !== (preview.remote?.version ?? 0) ||
      (remote[0] && preview.remote && fingerprint(remote[0]) !== fingerprint(preview.remote)))
      throw new Error('记录在核对后发生变化，请重新查看')
    const book = bookOf(matches[0])
    const generation = book ? pulled.generations.find(g => String(g.bookId) === book)?.generation : undefined
    if (book && !Number.isSafeInteger(generation)) throw new Error('无法确认账本代次，请检查账本权限')
    // Freeze other drafts at their original generation before changing this book's baseline.
    queueChanges(meta, local, () => globalThis.crypto.randomUUID())
    meta.archives ??= []
    meta.archives.push({ at: Date.now(), key, local: structuredClone(matches[0]), remote: remote[0] ? structuredClone(remote[0]) : null })
    if (book) meta.generations[book] = generation!
    delete meta.conflicts[key]
    delete meta.pending[key]
    meta.pending[key] = { ...structuredClone(matches[0]), operationId: globalThis.crypto.randomUUID(), baseVersion: remote[0]?.version ?? 0,
      ...(book ? { generation } : {}) }
    localStorage.setItem(`xiaoman-sync-v2:${uid}`, JSON.stringify(meta))
    return executeSync(session)
  }).finally(() => { if (inFlight.get(session.signal) === run) inFlight.delete(session.signal) })
  inFlight.set(session.signal, run)
  return run
}

/** 放弃本机版本，改用云端版本（保留双方内容到归档，便于回溯）。 */
export async function acceptRemoteConflict(key: string, preview: Awaited<ReturnType<typeof previewVersionedConflict>>) {
  const session = captureSessionEpoch()
  const uid = getCurrentUid()
  const ensure = () => {
    session.assertCurrent()
    if (getCurrentUid() !== uid) throw new DOMException('登录会话已变更', 'AbortError')
  }
  const active = inFlight.get(session.signal)
  if (active) await active
  ensure()
  const raw = localStorage.getItem(`xiaoman-sync-v2:${uid}`)
  if (!raw) throw new Error('同步状态不存在，请先同步')
  const meta = JSON.parse(raw) as VersionedMeta
  if (!meta.conflicts[key]) throw new Error('该记录已不在待核对列表')
  if (!preview.remote) throw new Error('云端没有这条记录，无法使用云端版本')
  const local = collectRecords().filter(r => recordKey(r) === key)
  if (local.length !== 1) throw new Error('本地记录身份不明确，请先导出备份')
  if (fingerprint(local[0]) !== fingerprint(preview.local)) throw new Error('本机记录已变化，请重新核对')
  // 双方内容先归档，再覆盖
  meta.archives ??= []
  meta.archives.push({
    at: Date.now(), key,
    local: structuredClone(local[0]),
    remote: structuredClone(preview.remote)
  })
  beginRemote()
  try {
    useLedger.getState().applyRemote([{ ...preview.remote, versionAuthoritative: true } as never])
  } finally {
    endRemote()
  }
  ensure()
  delete meta.conflicts[key]
  delete meta.pending[key]
  meta.bases[key] = { version: preview.remote.version, fingerprint: fingerprint(preview.remote) }
  localStorage.setItem(`xiaoman-sync-v2:${uid}`, JSON.stringify(meta))
  return { key }
}

/** All startup, manual and automatic syncs share one queue per account session. */
export function syncNow(): ReturnType<typeof runVersionedSync> {
  const session = captureSessionEpoch()
  const existing = inFlight.get(session.signal)
  if (existing) return existing
  const run = withSyncLock(session, () => executeSync(session)).finally(() => {
    if (inFlight.get(session.signal) === run) inFlight.delete(session.signal)
  })
  inFlight.set(session.signal, run)
  return run
}

/** Versioned sync keeps account-scoped baselines and retry operations on disk. */
async function executeSync(session: ReturnType<typeof captureSessionEpoch>) {
  const uid = getCurrentUid()
  const key = `xiaoman-sync-v2:${uid}`
  const ensure = () => {
    session.assertCurrent()
    if (getCurrentUid() !== uid) throw new DOMException('登录会话已变更', 'AbortError')
  }
  try {
    const result = await runVersionedSync({
      read: collectRecords,
      check: ensure,
      id: () => globalThis.crypto.randomUUID(),
      load: () => {
        ensure()
        const raw = localStorage.getItem(key)
        if (!raw) return null
        try { return JSON.parse(raw) as VersionedMeta } catch { throw new Error('本地同步状态损坏，请先导出备份') }
      },
      save: (meta) => {
        ensure()
        try { localStorage.setItem(key, JSON.stringify(meta)) } catch { throw new Error('无法保存同步草稿，请检查设备存储空间') }
      },
      pull: async () => {
        const data = await call('/data/pull', { signal: session.signal })
        ensure()
        return data
      },
      push: async (records) => {
        const data = await call('/data/push', { method: 'POST', body: JSON.stringify({ protocolVersion: 2, records }), signal: session.signal })
        ensure()
        return data
      },
      apply: (records: RemoteRecord[]) => {
        ensure()
        beginRemote()
        try { useLedger.getState().applyRemote(records.map(r => ({ ...r, versionAuthoritative: true }))) }
        finally { endRemote() }
      }
    })
    ensure()
    beginRemote()
    try {
      useLedger.getState().mergeTaxonomy()
      useLedger.getState().setSessionSyncAt(Date.now())
      if (!result.denied && !result.conflicts) useLedger.getState().setLastSync(Date.now())
    } finally { endRemote() }
    return result
  } catch (e) {
    if (!session.signal.aborted && getCurrentUid() === uid) useLedger.getState().setSessionSyncAt(-1)
    throw e
  }
}
