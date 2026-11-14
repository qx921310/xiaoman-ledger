import { useMemo, useState } from 'react'

/** 房贷计算（对照一木 MortgageCalcActivity：贷款总额/利率/年限/还款方式 → 月供、利息、还款表） */
const DEFAULT_RATE = 3.5

export function MortgageCalc({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const [amount, setAmount] = useState('100')
  const [rate, setRate] = useState(String(DEFAULT_RATE))
  const [years, setYears] = useState('30')
  const [mode, setMode] = useState<'equal' | 'principal'>('equal')
  const [helpOpen, setHelpOpen] = useState(false)

  const result = useMemo(() => {
    const P = (Number(amount) || 0) * 10000
    const yearRate = (Number(rate) || 0) / 100
    const n = Math.max(1, Math.round((Number(years) || 0) * 12))
    const r = yearRate / 12
    if (P <= 0) return null
    if (mode === 'equal') {
      const monthly = r === 0 ? P / n : (P * r * (1 + r) ** n) / ((1 + r) ** n - 1)
      const total = monthly * n
      return { monthly, first: monthly, total, interest: total - P, n }
    }
    const principalPart = P / n
    const first = principalPart + P * r
    const interest = (P * r * (n + 1)) / 2
    return { monthly: first - principalPart + principalPart * 0.5, first, total: P + interest, interest, n }
  }, [amount, rate, years, mode])

  const schedule = useMemo(() => {
    if (!result) return []
    const P = (Number(amount) || 0) * 10000
    const r = (Number(rate) || 0) / 100 / 12
    const rows: Array<{ year: number; principal: number; interest: number; left: number }> = []
    let left = P
    const perYear = 12
    const yearCount = Math.ceil(result.n / 12)
    for (let y = 1; y <= Math.min(yearCount, 40); y += 1) {
      let principalSum = 0
      let interestSum = 0
      for (let m = 0; m < perYear && (y - 1) * perYear + m < result.n; m += 1) {
        const interestPart = left * r
        const principalPart = mode === 'equal'
          ? (result.monthly as number) - interestPart
          : P / result.n
        interestSum += interestPart
        principalSum += principalPart
        left = Math.max(0, left - principalPart)
      }
      rows.push({ year: y, principal: principalSum, interest: interestSum, left })
    }
    return rows
  }, [result, amount, rate, mode])

  const money = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <section className="card" aria-label="房贷计算">
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>房贷计算</h3>
        <button type="button" className="link" aria-label="说明" onClick={() => setHelpOpen(true)}>?</button>
      </div>

      <div className="seg">
        <button type="button" className={mode === 'equal' ? 'on' : ''} onClick={() => setMode('equal')}>等额本息</button>
        <button type="button" className={mode === 'principal' ? 'on' : ''} onClick={() => setMode('principal')}>等额本金</button>
      </div>

      <label>贷款总额（万元）
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>年利率（%）
        <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>贷款年限（年）
        <input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/[^\d]/g, ''))} />
      </label>

      {result && (
        <>
          <div className="totalbox">
            <small>{mode === 'equal' ? '每月月供（元）' : '首月月供（元）'}</small>
            <b>{money(mode === 'equal' ? result.monthly : result.first)}</b>
            <small>支付利息 {money(result.interest)} · 还款总额 {money(result.total)}</small>
          </div>

          <div className="row2">
            <div className="row"><span className="grow">贷款总额</span><b>{money((Number(amount) || 0) * 10000)}</b></div>
            <div className="row"><span className="grow">支付利息</span><b>{money(result.interest)}</b></div>
            <div className="row"><span className="grow">还款总额</span><b>{money(result.total)}</b></div>
          </div>

          <div className="label">还款明细（按年）</div>
          <table className="table">
            <thead><tr><th>年份</th><th>本金</th><th>利息</th><th>剩余本金</th></tr></thead>
            <tbody>
              {schedule.slice(0, 12).map((r) => (
                <tr key={r.year}>
                  <td>{r.year}</td>
                  <td>{money(r.principal)}</td>
                  <td>{money(r.interest)}</td>
                  <td>{money(r.left)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {schedule.length > 12 && <p className="hint">仅显示前 12 年，共 {schedule.length} 年。</p>}
        </>
      )}

      {helpOpen && (
        <div className="sheet-mask" onClick={() => setHelpOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-hd"><b>说明</b></div>
            <div className="sheet-body">
              <p className="hint">等额本息：每月还款额固定，前期利息占比高，适合收入稳定的人。</p>
              <p className="hint">等额本金：每月本金固定，月供逐月递减，总利息更少，前期压力大。</p>
              <p className="hint">默认利率：商贷 3.5%，公积金 2.6%，仅供参考，请以贷款合同为准。</p>
            </div>
            <div className="sheet-ft"><button type="button" className="ghost" onClick={() => { setHelpOpen(false); notify('仅供参考') }}>知道了</button></div>
          </div>
        </div>
      )}
    </section>
  )
}
