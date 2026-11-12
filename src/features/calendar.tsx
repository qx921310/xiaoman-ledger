import { useMemo, useState } from 'react'
import { Solar } from 'lunar-typescript'
import { useLedger } from '../store'
import { money, fullDay } from '../ui-format'
import { toBase } from '../money'
import { billNetAmount } from '../bill-amount'

/** 日历：按月看每日收支（照一木「日历」标签的最小可用版） */
export function CalendarPage({ onAddBill, onOpenMonthBills }: { onAddBill?: () => void; onOpenMonthBills?: () => void } = {}) {
  const bills = useLedger((s) => s.bills)
  const parents = useLedger((s) => s.parentCategories)
  const refunds = useLedger((s) => s.refunds)
  const assets = useLedger((s) => s.assets)
  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const bookId = useLedger((s) => s.currentBookId)
  const [cursor, setCursor] = useState(() => new Date())
  const [picked, setPicked] = useState<string | null>(null)
  // 一木 CalendarLayout 支持月/周切换
  const [mode, setMode] = useState<'month' | 'week'>('month')
  // 一木 popup_calendar_menu：本月账单 / 多选账本 / 显示热力背景 / 热力图指标 / 更多设置
  const [menuOpen, setMenuOpen] = useState(false)
  const [heat, setHeat] = useState(false)
  const [heatType, setHeatType] = useState<'balance' | 'amount'>('balance')

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

  const todayKey = fullDay(Date.now())
  const isToday = (day: number) => keyOf(day) === todayKey

  const keyOf = (day: number) => `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  // 一木用开源库 com.haibin.calendarview 渲染格子，农历/节气/节日由库提供。
  // Web 端用同源的 lunar-typescript（6tail，成熟库），不再自己解析 Intl 字符串。
  // 一木格子第二行：节日/节气优先，其次农历日。按月一次性算好，避免每格重复建对象。
  const lunarMap = useMemo(() => {
    const out = new Map<number, string>()
    for (let d = 1; d <= new Date(year, monthIdx + 1, 0).getDate(); d++) {
      try {
        const solar = Solar.fromDate(new Date(year, monthIdx, d))
        const lunar = solar.getLunar()
        const festival = solar.getFestivals()[0] ?? lunar.getFestivals()[0] ?? lunar.getJieQi()
        // getJieQi() 无节气时返回空字符串，不能用 ?? 兜底，必须用 || 判断真值
        out.set(d, festival || lunar.getDayInChinese())
      } catch { out.set(d, '') }
    }
    return out
  }, [year, monthIdx])
  const lunarOf = (day: number) => lunarMap.get(day) ?? ''

  // 一木 tool_bar：月收入 / 月支出 / 月结余
  const monthTotals = useMemo(() => {
    let income = 0, expense = 0
    for (const row of daily.values()) { income += row.income; expense += row.expense }
    return { income: +income.toFixed(2), expense: +expense.toFixed(2), balance: +(income - expense).toFixed(2) }
  }, [daily])

  // 真周视图：从 picked 所在周的周日开始，连续 7 天（跨月也能正确显示）
  const weekDays = useMemo(() => {
    const base = new Date(`${picked ?? fullDay(Date.now())}T00:00:00`)
    const start = new Date(base)
    start.setDate(base.getDate() - base.getDay())
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [picked])

  /** 任意日期当天的收入/支出（周视图跨月时不能只查当月 daily） */
  const statOf = (date: Date) => {
    if (date.getFullYear() === year && date.getMonth() === monthIdx) return daily.get(fullDay(date.getTime())) ?? { income: 0, expense: 0, count: 0 }
    let income = 0, expense = 0, count = 0
    for (const b of bills) {
      if (bookId !== 0 && String(b.bookId) !== String(bookId)) continue
      if (fullDay(b.time) !== fullDay(date.getTime())) continue
      if (!b.notIntoTotal) {
        if (kindOf.get(b.parentCategoryId) === 'income') income = +(income + b.cost).toFixed(2)
        else expense = +(expense + billNetAmount(b, refunds)).toFixed(2)
      }
      count++
    }
    return { income, expense, count }
  }
  const lunarOfDate = (date: Date) => {
    try {
      const solar = Solar.fromDate(date)
      const lunar = solar.getLunar()
      const f = solar.getFestivals()[0] ?? lunar.getFestivals()[0] ?? lunar.getJieQi()
      return f || lunar.getDayInChinese()
    } catch { return '' }
  }

  // 必须走 statOf：周视图可能选中非当前月的日期，daily 里没有那条数据
  // 热力背景色阶：一木按当日结余/收支强度着色（0 为无底色）
  const heatMax = useMemo(() => {
    let max = 0
    for (const v of daily.values()) {
      const n = heatType === 'balance' ? Math.abs(v.income - v.expense) : v.income + v.expense
      if (n > max) max = n
    }
    return max
  }, [daily, heatType])
  const heatStyle = (st?: { income: number; expense: number }) => {
    if (!st || heatMax <= 0) return undefined
    const n = heatType === 'balance' ? Math.abs(st.income - st.expense) : st.income + st.expense
    if (n <= 0) return undefined
    return `color-mix(in srgb, var(--accent) ${Math.round((n / heatMax) * 70)}%, transparent)`
  }

  const pickedStat = picked
    ? statOf(new Date(`${picked}T00:00:00`))
    : { income: 0, expense: 0, count: 0 }
  /** 某天的农历（选中日头部用） */
  const dayLunar = (key: string) => {
    try {
      const [y, m, d] = key.split('-').map(Number)
      const solar = Solar.fromDate(new Date(y, m - 1, d))
      const lunar = solar.getLunar()
      // 一木头部是「日期 + 农历」，这里固定给农历月日，节日只作补充
      const solarFestival = solar.getFestivals()[0] ?? lunar.getFestivals()[0] ?? lunar.getJieQi()
      const lunarText = `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`
      return solarFestival ? `${lunarText} · ${solarFestival}` : lunarText
    } catch { return '' }
  }

  // 一木日历详情区顶部有「还款提醒」列表（repayment_list）：当天到期的信用卡还款
  const repayReminders = useMemo(() => {
    if (!picked) return []
    const dayNum = Number(picked.slice(8, 10))
    const daysInThisMonth = new Date(year, monthIdx + 1, 0).getDate()
    const list = assets
      .filter((a) => (bookId === 0 || a.bookId == null || String(a.bookId) === String(bookId)))
      .filter((a) => a.assetType === 2 && Math.min(a.outAccountDate ?? 0, daysInThisMonth) === dayNum)
      .map((a) => ({
        key: 'card-' + a.assetId,
        name: a.simpleName || a.assetName,
        // 原币换算成本位币，避免外币卡显示错币种
        due: Math.abs(toBase(a.assetNumber, a.currency, currencies, defaultCurrency))
      }))
    return list
  }, [picked, assets, bookId, year, monthIdx])

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
          <button type="button" className={'cal-today' + (mode === 'month' ? ' on' : '')} onClick={() => setMode('month')}>月</button>
          <button type="button" className={'cal-today' + (mode === 'week' ? ' on' : '')} onClick={() => { if (!picked) setPicked(fullDay(Date.now())); setMode('week') }}>周</button>
          <button type="button" className="cal-today" onClick={() => { const t = new Date(); setCursor(t); setPicked(fullDay(t.getTime())) }}>返回今天</button>
          {onAddBill && <button type="button" className="cal-add" onClick={onAddBill}>记一笔</button>}
        </div>
      </div>
        {menuOpen && (
        <div className="menu-mask" onClick={() => setMenuOpen(false)}>
          <div className="home-menu" role="dialog" aria-label="日历更多" onClick={(e) => e.stopPropagation()}>
            <div className="hm-group">
              <button type="button" className="hm-item" onClick={() => { setMenuOpen(false); onOpenMonthBills?.() }}>本月账单</button>
              <button type="button" className="hm-item muted" disabled>多选账本（暂未实现）</button>
            </div>
            <div className="hm-group">
              <div className="hm-label">热力背景</div>
              <div className="hm-seg">
                <button type="button" className={!heat ? 'on' : ''} onClick={() => setHeat(false)}>关闭</button>
                <button type="button" className={heat ? 'on' : ''} onClick={() => setHeat(true)}>显示</button>
              </div>
              {heat && (
                <div className="hm-seg">
                  <button type="button" className={heatType === 'balance' ? 'on' : ''} onClick={() => setHeatType('balance')}>结余热力</button>
                  <button type="button" className={heatType === 'amount' ? 'on' : ''} onClick={() => setHeatType('amount')}>收支热力</button>
                </div>
              )}
            </div>
            <button type="button" className="ghost wide" onClick={() => setMenuOpen(false)}>关闭</button>
          </div>
        </div>
      )}

      <div className="cal-grid cal-weekdays">
        {['日', '一', '二', '三', '四', '五', '六'].map((w) => <span key={w}>{w}</span>)}
      </div>
      {mode === 'week' ? (
      <div className="cal-grid">
          {weekDays.map((date) => {
            const key = fullDay(date.getTime())
            const stat = statOf(date)
            return (
              <button key={key} className={'cal-cell' + (picked === key ? ' on' : '')}
              style={heat ? { background: heatStyle(stat) } : undefined}
                onClick={() => setPicked(key)} aria-label={`${date.getMonth() + 1}月${date.getDate()}日`}>
                <em>{key === todayKey ? '今' : date.getDate()}</em>
                <i className="cal-lunar">{lunarOfDate(date)}</i>
                {stat.expense ? <i className="out">{'-'}{money(stat.expense).replace('¥', '')}</i> : null}
                {stat.income ? <i className="in">+{money(stat.income).replace('¥', '')}</i> : null}
              </button>
            )
          })}
        </div>
      ) : (

      <div className="cal-grid">
        {cells.map((day, i) => {
          if (day == null) return <span key={'e' + i} className="cal-cell empty" />
          const stat = daily.get(keyOf(day))
          return (
            <button key={day} className={'cal-cell' + (picked === keyOf(day) ? ' on' : '')}
              style={heat ? { background: heatStyle(daily.get(keyOf(day))) } : undefined}
              onClick={() => setPicked(keyOf(day))} aria-label={`${monthIdx + 1}月${day}日`}>
              <em>{isToday(day) ? '今' : day}</em>
              <i className="cal-lunar">{lunarOf(day)}</i>
              {stat?.expense ? <i className="out">{'-'}{money(stat.expense).replace('¥', '')}</i> : null}
              {stat?.income ? <i className="in">+{money(stat.income).replace('¥', '')}</i> : null}
            </button>
          )
        })}
      </div>
      )}

      {picked && (
        <div className="cal-list">
          <div className="hf-head">
            <span>
              {picked}
              <small className="cal-lunar">{dayLunar(picked)}</small>
            </span>
            <span className="cal-day-sum">
              收 {money(pickedStat.income)} · 支 {money(pickedStat.expense)} · 结余 {money(+(pickedStat.income - pickedStat.expense).toFixed(2))}
            </span>
            <span>共 {pickedBills.length} 笔</span>
          </div>
          {repayReminders.length > 0 && (
            <div className="cal-repay">
              <b>还款提醒</b>
              {repayReminders.map((r) => (
                <div key={r.key} className="row">
                  <span className="grow">{r.name}</span>
                  <b className="out">{money(r.due)}</b>
                </div>
              ))}
            </div>
          )}
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
