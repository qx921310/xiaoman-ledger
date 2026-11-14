import { useMemo, useState } from 'react'

/** 个税计算（对照一木 SalaryCalcActivity：工资/奖金、五险一金基数与比例、个税与到手） */
export function TaxCalc({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const [salary, setSalary] = useState('20000')
  const [bonus, setBonus] = useState('0')
  const [base, setBase] = useState('20000')
  const [cap, setCap] = useState('35283')
  const [housing, setHousing] = useState('12')

  const fmt = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const result = useMemo(() => {
    const income = (Number(salary) || 0) * 12 + (Number(bonus) || 0)
    const baseNum = Math.min(Number(base) || 0, Number(cap) || 0)
    // 一木默认个人比例：养老 8%、医疗 2%+3、失业 0.5%、公积金按输入比例
    const social = baseNum * (0.08 + 0.02 + 0.005) + 3
    const fund = baseNum * ((Number(housing) || 0) / 100)
    const deductible = social + fund
    const taxable = Math.max(0, income - deductible * 12 - 60000)
    // 年度综合所得税率表（速算扣除数）
    const brackets: Array<[number, number, number]> = [
      [36000, 0.03, 0], [144000, 0.1, 2520], [300000, 0.2, 16920],
      [420000, 0.25, 31920], [660000, 0.3, 52920], [960000, 0.35, 85920],
      [Infinity, 0.45, 181920],
    ]
    const tier = brackets.find(([limit]) => taxable <= limit)!
    const tax = Math.max(0, taxable * tier[1] - tier[2])
    const net = income - deductible * 12 - tax
    return {
      income, deductible: deductible * 12, taxable, tax,
      net, monthlyNet: net / 12, realRate: income > 0 ? (tax / income) * 100 : 0,
    }
  }, [salary, bonus, base, cap, housing])

  return (
    <section className="card" aria-label="个税计算">
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>个税计算</h3>
      </div>

      <label>税前工资（元/月）
        <input aria-label="税前工资" inputMode="decimal" value={salary}
          onChange={(e) => setSalary(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>年终奖（元）
        <input aria-label="年终奖" inputMode="decimal" value={bonus}
          onChange={(e) => setBonus(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>五险一金基数（元）
        <input aria-label="五险一金基数" inputMode="decimal" value={base}
          onChange={(e) => setBase(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>基数上限（元）
        <input aria-label="基数上限" inputMode="decimal" value={cap}
          onChange={(e) => setCap(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>公积金比例（%）
        <input aria-label="公积金比例" inputMode="decimal" value={housing}
          onChange={(e) => setHousing(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>

      <div className="totalbox">
        <small>全年到手（元）</small>
        <b>{fmt(result.net)}</b>
        <small>月均到手 {fmt(result.monthlyNet)}</small>
      </div>

      <div className="row"><span className="grow">全年个税</span><b>{fmt(result.tax)}</b></div>
      <div className="row"><span className="grow">五险一金（全年）</span><b>{fmt(result.deductible)}</b></div>
      <div className="row"><span className="grow">应纳税所得额</span><b>{fmt(result.taxable)}</b></div>
      <div className="row"><span className="grow">实际税率</span><b>{result.realRate.toFixed(2)}%</b></div>

      <button type="button" className="ghost wide" onClick={() => notify('按年度综合所得估算，实际以税务口径为准')}>说明</button>
    </section>
  )
}
