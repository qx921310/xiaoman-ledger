import { useMemo } from 'react'
import { useLedger } from '../store'
import { buildAssetSankey } from '../domain/asset-sankey'
import { money } from '../ui-format'

/** 资产桑基图：左侧各账户，右侧总资产，用贝塞尔带连接（对应一木 AssetSankeyChartView） */
export function AssetSankey() {
  const assets = useLedger((s) => s.assets)
  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const { nodes, groups, total } = useMemo(
    () => buildAssetSankey(assets, currencies, defaultCurrency),
    [assets, currencies, defaultCurrency]
  )

  if (!total) return <p className="hint"></p>

  const W = 640, H = Math.max(220, nodes.length * 26 + 40)
  const leftX = 8, nodeW = 10, rightX = W - 18
  const top = 20, usable = H - 40

  // 左侧每个账户按金额占比占高，右侧总资产一整条
  let cursor = top
  const rows = nodes.map((n) => {
    const h = (n.amount / total) * usable
    const row = { ...n, y: cursor, h: Math.max(2, h) }
    cursor += Math.max(2, h)
    return row
  })

  return (
    <div className="sankey">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="资产构成桑基图" className="sankey-svg">
        {rows.map((r) => {
          const y2 = top + (rows.slice(0, rows.indexOf(r)).reduce((s, x) => s + x.h, 0) / usable) * usable
          const mid = r.y + r.h / 2
          const mid2 = y2 + (r.h / usable) * usable + (r.h / 2)
          const c1 = leftX + nodeW + (rightX - leftX - nodeW) / 2
          return (
            <g key={r.name}>
              <path
                d={`M ${leftX + nodeW} ${r.y} C ${c1} ${r.y}, ${c1} ${y2}, ${rightX} ${y2}
                    L ${rightX} ${y2 + r.h} C ${c1} ${y2 + r.h}, ${c1} ${r.y + r.h}, ${leftX + nodeW} ${r.y + r.h} Z`}
                fill="var(--accent-soft)" opacity="0.75"
              />
              <rect x={leftX} y={r.y} width={nodeW} height={r.h} fill="var(--accent)" rx={2} />
              <text x={leftX + nodeW + 6} y={mid + 4} fontSize="11" fill="var(--ink)">
                {r.name} {money(r.amount)}
              </text>
              <title>{`${r.group} · ${r.name} ${money(r.amount)}`}</title>
              <text x={rightX - 4} y={mid2} fontSize="10" textAnchor="end" fill="var(--muted)">
                {r.group}
              </text>
            </g>
          )
        })}
        <rect x={rightX} y={top} width={nodeW} height={usable} fill="var(--accent)" rx={2} />
      </svg>
      <div className="sankey-legend">
        <span className="tag">总资产 {money(total)}</span>
        {groups.map((g) => (
          <span key={g.group} className="tag">{g.group} {money(g.amount)}</span>
        ))}
      </div>
    </div>
  )
}
