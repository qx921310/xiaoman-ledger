import type { Asset, Bill, Category, Lend, Refund, Reimbursement, Transfer } from '../types'

export interface AccountEntry {
  key: string
  time: number
  /** 变动金额（账户币种，正=入账） */
  delta: number
  label: string
  detail?: string
  kind: 'bill' | 'transfer' | 'lend' | 'refund' | 'reimbursement'
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
 * 口径与 balances.movements 一致：收入 +，支出 -，转账转出 -（含手续费）、转入 +，
 * 借出 -/收回 +，借入 +/还款 -，退款 +，报销到账 +。
 */
export function accountHistory(input: AccountHistoryInput): { entries: AccountEntry[]; opening: number; closing: number } {
  const { asset } = input
  const kindOf = new Map(input.parents.map((p) => [p.id, p.kind]))
  const entries: AccountEntry[] = []

  for (const b of input.bills) {
    if (b.assetId !== asset.assetId) continue
    const income = kindOf.get(b.parentCategoryId) === 'income'
    entries.push({
      key: 'b' + String(b.billId),
      time: b.time,
      delta: (income ? 1 : -1) * (b.accountAmount ?? b.cost),
      label: `${income ? '收入' : '支出'}${b.remark ? ' · ' + b.remark : ''}`,
      kind: 'bill'
    })
  }
  for (const t of input.transfers) {
    const fee = t.serviceCharge ?? 0
    if (t.fromAssetId === asset.assetId) {
      entries.push({ key: 't' + t.transferId + 'f', time: t.time, delta: -(t.cost + fee), label: '转账转出', detail: t.remark, kind: 'transfer' })
    }
    if (t.toAssetId === asset.assetId) {
      entries.push({ key: 't' + t.transferId + 't', time: t.time, delta: t.toCost ?? t.cost, label: '转账转入', detail: t.remark, kind: 'transfer' })
    }
  }
  for (const l of input.lends) {
    const cashAsset = (l.type === 2 || l.type === 4) && l.repaymentAssetId ? l.repaymentAssetId : l.assetId
    if (cashAsset !== asset.assetId) continue
    const sign = l.type === 1 || l.type === 4 ? -1 : 1
    const name = l.type === 1 ? '借出' : l.type === 2 ? '收回' : l.type === 3 ? '借入' : '还款'
    entries.push({ key: 'l' + String(l.lendId), time: l.time, delta: sign * l.number, label: `${name} · ${l.counterparty || '未填对方'}`, kind: 'lend' })
  }
  for (const r of input.refunds) {
    if ((r.assetId ?? undefined) !== asset.assetId) continue
    entries.push({ key: 'r' + String(r.refundId), time: r.updateTime, delta: r.number, label: '退款到账', kind: 'refund' })
  }
  for (const r of input.reimbursements) {
    if (r.assetId !== asset.assetId || r.status !== 'done') continue
    entries.push({ key: 'm' + String(r.reimbursementId), time: r.settledAt ?? r.updateTime, delta: r.number, label: '报销到账', detail: r.detail, kind: 'reimbursement' })
  }

  entries.sort((a, b) => a.time - b.time)
  const opening = asset.openingBalance ?? 0
  let running = opening
  for (const e of entries) {
    running = +(running + e.delta).toFixed(2)
    ;(e as AccountEntry & { balance?: number }).balance = running
  }
  return { entries, opening, closing: running }
}
