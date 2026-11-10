import type { Currency } from './types'

export const findCurrency = (list: Currency[], code?: string) =>
  list.find((c) => c.code === code) ?? list.find((c) => c.code === 'CNY') ?? list[0]

/** 外币金额 → 本币金额（rate 语义：1 外币 = rate 本币） */
export function toBase(amount: number, code: string | undefined, list: Currency[], defaultCode = 'CNY'): number {
  if (!code || code === defaultCode) return amount
  const c = list.find((x) => x.code === code)
  if (!c || !c.rate) return amount
  return +(amount * c.rate).toFixed(2)
}

/** 本币金额 → 外币金额 */
export function fromBase(amount: number, code: string | undefined, list: Currency[], defaultCode = 'CNY'): number {
  if (!code || code === defaultCode) return amount
  const c = list.find((x) => x.code === code)
  if (!c || !c.rate) return amount
  return +(amount / c.rate).toFixed(2)
}

export const currencySymbol = (list: Currency[], code?: string, defaultCode = 'CNY') => {
  const c = findCurrency(list, code ?? defaultCode)
  return c?.symbol ?? '¥'
}
