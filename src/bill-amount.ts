import type { Bill, Refund } from './types'

/** Older imports may already contain net costs, so only subtract explicit snapshots. */
export function billNetAmount(bill: Bill, refunds: Refund[]): number {
  const refunded = refunds.filter((r) => r.billId === bill.billId && Number.isFinite(r.baseAmount))
    .reduce((sum, r) => sum + (r.baseAmount ?? 0), 0)
  return Math.max(0, +(bill.cost - refunded).toFixed(2))
}
