import type { Lend } from './types'

/** 该笔借贷的应还/应收总额（本金 + 利息） */
export const lendTotal = (lend: Lend) => +(Number(lend.number) + Number(lend.interest ?? 0)).toFixed(2)

/** 已收/已还合计（关联到这笔的收回/还款记录） */
export const lendRepaid = (lend: Lend, lends: Lend[]) =>
  +lends.filter((l) => l.parentLendId === lend.lendId).reduce((sum, l) => sum + (Number(l.number) || 0), 0).toFixed(2)

/** 剩余未收/未还 */
export const lendRemaining = (lend: Lend, lends: Lend[]) =>
  +Math.max(0, lendTotal(lend) - lendRepaid(lend, lends)).toFixed(2)

/** 应收（我借出的未收）与应付（我借入的未还） */
export function lendTotals(lends: Lend[]) {
  const isChild = (l: Lend) => lends.some((p) => p.lendId === l.parentLendId)
  let receivable = 0
  let payable = 0
  for (const l of lends) {
    if (isChild(l)) continue
    if (l.type === 1) receivable += lendRemaining(l, lends)
    else if (l.type === 3) payable += lendRemaining(l, lends)
  }
  return { receivable: +receivable.toFixed(2), payable: +payable.toFixed(2) }
}
