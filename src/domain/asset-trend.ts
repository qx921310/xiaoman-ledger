import type { Asset, AssetFlow, Bill, Category, Lend, Refund, Reimbursement, Transfer } from '../types'

/**
 * 资产走势（一木 activity_assets_statistics 的「资产走势」）
 *
 * 一木用 AssetHistory 事件还原历史余额。我们没有独立事件表，
 * 但**所有会改变余额的记录都带时间**（账单、转账、借贷、退款、报销、资产流水），
 * 所以可以从「当前余额」按时间反向扣除，得到任意一天的真实余额：
 *     balance(D) = 当前余额 − Σ(时间晚于 D 的变动)
 * 这比「当前余额 − 区间内净支出」准确得多：区间外的转账、借贷、退款、手续费、定存都会被算进去。
 *
 * 账户在没有任何流水时按当前余额恒定处理（无法得知其创建日期，不做猜测）。
 */
export interface TrendInput {
  assets: Asset[]
  bills: Bill[]
  transfers: Transfer[]
  lends: Lend[]
  refunds: Refund[]
  reimbursements: Reimbursement[]
  assetFlows: AssetFlow[]
  parents: Category[]
  currencies: Array<{ code: string; rate: number }>
  defaultCurrency: string
}

export interface TrendPoint {
  /** YYYY-MM-DD */
  key: string
  /** 折算成默认币种后的净资产 */
  value: number
}

const dayStart = (t: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
const dayKey = (t: number) => {
  const d = new Date(t)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 每个账户的「带时间的余额变动」 */
export function assetMovements(input: TrendInput): Map<number, Array<{ time: number; delta: number }>> {
  const out = new Map<number, Array<{ time: number; delta: number }>>()
  const push = (assetId: number, time: number, delta: number) => {
    if (!assetId || !Number.isFinite(delta) || delta === 0) return
    out.set(assetId, [...(out.get(assetId) ?? []), { time, delta }])
  }
  const kindOf = (id: number) => input.parents.find((p) => p.id === id)?.kind

  for (const b of input.bills) {
    const income = kindOf(b.parentCategoryId) === 'income'
    push(b.assetId, b.time, (income ? 1 : -1) * (b.accountAmount ?? b.cost))
  }
  // 手续费要么是独立账单、要么在转账上，不能两边都算（与 balances.movements 一致）
  const feeBillIds = new Set(
    input.transfers
      .filter((t) => t.billId && input.bills.some((b) => String(b.billId) === String(t.billId)))
      .map((t) => String(t.billId))
  )
  for (const t of input.transfers) {
    const feeIsBill = t.billId != null && feeBillIds.has(String(t.billId))
    push(t.fromAssetId, t.time, -t.cost - (feeIsBill ? 0 : (t.serviceCharge || 0)))
    push(t.toAssetId, t.time, t.toCost ?? t.cost)
  }
  for (const l of input.lends) {
    const id = (l.type === 2 || l.type === 4) && l.repaymentAssetId ? l.repaymentAssetId : l.assetId
    push(id, l.time, (l.type === 1 || l.type === 4 ? -1 : 1) * l.number)
  }
  for (const r of input.refunds) {
    const bill = input.bills.find((b) => String(b.billId) === String(r.billId))
    // 退款以其登记的业务日期计入走势（真机退款页可选日期），缺省才回落到更新时间
    push(r.assetId ?? bill?.assetId ?? 0, r.time ?? r.updateTime ?? bill?.time ?? 0, r.number)
  }
  for (const r of input.reimbursements) {
    if (r.status === 'done') push(r.assetId, r.settledAt ?? r.updateTime ?? 0, r.accountAmount ?? r.number)
  }
  for (const f of input.assetFlows) push(f.assetId, f.time, f.delta)
  return out
}

/**
 * 生成 [from, to] 每天的总净资产。
 * 除按天取点外不做任何插值，缺数据的账户按当前余额计入。
 */
export function assetTrend(input: TrendInput, from: number, to: number): TrendPoint[] {
  const rateOf = (code?: string) => {
    if (!code || code === input.defaultCurrency) return 1
    const c = input.currencies.find((x) => x.code === code)
    return c && c.rate ? c.rate : 1
  }
  const visible = input.assets.filter((a) => !a.hide && a.intoTotalAsset !== false)
  const movements = assetMovements(input)
  const points: TrendPoint[] = []

  const start = dayStart(from)
  const end = dayStart(to)
  for (let day = start; day <= end; day += 86400000) {
    const dayEnd = day + 86400000
    let total = 0
    for (const a of visible) {
      const list = movements.get(a.assetId) ?? []
      // 当天结束时的余额 = 当前余额 − 之后发生的变动
      const future = list.filter((m) => m.time >= dayEnd).reduce((n, m) => n + m.delta, 0)
      const value = a.assetNumber - future
      total += value * rateOf(a.currency)
    }
    points.push({ key: dayKey(day), value: +total.toFixed(2) })
  }
  return points
}
