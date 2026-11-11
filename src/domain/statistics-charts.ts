import { billNetAmount } from '../bill-amount'
import type { Bill, Category, Refund } from '../types'

export type RangeMode = 'month' | 'week' | 'year' | 'custom'
export type ChartPoint = { key: string; label: string; income: number; expense: number }
export type CategoryPoint = { id: number; name: string; icon?: string; amount: number; count: number }
export type Bounds = { start: Date; end: Date }

// 使用本地自然日和开区间，避免跨夏令时与结束日最后一秒的边界误差。
export function statisticsBounds(mode: RangeMode, month: string, weekDay: string, from: string, to: string): Bounds | null {
  const parse = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
    const d = new Date(`${s}T00:00:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (mode === 'custom') {
    const start = parse(from), last = parse(to)
    if (!start || !last || last < start) return null
    return { start, end: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1) }
  }
  if (mode === 'week') {
    const date = parse(weekDay)
    if (!date) return null
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (date.getDay() + 6) % 7)
    return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) }
  }
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  const start = parse(`${month}-01`)
  if (!start) return null
  if (mode === 'year') return { start: new Date(start.getFullYear(), 0, 1), end: new Date(start.getFullYear() + 1, 0, 1) }
  return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) }
}

export function categoryDistribution(bills: Bill[], categories: Category[], refunds: Refund[], kind: 'income' | 'expense'): CategoryPoint[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const rows = new Map<number, CategoryPoint>()
  for (const bill of bills) {
    if (bill.notIntoTotal) continue
    const category = byId.get(bill.parentCategoryId)
    if ((category?.kind === 'income' ? 'income' : 'expense') !== kind) continue
    const amount = kind === 'income' ? bill.cost : billNetAmount(bill, refunds)
    if (amount <= 0) continue
    const row = rows.get(bill.parentCategoryId) ?? { id: bill.parentCategoryId, name: category?.name ?? '分类待核对', icon: category?.icon, amount: 0, count: 0 }
    row.amount += amount
    row.count++
    rows.set(row.id, row)
  }
  return [...rows.values()].sort((a, b) => b.amount - a.amount || a.id - b.id)
}

export function chartTrend(bills: Bill[], categories: Category[], refunds: Refund[], bounds: Bounds): ChartPoint[] {
  const spanDays = (bounds.end.getTime() - bounds.start.getTime()) / 86400000
  const monthly = spanDays > 93
  const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}${monthly ? '' : `-${String(d.getDate()).padStart(2, '0')}`}`
  const rows = new Map<string, ChartPoint>()
  const cursor = monthly ? new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1) : new Date(bounds.start)
  while (cursor < bounds.end) {
    const key = keyOf(cursor)
    rows.set(key, { key, label: monthly ? `${cursor.getFullYear()}/${cursor.getMonth() + 1}` : `${cursor.getMonth() + 1}/${cursor.getDate()}`, income: 0, expense: 0 })
    if (monthly) cursor.setMonth(cursor.getMonth() + 1)
    else cursor.setDate(cursor.getDate() + 1)
  }
  const kinds = new Map(categories.map((c) => [c.id, c.kind]))
  for (const bill of bills) {
    if (bill.notIntoTotal || bill.time < bounds.start.getTime() || bill.time >= bounds.end.getTime()) continue
    const row = rows.get(keyOf(new Date(bill.time)))
    if (!row) continue
    if (kinds.get(bill.parentCategoryId) === 'income') row.income += bill.cost
    else row.expense += billNetAmount(bill, refunds)
  }
  return [...rows.values()]
}
