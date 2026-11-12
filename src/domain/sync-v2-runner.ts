import { acknowledge, advanceGenerations, bootstrapMeta, fingerprint, queueChanges, reconcileRemote, recordKey } from './sync-v2-state'
import type { PendingOperation, RemoteRecord, VersionedMeta, VersionedRecord } from './sync-v2-state'

interface PullResult { records: RemoteRecord[]; generations: Array<{ bookId: string; generation: number }> }
interface Receipt { kind: string; id: string; operationId: string; status: string; version?: number }
interface PushResult { accepted: number; skipped: number; denied: number; duplicates: number; results: Receipt[] }
const explanations: Record<string, string> = {
  'version-conflict': '云端记录已修改，请比较两份内容',
  'stale-generation': '账本清空后发现旧代次记录，请核对',
  'book-required': '记录缺少所属账本，请核对',
  'permission-denied': '没有写入该账本的权限',
  'scope-conflict': '记录的账本归属不一致，请核对',
  'account-not-shared': '账户未共享到该账本，请核对',
  'private-history': '该记录涉及其他成员的私有账户，无法覆盖',
  'operation-id-reused': '同步操作身份异常，请导出备份后核对',
  'invalid-operation': '同步请求不完整，请更新应用后重试',
  'protocol-upgrade-required': '同步协议已升级，请更新应用'
}
const explain = (status: string) => explanations[status] ?? '同步未完成，请核对记录后重试'

// Keep records that refer to one another together, including conflicted records.
// Unknown relationships are not treated as permission to discard any operation.
function groups(meta: VersionedMeta, local: VersionedRecord[]):
  { pushable: Array<Array<[string, PendingOperation]>>; blocked: string[] } {
  const all = new Map(local.filter(r => meta.conflicts[recordKey(r)] || meta.pending[recordKey(r)]).map(r => [recordKey(r), r]))
  for (const [key, op] of Object.entries(meta.pending)) all.set(key, op)
  const nodes = [...all.entries()]
  const refs = (r: VersionedRecord) => {
    const result = new Set<string>([String(r.id)])
    // 只有「删一个就必须一起处理另一个」的关系才绑定成同批。
    // 以前把所有 *Id 字段都当强关联：资产一旦冲突，引用它的全部账单都被连带停发。
    const fields = HARD_RELATIONS[r.kind] ?? []
    for (const key of fields) {
      const value = (r.payload ?? {})[key]
      if (typeof value === 'string' || typeof value === 'number') result.add(String(value))
      if (Array.isArray(value)) for (const id of value) result.add(String(id))
    }
    return result
  }
  const buckets: Array<{ keys: Set<string>; ids: Set<string>; refs: Set<string> }> = []
  for (const [key, rec] of nodes) {
    const values = refs(rec)
    const connected = buckets.filter(b => b.refs.has(String(rec.id)) || [...b.ids].some(id => values.has(id)))
    const target = { keys: new Set([key]), ids: new Set([String(rec.id)]), refs: values }
    for (const b of connected) {
      for (const k of b.keys) target.keys.add(k)
      for (const id of b.ids) target.ids.add(id)
      for (const v of b.refs) target.refs.add(v)
      buckets.splice(buckets.indexOf(b), 1)
    }
    buckets.push(target)
  }
  const blocked: string[] = []
  const pushable: Array<Array<[string, PendingOperation]>> = []
  for (const bucket of buckets) {
    const conflicted = [...bucket.keys].filter(k => meta.conflicts[k])
    if (conflicted.length) {
      // 组内有冲突：这组其他待推送记录被连带拦下，必须让用户看见数量
      for (const k of bucket.keys) if (meta.pending[k]) blocked.push(k)
      continue
    }
    const ops = [...bucket.keys].filter(k => meta.pending[k]).map(k => [k, meta.pending[k]] as [string, PendingOperation])
    if (ops.length) pushable.push(ops)
  }
  return { pushable, blocked }
}
/** 必须原子提交的父子关系：父被阻塞时子也不动（其余引用不绑定） */
const HARD_RELATIONS: Record<string, string[]> = {
  splitMember: ['splitGroupId'],
  splitExpense: ['splitGroupId', 'sourceBillId'],
  stockInfo: ['stockAssetId'],
  billGroup: ['firstBillId', 'billList'],
  billRelated: ['oneBillId', 'twoBillId'],
  refund: ['billId'],
  reimbursement: ['billId'],
  transfer: [],
  bill: []
}

export interface VersionedAdapter {
  read(): VersionedRecord[]
  apply(records: RemoteRecord[]): void
  pull(): Promise<PullResult>
  push(records: PendingOperation[]): Promise<PushResult>
  load(): VersionedMeta | null
  save(meta: VersionedMeta): void
  id(): string
  check(): void
}

function generationsOf(pull: PullResult): Record<string, number> {
  if (!Array.isArray(pull.records) || !Array.isArray(pull.generations) || pull.records.some(r => !Number.isSafeInteger(r.version))) {
    throw new Error('服务端未提供同步版本，请更新服务端后重试；本地数据已保留')
  }
  return Object.fromEntries(pull.generations.map(b => [String(b.bookId), b.generation]))
}

/** Verifies application before advancing baselines; failed identity merges stay conflicts. */
function mergeSafe(adapter: VersionedAdapter, meta: VersionedMeta, remote: RemoteRecord[]): void {
  const prior = structuredClone(meta.bases)
  const accepted = reconcileRemote(meta, remote, adapter.read())
  adapter.check()
  adapter.apply(accepted)
  const current = new Map(adapter.read().map(r => [recordKey(r), r]))
  for (const record of accepted) {
    const key = recordKey(record)
    const actual = current.get(key)
    if (!actual || fingerprint(actual) !== fingerprint(record)) {
      if (prior[key]) meta.bases[key] = prior[key]
      else delete meta.bases[key]
      meta.conflicts[key] = '云端记录无法安全合并，本地数据已保留'
    }
  }
}

export async function runVersionedSync(adapter: VersionedAdapter) {
  adapter.check()
  let meta = adapter.load()
  if (!meta) {
    const first = await adapter.pull()
    adapter.check()
    meta = bootstrapMeta(adapter.read(), first.records, generationsOf(first))
    mergeSafe(adapter, meta, first.records)
    adapter.save(meta)
  }
  if (meta.schema !== 2) throw new Error('本地同步状态无法识别，请先导出备份')
  queueChanges(meta, adapter.read(), adapter.id)
  adapter.save(meta) // durable before any request
  const { pushable, blocked } = groups(meta, adapter.read())
  const pending = pushable.flat()
  let pushed = await adapter.push(pending.map(([, operation]) => operation))
  adapter.check()
  if (!Array.isArray(pushed.results)) throw new Error('服务器未确认同步协议，本地数据已保留')
  const byOperation = new Map(pending.map(([key, op]) => [op.operationId, key]))
  for (const receipt of pushed.results) {
    const key = byOperation.get(receipt.operationId)
    if (!key) continue
    if (receipt.status === 'accepted' && Number.isSafeInteger(receipt.version)) {
      acknowledge(meta, key, receipt.operationId, receipt.version!)
    } else if (receipt.status !== 'batch-aborted') {
      meta.conflicts[key] = explain(receipt.status)
    }
  }
  for (const [key, operation] of pending) {
    if (meta.pending[key] && !meta.conflicts[key] && !pushed.results.some(r => r.operationId === operation.operationId)) {
      meta.conflicts[key] = '服务器未返回该记录的确认结果，请核对'
    }
  }
  adapter.save(meta)
  // A rejected batch is atomic. Retry unaffected components independently so a
  // newly discovered conflict does not indefinitely block unrelated changes.
  if (pushed.results.some(r => r.status === 'batch-aborted')) {
    const retry = groups(meta, adapter.read()).pushable
    for (const component of retry) {
      const result = await adapter.push(component.map(([, operation]) => operation))
      adapter.check()
      if (!Array.isArray(result.results)) throw new Error('服务器未确认同步协议，本地数据已保留')
      for (const receipt of result.results) {
        const key = component.find(([, op]) => op.operationId === receipt.operationId)?.[0]
        if (!key) continue
        if (receipt.status === 'accepted' && Number.isSafeInteger(receipt.version)) acknowledge(meta, key, receipt.operationId, receipt.version!)
        else if (receipt.status !== 'batch-aborted') meta.conflicts[key] = explain(receipt.status)
      }
      adapter.save(meta)
      pushed = { ...pushed, accepted: pushed.accepted + result.accepted, denied: pushed.denied + result.denied, duplicates: pushed.duplicates + result.duplicates }
    }
  }
  const pulled = await adapter.pull()
  adapter.check()
  const generations = generationsOf(pulled)
  mergeSafe(adapter, meta, pulled.records)
  advanceGenerations(meta, generations, adapter.read())
  adapter.save(meta)
  const conflicts = Object.entries(meta.conflicts).map(([key, reason]) => {
    const [kind, id] = JSON.parse(key) as [string, string]
    return { kind, id, reason }
  })
  return { pushed: pushed.accepted, skipped: pushed.skipped, denied: pushed.denied, duplicates: pushed.duplicates,
    conflicts: conflicts.length, conflicted: conflicts, conflictsKept: 0, pulled: pulled.records.length,
    // 被「同组冲突」连带拦下的记录：不是冲突本身，但这次没推上去
    blocked: blocked.length, blockedKeys: blocked }
}
