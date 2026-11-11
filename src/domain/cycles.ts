import { cycleDueDates, dateKey, handledDates } from '../cycle-dates'
import { newBillIdentity } from '../identity'
import { resolveBillChild } from '../taxonomy'
import type { Asset, Bill, Category, Cycle } from '../types'

export interface CyclePlanInput {
  cycles: Cycle[]
  bills: Bill[]
  assets: Asset[]
  parentCategories: Category[]
  childCategories: Category[]
  currentBookId?: string | number
  userId: number
  uid?: number
  now?: Date
}

export interface CyclePlan {
  /** 本次要新增的账单 */
  bills: Bill[]
  /** 更新后的周期规则（含 generated） */
  cycles: Cycle[]
  /** 各账户的余额变化（收入为正） */
  assetDelta: Map<number, number>
  count: number
}

/**
 * 计算本次要补生成的周期账单。纯函数：不改状态，由 store 应用结果。
 */
export function planCycles(input: CyclePlanInput, now = new Date()): CyclePlan {
  const { bills: existing, assets, parentCategories, childCategories, userId } = input
  const created: Bill[] = []
  const assetDelta = new Map<number, number>()
  const usedIds = new Set(existing.map((b) => String(b.billId)))
  const updatedCycles: Cycle[] = []

  for (const c of input.cycles.filter((x) => x.enabled)) {
    const done = handledDates(c)
    const fresh = cycleDueDates(c, now).filter((d) => !done.has(dateKey(d)))
    if (!fresh.length) continue

    for (const d of fresh) {
      const time = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0).getTime()
      let identity = newBillIdentity()
      while (usedIds.has(String(identity.billId))) identity = newBillIdentity()
      usedIds.add(String(identity.billId))

      const parent = parentCategories.find((p) => p.id === c.parentCategoryId)
      const asset = assets.find((a) => a.assetId === c.assetId)
      created.push({
        billId: identity.billId, syncId: identity.syncId, time, cost: c.cost,
        parentCategoryId: c.parentCategoryId, childCategoryId: c.childCategoryId,
        childCategoryIdentityVersion: c.childCategoryIdentityVersion,
        assetId: c.assetId, bookId: input.currentBookId || 1,
        remark: c.remark || c.name, billType: 4,
        tags: [], files: [], userId: input.uid || userId, updateTime: Date.now(),
        billShareInfo: {
          parentCategoryName: parent?.name ?? '',
          childCategoryName: resolveBillChild(c, childCategories)?.name ?? '',
          assetName: asset?.assetName ?? ''
        }
      })
      const sign = parent?.kind === 'income' ? 1 : -1
      assetDelta.set(c.assetId, (assetDelta.get(c.assetId) ?? 0) + sign * c.cost)
      done.add(dateKey(d))
    }
    updatedCycles.push({ ...c, generated: [...done], updateTime: Date.now() })
  }

  return { bills: created, cycles: updatedCycles, assetDelta, count: created.length }
}
