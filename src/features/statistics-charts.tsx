import { useEffect, useState } from 'react'
import { money } from '../ui-format'
import { CatIcon } from '../ui/icons'
import type { CategoryPoint, ChartPoint } from '../domain/statistics-charts'

const COLORS = ['var(--accent)', 'var(--out)', 'var(--in)', 'var(--focus-ink)', 'var(--muted)']

export function CategoryChart({ title, rows, onPick }: { title: string; rows: CategoryPoint[]; onPick?: (id: number, name: string) => void }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  let offset = 0
  return <section className="stats-panel" aria-label={title}>
    <div className="stats-panel-head"><h3>{title}</h3><span>合计 {money(total)}</span></div>
    {!total ? <p className="stats-empty">这个时间范围暂无{title.slice(0, 2)}记录</p> : <div className="stats-distribution">
      <div className="stats-donut">
        <svg viewBox="0 0 120 120" role="img" aria-label={`${title}占比图，总计 ${money(total)}`}>
          <circle cx="60" cy="60" r="45" fill="none" stroke="var(--line)" strokeWidth="18" />
          {rows.map((row, index) => {
            const pct = row.amount / total * 100
            const start = offset
            offset += pct
            return <circle key={row.id} cx="60" cy="60" r="45" fill="none" stroke={COLORS[index % COLORS.length]}
              strokeWidth="18" pathLength="100" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-start} transform="rotate(-90 60 60)" />
          })}
        </svg>
        <div className="stats-donut-center"><small>{title.slice(0, 2)}合计</small><strong>{money(total)}</strong></div>
      </div>
      <div className="stats-legend">
        {rows.map((row, index) => <button type="button" className="stats-category" key={row.id}
          onClick={onPick ? () => onPick(row.id, row.name) : undefined}>
          <span className="stats-dot" style={{ background: COLORS[index % COLORS.length] }} />
          <span className="stats-category-name"><CatIcon k={row.icon} size={16} /> {row.name}<small>{row.count} 笔</small></span>
          <span className="stats-category-value"><strong>{money(row.amount)}</strong><small>{(row.amount / total * 100).toFixed(1)}%</small></span>
        </button>)}
      </div>
    </div>}
  </section>
}

export function TrendChart({ points, onPickDay }: { points: ChartPoint[]; onPickDay?: (key: string) => void }) {
  const [selected, setSelected] = useState('')
  useEffect(() => { setSelected(points.find((p) => p.income || p.expense)?.key ?? points[0]?.key ?? '') }, [points])
  const current = points.find((p) => p.key === selected) ?? points[0]
  if (!points.length || !points.some((p) => p.income || p.expense)) return <section className="stats-panel"><div className="stats-panel-head"><h3>收支趋势</h3></div><p className="stats-empty">这个时间范围暂无收支记录</p></section>
  const width = 600, height = 180, left = 20, right = 580, top = 16, bottom = 150
  const max = Math.max(1, ...points.map((p) => Math.max(p.income, p.expense)))
  const x = (index: number) => points.length === 1 ? (left + right) / 2 : left + index * (right - left) / (points.length - 1)
  const y = (value: number) => bottom - value / max * (bottom - top)
  const line = (kind: 'income' | 'expense') => points.map((p, i) => {
    if (!i) return `M ${x(i)} ${y(p[kind])}`
    const middle = (x(i - 1) + x(i)) / 2
    return `C ${middle} ${y(points[i - 1][kind])}, ${middle} ${y(p[kind])}, ${x(i)} ${y(p[kind])}`
  }).join(' ')
  return <section className="stats-panel" aria-label="收支趋势">
    <div className="stats-panel-head"><h3>收支趋势</h3><span><i className="stats-key expense" />支出 <i className="stats-key income" />收入</span></div>
    <svg className="stats-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="所选时间范围收支趋势图">
      {[0, 0.5, 1].map((fraction) => <line key={fraction} x1={left} x2={right} y1={y(max * fraction)} y2={y(max * fraction)} stroke="var(--line)" />)}
      <path d={line('expense')} fill="none" stroke="var(--out)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <path d={line('income')} fill="none" stroke="var(--in)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {current && <g><circle cx={x(points.indexOf(current))} cy={y(current.expense)} r="5" fill="var(--out)" /><circle cx={x(points.indexOf(current))} cy={y(current.income)} r="5" fill="var(--in)" /></g>}
      <text x={left} y="174" fill="var(--muted)" fontSize="15">{points[0].label}</text>
      {points.length > 1 && <text x={right} y="174" textAnchor="end" fill="var(--muted)" fontSize="15">{points[points.length - 1].label}</text>}
    </svg>
    <div className="stats-trend-detail">
      <select aria-label="查看趋势日期" value={current?.key ?? ''} onChange={(e) => setSelected(e.target.value)}>{points.map((p) => <option key={p.key} value={p.key}>{p.key}</option>)}</select>
      {current && <span>支出 <b className="out">{money(current.expense)}</b> · 收入 <b className="in">{money(current.income)}</b></span>}
    </div>
    <details className="stats-report"><summary>查看收支报表</summary><div className="stats-report-scroll"><table><thead><tr><th>日期</th><th>收入</th><th>支出</th><th>结余</th></tr></thead><tbody>{points.map((p) => <tr key={p.key} onClick={onPickDay ? () => onPickDay(p.key) : undefined}
              style={onPickDay ? { cursor: 'pointer' } : undefined}><td>{p.key}</td><td>{money(p.income)}</td><td>{money(p.expense)}</td><td>{money(p.income - p.expense)}</td></tr>)}</tbody></table></div></details>
  </section>
}
