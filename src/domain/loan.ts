/**
 * 房贷计算（对应一木 AddHomeLoanActivity 的输入项）：
 * 组合贷 = 商业贷款 + 公积金贷款；两种还款方式分别计算后按同一天合并。
 */

export type RepaymentType = 'equal-payment' | 'equal-principal' // 等额本息 / 等额本金

export interface LoanPart {
  /** 本金 */
  amount: number
  /** 年利率，如 0.043 表示 4.3% */
  rate: number
  /** LPR 加点（百分点），如 +0.6 表示加 60 个基点 */
  lprAdd?: number
}

export interface LoanPlanInput {
  commercial?: LoanPart
  provident?: LoanPart
  /** 期数（月） */
  periods: number
  repayment: RepaymentType
}

export interface LoanPeriod {
  period: number
  principal: number
  interest: number
  /** 当期应还 */
  total: number
}

export interface LoanPlan {
  periods: LoanPeriod[]
  totalPrincipal: number
  totalInterest: number
  /** 等额本息的首期月供；等额本金是首月月供 */
  firstMonthly: number
  /** 每期利率（月） */
  monthlyRate: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function planSingle(amount: number, annualRate: number, periods: number, repayment: RepaymentType): LoanPeriod[] {
  const r = annualRate / 12
  const out: LoanPeriod[] = []
  if (amount <= 0 || periods <= 0) return out

  if (repayment === 'equal-payment') {
    // 等额本息：M = P·r·(1+r)^n / ((1+r)^n − 1)
    const monthly = r === 0 ? amount / periods : (amount * r * Math.pow(1 + r, periods)) / (Math.pow(1 + r, periods) - 1)
    let remain = amount
    for (let i = 1; i <= periods; i++) {
      const interest = round2(remain * r)
      let principal = round2(monthly - interest)
      if (i === periods) principal = round2(remain)          // 末期把尾差补平
      const total = round2(principal + interest)
      out.push({ period: i, principal, interest, total })
      remain = round2(remain - principal)
    }
    return out
  }

  // 等额本金：每期本金相同，利息按剩余本金计
  const per = round2(amount / periods)
  let remain = amount
  for (let i = 1; i <= periods; i++) {
    const principal = i === periods ? round2(remain) : per
    const interest = round2(remain * r)
    out.push({ period: i, principal, interest, total: round2(principal + interest) })
    remain = round2(remain - principal)
  }
  return out
}

/** 组合贷：两笔各自计算，按期合并（同一期相加） */
export function planLoan(input: LoanPlanInput): LoanPlan {
  const parts: LoanPart[] = []
  if (input.commercial && input.commercial.amount > 0) parts.push(input.commercial)
  if (input.provident && input.provident.amount > 0) parts.push(input.provident)
  const periods = Math.max(1, Math.floor(input.periods))

  const lists = parts.map((p) => {
    const rate = (p.rate ?? 0) + (p.lprAdd ?? 0) / 100
    return planSingle(p.amount, rate, periods, input.repayment)
  })

  const merged: LoanPeriod[] = []
  for (let i = 0; i < periods; i++) {
    let principal = 0, interest = 0
    for (const list of lists) {
      principal += list[i]?.principal ?? 0
      interest += list[i]?.interest ?? 0
    }
    merged.push({
      period: i + 1,
      principal: round2(principal),
      interest: round2(interest),
      total: round2(principal + interest)
    })
  }

  const totalPrincipal = round2(merged.reduce((s, x) => s + x.principal, 0))
  const totalInterest = round2(merged.reduce((s, x) => s + x.interest, 0))
  const firstMonthly = merged[0]?.total ?? 0
  const totalAmount = parts.reduce((s, p) => s + p.amount, 0)
  const monthlyRate = totalAmount ? (totalInterest / totalAmount) : 0

  return { periods: merged, totalPrincipal, totalInterest, firstMonthly, monthlyRate: round2(monthlyRate) }
}

/** 信用卡分期：把消费额按 periods 均摊，手续费支持一次性或每期收取 */
export type InstalmentServiceType = 0 | 1 // 0 一次性 / 1 每期

export interface InstalmentPlanInput {
  total: number
  periods: number
  serviceRate: number          // 总手续费率，如 0.072
  serviceType: InstalmentServiceType
}

export interface InstalmentPeriod {
  period: number
  principal: number
  service: number
  total: number
}

export function planInstalment(input: InstalmentPlanInput): { periods: InstalmentPeriod[]; totalService: number; total: number } {
  const n = Math.max(1, Math.floor(input.periods))
  const total = Number(input.total) || 0
  if (total <= 0) return { periods: [], totalService: 0, total: 0 }
  const totalService = round2(total * (input.serviceRate ?? 0))
  const perPrincipal = round2(total / n)
  const perService = round2(totalService / n)
  const out: InstalmentPeriod[] = []
  let allocated = 0
  for (let i = 1; i <= n; i++) {
    const principal = i === n ? round2(total - allocated) : perPrincipal
    allocated = round2(allocated + principal)
    // 一次性手续费计入第 1 期；每期收则均摊
    const service = input.serviceType === 0 ? (i === 1 ? totalService : 0) : (i === n ? round2(totalService - perService * (n - 1)) : perService)
    out.push({ period: i, principal, service, total: round2(principal + service) })
  }
  return { periods: out, totalService, total: round2(total + totalService) }
}
