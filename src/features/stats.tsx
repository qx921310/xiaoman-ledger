import { useMemo, useState } from 'react'
import { useLedger } from '../store'
import { money, monthOf } from '../ui-format'
import { CatIcon } from '../ui/icons'
import { summarizeBills } from '../bill-summary'
import { byAsset, byTag, dailyTrend } from '../domain/stats-breakdown'
import { AssetSankey } from './asset-sankey'
import type { Bill } from '../types'
import { Modal } from '../ui/modal'
import { IMPORTED_CATEGORY_COLOR } from '../default-colors'

export function Stats() {
  const bills = useLedger((s) => s.bills)
  const refunds = useLedger((s) => s.refunds)
  const currentBookId = useLedger((s) => s.currentBookId)
  const parents = useLedger((s) => s.parentCategories)
  const budgets = useLedger((s) => s.budgets)
  const assets = useLedger((s) => s.assets)
  const tags = useLedger((s) => s.tags)
  const setBudget = useLedger((s) => s.setBudget)
  const removeBudget = useLedger((s) => s.removeBudget)
  const removeBudgetById = useLedger((s) => s.removeBudgetById)
  const [month, setMonth] = useState(monthOf(Date.now()))
  const [rangeMode, setRangeMode] = useState<'month' | 'week' | 'year' | 'custom'>('month')
  const [flow, setFlow] = useState<'expense' | 'income'>('expense')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [editing, setEditing] = useState<{
    categoryId: number; amount: string; addNum?: string
    type?: 'month' | 'year' | 'custom'
    budgetName?: string; startDate?: string; endDate?: string
  } | null>(null)

  const monthBills = useMemo(
    () => bills.filter((b) => monthOf(b.time) === month && (currentBookId === 0 || b.bookId === currentBookId)),
    [bills, month, currentBookId]
  )

  const monthSummary = useMemo(() => summarizeBills(monthBills, parents, refunds), [monthBills, parents, refunds])

  // 时间范围：周 / 年 / 自定义（一木的日常·月·年·自定义）
  const rangeBills = useMemo(() => {
    const inBook = (b: Bill) => currentBookId === 0 || b.bookId === currentBookId
    if (rangeMode === 'month') return monthBills
    if (rangeMode === 'year') {
      const y = month.slice(0, 4)
      return bills.filter((b) => inBook(b) && String(monthOf(b.time)).slice(0, 4) === y)
    }
    if (rangeMode === 'week') {
      // 以所选月份 1 号为锚点，取包含它的那一周（周一为一周开始）
      const base = new Date(`${month}-01T00:00:00`).getTime()
      const d = new Date(base)
      const shift = (d.getDay() + 6) % 7
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - shift).getTime()
      const end = start + 7 * 86400000 - 1
      return bills.filter((b) => inBook(b) && b.time >= start && b.time <= end)
    }
    const from = customFrom ? new Date(customFrom + 'T00:00:00').getTime() : 0
    const to = customTo ? new Date(customTo + 'T23:59:59').getTime() : Number.MAX_SAFE_INTEGER
    return bills.filter((b) => inBook(b) && b.time >= from && b.time <= to)
  }, [rangeMode, monthBills, bills, currentBookId, month, customFrom, customTo])
  const rows = useMemo(() => {
    return [...monthSummary.expenseByCategory.entries()]
      .map(([id, v]) => ({ p: parents.find((x) => x.id === id)!, v }))
      .sort((a, b) => b.v - a.v)
  }, [monthSummary, parents])

  const max = rows[0]?.v || 1
  const total = rows.reduce((s, r) => s + r.v, 0)
  const spentOf = (cid: number) => cid === 0 ? monthSummary.budget : (monthSummary.budgetByCategory.get(cid) ?? 0)
  const limitOf = (b: { amount: number; addNum?: number }) => (b.amount ?? 0) + (b.addNum ?? 0)
  const monthBudgets = budgets.filter((b) => b.month === 'all' && (b.type ?? 'month') === 'month')
  const yearBudgets = budgets.filter((b) => b.month === 'all' && b.type === 'year')
  const totalBudget = limitOf(monthBudgets.find((b) => b.categoryId === 0) ?? { amount: 0 })
  const catBudgets = monthBudgets.filter((b) => b.categoryId !== 0)

  // 年度支出（当年）
  const yearSpend = useMemo(() => {
    const y = month.slice(0, 4)
    const yearBills = bills.filter((b) => String(monthOf(b.time)).slice(0, 4) === y
      && (currentBookId === 0 || b.bookId === currentBookId))
    return summarizeBills(yearBills, parents, refunds).budget
  }, [bills, parents, month, refunds, currentBookId])
  const totalYearBudget = limitOf(yearBudgets.find((b) => b.categoryId === 0) ?? { amount: 0 })

  // 自定义区间预算：按起止日期统计区间内支出
  const customBudgets = budgets.filter((b) => b.type === 'custom' && b.startTime && b.endTime)
  const customSpend = (b: { startTime?: number; endTime?: number; categoryId: number }) => {
    const from = b.startTime ?? 0
    const to = b.endTime ?? Number.MAX_SAFE_INTEGER
    const inRange = bills.filter((x) => x.time >= from && x.time <= to
      && (currentBookId === 0 || x.bookId === currentBookId))
    const s2 = summarizeBills(inRange, parents, refunds)
    return b.categoryId === 0 ? s2.budget : (s2.budgetByCategory.get(b.categoryId) ?? 0)
  }

  const trend = useMemo(() => {
    const byMonth = new Map<string, Bill[]>()
    for (const b of rangeBills) {
      const k = monthOf(b.time)
      byMonth.set(k, [...(byMonth.get(k) ?? []), b])
    }
    return [...byMonth.entries()].flatMap(([m, list]) => dailyTrend(list, parents, refunds, m))
      .sort((a, b) => (a.day < b.day ? -1 : 1))
  }, [rangeBills, parents, refunds])
  const assetRows = useMemo(() => byAsset(rangeBills, assets, parents, refunds), [rangeBills, assets, parents, refunds])
  const tagRows = useMemo(() => byTag(rangeBills, tags, parents, refunds), [rangeBills, tags, parents, refunds])
  const rangeSummary = useMemo(() => summarizeBills(rangeBills, parents, refunds), [rangeBills, parents, refunds])
  const trendMax = Math.max(1, ...trend.map((d) => Math.max(d.income, d.expense)))

  return (
    <section className="card">
      <div className="label">时间范围</div>
      <div className="row2">
        <select aria-label="统计范围" value={rangeMode} onChange={(e) => setRangeMode(e.target.value as 'month' | 'week' | 'year' | 'custom')}>
          <option value="month">按月</option>
          <option value="week">按周</option>
          <option value="year">按年</option>
          <option value="custom">自定义</option>
        </select>
        {rangeMode !== 'custom' && (
          <input aria-label="统计月份" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        )}
      </div>
      {rangeMode === 'custom' && (
        <div className="row2">
          <input aria-label="统计开始日期" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <input aria-label="统计结束日期" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}
      <p className="hint">
        范围合计：支出 {money(rangeSummary.expense)} · 收入 {money(rangeSummary.income)} · 结余 {money(rangeSummary.income - rangeSummary.expense)}（{rangeBills.length} 笔）
      </p>

      <div className="label">预算</div>
      {totalBudget > 0 ? (
        <div className="budget-box">
          <div className="budget-line">
            <span>本月总预算</span>
            <b>{money(spentOf(0))} / {money(totalBudget)}</b>
          </div>
          <div className="bar-track">
            <div className="bar" style={{
              width: `${Math.min(100, (spentOf(0) / totalBudget) * 100)}%`,
              background: spentOf(0) > totalBudget ? 'var(--out)' : 'var(--accent)'
            }} />
          </div>
          <div className="budget-foot">
            <span>剩余 {money(totalBudget - spentOf(0))}</span>
            <button className="link" onClick={() => setEditing({ categoryId: 0, amount: String(totalBudget) })}>调整</button>
          </div>
        </div>
      ) : (
        <button className="ghost wide" onClick={() => setEditing({ categoryId: 0, amount: '' })}>设置本月总预算</button>
      )}

      {totalYearBudget > 0 && (
        <div className="budget-box">
          <div className="budget-line">
            <span>本年总预算</span>
            <b>{money(yearSpend)} / {money(totalYearBudget)}</b>
          </div>
          <div className="bar-track">
            <div className="bar" style={{
              width: `${Math.min(100, (yearSpend / totalYearBudget) * 100)}%`,
              background: yearSpend > totalYearBudget ? 'var(--out)' : 'var(--accent)'
            }} />
          </div>
          <div className="budget-foot">
            <span>剩余 {money(totalYearBudget - yearSpend)}</span>
          </div>
        </div>
      )}

      {customBudgets.map((b) => {
        const used = customSpend(b)
        const limit = limitOf(b)
        const p = parents.find((x) => x.id === b.categoryId)
        return (
          <div key={String(b.budgetId ?? b.budgetName)} className="budget-box small">
            <div className="budget-line">
              <span>{b.budgetName || '自定义预算'}（{b.startTime ? new Date(b.startTime).toISOString().slice(0, 10) : ''} ~ {b.endTime ? new Date(b.endTime).toISOString().slice(0, 10) : ''}）</span>
              <b>{money(used)} / {money(limit)}</b>
            </div>
            <div className="bar-track">
              <div className="bar" style={{
                width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%`,
                background: used > limit ? 'var(--out)' : 'var(--accent)'
              }} />
            </div>
            <div className="budget-foot">
              <span>{p ? p.name : '全部支出'} · 剩余 {money(limit - used)}</span>
              <button className="del" aria-label="删除预算" onClick={() => (b.budgetId != null ? removeBudgetById(b.budgetId) : removeBudget(b.month, b.categoryId))}>删</button>
            </div>
          </div>
        )
      })}

      {catBudgets.map((b) => {
        const p = parents.find((x) => x.id === b.categoryId)
        const used = spentOf(b.categoryId)
        return (
          <div key={b.categoryId} className="budget-box small">
            <div className="budget-line">
              <span><CatIcon k={p?.icon} size={14} /> {p?.name ?? '分类'}预算</span>
              <b>{money(used)} / {money(limitOf(b))}</b>
            </div>
            <div className="bar-track">
              <div className="bar" style={{
                width: `${Math.min(100, (used / Math.max(1, limitOf(b))) * 100)}%`,
                background: used > limitOf(b) ? 'var(--out)' : (p?.color === IMPORTED_CATEGORY_COLOR ? 'var(--accent)' : p?.color)
              }} />
            </div>
            <div className="budget-foot">
              <span>剩余 {money(limitOf(b) - used)}</span>
              <span>
                <button className="link" onClick={() => setEditing({ categoryId: b.categoryId, amount: String(b.amount) })}>调整</button>
                <button className="link" onClick={() => setEditing({ categoryId: b.categoryId, amount: String(b.amount), addNum: String(b.addNum ?? ''), type: b.type ?? 'month' })}>追加</button>
                <button className="del" onClick={() => removeBudget('all', b.categoryId)}>删</button>
              </span>
            </div>
          </div>
        )
      })}

      <button className="ghost wide" onClick={() => setEditing({ categoryId: catBudgets[0]?.categoryId ?? 1, amount: '' })}>
        添加分类预算
      </button>

      <div className="label">支出构成（合计 {money(total)}）</div>
      {rows.length === 0 && <p className="empty">暂无数据</p>}
      {rows.map((r) => (
        <div key={r.p.id} className="bar-row">
          <span className="bar-name"><CatIcon k={r.p.icon} size={15} /> {r.p.name}</span>
          <div className="bar-track">
            <div className="bar" style={{ width: `${(r.v / max) * 100}%`, background: r.p.color }} />
          </div>
          <span className="bar-val">{money(r.v)}</span>
          <span className="bar-pct">{(total ? (r.v / total) * 100 : 0).toFixed(0)}%</span>
        </div>
      ))}

      <div className="label">资产构成</div>
      <AssetSankey />

      <div className="label">收支构成</div>
      <div className="row2">
        <select aria-label="收支切换" value={flow} onChange={(e) => setFlow(e.target.value as 'expense' | 'income')}>
          <option value="expense">支出</option>
          <option value="income">收入</option>
        </select>
      </div>
      {(() => {
        const byCat = flow === 'expense' ? rangeSummary.expenseByCategory : new Map<number, number>()
        const rows2 = [...byCat.entries()]
          .map(([pid, v]) => ({ p: parents.find((x) => x.id === pid), v }))
          .filter((r) => r.p)
          .sort((a, b) => b.v - a.v)
        if (flow === 'income') {
          const incomeRows = [...rangeBills.reduce((m, b) => {
            const kind = parents.find((p) => p.id === b.parentCategoryId)?.kind
            if (kind !== 'income') return m
            m.set(b.parentCategoryId, (m.get(b.parentCategoryId) ?? 0) + b.cost)
            return m
          }, new Map<number, number>()).entries()]
            .map(([pid, v]) => ({ p: parents.find((x) => x.id === pid), v }))
            .filter((r) => r.p)
            .sort((a, b) => b.v - a.v)
          if (!incomeRows.length) return <p className="hint">这个范围没有收入。</p>
          return incomeRows.map((r) => (
            <div key={r.p!.id} className="bar-row">
              <span className="bar-name"><CatIcon k={r.p!.icon} size={15} /> {r.p!.name}</span>
              <div className="bar-track"><div className="bar" style={{ width: `${(r.v / Math.max(1, incomeRows[0].v)) * 100}%`, background: 'var(--in)' }} /></div>
              <span className="bar-val">{money(r.v)}</span>
              <span className="bar-pct" />
            </div>
          ))
        }
        if (!rows2.length) return <p className="hint">这个范围没有支出。</p>
        return rows2.map((r) => (
          <div key={r.p!.id} className="bar-row">
            <span className="bar-name"><CatIcon k={r.p!.icon} size={15} /> {r.p!.name}</span>
            <div className="bar-track"><div className="bar" style={{ width: `${(r.v / Math.max(1, rows2[0].v)) * 100}%`, background: r.p!.color }} /></div>
            <span className="bar-val">{money(r.v)}</span>
            <span className="bar-pct" />
          </div>
        ))
      })()}

      {trend.length > 0 && (
        <>
          <div className="label">按日收支</div>
          <div className="trend">
            {trend.map((d) => (
              <div key={d.day} className="trend-col" title={`${d.day} 支出 ${money(d.expense)} / 收入 ${money(d.income)}`}>
                <div className="trend-bars">
                  <i className="exp" style={{ height: `${(d.expense / trendMax) * 100}%` }} />
                  <i className="inc" style={{ height: `${(d.income / trendMax) * 100}%` }} />
                </div>
                <span>{d.day.slice(-2)}</span>
              </div>
            ))}
          </div>
          <p className="hint">深色为支出，浅色为收入；悬停看具体金额。</p>
        </>
      )}

      {assetRows.length > 0 && (
        <>
          <div className="label">按账户</div>
          {assetRows.map((r) => (
            <div key={r.assetId} className="bar-row">
              <span className="bar-name">{r.name}</span>
              <div className="bar-track"><div className="bar" style={{ width: `${(r.expense / Math.max(1, assetRows[0].expense)) * 100}%`, background: 'var(--accent)' }} /></div>
              <span className="bar-val">{money(r.expense)}</span>
              <span className="bar-pct">{r.income ? '+' + money(r.income) : ''}</span>
            </div>
          ))}
        </>
      )}

      {tagRows.length > 0 && (
        <>
          <div className="label">按标签</div>
          {tagRows.map((r) => (
            <div key={r.name} className="bar-row">
              <span className="bar-name">#{r.name}</span>
              <div className="bar-track"><div className="bar" style={{ width: `${(r.amount / Math.max(1, tagRows[0].amount)) * 100}%`, background: 'var(--accent-soft)' }} /></div>
              <span className="bar-val">{money(r.amount)}</span>
              <span className="bar-pct" />
            </div>
          ))}
        </>
      )}

      {editing && (
        <Modal label="设置预算" onClose={() => setEditing(null)}>
            <h3>设置预算</h3>
            <div className="label">分类</div>
            <select aria-label="预算分类" value={editing.categoryId} onChange={(e) => setEditing({ ...editing, categoryId: Number(e.target.value) })}>
              <option value={0}>全部支出（总预算）</option>
              {parents.filter((p) => p.kind === 'expense').map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="label">周期</div>
            <select aria-label="预算周期" value={editing.type ?? 'month'}
              onChange={(e) => setEditing({ ...editing, type: e.target.value as 'month' | 'year' | 'custom' })}>
              <option value="month">按月</option>
              <option value="year">按年</option>
              <option value="custom">自定义区间</option>
            </select>
            {editing.type === 'custom' && (
              <>
                <div className="label">预算名称</div>
                <input aria-label="预算名称" value={editing.budgetName ?? ''} placeholder="例如：装修、旅行"
                  onChange={(e) => setEditing({ ...editing, budgetName: e.target.value })} />
                <div className="row2">
                  <div>
                    <div className="label">开始日期</div>
                    <input aria-label="开始日期" type="date" value={editing.startDate ?? ''}
                      onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} />
                  </div>
                  <div>
                    <div className="label">结束日期</div>
                    <input aria-label="结束日期" type="date" value={editing.endDate ?? ''}
                      onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} />
                  </div>
                </div>
              </>
            )}
            <div className="label">追加额度（可选）</div>
            <input aria-label="追加额度" value={editing.addNum ?? ''} inputMode="decimal" placeholder="在原额度上叠加"
              onChange={(e) => setEditing({ ...editing, addNum: e.target.value.replace(/[^\d.]/g, '') })} />
            <div className="label">基础额度</div>
            <input
              aria-label="基础额度"
              value={editing.amount}
              autoFocus
              placeholder="填 0 表示取消"
              onChange={(e) => setEditing({ ...editing, amount: e.target.value.replace(/[^\d.]/g, '') })}
              inputMode="decimal"
            />
            <p className="hint">预算按「每月固定」生效，不需要每月重设。</p>
            <div className="modal-btns">
              <button className="ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="primary" onClick={() => {
                const type = editing.type ?? 'month'
                setBudget({
                  month: 'all', categoryId: editing.categoryId,
                  amount: Number(editing.amount) || 0,
                  addNum: Number(editing.addNum) || 0,
                  type,
                  ...(type === 'custom' ? {
                    budgetId: Date.now(),
                    budgetName: editing.budgetName || '自定义预算',
                    startTime: editing.startDate ? new Date(editing.startDate).getTime() : undefined,
                    endTime: editing.endDate ? new Date(editing.endDate).getTime() + 86399999 : undefined
                  } : {})
                })
                setEditing(null)
              }}>保存</button>
            </div>
        </Modal>
      )}
    </section>
  )
}
