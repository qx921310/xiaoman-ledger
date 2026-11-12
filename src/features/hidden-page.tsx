import { useMemo, useState } from 'react'

export interface HiddenGroup {
  key: string
  label: string
  rows: Array<{ key: string; name: string; value: string; onRestore?: () => void }>
}

/**
 * 一木的「隐藏」页族（activity_asset_hide / account_book_hide / budget_hide /
 * tag_hide / stock_hide / reimbursement_hide）共用同一套结构：
 *   tool_bar（返回 + 标题）+ tip 提示条 + 分类汇总 + 列表。
 * 这里抽成一个组件，六处复用，避免写六遍。
 */
export function HiddenPage({ title, tip, groups, emptyText = '没有被隐藏的内容。', summary }: {
  title: string
  tip?: string
  groups: HiddenGroup[]
  emptyText?: string
  summary?: Array<{ label: string; value: string }>
}) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const kw = q.trim()
    if (!kw) return groups
    return groups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => r.name.includes(kw)) }))
      .filter((g) => g.rows.length > 0)
  }, [groups, q])
  const total = groups.reduce((n, g) => n + g.rows.length, 0)

  return (
    <>
      {tip && <p className="hint">{tip}</p>}

      {summary && summary.length > 0 && (
        <div className="subpage-sum">
          {summary.map((s) => (
            <div key={s.label}><small>{s.label}</small><b>{s.value}</b></div>
          ))}
        </div>
      )}

      {total > 6 && (
        <input className="hidden-search" aria-label={`搜索${title}`} placeholder="搜索" value={q} onChange={(e) => setQ(e.target.value)} />
      )}

      {shown.map((g) => (
        <div key={g.key} className="cal-repay">
          <b>{g.label}（{g.rows.length}）</b>
          {g.rows.map((r) => (
            <div key={r.key} className="row">
              <span className="grow">{r.name}</span>
              <b>{r.value}</b>
              {r.onRestore && (
                <button type="button" className="link" onClick={r.onRestore}>恢复显示</button>
              )}
            </div>
          ))}
        </div>
      ))}

      {total === 0 && <p className="hint">{emptyText}</p>}
    </>
  )
}
