import { hasCurrencyRate } from '../money'
import { leaksPrivateAccount, visibleAssets } from './asset-scope'
import type { AccountBook, Asset, Category, Currency } from '../types'

export type OcrDraft = { date: string; amount: string; direction: 'income' | 'expense'; categoryId: string; assetId: string; remark: string; payment?: string }

export function validateOcrDraft(draft: OcrDraft, assets: Asset[], parents: Category[], currentBookId: string | number, books: AccountBook[], currencies: Currency[], defaultCurrency: string, userId?: number): { error: string } | { amount: number; time: number; category: Category; asset: Asset } {
  const amount = Number(draft.amount)
  const time = new Date(draft.date + 'T12:00:00').getTime()
  const category = parents.find((p) => String(p.id) === draft.categoryId && p.kind === draft.direction && !p.hide)
  const asset = visibleAssets(assets, currentBookId, userId).find((a) => String(a.assetId) === draft.assetId)
  if (!Number.isFinite(amount) || amount <= 0 || !/^\d+(\.\d{1,2})?$/.test(draft.amount.trim())) return { error: '请输入大于零、最多两位小数的金额' } as const
  if (!draft.date || !Number.isFinite(time)) return { error: '请选择有效日期' } as const
  if (!category) return { error: '请选择与收支方向一致的分类' } as const
  if (!asset) return { error: assets.length ? '请选择账户' : '请先到资产页新建账户' } as const
  if (leaksPrivateAccount(asset, currentBookId, books, userId)) return { error: '该账户是私有账户，请先设为共享或换账户' } as const
  if (!hasCurrencyRate(asset.currency, currencies, defaultCurrency)) return { error: `请先设置 ${asset.currency} 汇率` } as const
  return { amount, time, category, asset } as const
}
