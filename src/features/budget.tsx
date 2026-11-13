import { useMemo, useState } from 'react'
import { useLedger } from '../store'
import { money, fullDay, monthOf } from '../ui-format'
import { billNetAmount } from '../bill-amount'
import { CatIcon } from '../ui/icons'
import { Modal } from '../ui/modal'

/**
 * 预算管理（对齐一木 activity_budget_manager.xml，41 个 id 与全部文案）
 * 结构：周/月/年/自定义 Tab + 年份；总预算 / 剩余 / 预算支出；
 *      日均预算 / 日均支出 / 今日剩余；预算趋势（支出 · 剩余）；添加分类预算 + 分类预算列表。
 * 空态文案沿用一木「你还没有任何分类预算」。
 */
type Period = 'week' | 'month' | 'year' | 'custom'

export function BudgetManager({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const budgets = useLedger((s) => s.budgets)
  const bills = useLedger((s) => s.bills)
  const parents = useLedger((s) => s.parentCategories)
  const refunds = useLedger((s) => s.refunds)
  const setBudget = useLedger((s) => s.setBudget)
  const removeBudgetById = useLedger((s) => s.removeBudgetById)
  const currentBookId = useLedger((s) => s.currentBookId)

  const [period, setPeriod] = useState<Period>('month')
  const [editing, setEditing] = useState<null | { categoryId: number; amount: string; name?: string }>(null)

  // 期间范围：周一为一周之始（与一木周预算一致）
  const range = useMemo(() => {
    const now = new Date()
    if (period === 'week') {
      const day = (now.getDay() + 6) % 7
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day)
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
      return { start: start.getTime(), end: end.getTime(), label: `${fullDay(start.getTime())} ~ ${fullDay(end.getTime() - 1)}` }
    }
    if (period === 'year') {
      const start = new Date(now.getFullYear(), 0, 1)
      return { start: start.getTime(), end: new Date(now.getFullYear() + 1, 0, 1).getTime(), label: `${now.getFullYear()} 年` }
    }
    if (period === 'custom') {
      const custom = budgets.find((b) => b.type === 'custom' && b.startTime && b.endTime)
      if (custom) return { start: custom.startTime!, end: custom.endTime!, label: `${fullDay(custom.startTime!)} ~ ${fullDay(custom.endTime!)}` }
      return null
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: start.getTime(), end: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(), label: monthOf(Date.now()) }
  }, [period, budgets])

  const inRange = useMemo(() => bills.filter((b) => {
    if (currentBookId !== 0 && String(b.bookId) !== String(currentBookId)) return false
    if (!range) return false
    return b.time >= range.start && b.time < range.end
  }), [bills, range, currentBookId])

  const kindOf = (id: number) => parents.find((p) => p.id === id)?.kind
  const spendOf = (categoryId: number) => +inRange
    .filter((b) => b.notIntoBudget !== true)
    .filter((b) => kindOf(b.parentCategoryId) !== 'income')
    .filter((b) => categoryId === 0 || b.parentCategoryId === categoryId)
    .reduce((n, b) => n + billNetAmount(b, refunds), 0).toFixed(2)

  const periodBudgets = budgets.filter((b) => !b.hide && (b.type ?? 'month') === period)
  const totalBudget = periodBudgets.filter((b) => b.categoryId === 0).reduce((n, b) => n + b.amount + (b.addNum ?? 0), 0)
  const catBudgets = periodBudgets.filter((b) => b.categoryId !== 0)
  const totalSpent = spendOf(0)
  const surplus = +(totalBudget - totalSpent).toFixed(2)

  const days = range ? Math.max(1, Math.ceil((Math.min(range.end, Date.now() + 86400000) - range.start) / 86400000)) : 1
  const dailyBudget = +(totalBudget / days).toFixed(2)
  const dailySpent = +(totalSpent / days).toFixed(2)
  const todaySpent = spendOf(0) && fullDay(Date.now()) ? +inRange
    .filter((b) => fullDay(b.time) === fullDay(Date.now()))
    .filter((b) => b.notIntoBudget !== true && kindOf(b.parentCategoryId) !== 'income')
    .reduce((n, b) => n + billNetAmount(b, refunds), 0).toFixed(2) : 0
  const todayRemain = +(dailyBudget - todaySpent).toFixed(2)

  // 预算趋势：按天画「支出 / 剩余」
  const trend = useMemo(() => {
    if (!range) return []
    const map = new Map<string, number>()
    for (const b of inRange) {
      if (b.notIntoBudget === true || kindOf(b.parentCategoryId) === 'income') continue
      const day = fullDay(b.time)
      map.set(day, +((map.get(day) ?? 0) + billNetAmount(b, refunds)).toFixed(2))
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  }, [inRange, parents, refunds])

  const maxDay = Math.max(1, ...trend.map(([, v]) => v))

  const save = (categoryId: number, amount: number, name?: string) => {
    if (!(amount >= 0)) { notify('请输入预算金额'); return }
    if (categoryId === 0) {
      setBudget({ month: 'all', categoryId: 0, amount, type: period === 'custom' ? 'custom' : period })
    } else {
      setBudget({ month: 'all', categoryId, amount, type: period === 'custom' ? 'custom' : period })
    }
    notify(categoryId === 0 ? '总预算已保存' : '分类预算已保存')
    setEditing(null)
  }

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>预算</h3>
        <button type="button" className="link" onClick={() => setEditing({ categoryId: 0, amount: String(totalBudget || '') })}>设置</button>
      </div>

      <div className="seg">
        {([['week', '周'], ['month', '月'], ['year', '年'], ['custom', '自定义']] as [Period, string][]).map(([k, label]) => (
          <button key={k} type="button" className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{label}</button>
        ))}
      </div>

      {period === 'custom' && !range && <p className="hint">未选择自定义预算，点击选择</p>}
      {range && <p className="hint">{range.label}</p>}

      <div className="stat-cards">
        <div><small>总预算</small><b>{money(totalBudget)}</b></div>
        <div><small>剩余</small><b className={surplus < 0 ? 'out' : ''}>{money(surplus)}</b></div>
        <div><small>预算支出</small><b>{money(totalSpent)}</b></div>
      </div>
      <div className="stat-cards">
        <div><small>日均预算</small><b>{money(dailyBudget)}</b></div>
        <div><small>日均支出</small><b>{money(dailySpent)}</b></div>
        <div><small>今日剩余</small><b className={todayRemain < 0 ? 'out' : ''}>{money(todayRemain)}</b></div>
      </div>

      {trend.length > 0 && (
        <>
          <div className="label">预算趋势</div>
          <div className="stats-chart" role="img" aria-label="预算趋势">
            <svg viewBox="0 0 300 96" preserveAspectRatio="none">
              {trend.map(([day, v], i) => {
                const w = 300 / trend.length
                const h = (v / maxDay) * 80
                return <rect key={day} x={i * w + 1} y={90 - h} width={Math.max(1, w - 2)} height={h} fill="var(--accent)" opacity="0.8" />
              })}
            </svg>
            <div className="stats-panel-head"><span>{trend[0][0]}</span><span>{trend[trend.length - 1][0]}</span></div>
          </div>
        </>
      )}

      <div className="row">
        <span className="grow">分类预算</span>
        <button type="button" className="link" onClick={() => setEditing({ categoryId: parents.find((p) => p.kind === 'expense')?.id ?? 0, amount: '' })}>添加分类预算</button>
      </div>
      {catBudgets.length === 0 && <p className="hint">你还没有任何分类预算</p>}
      {catBudgets.map((b) => {
        const p = parents.find((x) => x.id === b.categoryId)
        const used = spendOf(b.categoryId)
        const limit = b.amount + (b.addNum ?? 0)
        return (
          <div key={`${b.categoryId}-${b.budgetId ?? 0}`} className="row">
            <div className="grow">
              <div><CatIcon k={p?.icon} size={14} /> {p?.name ?? '分类'}</div>
              <small>{money(used)} / {money(limit)}</small>
            </div>
            <div className="bar-track" aria-hidden>
              <div className="bar" style={{ width: `${Math.min(100, limit ? (used / limit) * 100 : 0)}%`, background: used > limit ? 'var(--out)' : 'var(--accent)' }} />
            </div>
            <button type="button" className="link" onClick={() => setEditing({ categoryId: b.categoryId, amount: String(b.amount) })}>改</button>
            <button type="button" className="del" onClick={() => {
              if (b.budgetId != null) removeBudgetById(b.budgetId)
              else setBudget({ month: b.month, categoryId: b.categoryId, amount: 0, type: b.type })
            }}>删</button>
          </div>
        )
      })}

      {editing && (
        <Modal label="设置预算" onClose={() => setEditing(null)}>
          <h3>{editing.categoryId === 0 ? '总预算' : '分类预算'}</h3>
          {editing.categoryId !== 0 && (
            <>
              <div className="label">分类</div>
              <select aria-label="预算分类" value={editing.categoryId} onChange={(e) => setEditing({ ...editing, categoryId: Number(e.target.value) })}>
                {parents.filter((p) => p.kind === 'expense' && !p.hide).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </>
          )}
          <div className="label">金额</div>
          <input aria-label="预算金额" inputMode="decimal" value={editing.amount}
            onChange={(e) => setEditing({ ...editing, amount: e.target.value.replace(/[^\d.]/g, '') })} />
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setEditing(null)}>取消</button>
            <button type="button" className="primary" onClick={() => save(editing.categoryId, Number(editing.amount) || 0, editing.name)}>保存</button>
          </div>
        </Modal>
      )}
    </>
  )
}
