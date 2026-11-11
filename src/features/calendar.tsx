import { useMemo, useState } from 'react'
import { useLedger } from '../store'
import { money, fullDay } from '../ui-format'
import { billNetAmount } from '../bill-amount'

/** 日历：按月看每日收支（照一木「日历」标签的最小可用版） */
export function CalendarPage() {
  const bills = useLedger((s) => s.bills)
  const parents = useLedger((s) => s.parentCategories)
  const refunds = useLedger((s) => s.refunds)
  const bookId = useLedger((s) => s.currentBookId)
  const [cursor, setCursor] = useState(() => new Date())
  const [picked, setPicked] = useState<string | null>(null)

  const kindOf = useMemo(() => new Map(parents.map((p) => [p.id, p.kind])), [parents])

  const daily = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; count: number }>()
    for (const b of bills) {
      if (bookId !== 0 && String(b.bookId) !== String(bookId)) continue
      const d = new Date(b.time)
      if (d.getFullYear() !== cursor.getFullYear() || d.getMonth() !== cursor.getMonth()) continue
      const key = fullDay(b.time)
      const row = map.get(key) ?? { income: 0, expense: 0, count: 0 }
      // 与统计同口径：不计收支的不进日历，支出扣退款后的净额
      if (!b.notIntoTotal) {
        if (kindOf.get(b.parentCategoryId) === 'income') row.income = +(row.income + b.cost).toFixed(2)
        else row.expense = +(row.expense + billNetAmount(b, refunds)).toFixed(2)
      }
      row.count++
      map.set(key, row)
    }
    return map
  }, [bills, bookId, cursor, kindOf, refunds])

  const year = cursor.getFullYear()
  const monthIdx = cursor.getMonth()
  const firstWeekday = new Date(year, monthIdx, 1).getDay()
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]

  const keyOf = (day: number) => `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const pickedBills = picked
    ? bills.filter((b) => (bookId === 0 || String(b.bookId) === String(bookId)) && fullDay(b.time) === picked)
      .sort((a, b) => b.time - a.time)
    : []

  return (
    <section className="card">
      <div className="cal-head">
        <button className="ghost" onClick={() => setCursor(new Date(year, monthIdx - 1, 1))}>‹</button>
        <b>{year} 年 {monthIdx + 1} 月</b>
        <button className="ghost" onClick={() => setCursor(new Date(year, monthIdx + 1, 1))}>›</button>
      </div>
      <div className="cal-grid cal-weekdays">
        {['日', '一', '二', '三', '四', '五', '六'].map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="cal-grid">
        {cells.map((day, i) => {
          if (day == null) return <span key={'e' + i} className="cal-cell empty" />
          const stat = daily.get(keyOf(day))
          return (
            <button key={day} className={'cal-cell' + (picked === keyOf(day) ? ' on' : '')}
              onClick={() => setPicked(keyOf(day))} aria-label={`${monthIdx + 1}月${day}日`}>
              <em>{day}</em>
              {stat?.expense ? <i className="out">{money(stat.expense).replace('¥', '')}</i> : null}
              {stat?.income ? <i className="in">+{money(stat.income).replace('¥', '')}</i> : null}
            </button>
          )
        })}
      </div>

      {picked && (
        <div className="cal-list">
          <div className="hf-head">{picked} 共 {pickedBills.length} 笔</div>
          {pickedBills.length === 0 && <p className="hint">这天没有记账。</p>}
          {pickedBills.map((b) => (
            <div key={String(b.billId)} className="row">
              <div className="grow">
                <div>{parents.find((p) => p.id === b.parentCategoryId)?.name ?? '未分类'}{b.remark ? ` · ${b.remark}` : ''}</div>
                <small>{new Date(b.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small>
              </div>
              <b className={kindOf.get(b.parentCategoryId) === 'income' ? 'in' : 'out'}>
                {kindOf.get(b.parentCategoryId) === 'income' ? '+' : '-'}{money(b.cost)}
              </b>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
