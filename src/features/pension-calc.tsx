import { useMemo, useState } from 'react'

/** 养老金测算（对照一木 PensionCalcActivity：社平工资/缴费指数/累计缴费年限/个人账户余额 → 退休后月领） */
export function PensionCalc({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const [wage, setWage] = useState('8000')
  const [index, setIndex] = useState('1.0')
  const [years, setYears] = useState('30')
  const [account, setAccount] = useState('120000')
  const [age, setAge] = useState('40')
  const [retireAge, setRetireAge] = useState('60')

  const fmt = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const result = useMemo(() => {
    const w = Number(wage) || 0
    const idx = Number(index) || 0
    const y = Number(years) || 0
    const acc = Number(account) || 0
    const a = Number(age) || 0
    const ra = Number(retireAge) || 0
    if (idx < 0.6 || idx > 3) return { error: '缴费指数需在 0.6-3 之间' }
    if (y < 15) return { error: '累计缴费不满 15 年，无法按月领取基本养老金' }
    if (ra < 40 || ra > 70) return { error: '退休年龄需在 40-70 岁之间' }
    // 基础养老金 = 社平工资 ×(1+指数)/2 × 缴费年限 × 1%
    const base = (w * (1 + idx)) / 2 * y * 0.01
    // 个人账户养老金 = 账户余额 / 计发月数（60 岁 139、55 岁 170、50 岁 195，按线性近似）
    const months = ra >= 60 ? 139 : ra >= 55 ? 170 : 195
    const accPart = acc / months
    return { base, accPart, total: base + accPart, months, remainYears: ra - a }
  }, [wage, index, years, account, age, retireAge])

  return (
    <section className="card" aria-label="养老金测算">
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>养老金测算</h3>
      </div>

      <label>当地社平工资（元/月）
        <input aria-label="社平工资" inputMode="decimal" value={wage} onChange={(e) => setWage(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>缴费指数（0.6 - 3）
        <input aria-label="缴费指数" inputMode="decimal" value={index} onChange={(e) => setIndex(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>累计缴费年限（年）
        <input aria-label="缴费年限" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/[^\d]/g, ''))} />
      </label>
      <label>个人账户余额（元）
        <input aria-label="个人账户余额" inputMode="decimal" value={account} onChange={(e) => setAccount(e.target.value.replace(/[^\d.]/g, ''))} />
      </label>
      <label>当前年龄（岁）
        <input aria-label="当前年龄" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, ''))} />
      </label>
      <label>退休年龄（40-70 岁）
        <input aria-label="退休年龄" inputMode="numeric" value={retireAge} onChange={(e) => setRetireAge(e.target.value.replace(/[^\d]/g, ''))} />
      </label>

      {'error' in result ? <p className="hint">{result.error}</p> : (
        <>
          <div className="totalbox">
            <small>退休后每月约领（元）</small>
            <b>{fmt(result.total)}</b>
            <small>累计缴费 {years} 年，{retireAge} 岁退休，距退休约 {result.remainYears} 年</small>
          </div>
          <div className="row"><span className="grow">基础养老金</span><b>{fmt(result.base)}</b></div>
          <div className="row"><span className="grow">个人账户养老金</span><b>{fmt(result.accPart)}</b></div>
          <div className="row"><span className="grow">计发月数</span><b>{result.months}</b></div>
        </>
      )}

      <button type="button" className="ghost wide" onClick={() => notify('按现行计发办法估算，实际以当地社保为准')}>说明</button>
    </section>
  )
}
