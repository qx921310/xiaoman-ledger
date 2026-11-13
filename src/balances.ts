import type { Asset, AssetFlow, Bill, Category, Lend, Refund, Reimbursement, Transfer } from './types'

/** The amounts follow the legacy account-balance rules, including linked fee bills. */
export interface BalanceData {
  assets: Asset[]
  /** 资产流水（定存等非账单变动） */
  assetFlows?: AssetFlow[]
  bills: Bill[]
  transfers: Transfer[]
  lends: Lend[]
  refunds: Refund[]
  reimbursements: Reimbursement[]
  parentCategories: Category[]
  /** 查询某币种对本位币的汇率（缺失时按 1 处理） */
  currencyRate?: (code: string) => number
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
    // Older bills lack an account-currency snapshot; retain their original
    // balance semantics instead of retroactively changing historical balances.
    const amount = Number.isFinite(bill.accountAmount) ? bill.accountAmount! : bill.cost
    add(bill.assetId, (income ? 1 : -1) * amount)
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
    if (bill) add(refund.assetId ?? bill.assetId, refund.number)
  }
  for (const reimbursement of data.reimbursements || []) {
    if (reimbursement.status === 'done') {
      // 入账金额已在结算时冻结（accountAmount）；历史数据没有冻结值时按当时汇率折算一次
      if (Number.isFinite(reimbursement.accountAmount)) {
        add(reimbursement.assetId, reimbursement.accountAmount!)
      } else {
        const asset = (data.assets || []).find((a) => a.assetId === reimbursement.assetId)
        const rate = !asset?.currency ? 1 : (data.currencyRate?.(asset.currency) ?? 1)
        add(reimbursement.assetId, reimbursement.number / rate)
      }
    }
  }
  // 一木的资产流水（如定存累加/扣回）直接参与余额推导
  for (const flow of data.assetFlows || []) add(flow.assetId, flow.delta)
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
