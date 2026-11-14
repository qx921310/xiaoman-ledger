import { useMemo, useState } from 'react'

/** 理财收益（对照一木 InvestCalcActivity：按天 / 复利 / 定投 三种模式） */
type Mode = 'day' | 'compound' | 'monthly'

export function InvestCalc({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const [mode, setMode] = useState<Mode>('day')
  const [principal, setPrincipal] = useState('10000')
  const [rate, setRate] = useState('3')
  const [days, setDays] = useState('365')
  const [years, setYears] = useState('1')
  const [monthly, setMonthly] = useState('1000')

  const fmt = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const result = useMemo(() => {
    const P = Number(principal) || 0
    const r = (Number(rate) || 0) / 100
    if (mode === 'day') {
      const d = Number(days) || 0
      const profit = (P * r * d) / 365
      return [
        ['预计收益（元）', fmt(profit)],
        ['本息合计', fmt(P + profit)],
        ['日均收益', fmt(d ? profit / d : 0)],
        ['万份收益', fmt(((Number(rate) || 0) * 10000) / 100 / 365)],
      ] as Array<[string, string]>
    }
    if (mode === 'compound') {
      const n = Number(years) || 0
      const total = P * (1 + r) ** n
      const profit = total - P
      return [
        ['到期本息（元）', fmt(total)],
        ['累计收益', fmt(profit)],
        ['总收益率', `${fmt(r ? (profit / P) * 100 : 0)}%`],
        ['翻倍约需', r > 0 ? `${(Math.log(2) / Math.log(1 + r)).toFixed(1)} 年` : '—'],
      ] as Array<[string, string]>
    }
    const n = Math.round((Number(years) || 0) * 12)
    const i = r / 12
    const M = Number(monthly) || 0
    const total = i === 0 ? M * n : (M * ((1 + i) ** n - 1)) / i
    const invested = M * n
    return [
      ['到期总资产（元）', fmt(total)],
      ['累计投入', fmt(invested)],
      ['累计收益', fmt(total - invested)],
      ['收益率', `${fmt(invested ? ((total - invested) / invested) * 100 : 0)}%`],
    ] as Array<[string, string]>
  }, [mode, principal, rate, days, years, monthly])

  return (
    <section className="card" aria-label="理财收益">
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>理财收益</h3>
      </div>

      <div className="seg">
        <button type="button" className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>按天</button>
        <button type="button" className={mode === 'compound' ? 'on' : ''} onClick={() => setMode('compound')}>复利</button>
        <button type="button" className={mode === 'monthly' ? 'on' : ''} onClick={() => setMode('monthly')}>定投</button>
      </div>

      {mode !== 'monthly' && (
        <label>本金（元）
          <input aria-label="本金" inputMode="decimal" value={principal}
            onChange={(e) => setPrincipal(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
      )}
      <label>年化收益率（%）
        <input aria-label="年化收益率" inputMode="decimal" value={rate}
          onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      {mode === 'day' ? (
        <label>投资天数
          <input aria-label="投资天数" inputMode="numeric" value={days}
            onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ''))} />
        </label>
      ) : (
        <label>投资年限
          <input aria-label="投资年限" inputMode="decimal" value={years}
            onChange={(e) => setYears(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
      )}
      {mode === 'monthly' && (
        <label>每月定投（元）
          <input aria-label="每月定投" inputMode="decimal" value={monthly}
            onChange={(e) => setMonthly(e.target.value.replace(/[^\d.]/g, ''))} />
        </label>
      )}

      <div className="totalbox">
        <small>{result[0][0]}</small>
        <b>{result[0][1]}</b>
      </div>
      {result.slice(1).map(([k, v]) => <div key={k} className="row"><span className="grow">{k}</span><b>{v}</b></div>)}

      <button type="button" className="ghost wide" onClick={() => notify('按年化收益率估算，实际以产品为准')}>说明</button>
    </section>
  )
}
