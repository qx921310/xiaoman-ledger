import { useMemo, useState } from 'react'

/** 时薪 / 通胀 / 租买对比（对照 HourlyWageActivity、InflationCalcActivity、BuyRentActivity） */
export function ToolCalc({ kind, onBack, notify }: { kind: 'hourly' | 'inflation' | 'buyrent'; onBack: () => void; notify: (m: string) => void }) {
  const title = kind === 'hourly' ? '时薪计算' : kind === 'inflation' ? '通胀计算' : '租买对比'
  const [monthly, setMonthly] = useState('10000')
  const [days, setDays] = useState('21.75')
  const [hours, setHours] = useState('8')
  const [amount, setAmount] = useState('100000')
  const [inflation, setInflation] = useState('3')
  const [years, setYears] = useState('10')
  const [price, setPrice] = useState('200')
  const [down, setDown] = useState('30')
  const [rate, setRate] = useState('3.5')
  const [rent, setRent] = useState('4000')
  const [holdYears, setHoldYears] = useState('20')

  const fmt = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const out = useMemo(() => {
    if (kind === 'hourly') {
      const M = Number(monthly) || 0
      const d = Number(days) || 0
      const h = Number(hours) || 0
      const perDay = d ? M / d : 0
      const perHour = d && h ? M / d / h : 0
      return [['时薪（元/小时）', fmt(perHour)], ['日薪（元）', fmt(perDay)], ['月工时（小时）', fmt(d * h)], ['折算年收入', fmt(M * 12)]] as Array<[string, string]>
    }
    if (kind === 'inflation') {
      const P = Number(amount) || 0
      const r = (Number(inflation) || 0) / 100
      const n = Number(years) || 0
      const future = P * (1 + r) ** n
      const power = P / (1 + r) ** n
      return [['未来等值（元）', fmt(future)], ['现值购买力（元）', fmt(power)], ['贬值（元）', fmt(future - P)], ['年均贬值率', `${((1 - 1 / (1 + r)) * 100).toFixed(2)}%`]] as Array<[string, string]>
    }
    const total = (Number(price) || 0) * 10000
    const downPct = (Number(down) || 0) / 100
    const loan = total * (1 - downPct)
    const r = (Number(rate) || 0) / 100 / 12
    const n = (Number(holdYears) || 0) * 12
    const monthlyPay = r > 0 && n > 0 ? (loan * r * (1 + r) ** n) / ((1 + r) ** n - 1) : 0
    const interest = monthlyPay * n - loan
    const rentTotal = (Number(rent) || 0) * n
    return [
      ['月供（元）', fmt(monthlyPay)],
      ['总利息（元）', fmt(interest)],
      ['首付（元）', fmt(total * downPct)],
      ['同期房租合计（元）', fmt(rentTotal)],
      ['买房持有成本（元）', fmt(total * downPct + monthlyPay * n)],
    ] as Array<[string, string]>
  }, [kind, monthly, days, hours, amount, inflation, years, price, down, rate, rent, holdYears])

  return (
    <section className="card" aria-label={title}>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>{title}</h3>
      </div>

      {kind === 'hourly' && (<>
        <label>月薪（元）<input aria-label="月薪" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <label>月工作天数<input aria-label="月工作天数" inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <label>每日工时<input aria-label="每日工时" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))} /></label>
      </>)}
      {kind === 'inflation' && (<>
        <label>当前金额（元）<input aria-label="金额" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <label>年通胀率（%）<input aria-label="通胀率" inputMode="decimal" value={inflation} onChange={(e) => setInflation(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <label>年限<input aria-label="年限" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/[^\d]/g, ''))} /></label>
      </>)}
      {kind === 'buyrent' && (<>
        <label>房价（万元）<input aria-label="房价" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <label>首付比例（%）<input aria-label="首付比例" inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <label>贷款年利率（%）<input aria-label="贷款年利率" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <label>月租（元）<input aria-label="月租" inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value.replace(/[^\d.]/g, ''))} /></label>
        <label>对比年限<input aria-label="对比年限" inputMode="numeric" value={holdYears} onChange={(e) => setHoldYears(e.target.value.replace(/[^\d]/g, ''))} /></label>
      </>)}

      <div className="totalbox">
        <small>{out[0][0]}</small>
        <b>{out[0][1]}</b>
      </div>
      {out.slice(1).map(([k, v]) => <div key={k} className="row"><span className="grow">{k}</span><b>{v}</b></div>)}

      <button type="button" className="ghost wide" onClick={() => notify('估算结果，仅供参考')}>说明</button>
    </section>
  )
}
