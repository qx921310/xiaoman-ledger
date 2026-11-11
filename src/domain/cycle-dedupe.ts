import type { Bill } from '../types'

/** 同一周期规则、同一天只应存在一条账单（多设备各自补生成会产生重复） */
export function cycleBillKey(bill: Bill): string | null {
  if (bill.cycleId == null) return null
  const d = new Date(bill.time)
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // 必须带上账本：不同账本里 cycleId 可能撞号，不能互相去重
  return `${bill.bookId ?? ''}|${bill.cycleId}|${day}`
}

/** 同步元数据：这些字段不同不代表用户改过内容 */
const META_KEYS = new Set([
  'billId', 'syncId', 'displayId', 'memberNo', 'sequenceNo',
  'updateTime', 'ownerId', 'userId', 'bookId', 'cycleId'
])

/**
 * 内容是否完全一致（用于判断能否安全自动去重）。
 * 除同步元数据外的所有字段都比对：标签、附件、不计收支、币种快照等
 * 任何影响展示/统计/资金的差异都会阻止自动删除。
 */
function sameContent(a: Bill, b: Bill): boolean {
  const strip = (bill: Bill) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(bill)) {
      if (META_KEYS.has(k)) continue
      if (v === undefined) continue
      out[k] = v
    }
    return out
  }
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b))
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
