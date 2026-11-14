import { useMemo, useState } from 'react'
import { billNetAmount } from '../bill-amount'
import { useLedger } from '../store'
import { money, monthOf, toLocalInput } from '../ui-format'
import { CatIcon } from '../ui/icons'
import { summarizeBills } from '../bill-summary'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'

/** 图表色板：全部复用既有主题令牌，不新增主题色 */
const CHART_COLORS = ['var(--accent)', 'var(--focus-ink)', 'var(--muted)', 'var(--accent-soft)', 'var(--out)', 'var(--in)']
import { byAsset, byTag } from '../domain/stats-breakdown'
import { statisticsBounds, chartTrend, categoryDistribution } from '../domain/statistics-charts'
import { CategoryChart, TrendChart } from './statistics-charts'
import { AssetSankey } from './asset-sankey'
import { StatsDetail } from './stats-detail'
import { assetTrend as assetTrendOf } from '../domain/asset-trend'
import { Modal } from '../ui/modal'
import { IMPORTED_CATEGORY_COLOR } from '../default-colors'

export function Stats({ notify }: { notify?: (m: string) => void } = {}) {
  const bills = useLedger((s) => s.bills)
  const refunds = useLedger((s) => s.refunds)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const currencies = useLedger((s) => s.currencies)
  const assetFlows = useLedger((s) => s.assetFlows ?? [])
  const reimbursements = useLedger((s) => s.reimbursements)
  const transfers = useLedger((s) => s.transfers)
  const lends = useLedger((s) => s.lends)
  const userId = useLedger((s) => s.userId)
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
  const [weekDay, setWeekDay] = useState(toLocalInput(Date.now()).slice(0, 10))
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [editing, setEditing] = useState<{
    categoryId: number; amount: string; addNum?: string
    type?: 'week' | 'month' | 'year' | 'custom'
    budgetName?: string; startDate?: string; endDate?: string
  } | null>(null)

  const monthBills = useMemo(
    () => bills.filter((b) => monthOf(b.time) === month && (currentBookId === 0 || String(b.bookId) === String(currentBookId))),
    [bills, month, currentBookId]
  )

  const monthSummary = useMemo(() => summarizeBills(monthBills, parents, refunds), [monthBills, parents, refunds])

  const bounds = useMemo(() => statisticsBounds(rangeMode, month, weekDay, customFrom, customTo), [rangeMode, month, weekDay, customFrom, customTo])
  const rangeBills = useMemo(() => bounds ? bills.filter((b) =>
    (currentBookId === 0 || String(b.bookId) === String(currentBookId)) && b.time >= bounds.start.getTime() && b.time < bounds.end.getTime()) : [], [bills, currentBookId, bounds])
  const spentOf = (cid: number) => cid === 0 ? monthSummary.budget : (monthSummary.budgetByCategory.get(cid) ?? 0)
  const limitOf = (b: { amount: number; addNum?: number }) => (b.amount ?? 0) + (b.addNum ?? 0)
  const monthBudgets = budgets.filter((b) => !b.hide && b.month === 'all' && (b.type ?? 'month') === 'month')
  const yearBudgets = budgets.filter((b) => !b.hide && b.month === 'all' && b.type === 'year')
  const totalBudget = limitOf(monthBudgets.find((b) => b.categoryId === 0) ?? { amount: 0 })
  const catBudgets = monthBudgets.filter((b) => b.categoryId !== 0)
  // 每日支出序列（一木普通页柱状图：按日看收支）
  // 资产走势：按真实资金流水反向推算（转账/借贷/退款/报销/定存都计入）
  const assetTrend = useMemo(() => {
    const list = rangeBills
    if (!list.length) {
      const now = Date.now()
      return assetTrendOf({ assets, bills: [] as never, transfers: [], lends: [], refunds: [], reimbursements: [], assetFlows: [], parents, currencies, defaultCurrency }, now - 7 * 86400000, now)
        .map((p: { key: string; value: number }) => ({ label: p.key.slice(5), 净值: p.value }))
    }
    const times = list.map((b) => b.time)
    const from = Math.min(...times) - 86400000
    const to = Date.now()
    return assetTrendOf({ assets, bills, transfers, lends, refunds, reimbursements, assetFlows, parents, currencies, defaultCurrency }, from, to)
      .map((p: { key: string; value: number }) => ({ label: p.key.slice(5), 净值: p.value }))

  }, [rangeBills, assets, bills, transfers, lends, refunds, reimbursements, assetFlows, parents, currencies, defaultCurrency])

  const daySeries = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of monthBills) {
      if (b.notIntoTotal) continue
      if (parents.find((p) => p.id === b.parentCategoryId)?.kind === 'income') continue
      const d = new Date(b.time)
      const key = `${d.getMonth() + 1}/${d.getDate()}`
      // 与 summarizeBills 同口径：支出扣掉退款后的净额
      map.set(key, +((map.get(key) ?? 0) + billNetAmount(b, refunds)).toFixed(2))
    }
    return [...map.entries()].sort((a, b) => {
      const [am, ad] = a[0].split('/').map(Number)
      const [bm, bd] = b[0].split('/').map(Number)
      return am - bm || ad - bd
    }).map(([label, expense]) => ({ label, expense }))
  }, [monthBills, parents, refunds])

  // 年度支出（当年）
  const yearSpend = useMemo(() => {
    const y = month.slice(0, 4)
    const yearBills = bills.filter((b) => String(monthOf(b.time)).slice(0, 4) === y
      && (currentBookId === 0 || String(b.bookId) === String(currentBookId)))
    return summarizeBills(yearBills, parents, refunds).budget
  }, [bills, parents, month, refunds, currentBookId])
  const totalYearBudget = limitOf(yearBudgets.find((b) => b.categoryId === 0) ?? { amount: 0 })

  // 自定义区间预算：按起止日期统计区间内支出
  const customBudgets = budgets.filter((b) => !b.hide && b.type === 'custom' && b.startTime && b.endTime)
  const customSpend = (b: { startTime?: number; endTime?: number; categoryId: number }) => {
    const from = b.startTime ?? 0
    const to = b.endTime ?? Number.MAX_SAFE_INTEGER
    const inRange = bills.filter((x) => x.time >= from && x.time <= to
      && (currentBookId === 0 || String(x.bookId) === String(currentBookId)))
    const s2 = summarizeBills(inRange, parents, refunds)
    return b.categoryId === 0 ? s2.budget : (s2.budgetByCategory.get(b.categoryId) ?? 0)
  }

  const [moreInfo, setMoreInfo] = useState(false)
  const [summaryText, setSummaryText] = useState<string | null>(null)
  // 一木统计页的 11 个可勾选模块（StatisticsModule）
  const MODULES = ['支出占比', '支出数据', '收支统计', '收支对比', '标签占比', '标签数据', '资产走势', '账户收支', '本月总结', '报表统计', '成员收支'] as const
  const [modOpen, setModOpen] = useState(false)
  const [drill, setDrill] = useState<{ title: string; catId: number } | null>(null)
  const [detail, setDetail] = useState<{ kind: 'category' | 'tag' | 'account' | 'day'; title: string; bills: typeof bills } | null>(null)
  const [mods, setMods] = useState<Record<string, boolean>>(() => {
    const base: Record<string, boolean> = {}
    for (const m of MODULES) base[m] = !['报表统计', '成员收支', '资产走势'].includes(m)
    try { return { ...base, ...(JSON.parse(localStorage.getItem('xiaoman-stats-modules') ?? '{}')) } } catch { return base }
  })
  const toggleMod = (m: string) => {
    const next = { ...mods, [m]: !mods[m] }
    setMods(next)
    try { localStorage.setItem('xiaoman-stats-modules', JSON.stringify(next)) } catch { /* 忽略 */ }
  }
  // 本月总结（一木「本月总结」模块：自动生成，可编辑复制）
  const buildSummary = () => {
    const top = expenseRows.slice(0, 3)
    const days = new Set(rangeBills.map((b) => new Date(b.time).getDate())).size || 1
    const lines = [
      `# ${month.slice(0, 4)} 年 ${Number(month.slice(5, 7))} 月账单总结`,
      '',
      `- 支出：${money(rangeSummary.expense)}`,
      `- 收入：${money(rangeSummary.income)}`,
      `- 结余：${money(+(rangeSummary.income - rangeSummary.expense).toFixed(2))}`,
      `- 笔数：${rangeBills.length} 笔，日均支出 ${money(+(rangeSummary.expense / days).toFixed(2))}`,
      '',
      '## 支出前三'
    ]
    if (top.length === 0) lines.push('- 本月暂无支出')
    else top.forEach((r, i) => lines.push(`${i + 1}. ${r.name}：${money(r.amount)}`))
    return lines.join('\n')
  }

  const trend = useMemo(() => bounds ? chartTrend(rangeBills, parents, refunds, bounds) : [], [rangeBills, parents, refunds, bounds])
  const expenseRows = useMemo(() => categoryDistribution(rangeBills, parents, refunds, 'expense'), [rangeBills, parents, refunds])
  const incomeRows = useMemo(() => categoryDistribution(rangeBills, parents, refunds, 'income'), [rangeBills, parents, refunds])
  const assetRows = useMemo(() => byAsset(rangeBills, assets, parents, refunds), [rangeBills, assets, parents, refunds])
  const tagRows = useMemo(() => byTag(rangeBills, tags, parents, refunds), [rangeBills, tags, parents, refunds])
  const rangeSummary = useMemo(() => summarizeBills(rangeBills, parents, refunds), [rangeBills, parents, refunds])

  return (
    <section className="card">
      {drill && (
        <StatsDetail kind="category" title={drill.title}
          bills={rangeBills.filter((b) => b.parentCategoryId === drill.catId)}
          onBack={() => setDrill(null)} />
      )}
      {detail && (
        <StatsDetail kind={detail.kind} title={detail.title} bills={detail.bills}
          onBack={() => setDetail(null)} />
      )}
      {!drill && (<>
      <div className="label">时间范围</div>
      <div className="row2">
        <div className="row">
        <span className="grow" />
        <button type="button" className="link" onClick={() => setModOpen(true)}>模块</button>
      </div>

      {modOpen && (
        <div className="menu-mask" onClick={() => setModOpen(false)}>
          <div className="home-menu" role="dialog" aria-label="统计模块" onClick={(e) => e.stopPropagation()}>
            <div className="hm-label">统计模块</div>
            {MODULES.map((m) => (
              <label key={m} className="row hm-check">
                <span className="grow">{m}</span>
                <input type="checkbox" checked={!!mods[m]} onChange={() => toggleMod(m)} />
              </label>
            ))}
            <button type="button" className="ghost wide" onClick={() => setModOpen(false)}>完成</button>
          </div>
        </div>
      )}

      <div className="stats-tabs" role="tablist" aria-label="统计视图">
        {([['month', '月统计'], ['year', '年统计'], ['custom', '自定义']] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab"
            aria-selected={rangeMode === key}
            className={rangeMode === key ? 'on' : ''}
            onClick={() => setRangeMode(key as 'month' | 'week' | 'year' | 'custom')}>
            {label}
          </button>
        ))}
      </div>

      <select aria-label="统计范围" value={rangeMode} onChange={(e) => setRangeMode(e.target.value as 'month' | 'week' | 'year' | 'custom')}>
          <option value="month">按月</option>
          <option value="week">按周</option>
          <option value="year">按年</option>
          <option value="custom">自定义</option>
        </select>
        {rangeMode === 'week' && <input aria-label="统计周内日期" type="date" value={weekDay} onChange={(e) => setWeekDay(e.target.value)} />}
        {rangeMode !== 'custom' && rangeMode !== 'week' && (
          <input aria-label="统计月份" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        )}
      </div>
      {rangeMode === 'custom' && (
        <div className="row2">
          <input aria-label="统计开始日期" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <input aria-label="统计结束日期" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}
      {!bounds && <p className="hint">请选择有效的开始和结束日期。</p>}
      <p className="hint">
        范围合计：支出 {money(rangeSummary.expense)} · 收入 {money(rangeSummary.income)} · 结余 {money(rangeSummary.income - rangeSummary.expense)}（{rangeBills.length} 笔）
      </p>

      <TrendChart points={trend} onPickDay={(key) => {
        // 一木 activity_statistics_bill_info：点某天看当天账单
        const billsOfDay = rangeBills.filter((b) => {
          const d = new Date(b.time)
          const label = month.slice(5, 7) === String(d.getMonth() + 1).padStart(2, '0')
            ? `${d.getDate()}` : `${d.getMonth() + 1}-${d.getDate()}`
          return key === label || key === `${d.getMonth() + 1}-${d.getDate()}`
        })
        setDetail({ kind: 'day', title: key, bills: billsOfDay })
      }} />
      <CategoryChart title="支出分类" rows={expenseRows} onPick={(id, name) => setDrill({ title: name, catId: id })} />
      <CategoryChart title="收入分类" rows={incomeRows} onPick={(id, name) => setDrill({ title: name, catId: id })} />

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
            <div className="budget-line" onClick={() => setDrill({ title: `${p?.name ?? '分类'}预算明细`, catId: b.categoryId })}>
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
            <div className="budget-line" onClick={() => setDrill({ title: `${p?.name ?? '分类'}预算明细`, catId: b.categoryId })}>
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

      <details className="stats-extra">
        <summary>查看资产构成</summary>
        <AssetSankey />
      </details>

      {mods['收支统计'] && trend.length > 0 && rangeMode === 'custom' && (
        <>
          <div className="label">收支趋势（折线）</div>
          <div className="stats-chart" role="img" aria-label="自定义区间收支折线图">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trend.map((t) => ({ label: t.label, 支出: t.expense, 收入: t.income }))}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis hide />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Line type="monotone" dataKey="支出" stroke="var(--accent)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="收入" stroke="var(--focus-ink)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {mods['收支统计'] && trend.length > 0 && (rangeMode === 'month' || rangeMode === 'year') && (
        <>
          <div className="label">{rangeMode === 'year' ? '年度趋势' : '本月趋势'}</div>
          <div className="stats-chart" role="img" aria-label="收支柱状图">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trend.map((t) => ({ label: t.label, 支出: t.expense, 收入: t.income }))}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis hide />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Bar dataKey="支出" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="收入" fill="var(--focus-ink)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {mods['本月总结'] && <div className="stats-summary">
        <div className="row">
          <b className="grow">本月总结</b>
          <button type="button" className="link" onClick={() => setSummaryText(buildSummary())}>生成</button>
        </div>
        {summaryText && (
          <>
            <textarea className="summary-text" aria-label="本月总结" value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)} rows={8} />
            <div className="row">
              <button type="button" className="link" onClick={async () => {
                try { await navigator.clipboard.writeText(summaryText) ; notify?.('已复制总结') } catch { notify?.('复制失败') }
              }}>复制总结</button>
              <small className="muted">可编辑后复制</small>
            </div>
          </>
        )}
      </div>}

      <button type="button" className="link stats-more" onClick={() => setMoreInfo(!moreInfo)}>
        {moreInfo ? '收起明细' : '更多明细'}
      </button>
      {moreInfo && (() => {
        const inRange = rangeBills
        const transferSum = inRange.filter((b) => b.billType === 2 && b.remark?.includes('转账')).reduce((n, b) => n + b.cost, 0)
        const repaySum = lends.filter((l) => l.type === 2 || l.type === 4).reduce((n, l) => n + l.number, 0)
        const lendOut = lends.filter((l) => l.type === 1).reduce((n, l) => n + l.number, 0)
        const lendIn = lends.filter((l) => l.type === 3).reduce((n, l) => n + l.number, 0)
        return (
          <div className="stats-more-box">
            <div className="row"><span className="grow">转账明细</span><b>{money(transferSum)}</b></div>
            <div className="row"><span className="grow">还款明细</span><b>{money(repaySum)}</b></div>
            <div className="row"><span className="grow">应收/借出明细</span><b>{money(lendOut)}</b></div>
            <div className="row"><span className="grow">应付/借入明细</span><b>{money(lendIn)}</b></div>
            <div className="row"><span className="grow">收款明细</span><b>{money(repaySum)}</b></div>
          </div>
        )
      })()}

      {mods['报表统计'] && (
        <>
          <div className="label">报表统计</div>
          <div className="stats-report">
            {(() => {
              const days = new Set(rangeBills.map((b) => new Date(b.time).getDate())).size || 1
              const maxBill = rangeBills.reduce((m, b) => (b.cost > m.cost ? b : m), rangeBills[0] ?? { cost: 0 })
              const catCount = new Set(rangeBills.map((b) => b.parentCategoryId)).size
              const accCount = new Set(rangeBills.map((b) => b.assetId)).size
              return [
                ['笔数', `${rangeBills.length} 笔`],
                ['记账天数', `${days} 天`],
                ['日均支出', money(+(rangeSummary.expense / days).toFixed(2))],
                ['最大单笔', money(maxBill.cost ?? 0)],
                ['涉及分类', `${catCount} 个`],
                ['涉及账户', `${accCount} 个`]
              ].map(([k, v]) => <div key={k} className="row"><span className="grow">{k}</span><b>{v}</b></div>)
            })()}
          </div>
        </>
      )}

      {mods['成员收支'] && (() => {
        const byOwner = new Map<string, { income: number; expense: number }>()
        for (const b of rangeBills) {
          if (b.notIntoTotal) continue
          const key = String(b.ownerId ?? b.userId ?? 0)
          const row = byOwner.get(key) ?? { income: 0, expense: 0 }
          if (parents.find((p) => p.id === b.parentCategoryId)?.kind === 'income') row.income += b.cost
          else row.expense += billNetAmount(b, refunds)
          byOwner.set(key, row)
        }
        if (byOwner.size <= 1) return null
        return (
          <>
            <div className="label">成员收支</div>
            <div className="stats-report">
              {[...byOwner.entries()].map(([uid, r]) => (
                <div key={uid} className="row">
                  <span className="grow">成员 {uid === String(userId) ? '（我）' : uid}</span>
                  <span className="muted">收 {money(+r.income.toFixed(2))} · 支 {money(+r.expense.toFixed(2))}</span>
                </div>
              ))}
            </div>
          </>
        )
      })()}

      {mods['标签占比'] && tagRows.length > 0 && (
        <>
          <div className="label">标签占比</div>
          <div className="stats-chart" role="img" aria-label="标签支出占比饼图">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={tagRows.slice(0, 6).map((r) => ({ name: r.name, value: r.amount }))}
                  dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                  {tagRows.slice(0, 6).map((r, i) => (
                    <Cell key={r.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => money(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {mods['收支对比'] && (() => {
        const compare = [
          { label: '收入', 金额: rangeSummary.income },
          { label: '支出', 金额: rangeSummary.expense },
          { label: '结余', 金额: +(rangeSummary.income - rangeSummary.expense).toFixed(2) }
        ]
        return (
          <>
            <div className="label">收支对比</div>
            <div className="stats-chart" role="img" aria-label="收支对比条形图">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={compare} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="label" width={48} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Bar dataKey="金额" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )
      })()}

      {mods['资产走势'] && (
        <>
          <div className="label">资产走势 <small className="muted">（估算：以当前余额回推）</small></div>
          <div className="stats-chart" role="img" aria-label="资产走势折线图">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={assetTrend}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis hide />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Line type="monotone" dataKey="净值" stroke="var(--accent)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {mods['支出占比'] && expenseRows.length > 0 && (
        <>
          <div className="label">分类占比</div>
          <div className="stats-chart" role="img" aria-label="分类支出占比饼图">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={expenseRows.slice(0, 6).map((r) => ({ name: r.name, value: r.amount }))}
                  dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                  {expenseRows.slice(0, 6).map((r, i) => (
                    <Cell key={r.id} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => money(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="label">每日支出</div>
          <div className="stats-chart" role="img" aria-label="每日支出柱状图">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={daySeries}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis hide />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Bar dataKey="expense" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {mods['账户收支'] && assetRows.length > 0 && (
        <>
          <div className="label">按账户</div>
          {assetRows.map((r) => (
            <button key={r.assetId} type="button" className="bar-row"
              onClick={() => setDetail({ kind: 'account', title: r.name, bills: rangeBills.filter((b) => b.assetId === r.assetId) })}>
              <span className="bar-name">{r.name}</span>
              <div className="bar-track"><div className="bar" style={{ width: `${(r.expense / Math.max(1, assetRows[0].expense)) * 100}%`, background: 'var(--accent)' }} /></div>
              <span className="bar-val">{money(r.expense)}</span>
              <span className="bar-pct">{r.income ? '+' + money(r.income) : ''}</span>
            </button>
          ))}
        </>
      )}

      {mods['标签数据'] && tagRows.length > 0 && (
        <>
          <div className="label">按标签</div>
          {tagRows.map((r) => (
            <button key={r.name} type="button" className="bar-row"
              onClick={() => setDetail({ kind: 'tag', title: `#${r.name}`, bills: rangeBills.filter((b) => (b.tags ?? []).includes(r.name)) })}>
              <span className="bar-name">#{r.name}</span>
              <div className="bar-track"><div className="bar" style={{ width: `${(r.amount / Math.max(1, tagRows[0].amount)) * 100}%`, background: 'var(--accent-soft)' }} /></div>
              <span className="bar-val">{money(r.amount)}</span>
              <span className="bar-pct" />
            </button>
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
            <p className="hint"></p>
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
    </>)}
    </section>
  )
}
