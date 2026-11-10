import { useLedger } from './store'

export interface SyncRecord {
  kind: string
  id: string
  payload: any
  updatedAt: number
  deleted?: boolean
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

const idOf = (kind: string, item: any) =>
  kind === 'budget' ? `${item.month}:${item.categoryId}` : String(item[KIND_MAP[kind][1]])

export function collectRecords(): SyncRecord[] {
  const s: any = useLedger.getState()
  const out: SyncRecord[] = []
  for (const kind of Object.keys(KIND_MAP)) {
    const arr = s[KIND_MAP[kind][0]] as any[]
    for (const item of arr || []) {
      out.push({ kind, id: idOf(kind, item), payload: item, updatedAt: item.updateTime ?? 0 })
    }
  }
  for (const t of s.tombstones || []) {
    out.push({ kind: t.kind, id: String(t.id), payload: null, updatedAt: t.updatedAt, deleted: true })
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
  const pushed = await call('/data/push', { method: 'POST', body: JSON.stringify({ records }) })
  const pulled = await call('/data/pull')
  useLedger.getState().applyRemote(pulled.records || [])
  // 云端记录会带回旧分类，合并后再跑一次规范/去重
  useLedger.getState().mergeTaxonomy()
  useLedger.getState().setLastSync(Date.now())
  return {
    pushed: pushed.accepted as number,
    skipped: pushed.skipped as number,
    pulled: (pulled.records || []).length as number
  }
}
