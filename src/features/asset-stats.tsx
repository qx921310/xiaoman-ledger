import { useMemo } from 'react'
import { useLedger } from '../store'
import { money } from '../ui-format'
import { ASSET_TYPE } from '../types'
import { AssetSankey } from './asset-sankey'
import { assetTrend } from '../domain/asset-trend'

/**
 * 资产统计（对齐一木 activity_assets_statistics.xml，26 个 id）
 * 结构：资产走势（近一月折线，起止日期）+ 资产分布（饼：总资产 / 资产占比）+ 理财统计。
 * 一木的走势来自资产事件，我们目前只能按「当前余额 + 区间内账单」回推，页面上明确标为估算。
 */
export function AssetStats({ onBack }: { onBack: () => void }) {
  const assets = useLedger((s) => s.assets)
  const bills = useLedger((s) => s.bills)
  const parents = useLedger((s) => s.parentCategories)
  const transfers = useLedger((s) => s.transfers)
  const lends = useLedger((s) => s.lends)
  const refunds = useLedger((s) => s.refunds)
  const reimbursements = useLedger((s) => s.reimbursements)
  const assetFlows = useLedger((s) => s.assetFlows ?? [])
  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)

  const rateOf = (code?: string) => {
    if (!code || code === defaultCurrency) return 1
    const c = currencies.find((x) => x.code === code)
    return c && c.rate ? c.rate : 1
  }
  const total = assets.filter((a) => !a.hide && a.intoTotalAsset !== false)
    .reduce((n, a) => n + a.assetNumber * rateOf(a.currency), 0)

  // 近一月走势：按真实资金流水反向推算（转账/借贷/退款/报销/定存都计入）
  const trend = useMemo(() => {
    const now = Date.now()
    const pts = assetTrend({
      assets, bills, transfers, lends, refunds, reimbursements, assetFlows,
      parents, currencies, defaultCurrency
    }, now - 29 * 86400000, now)
    return pts.map((p) => ({ day: p.key.slice(5), value: p.value }))

  }, [assets, bills, transfers, lends, refunds, reimbursements, assetFlows, parents, currencies, defaultCurrency])

  const maxV = Math.max(...trend.map((d) => d.value), 1)
  const minV = Math.min(...trend.map((d) => d.value), 0)

  // 资产分布：按类型汇总（饼用横向条带等同表达，避免再引图表库）
  const byType = useMemo(() => {
    const map = new Map<number, number>()
    for (const a of assets.filter((x) => !x.hide && x.intoTotalAsset !== false)) {
      map.set(a.assetType, +((map.get(a.assetType) ?? 0) + a.assetNumber * rateOf(a.currency)).toFixed(2))
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])

  }, [assets, currencies, defaultCurrency])

  // 理财统计：投资类账户（4 投资理财 / 11 理财账户）合计
  const invest = assets.filter((a) => (a.assetType === 4 || a.assetType === 11) && !a.hide)
  const investTotal = +invest.reduce((n, a) => n + a.assetNumber * rateOf(a.currency), 0).toFixed(2)

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>资产统计</h3>
        <span className="muted">近一月</span>
      </div>

      <div className="label">资产走势 <small className="muted">（按资金流水反向推算）</small></div>
      <div className="stats-chart" role="img" aria-label="资产走势">
        <svg viewBox="0 0 300 96" preserveAspectRatio="none">
          <polyline
            fill="none" stroke="var(--accent)" strokeWidth="2"
            points={trend.map((d, i) => {
              const x = (i / Math.max(1, trend.length - 1)) * 300
              const y = 90 - ((d.value - minV) / Math.max(1, maxV - minV)) * 80
              return `${x},${y}`
            }).join(' ')}
          />
        </svg>
        <div className="stats-panel-head"><span>{trend[0]?.day}</span><span>{trend[trend.length - 1]?.day}</span></div>
      </div>

      <div className="label">资产分布</div>
      <div className="row"><span className="grow">总资产</span><b>{money(total)}</b></div>
      {byType.map(([type, value]) => (
        <div key={type} className="bar-row">
          <span className="bar-name">{ASSET_TYPE[type] ?? '其他'}</span>
          <div className="bar-track"><div className="bar" style={{ width: `${Math.min(100, total ? (value / total) * 100 : 0)}%`, background: 'var(--accent)' }} /></div>
          <span className="bar-val">{money(value)}</span>
          <span className="bar-pct">{total ? `${((value / total) * 100).toFixed(1)}%` : ''}</span>
        </div>
      ))}

      <div className="label">资产组成</div>
      <AssetSankey />

      <div className="label">理财统计</div>
      <div className="row"><span className="grow">投资类账户</span><b>{money(investTotal)}</b></div>
      {invest.length === 0 && <p className="hint">还没有投资类账户。</p>}
      {invest.map((a) => (
        <div key={a.assetId} className="row">
          <span className="grow">{a.simpleName || a.assetName}</span>
          <span className="muted">{ASSET_TYPE[a.assetType]}</span>
          <b>{money(a.assetNumber * rateOf(a.currency))}</b>
        </div>
      ))}
    </>
  )
}
