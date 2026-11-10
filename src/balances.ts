import type { Asset, Bill, Category, Lend, Refund, Reimbursement, Transfer } from './types'

/** The amounts follow the legacy account-balance rules, including linked fee bills. */
export interface BalanceData {
  assets: Asset[]
  bills: Bill[]
  transfers: Transfer[]
  lends: Lend[]
  refunds: Refund[]
  reimbursements: Reimbursement[]
  parentCategories: Category[]
}

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function movements(data: BalanceData): Map<number, number> {
  const result = new Map<number, number>()
  const add = (id: number, amount: number) => {
    if (id) result.set(id, round((result.get(id) || 0) + amount))
  }
  const bills = data.bills || []
  for (const bill of bills) {
    const income = (data.parentCategories || []).find(c => c.id === bill.parentCategoryId)?.kind === 'income'
    add(bill.assetId, (income ? 1 : -1) * bill.cost)
  }
  for (const transfer of data.transfers || []) {
    // A fee is either a linked bill or part of an imported transfer, never both.
    const feeIsBill = transfer.billId && bills.some(b => b.billId === transfer.billId)
    add(transfer.fromAssetId, -transfer.cost - (feeIsBill ? 0 : (transfer.serviceCharge || 0)))
    add(transfer.toAssetId, transfer.toCost ?? transfer.cost)
  }
  for (const lend of data.lends || []) {
    const id = (lend.type === 2 || lend.type === 4) && lend.repaymentAssetId ? lend.repaymentAssetId : lend.assetId
    add(id, (lend.type === 1 || lend.type === 4 ? -1 : 1) * lend.number)
  }
  for (const refund of data.refunds || []) {
    const bill = bills.find(b => b.billId === refund.billId)
    if (bill) add(bill.assetId, refund.number)
  }
  for (const reimbursement of data.reimbursements || []) {
    if (reimbursement.status === 'done') add(reimbursement.assetId, reimbursement.number)
  }
  return result
}

/** Migration uses the balance and transactions from the same snapshot. */
export function deriveAssets(data: BalanceData): Asset[] {
  const delta = movements(data)
  return (data.assets || []).map(asset => {
    const movement = delta.get(asset.assetId) || 0
    const openingBalance = Number.isFinite(asset.openingBalance)
      ? asset.openingBalance! : round((Number(asset.assetNumber) || 0) - movement)
    return { ...asset, openingBalance, assetNumber: round(openingBalance + movement) }
  })
}
