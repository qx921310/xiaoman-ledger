import { useMemo } from 'react'
import { useLedger } from '../store'
import { summarizeBills } from '../bill-summary'
import { money } from '../ui-format'
import { Bills } from './bills'

/** 首页：本月汇总 + 预算卡 + 记账入口 + 流水（照一木的单列结构） */
export function Home({ me, onAdd }: { me?: { id: number; email: string }; onAdd: () => void }) {
  const bills = useLedger((s) => s.bills)
  const parents = useLedger((s) => s.parentCategories)
  const refunds = useLedger((s) => s.refunds)
  const budgets = useLedger((s) => s.budgets)
  const bookId = useLedger((s) => s.currentBookId)
  const readOnly = useLedger((s) => {
    const book = s.accountBooks.find((b) => String(b.bookId) === String(s.currentBookId))
    return book?.role === 'silent'
  })

  const month = new Date().toISOString().slice(0, 7)
  const inBook = useMemo(
    () => bills.filter((b) => bookId === 0 || String(b.bookId) === String(bookId)),
    [bills, bookId]
  )
  const monthBills = useMemo(() => inBook.filter((b) => new Date(b.time).toISOString().slice(0, 7) === month), [inBook, month])
  const summary = useMemo(() => summarizeBills(monthBills, parents, refunds), [monthBills, parents, refunds])

  // 总预算：本月 categoryId=0 的额度，缺省回落到 all
  const budgetTotal = useMemo(() => {
    const hit = budgets.find((b) => b.month === month && b.categoryId === 0)
      ?? budgets.find((b) => b.month === 'all' && b.categoryId === 0)
    return hit?.amount ?? 0
  }, [budgets, month])
  const used = summary.expense
  const percent = budgetTotal > 0 ? Math.min(100, Math.round((used / budgetTotal) * 100)) : 0

  return (
    <section className="home">
      <h2 className="page-title">{new Date().getFullYear()} 年 {new Date().getMonth() + 1} 月</h2>
      <div className="home-summary">
        <div className="hm-item">
          <small>本月支出</small>
          <b className="out">{money(used)}</b>
        </div>
        <div className="hm-item">
          <small>本月收入</small>
          <b className="in">{money(summary.income)}</b>
        </div>
        <div className="hm-item">
          <small>本月结余</small>
          <b>{money(summary.income - used)}</b>
        </div>
      </div>

      {budgetTotal > 0 && (
        <div className="home-budget" role="group" aria-label="本月预算">
          <div className="hb-head">
            <span>本月预算 {money(budgetTotal)}</span>
            <span className={percent >= 100 ? 'out' : ''}>已用 {percent}%</span>
          </div>
          <div className="hb-bar"><i style={{ width: `${percent}%` }} /></div>
          <small>剩余 {money(Math.max(0, budgetTotal - used))}</small>
        </div>
      )}

      <button className="home-add" onClick={onAdd} disabled={readOnly}>
        {readOnly ? '当前账本只读' : '＋ 添加一条新记账'}
      </button>

      <div className="home-flow">
        <div className="hf-head">流水</div>
        <Bills me={me} onAdd={onAdd} embedded />
      </div>
    </section>
  )
}
