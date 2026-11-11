import { useLedger } from './store'
import type { Bill } from './types'
import { periodKeyOf as cyclePeriodKey } from './domain/cycle-dedupe'

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
  budget: ['budgets', 'month']
}

type Entity = Record<string, unknown>

const idOf = (kind: string, item: Entity) =>
  kind === 'budget' ? `${item.month}:${item.categoryId}` : kind === 'bill' ? String(item.syncId ?? item.billId) : String(item[KIND_MAP[kind][1]])

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

/** 先推后拉：推送本地记录，再把云端记录合并回来（逐条 LWW） */
export async function syncNow() {
  const records = collectRecords()
  try {
    return await runSync(records)
  } catch (e) {
    // 失败也要解除"等待首次同步"的阻塞，否则周期账单永远不生成
    useLedger.getState().setSessionSyncAt(-1)
    throw e
  }
}

async function runSync(records: ReturnType<typeof collectRecords>) {
  const pushed = await call('/data/push', { method: 'POST', body: JSON.stringify({ records }) })

  // 服务端权威：期号冲突要先拉回胜出记录，才能判断本地候选是「重复」还是「被改过」
  const authoritative = (pushed.authoritative ?? []) as Array<{ id: string; winnerId: string; reason: string }>

  const pulled = await call('/data/pull')
  useLedger.getState().applyRemote(pulled.records || [])
  let conflictsKept = 0
  if (authoritative.length) {
    const r = useLedger.getState().resolvePeriodConflicts(authoritative.map((a) => ({ id: a.id, winnerId: a.winnerId })))
    conflictsKept = r.kept
  }
  // 云端记录会带回旧分类，合并后再跑一次规范/去重
  useLedger.getState().mergeTaxonomy()
  // 多设备可能各自补生成了同一期周期账单：交回 store 去重（会重算余额并排墓碑）
  useLedger.getState().dedupeCycleBills()
  useLedger.getState().setSessionSyncAt(Date.now())
  if (!pushed.denied) useLedger.getState().setLastSync(Date.now())
  return {
    pushed: pushed.accepted as number,
    skipped: pushed.skipped as number,
    denied: pushed.denied as number,
    duplicates: (pushed.duplicates ?? 0) as number,
    conflictsKept,
    pulled: (pulled.records || []).length as number
  }
}
