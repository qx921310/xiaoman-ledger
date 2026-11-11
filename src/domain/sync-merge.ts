import { normalizeBuiltInChild, TAXONOMY_CHILDREN } from '../taxonomy'
import { OWNERLESS, sameIdentity as sameIdentityOf, tombstoneMatches } from './identity'
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
    const ownerOf = (x: Record<string, unknown>) => (x?.ownerId ?? x?.userId ?? 0)

    if (r.deleted) {
      // 身份规则：无属主概念的类型只按业务 ID 匹配；其余要求属主一致
      const sameOwner = OWNERLESS.has(r.kind) || r.ownerId == null ? null : Number(r.ownerId)
      // 作用域判定统一走 identity 模块（见下方 tombstoneMatches）
      const delIdx = arr.findIndex((x) => {
        if (sameOwner != null && Number(ownerOf(x)) !== sameOwner) return false
        if (x.__originId != null && String(x.__originId) === String(r.id)) return true
        return idOf(r.kind, x) === String(r.id)
      })
      // 作用域判定不了时不删除（历史数据宁留重复也不丢）
      if (delIdx >= 0 && !tombstoneMatches(r.kind, r as unknown as Record<string, unknown>, arr[delIdx])) continue
      // 本地记录比墓碑新 → 墓碑已过期，保留本地记录
      if (delIdx >= 0 && Number(arr[delIdx].updateTime ?? 0) > Number(r.updatedAt ?? 0)) continue
      if (delIdx >= 0) next[k[0]] = arr.filter((_, i) => i !== delIdx)
      // 墓碑时间必须取较新的一次，否则更早的记录会被误判为更新而复活
      const existingTomb = tombstones.findIndex((t) => t.kind === r.kind && t.id === String(r.id)
        && sameIdentityOf(r.kind, t as unknown as Record<string, unknown>, r as unknown as Record<string, unknown>) !== false)
      const tombTime = r.updatedAt || now
      if (existingTomb < 0) {
        tombstones.push({ kind: r.kind, id: String(r.id), ownerId: sameOwner ?? undefined, updatedAt: tombTime })
      } else if (tombTime > tombstones[existingTomb].updatedAt) {
        tombstones[existingTomb] = { ...tombstones[existingTomb], updatedAt: tombTime }
      }
      continue
    }
    if (!r.payload) continue

    // 墓碑「阻挡旧记录复活」可以宽松：作用域不同才排除，作用域未知时按时间判断
    // （删除已有记录必须严格，见上面的 tombstoneMatches）
    const deleted = tombstones.find((t) => t.kind === r.kind && t.id === String(r.id)
      && sameIdentityOf(r.kind, t as unknown as Record<string, unknown>, r.payload as Record<string, unknown>) !== false)
    if (deleted && deleted.updatedAt >= (r.updatedAt ?? 0)) continue
    if (r.ownerId != null && r.payload.ownerId == null) r.payload = { ...r.payload, ownerId: r.ownerId }

    // 之前因属主不同被顺位改号的记录，用原始身份认回，避免每次合并都再改一次号
    const originOf = (x: Record<string, unknown>) =>
      x.__originOwner != null && String(x.__originId) === String(r.id) && Number(x.__originOwner) === Number(ownerOf(r.payload ?? {}))
    // 优先用原始身份认回（否则会反复命中本地同名记录、每次合并都再造一条）
    const originIdx = arr.findIndex(originOf)
    const idx = originIdx >= 0 ? originIdx : arr.findIndex((x) => idOf(r.kind, x) === String(r.id))
    const localRow = idx >= 0 ? arr[idx] : undefined
    const sameBuiltInChild = r.kind === 'child' &&
      TAXONOMY_CHILDREN.some((c) => c.id === r.payload!.id && c.parentId === r.payload!.parentId && c.name === r.payload!.name) &&
      !!localRow && localRow.parentId === r.payload!.parentId && localRow.name === r.payload!.name

    if (!OWNERLESS.has(r.kind) && idx >= 0 && !sameBuiltInChild && (r.kind !== 'bill' || (!arr[idx].syncId && !r.payload.syncId)) && ownerOf(arr[idx]) !== ownerOf(r.payload)) {
      // 同 ID 但属主不同：不覆盖，顺位换一个空闲 ID，两条并存
      const idField = k[1]
      const taken = new Set(arr.map((x) => String(x[idField])))
      const baseId = Number(r.id)
      const salt = Number(ownerOf(r.payload)) || 0
      // 由 (原 id, 属主) 推导，保证多次合并得到同一个号
      let nextId = Number.isFinite(baseId) ? baseId * 1000 + (salt % 1000) : now
      while (taken.has(String(nextId))) nextId++
      arr.push({
        ...r.payload, [idField]: nextId,
        __originId: String(r.id), __originOwner: salt
      })
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
      if (idx >= 0) {
        // 改过号的记录：用新内容更新，但保留已分配的编号与来源身份
        const prev = arr[idx]
        const keepId = prev[k[1]]
        const originMeta = prev.__originId != null
          ? { __originId: prev.__originId, __originOwner: prev.__originOwner } : {}
        arr[idx] = { ...r.payload, [k[1]]: keepId, ...originMeta }
      } else {
        arr.push(r.payload)
      }
    }
    next[k[0]] = arr
  }
  return { ...next, tombstones } as Partial<MergeableState>
}
