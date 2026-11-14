import { useMemo, useState } from 'react'

/** 提前还贷（对照一木 PrepayCalcActivity：贷款总额/年利率/年限/已还期数/提前还款金额 → 缩短期限或减少月供） */
export function PrepayCalc({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const [loan, setLoan] = useState('100')
  const [rate, setRate] = useState('3.5')
  const [years, setYears] = useState('30')
  const [paid, setPaid] = useState('36')
  const [prepay, setPrepay] = useState('20')
  const [mode, setMode] = useState<'shorten' | 'reduce'>('shorten')

  const fmt = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const result = useMemo(() => {
    const P = (Number(loan) || 0) * 10000
    const prepayAmt = (Number(prepay) || 0) * 10000
    const n = Math.max(1, Math.round((Number(years) || 0) * 12))
    const paidN = Math.min(Number(paid) || 0, n - 1)
    const r = (Number(rate) || 0) / 100 / 12
    if (P <= 0 || r <= 0) return null
    const monthly = (P * r * (1 + r) ** n) / ((1 + r) ** n - 1)
    // 剩余本金
    const left = P * ((1 + r) ** n - (1 + r) ** paidN) / ((1 + r) ** n - 1)
    const after = Math.max(0, left - prepayAmt)
    // 不提前还时的剩余利息 = 剩余月供合计 - 剩余本金
    const remainMonths = n - paidN
    const beforeInterest = +(monthly * remainMonths - left).toFixed(2)
    if (mode === 'reduce') {
      const newMonthly = (after * r * (1 + r) ** remainMonths) / ((1 + r) ** remainMonths - 1)
      const afterInterest = +(newMonthly * remainMonths - after).toFixed(2)
      return {
        before: monthly, after: newMonthly, savedMonthly: monthly - newMonthly,
        left, prepayAmt, months: remainMonths,
        // 节省利息只能比较「利息支出」，不能拿月供合计直接相减
        savedInterest: +Math.max(0, beforeInterest - afterInterest).toFixed(2),
      }
    }
    // 缩短期限：月供不变，反推期数
    const newN = Math.ceil(Math.log(monthly / (monthly - after * r)) / Math.log(1 + r))
    const afterInterest = +(monthly * newN - after).toFixed(2)
    return {
      before: monthly, after: monthly, savedMonthly: 0,
      left, prepayAmt, months: newN,
      savedInterest: +Math.max(0, beforeInterest - afterInterest).toFixed(2),
    }
  }, [loan, rate, years, paid, prepay, mode])

  return (
    <section className="card" aria-label="提前还贷">
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>提前还贷</h3>
      </div>

      <div className="seg">
        <button type="button" className={mode === 'shorten' ? 'on' : ''} onClick={() => setMode('shorten')}>缩短年限</button>
        <button type="button" className={mode === 'reduce' ? 'on' : ''} onClick={() => setMode('reduce')}>减少月供</button>
      </div>

      <label>贷款总额（万元）
        <input aria-label="贷款总额" inputMode="decimal" value={loan} onChange={(e) => setLoan(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>年利率（%）
        <input aria-label="年利率" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>贷款年限（1-30 年）
        <input aria-label="贷款年限" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/[^\d]/g, ''))} />
      </label>
      <label>已还期数（期）
        <input aria-label="已还期数" inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d]/g, ''))} />
      </label>
      <label>提前还款金额（万元）
        <input aria-label="提前还款金额" inputMode="decimal" value={prepay} onChange={(e) => setPrepay(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>

      {result ? (
        <>
          <div className="totalbox">
            <small>{mode === 'shorten' ? '剩余期数（期）' : '新月供（元）'}</small>
            <b>{mode === 'shorten' ? result.months : fmt(result.after)}</b>
            <small>原月供 {fmt(result.before)} · 剩余本金 {fmt(result.left)}</small>
          </div>
          <div className="row"><span className="grow">提前还款</span><b>{fmt(result.prepayAmt)}</b></div>
          <div className="row"><span className="grow">节省利息（估）</span><b>{fmt(Math.max(0, result.savedInterest))}</b></div>
          {mode === 'reduce' && <div className="row"><span className="grow">每月少还</span><b>{fmt(result.savedMonthly)}</b></div>}
        </>
      ) : <p className="hint">请输入贷款总额与年利率。</p>}

      <button type="button" className="ghost wide" onClick={() => notify('按等额本息估算，实际以银行为准')}>说明</button>
    </section>
  )
}
