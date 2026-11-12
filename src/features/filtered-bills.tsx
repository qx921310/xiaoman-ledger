import { useLedger } from '../store'
import { money, dayOf, hhmm } from '../ui-format'
import { billNetAmount } from '../bill-amount'
import { CatIcon } from '../ui/icons'

/**
 * 按条件筛选后的账单明细页（对应一木 CategoryBillInfoActivity / BudgetBillInfoActivity /
 * CycleBillInfoActivity 等「从统计或规则点进去看明细」的落地页）。
 */
export function FilteredBills({ title, bills, onBack }: {
  title: string
  bills: Array<import('../types').Bill>
  onBack: () => void
}) {
  const parents = useLedger((s) => s.parentCategories)
  const refunds = useLedger((s) => s.refunds)

  const groups = new Map<string, typeof bills>()
  for (const b of [...bills].sort((a, b2) => b2.time - a.time)) {
    const k = dayOf(b.time)
    groups.set(k, [...(groups.get(k) ?? []), b])
  }
  const total = bills.reduce((n, b) => {
    const inc = parents.find((p) => p.id === b.parentCategoryId)?.kind === 'income'
    return inc ? n : n + billNetAmount(b, refunds)
  }, 0)

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>{title}</h3>
        <span className="muted">{bills.length} 笔 · {money(+total.toFixed(2))}</span>
      </div>
      {bills.length === 0 && <p className="hint">这里还没有账单。</p>}
      {[...groups.entries()].map(([day, rows]) => (
        <div key={day} className="group">
          <div className="day"><span>{day}</span><small>{rows.length} 笔</small></div>
          {rows.map((b) => {
            const p = parents.find((x) => x.id === b.parentCategoryId)
            const inc = p?.kind === 'income'
            return (
              <div key={b.billId} className="row ledger-row">
                <span className="dot-badge" style={{ background: p?.bg ?? 'var(--accent-soft)', color: p?.color ?? 'var(--ink)' }}>
                  <CatIcon k={p?.icon} size={16} />
                </span>
                <div className="grow">
                  <div>{p?.name ?? '未分类'}{b.remark ? ` · ${b.remark}` : ''}</div>
                  <small>{hhmm(b.time)}</small>
                </div>
                <b className={inc ? 'in' : 'out'}>{inc ? '+' : '-'}{money(inc ? b.cost : billNetAmount(b, refunds))}</b>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}
