import type { Asset, Bill, Category, Lend, Refund, Reimbursement, Transfer } from '../types'

export interface AccountEntry {
  key: string
  time: number
  /** 变动金额（账户币种，正=入账） */
  delta: number
  label: string
  detail?: string
  kind: 'bill' | 'transfer' | 'lend' | 'refund' | 'reimbursement'
  balance?: number
}

export interface AccountHistoryInput {
  asset: Asset
  bills: Bill[]
  transfers: Transfer[]
  lends: Lend[]
  refunds: Refund[]
  reimbursements: Reimbursement[]
  parents: Category[]
}

/**
 * 某账户的全部资金变动，按时间排序并带运行余额。
 *
 * 口径与 balances.movements **逐条保持一致**（尤其是手续费：
 * 已有独立手续费账单时，转账本身不再重复计手续费）。
 * 测试用「期末余额 === 资产余额」锁死两者一致性。
 */
export function accountHistory(input: AccountHistoryInput): { entries: AccountEntry[]; opening: number; closing: number } {
  const { asset, bills, transfers, lends, refunds, reimbursements } = input
  const kindOf = new Map(input.parents.map((p) => [p.id, p.kind]))
  const entries: AccountEntry[] = []

  for (const b of bills) {
    if (b.assetId !== asset.assetId) continue
    const income = kindOf.get(b.parentCategoryId) === 'income'
    const amount = Number.isFinite(b.accountAmount) ? b.accountAmount! : b.cost
    entries.push({
      key: 'b' + String(b.billId),
      time: b.time,
      delta: (income ? 1 : -1) * amount,
      label: `${income ? '收入' : '支出'}${b.remark ? ' · ' + b.remark : ''}`,
      kind: 'bill'
    })
  }

  for (const t of transfers) {
    // 手续费只有两种来源：独立手续费账单 或 转账自带，不能都算
    const feeIsBill = Boolean(t.billId && bills.some((b) => b.billId === t.billId))
    const fee = feeIsBill ? 0 : (t.serviceCharge ?? 0)
    if (t.fromAssetId === asset.assetId) {
      entries.push({ key: 't' + t.transferId + 'f', time: t.time, delta: -(t.cost + fee), label: '转账转出', detail: t.remark, kind: 'transfer' })
    }
    if (t.toAssetId === asset.assetId) {
      entries.push({ key: 't' + t.transferId + 't', time: t.time, delta: t.toCost ?? t.cost, label: '转账转入', detail: t.remark, kind: 'transfer' })
    }
  }

  for (const l of lends) {
    const cashAsset = (l.type === 2 || l.type === 4) && l.repaymentAssetId ? l.repaymentAssetId : l.assetId
    if (cashAsset !== asset.assetId) continue
    const sign = l.type === 1 || l.type === 4 ? -1 : 1
    const name = l.type === 1 ? '借出' : l.type === 2 ? '收回' : l.type === 3 ? '借入' : '还款'
    entries.push({ key: 'l' + String(l.lendId), time: l.time, delta: sign * l.number, label: `${name} · ${l.counterparty || '未填对方'}`, kind: 'lend' })
  }

  for (const r of refunds) {
    if (r.assetId !== asset.assetId) continue
    entries.push({ key: 'r' + String(r.refundId), time: r.updateTime ?? 0, delta: r.number, label: '退款到账', kind: 'refund' })
  }

  for (const r of reimbursements) {
    if (r.assetId !== asset.assetId || r.status !== 'done') continue
    entries.push({ key: 'm' + String(r.reimbursementId), time: r.settledAt ?? r.updateTime ?? 0, delta: r.number, label: '报销到账', detail: r.detail, kind: 'reimbursement' })
  }

  entries.sort((a, b) => a.time - b.time)
  const opening = asset.openingBalance ?? 0
  let running = opening
  for (const e of entries) {
    running = +(running + e.delta).toFixed(2)
    e.balance = running
  }
  return { entries, opening, closing: running }
}
