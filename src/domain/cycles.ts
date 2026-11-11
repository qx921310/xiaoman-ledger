import { cycleDueDates, dateKey, handledDates } from '../cycle-dates'
import { newBillIdentity } from '../identity'
import { resolveBillChild } from '../taxonomy'
import { fromBase } from '../money'
import type { Asset, Bill, Category, Currency, Cycle } from '../types'

export interface CyclePlanInput {
  cycles: Cycle[]
  bills: Bill[]
  assets: Asset[]
  parentCategories: Category[]
  childCategories: Category[]
  currentBookId?: string | number
  currencies: Currency[]
  defaultCurrency: string
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
  const { bills: existing, assets, parentCategories, childCategories, userId, currencies, defaultCurrency } = input
  const created: Bill[] = []
  const assetDelta = new Map<number, number>()
  const usedIds = new Set(existing.map((b) => String(b.billId)))
  const updatedCycles: Cycle[] = []

  // 未确认所属账本的旧规则暂不自动生成，避免多设备各记到不同账本
  for (const c of input.cycles.filter((x) => x.enabled && x.bookId != null)) {
    const done = handledDates(c)
    let fresh = cycleDueDates(c, now).filter((d) => !done.has(dateKey(d)))
    // 结束方式：到某天为止 / 记满 N 次
    if (c.endMode === 'date' && c.endDate) {
      fresh = fresh.filter((d) => d.getTime() <= c.endDate!)
    }
    if (c.endMode === 'times' && c.times && c.times > 0) {
      const already = handledDates(c).size
      const left = Math.max(0, c.times - already)
      fresh = fresh.slice(0, left)
    }
    if (!fresh.length) continue

    for (const d of fresh) {
      const time = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0).getTime()
      let identity = newBillIdentity()
      while (usedIds.has(String(identity.billId))) identity = newBillIdentity()
      usedIds.add(String(identity.billId))

      const parent = parentCategories.find((p) => p.id === c.parentCategoryId)
      const asset = assets.find((a) => a.assetId === c.assetId)
      const accountCurrency = asset?.currency ?? defaultCurrency
      const accountAmount = accountCurrency === defaultCurrency
        ? c.cost
        : +fromBase(c.cost, accountCurrency, currencies, defaultCurrency).toFixed(2)
      created.push({
        billId: identity.billId, syncId: identity.syncId, time, cost: c.cost,
        accountAmount, accountCurrency,
        currencyInfo: accountCurrency === defaultCurrency ? undefined : accountCurrency,
        currencyAssetNumber: accountCurrency === defaultCurrency ? undefined : accountAmount,
        parentCategoryId: c.parentCategoryId, childCategoryId: c.childCategoryId,
        childCategoryIdentityVersion: c.childCategoryIdentityVersion,
        assetId: c.assetId, bookId: c.bookId ?? input.currentBookId ?? 1,
        cycleId: c.cycleId,
        remark: c.remark || c.name, billType: 4,
        // 周期规则可配置：不计收支 / 不计预算 / 待报销
        notIntoTotal: c.notIntoTotal ?? false,
        notIntoBudget: c.notIntoBudget ?? false,
        isReimbursement: c.reimbursement ? 1 : 0,
        tags: [], files: [], userId: input.uid || userId, updateTime: Date.now(),
        billSnapshot: {
          parentCategoryName: parent?.name ?? '',
          childCategoryName: resolveBillChild(c, childCategories)?.name ?? '',
          assetName: asset?.assetName ?? ''
        }
      })
      // 账户按自身币种扣款：外币账户扣 accountAmount，不是本币 cost
      const sign = parent?.kind === 'income' ? 1 : -1
      assetDelta.set(c.assetId, (assetDelta.get(c.assetId) ?? 0) + sign * accountAmount)
      done.add(dateKey(d))
    }
    updatedCycles.push({ ...c, generated: [...done], updateTime: Date.now() })
  }

  return { bills: created, cycles: updatedCycles, assetDelta, count: created.length }
}
