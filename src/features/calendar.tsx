import { useMemo, useState } from 'react'
import { useLedger } from '../store'
import { money, fullDay } from '../ui-format'
import { billNetAmount } from '../bill-amount'

/** 日历：按月看每日收支（照一木「日历」标签的最小可用版） */
export function CalendarPage({ onAddBill }: { onAddBill?: () => void } = {}) {
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

  // 一木日历格里有农历（ActivityMonthView 第二行）。用 Intl 的中国历法取，再转成「初一/十五」
  const lunarOf = (day: number) => {
    try {
      const raw = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' })
        .format(new Date(year, monthIdx, day))
      const n = Number(raw.replace(/\D+/g, '').match(/\d+$/)?.[0] ?? 0)
      if (!n) return raw
      const names = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
        '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
        '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十']
      return names[n - 1] ?? raw
    } catch { return '' }
  }

  // 一木 tool_bar：月收入 / 月支出 / 月结余
  const monthTotals = useMemo(() => {
    let income = 0, expense = 0
    for (const row of daily.values()) { income += row.income; expense += row.expense }
    return { income: +income.toFixed(2), expense: +expense.toFixed(2), balance: +(income - expense).toFixed(2) }
  }, [daily])

  const pickedBills = picked
    ? bills.filter((b) => (bookId === 0 || String(b.bookId) === String(bookId)) && fullDay(b.time) === picked)
      .sort((a, b) => b.time - a.time)
    : []

  return (
    <section className="card">
      <div className="cal-toolbar">
        <div className="cal-title">
          <button className="ghost" aria-label="上个月" onClick={() => setCursor(new Date(year, monthIdx - 1, 1))}>‹</button>
          <b>{year} 年 {monthIdx + 1} 月</b>
          <button className="ghost" aria-label="下个月" onClick={() => setCursor(new Date(year, monthIdx + 1, 1))}>›</button>
        </div>
        <div className="cal-totals">
          <div><small>收入</small><b className="in">{money(monthTotals.income)}</b></div>
          <div><small>支出</small><b className="out">{money(monthTotals.expense)}</b></div>
          <div><small>结余</small><b>{money(monthTotals.balance)}</b></div>
        </div>
        <div className="cal-actions">
          <button type="button" className="cal-today" onClick={() => { const t = new Date(); setCursor(t); setPicked(fullDay(t.getTime())) }}>返回今天</button>
          {onAddBill && <button type="button" className="cal-add" onClick={onAddBill}>记一笔</button>}
        </div>
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
              <i className="cal-lunar">{lunarOf(day)}</i>
              {stat?.expense ? <i className="out">{money(stat.expense).replace('¥', '')}</i> : null}
              {stat?.income ? <i className="in">+{money(stat.income).replace('¥', '')}</i> : null}
            </button>
          )
        })}
      </div>

      {picked && (
        <div className="cal-list">
          <div className="hf-head">
            <span>{picked}</span>
            <span className="cal-day-sum">
              收 {money(pickedBills.filter((b) => kindOf.get(b.parentCategoryId) === 'income').reduce((s, b) => s + b.cost, 0))} ·
              支 {money(pickedBills.filter((b) => kindOf.get(b.parentCategoryId) !== 'income').reduce((s, b) => s + billNetAmount(b, refunds), 0))}
            </span>
            <span>共 {pickedBills.length} 笔</span>
          </div>
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
