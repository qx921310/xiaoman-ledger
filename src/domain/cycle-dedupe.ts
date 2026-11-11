import type { Bill } from '../types'

/** 同一周期规则、同一天只应存在一条账单（多设备各自补生成会产生重复） */
export function cycleBillKey(bill: Bill): string | null {
  if (bill.cycleId == null) return null
  const d = new Date(bill.time)
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // 必须带上账本：不同账本里 cycleId 可能撞号，不能互相去重
  return `${bill.bookId ?? ''}|${bill.cycleId}|${day}`
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
export function dedupeCycleBills(bills: Bill[]): CycleDedupeResult {
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
    const sorted = [...list].sort((a, b) => String(a.syncId ?? a.billId).localeCompare(String(b.syncId ?? b.billId)))
    for (const extra of sorted.slice(1)) drop.add(extra)
  }
  if (!drop.size) return { bills, removed: [] }
  return {
    bills: bills.filter((b) => !drop.has(b)),
    removed: [...drop]
  }
}
