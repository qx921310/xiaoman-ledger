import { normalizeBuiltInChild, TAXONOMY_CHILDREN } from '../taxonomy'
import type {
  AccountBook, Asset, Bill, Category, Cycle, Lend, Refund, Reimbursement, SyncIncoming, Tag, TombstoneV1, Transfer
} from '../types'

/** 合并远端记录时需要用到的本地状态（只读） */
export interface MergeableState {
  bills: Bill[]
  assets: Asset[]
  transfers: Transfer[]
  lends: Lend[]
  cycles: Cycle[]
  parentCategories: Category[]
  childCategories: Category[]
  accountBooks: AccountBook[]
  reimbursements: Reimbursement[]
  refunds: Refund[]
  tags: Tag[]
  tombstones: TombstoneV1[]
}

const KIND_SPEC: Record<string, [string, string]> = {
  bill: ['bills', 'billId'], asset: ['assets', 'assetId'], transfer: ['transfers', 'transferId'],
  lend: ['lends', 'lendId'], cycle: ['cycles', 'cycleId'],
  parent: ['parentCategories', 'id'], child: ['childCategories', 'id'],
  book: ['accountBooks', 'accountBookId'],
  reimbursement: ['reimbursements', 'reimbursementId'], refund: ['refunds', 'refundId'],
  budget: ['budgets', 'month'],
  tag: ['tags', 'tagId']
}

const idOf = (kind: string, item: Record<string, unknown>) =>
  kind === 'budget' ? `${item.month}:${item.categoryId}`
    : kind === 'bill' ? String(item.syncId ?? item.billId)
      : String(item[KIND_SPEC[kind][1]])

/**
 * 逐条 last-write-wins 合并云端记录；墓碑按时间比较，同 ID 不同属主顺位另存。
 * 纯函数：不读写 store，返回需要写回的部分状态。
 */
export function mergeRemote(s: MergeableState, records: SyncIncoming[], now = Date.now()): Partial<MergeableState> {
  const next: Record<string, unknown[]> = {}
  const tombstones = [...s.tombstones]
  const stateView = s as unknown as Record<string, unknown[]>

  for (const incoming of records || []) {
    let r = incoming
    if (r.kind === 'child' && !r.deleted && r.payload) {
      const normalized = normalizeBuiltInChild(r.payload as unknown as Category)
      if (normalized !== (r.payload as unknown as Category)) {
        r = { ...r, id: String(normalized.id), payload: normalized as unknown as Record<string, unknown> }
      }
    }
    const k = KIND_SPEC[r.kind]
    if (!k) continue
    const arr = (next[k[0]] ?? [...(stateView[k[0]] || [])]) as Record<string, unknown>[]

    if (r.deleted) {
      const local = arr.find((x) => idOf(r.kind, x) === String(r.id))
      // 本地版本比墓碑新 → 墓碑已过期，保留本地记录
      if (local && Number(local.updateTime ?? 0) > Number(r.updatedAt ?? 0)) continue
      next[k[0]] = arr.filter((x) => idOf(r.kind, x) !== String(r.id))
      // 墓碑时间必须取较新的一次，否则更早的记录会被误判为更新而复活
      const existingTomb = tombstones.findIndex((t) => t.kind === r.kind && t.id === String(r.id))
      const tombTime = r.updatedAt || now
      if (existingTomb < 0) {
        tombstones.push({ kind: r.kind, id: String(r.id), updatedAt: tombTime })
      } else if (tombTime > tombstones[existingTomb].updatedAt) {
        tombstones[existingTomb] = { ...tombstones[existingTomb], updatedAt: tombTime }
      }
      continue
    }
    if (!r.payload) continue

    const deleted = tombstones.find((t) => t.kind === r.kind && t.id === String(r.id))
    if (deleted && deleted.updatedAt >= (r.updatedAt ?? 0)) continue
    if (r.ownerId != null && r.payload.ownerId == null) r.payload = { ...r.payload, ownerId: r.ownerId }

    const idx = arr.findIndex((x) => idOf(r.kind, x) === String(r.id))
    const ownerOf = (x: Record<string, unknown>) => (x?.ownerId ?? x?.userId ?? 0)
    const localRow = idx >= 0 ? arr[idx] : undefined
    const sameBuiltInChild = r.kind === 'child' &&
      TAXONOMY_CHILDREN.some((c) => c.id === r.payload!.id && c.parentId === r.payload!.parentId && c.name === r.payload!.name) &&
      !!localRow && localRow.parentId === r.payload!.parentId && localRow.name === r.payload!.name

    if (idx >= 0 && !sameBuiltInChild && (r.kind !== 'bill' || (!arr[idx].syncId && !r.payload.syncId)) && ownerOf(arr[idx]) !== ownerOf(r.payload)) {
      // 同 ID 但属主不同：不覆盖，顺位换一个空闲 ID，两条并存
      const idField = k[1]
      const taken = new Set(arr.map((x) => String(x[idField])))
      let nextId = (Number(r.id) || 0) + 1
      while (taken.has(String(nextId))) nextId++
      arr.push({ ...r.payload, [idField]: nextId })
      next[k[0]] = arr
      continue
    }

    const localTime = idx >= 0 ? Number(arr[idx].updateTime ?? 0) : -1
    if (r.kind === 'bill' && idx >= 0 && r.payload.displayId) {
      arr[idx] = {
        ...arr[idx], memberNo: r.payload.memberNo, sequenceNo: r.payload.sequenceNo,
        displayId: r.payload.displayId, ownerId: r.ownerId
      }
      next[k[0]] = arr
    }
    if (idx < 0 || Number(r.updatedAt ?? 0) > localTime) {
      if (idx >= 0) arr[idx] = r.payload
      else arr.push(r.payload)
    }
    next[k[0]] = arr
  }
  return { ...next, tombstones } as Partial<MergeableState>
}
