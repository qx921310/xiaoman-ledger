import type { Asset, Bill, Category, Currency, Refund } from './types'
import { hasCurrencyRate, toBase } from './money'

type Tombstone = { kind: string; id: string; updatedAt: number; bookId?: string | number }
type RefundState = {
  bills: Bill[]
  assets: Asset[]
  refunds: Refund[]
  currencies: Currency[]
  defaultCurrency: string
  parentCategories: Category[]
  tombstones: Tombstone[]
  userId: number
}
type NewRefund = { billId: string | number; number: number; assetId?: number; baseAmount?: number; time?: number; remark?: string }

export function addRefundChanges(s: RefundState, input: NewRefund, now: number) {
  const bill = s.bills.find((b) => b.billId === input.billId)
  if (!bill || s.parentCategories.find((p) => p.id === bill.parentCategoryId)?.kind === 'income') return {}
  const asset = s.assets.find((a) => a.assetId === (input.assetId || bill.assetId))
  if (!asset || !hasCurrencyRate(asset.currency, s.currencies, s.defaultCurrency)) return {}
  const amount = Number(input.number)
  if (!Number.isFinite(amount) || amount <= 0) return {}
  const base = input.baseAmount ?? toBase(amount, asset.currency, s.currencies, s.defaultCurrency)
  const existing = s.refunds.filter((r) => r.billId === bill.billId)
  if (existing.some((r) => r.baseAmount == null)) return {}
  const refunded = existing.reduce((sum, r) => sum + (r.baseAmount ?? 0), 0)
  if (!Number.isFinite(base) || base <= 0 || base > +(bill.cost - refunded).toFixed(2)) return {}
  let refundId = now
  while (s.refunds.some((r) => r.refundId === refundId) || s.tombstones.some((t) => t.kind === 'refund' && t.id === String(refundId))) refundId++
  const rec: Refund = {
    refundId, billId: bill.billId, assetId: asset.assetId, currency: asset.currency ?? s.defaultCurrency,
    bookId: (bill as { bookId?: string | number }).bookId,
    number: amount, baseAmount: base, time: input.time ?? now,
    remark: input.remark?.trim() || undefined, userId: s.userId, updateTime: now
  }
  return {
    refunds: [rec, ...s.refunds],
    bills: s.bills.map((b) => b.billId === bill.billId ? { ...b, refundNum: +(refunded + base).toFixed(2), updateTime: now } : b)
  }
}

export function deleteRefundChanges(s: RefundState, refundId: number, now: number) {
  const rec = s.refunds.find((r) => r.refundId === refundId)
  if (!rec) return {}
  const bill = s.bills.find((b) => b.billId === rec.billId)
  const remaining = s.refunds.filter((r) => r.billId === rec.billId && r.refundId !== refundId)
  const refundNum = remaining.some((r) => r.baseAmount == null)
    ? bill?.refundNum ?? 0
    : +remaining.reduce((sum, r) => sum + (r.baseAmount ?? 0), 0).toFixed(2)
  return {
    refunds: s.refunds.filter((r) => r.refundId !== refundId),
    tombstones: [...s.tombstones, { kind: 'refund', id: String(refundId), updatedAt: now }],
    bills: s.bills.map((b) => b.billId === rec.billId ? { ...b, refundNum, updateTime: now } : b)
  }
}
