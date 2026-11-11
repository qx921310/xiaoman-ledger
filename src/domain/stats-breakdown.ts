import { billNetAmount } from '../bill-amount'
import type { Asset, Bill, Category, Refund, Tag } from '../types'

const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface DailyPoint { day: string; income: number; expense: number }

/** 按日收支：给定月份（'YYYY-MM'），返回当月每一天（只返回有记录的日子） */
export function dailyTrend(bills: Bill[], parents: Category[], refunds: Refund[], month: string): DailyPoint[] {
  const kindOf = new Map(parents.map((p) => [p.id, p.kind]))
  const map = new Map<string, DailyPoint>()
  for (const b of bills) {
    const key = dayKey(b.time)
    if (!key.startsWith(month)) continue
    const row = map.get(key) ?? { day: key, income: 0, expense: 0 }
    if (kindOf.get(b.parentCategoryId) === 'income') {
      if (!b.notIntoTotal) row.income = +(row.income + b.cost).toFixed(2)
    } else {
      const net = billNetAmount(b, refunds)
      if (!b.notIntoTotal) row.expense = +(row.expense + net).toFixed(2)
    }
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1))
}

export interface AssetPoint { assetId: number; name: string; expense: number; income: number }

/** 按账户汇总支出/收入（仅统计计入收支的账单） */
export function byAsset(bills: Bill[], assets: Asset[], parents: Category[], refunds: Refund[]): AssetPoint[] {
  const kindOf = new Map(parents.map((p) => [p.id, p.kind]))
  const nameOf = new Map(assets.map((a) => [a.assetId, a.simpleName || a.assetName]))
  const map = new Map<number, AssetPoint>()
  for (const b of bills) {
    if (b.notIntoTotal) continue
    const row = map.get(b.assetId) ?? { assetId: b.assetId, name: nameOf.get(b.assetId) ?? '已删除账户', expense: 0, income: 0 }
    if (kindOf.get(b.parentCategoryId) === 'income') row.income = +(row.income + b.cost).toFixed(2)
    else row.expense = +(row.expense + billNetAmount(b, refunds)).toFixed(2)
    map.set(b.assetId, row)
  }
  return [...map.values()]
    .filter((r) => r.expense || r.income)
    .sort((a, b) => b.expense - a.expense)
}

export interface TagPoint { name: string; amount: number }

/** 按标签汇总支出（一笔账单多个标签时每个标签都计一次） */
export function byTag(bills: Bill[], tags: Tag[], parents: Category[], refunds: Refund[]): TagPoint[] {
  const kindOf = new Map(parents.map((p) => [p.id, p.kind]))
  const colorOf = new Map(tags.map((t) => [t.name, t.color]))
  const map = new Map<string, TagPoint>()
  for (const b of bills) {
    if (b.notIntoTotal) continue
    if (kindOf.get(b.parentCategoryId) === 'income') continue
    const amount = billNetAmount(b, refunds)
    for (const name of b.tags ?? []) {
      if (!colorOf.has(name)) continue
      const row = map.get(name) ?? { name, amount: 0 }
      row.amount = +(row.amount + amount).toFixed(2)
      map.set(name, row)
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
}
