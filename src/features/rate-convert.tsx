import { useMemo, useState } from 'react'

/** 利率换算（对照一木 RateConvertActivity：年/月/日利率互换 + 借款利息） */
export function RateConvert({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const [yearRate, setYearRate] = useState('3.5')
  const [loan, setLoan] = useState('10000')
  const [days, setDays] = useState('30')

  const year = Number(yearRate) || 0
  const month = year / 12
  const day = year / 365
  const fmt = (v: number) => (Number.isInteger(+v.toFixed(4)) ? String(+v.toFixed(4)) : v.toFixed(4).replace(/0+$/, ''))

  const interest = useMemo(() => {
    const P = Number(loan) || 0
    const d = Number(days) || 0
    return (P * (year / 100) * d) / 365
  }, [loan, days, year])

  const perDay = ((10000 * day) / 100)

  return (
    <section className="card" aria-label="利率换算">
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>利率换算</h3>
      </div>

      <div className="label">年利率（%）</div>
      <input aria-label="年利率" inputMode="decimal" value={yearRate}
        onChange={(e) => setYearRate(e.target.value.replace(/[^\d.]/g, ''))} />

      <div className="row"><span className="grow">月利率</span><b>{fmt(month)}%</b></div>
      <div className="row"><span className="grow">日利率</span><b>{fmt(day)}%</b></div>
      <div className="row"><span className="grow">月息</span><b>{fmt(month / 10)} 分</b></div>
      <div className="row"><span className="grow">每万元每天</span><b>{perDay.toFixed(2)} 元</b></div>

      <div className="label">借款利息</div>
      <label>借款金额（元）
        <input aria-label="借款金额" inputMode="decimal" value={loan}
          onChange={(e) => setLoan(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>借款天数
        <input aria-label="借款天数" inputMode="numeric" value={days}
          onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ''))} />
      </label>

      <div className="totalbox">
        <small>利息（元）</small>
        <b>{interest.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
        <small>相当于月息 {fmt(month / 10)} 分，每万元每天 {perDay.toFixed(2)} 元</small>
      </div>

      <button type="button" className="ghost wide" onClick={() => notify('仅供换算参考')}>说明</button>
    </section>
  )
}
