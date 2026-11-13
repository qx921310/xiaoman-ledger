import { useMemo } from 'react'
import { useLedger } from '../store'
import { money, dayOf } from '../ui-format'
import { billNetAmount } from '../bill-amount'
import type { Bill } from '../types'

/**
 * 统计明细页（对齐一木三个数据页）
 *  - activity_category_statistics：金额 / 笔数 / 平均每笔 / 平均每天 + 支出走势 + 列表
 *  - activity_tag_statistics：总支出 / 总收入 / 总结余 + 收支走势 + 列表
 *  - activity_asset_statistics：「账户统计」+ 日期 + 账单列表
 * 共用同一套骨架，按 kind 决定汇总卡与走势口径，避免三份重复实现。
 */
export function StatsDetail({ kind, title, bills, onBack }: {
  kind: 'category' | 'tag' | 'account' | 'day'
  title: string
  bills: Bill[]
  onBack: () => void
}) {
  const parents = useLedger((s) => s.parentCategories)
  const refunds = useLedger((s) => s.refunds)

  const rows = useMemo(() => [...bills].sort((a, b) => b.time - a.time), [bills])
  const kindOf = (b: Bill) => parents.find((p) => p.id === b.parentCategoryId)?.kind

  const { expense, income, days } = useMemo(() => {
    let e = 0; let i = 0
    const set = new Set<string>()
    for (const b of rows) {
      set.add(dayOf(b.time))
      if (kindOf(b) === 'income') i += b.cost
      else if (!b.notIntoTotal) e += billNetAmount(b, refunds)
    }
    return { expense: +e.toFixed(2), income: +i.toFixed(2), days: set.size || 1 }
  }, [rows, parents, refunds])

  // 走势：按天聚合（一木 line_mode_day）
  const trend = useMemo(() => {
    const map = new Map<string, { expense: number; income: number }>()
    for (const b of rows) {
      const day = dayOf(b.time)
      const row = map.get(day) ?? { expense: 0, income: 0 }
      if (kindOf(b) === 'income') row.income = +(row.income + b.cost).toFixed(2)
      else if (!b.notIntoTotal) row.expense = +(row.expense + billNetAmount(b, refunds)).toFixed(2)
      map.set(day, row)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows, parents, refunds])

  const maxValue = Math.max(1, ...trend.map(([, v]) => Math.max(v.expense, v.income)))
  const balance = +(income - expense).toFixed(2)

  const groups = useMemo(() => {
    const m = new Map<string, Bill[]>()
    for (const b of rows) m.set(dayOf(b.time), [...(m.get(dayOf(b.time)) ?? []), b])
    return [...m.entries()]
  }, [rows])

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>{kind === 'account' ? '账户统计' : title}</h3>
        <span className="muted">{rows.length} 笔</span>
      </div>

      {/* 汇总卡：分类页四项、标签页三项、账户页不显示 */}
      {kind === 'category' && (
        <div className="stat-cards">
          <div><small>金额</small><b>{money(expense)}</b></div>
          <div><small>笔数</small><b>{rows.length}</b></div>
          <div><small>平均每笔</small><b>{money(rows.length ? +(expense / rows.length).toFixed(2) : 0)}</b></div>
          <div><small>平均每天</small><b>{money(+(expense / days).toFixed(2))}</b></div>
        </div>
      )}
      {kind === 'tag' && (
        <div className="stat-cards">
          <div><small>总支出</small><b className="out">{money(expense)}</b></div>
          <div><small>总收入</small><b className="in">{money(income)}</b></div>
          <div><small>总结余</small><b>{money(balance)}</b></div>
        </div>
      )}

      {/* 走势（分类、标签页），账户页不画 */}
      {kind !== 'account' && kind !== 'day' && trend.length > 0 && (
        <div className="stats-chart" role="img" aria-label="收支走势">
          <svg viewBox="0 0 300 96" preserveAspectRatio="none">
            {trend.map(([day, v], i) => {
              const w = 300 / trend.length
              const x = i * w
              const eh = (v.expense / maxValue) * 80
              const ih = (v.income / maxValue) * 80
              return (
                <g key={day}>
                  {kind === 'category'
                    ? <rect x={x + 1} y={90 - eh} width={Math.max(1, w - 2)} height={eh} fill="var(--out)" opacity="0.8" />
                    : <>
                        <rect x={x + 1} y={90 - eh} width={Math.max(1, w / 2 - 2)} height={eh} fill="var(--out)" opacity="0.8" />
                        <rect x={x + w / 2} y={90 - ih} width={Math.max(1, w / 2 - 2)} height={ih} fill="var(--in)" opacity="0.8" />
                      </>}
                </g>
              )
            })}
          </svg>
          <div className="stats-panel-head"><span>{trend[0][0]}</span><span>{trend[trend.length - 1][0]}</span></div>
        </div>
      )}

      {rows.length === 0 && <p className="hint">{kind === 'day' ? '没有任何账单' : '这个时间范围没有账单。'}</p>}

      {groups.map(([day, list]) => (
        <div key={day} className="group">
          <div className="day"><span>{day}</span><small>{list.length} 笔</small></div>
          {list.map((b) => {
            const p = parents.find((x) => x.id === b.parentCategoryId)
            const inc = p?.kind === 'income'
            return (
              <div key={b.billId} className="row ledger-row">
                <div className="grow">
                  <div>{p?.name ?? '未分类'}{b.remark ? ` · ${b.remark}` : ''}</div>
                  <small>{b.tags?.length ? `#${b.tags.join(' #')}` : '无标签'}</small>
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
