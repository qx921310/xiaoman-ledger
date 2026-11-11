import type { Bill } from '../types'

/** 同一周期规则、同一天只应存在一条账单（多设备各自补生成会产生重复） */
export function cycleBillKey(bill: Bill): string | null {
  if (bill.cycleId == null) return null
  const d = new Date(bill.time)
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // 必须带上账本：不同账本里 cycleId 可能撞号，不能互相去重
  return `${bill.bookId ?? ''}|${bill.cycleId}|${day}`
}

/** 内容是否完全一致（用于判断能否安全自动去重） */
function sameContent(a: Bill, b: Bill): boolean {
  return a.cost === b.cost
    && a.time === b.time
    && a.parentCategoryId === b.parentCategoryId
    && (a.childCategoryId ?? 0) === (b.childCategoryId ?? 0)
    && a.assetId === b.assetId
    && (a.remark ?? '') === (b.remark ?? '')
    && (a.accountAmount ?? a.cost) === (b.accountAmount ?? b.cost)
}

export interface CycleDedupeResult {
  bills: Bill[]
  /** 被去掉的重复账单（需要写墓碑，避免下次同步再回来） */
  removed: Bill[]
}

/**
 * 周期账单去重：同一 (cycleId, 日期) 只保留编号最小的一条。
 * 用确定性规则选保留项，两台设备各自执行也会收敛到同一条。
 */
export function dedupeCycleBills(bills: Bill[], protectedIds: Set<string> = new Set()): CycleDedupeResult {
  const groups = new Map<string, Bill[]>()
  for (const b of bills) {
    const key = cycleBillKey(b)
    if (!key) continue
    const list = groups.get(key)
    if (list) list.push(b)
    else groups.set(key, [b])
  }
  const drop = new Set<Bill>()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    // 用明确的字符序比较，不依赖 locale
    const key = (b: Bill) => String(b.syncId ?? b.billId)
    const sorted = [...list].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
    const keeper = sorted[0]
    for (const extra of sorted.slice(1)) {
      // 只有「无业务关联」且「内容完全一致」才自动删除；改过金额或备注的一律保留
      if (protectedIds.has(key(extra))) continue
      if (!sameContent(keeper, extra)) continue
      drop.add(extra)
    }
  }
  if (!drop.size) return { bills, removed: [] }
  return {
    bills: bills.filter((b) => !drop.has(b)),
    removed: [...drop]
  }
}
