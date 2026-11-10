import { useEffect, useState } from 'react'
import { useLedger } from '../store'
import { accountMoney, currencySymbol, findCurrency, hasCurrencyRate, toBase } from '../money'
import { money, toLocalInput } from '../ui-format'
import { CatIcon } from '../ui/icons'

export function AddBill({ notify }: { notify: (m: string) => void }) {
  const accountBooks = useLedger((s) => s.accountBooks)
  const curBookId = useLedger((s) => s.currentBookId)
  const myRole = accountBooks.find((b) => b.bookId && String(b.bookId) === String(curBookId))?.role
  const readOnly = myRole === 'silent'
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const assets = useLedger((s) => s.assets)
  const addBill = useLedger((s) => s.addBill)
  const addTransfer = useLedger((s) => s.addTransfer)

  const lastParentId = useLedger((s) => s.lastParentId)
  const lastChildId = useLedger((s) => s.lastChildId)
  const lastAssetId = useLedger((s) => s.lastAssetId)

  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const [currency, setCurrency] = useState(defaultCurrency)
  const [mode, setMode] = useState<'expense' | 'income' | 'transfer'>('expense')
  const [cost, setCost] = useState('')
  const [pid, setPid] = useState(lastParentId)
  const [cid, setCid] = useState(lastChildId)
  const [aid, setAid] = useState(lastAssetId || 0)
  const [toAid, setToAid] = useState(0)
  const [fee, setFee] = useState('')
  const [toCost, setToCost] = useState('')
  const [remark, setRemark] = useState('')
  const [time, setTime] = useState(toLocalInput(Date.now()))

  // 账户默认取上次使用的，没有就取第一个
  useEffect(() => {
    if (!aid && assets[0]) setAid(assets[0].assetId)
    if (!toAid && assets[1]) setToAid(assets[1].assetId)
  }, [assets, aid, toAid])

  const catKind = mode === 'income' ? 'income' : 'expense'
  const list = parents.filter((p) => p.kind === catKind)
  const cur = list.some((p) => p.id === pid) ? pid : (list[0]?.id ?? 7)
  const subs = children.filter((c) => c.parentId === cur)

  const switchMode = (m: 'expense' | 'income' | 'transfer') => {
    setMode(m)
    setCid(0)
    if (m === 'expense') setPid(7)
    if (m === 'income') setPid(903)
  }

  const submit = () => {
    const v = Number(cost)
    if (!v || v <= 0) return notify('请输入金额')
    if (String(curBookId) === '0') return notify('请先选择一个具体账本')

    if (mode === 'transfer') {
      if (!aid || !toAid) return notify('请选择转出和转入账户')
      if (aid === toAid) return notify('转出和转入不能是同一个账户')
      const f = Number(fee) || 0
      const fromCurrency = assets.find((a) => a.assetId === aid)?.currency
      if (f > 0 && !hasCurrencyRate(fromCurrency, currencies, defaultCurrency)) return notify(`请先设置 ${fromCurrency} 汇率`)
      const tc = Number(toCost) || 0
      addTransfer({
        toCost: tc > 0 ? tc : undefined,
        fromAssetId: aid, toAssetId: toAid, cost: v,
        serviceCharge: f, remark, time: new Date(time).getTime()
      })
      setCost(''); setFee(''); setRemark(''); setToCost('')
      return notify(`已转账 ${money(v)}` + (tc > 0 && tc !== v ? `（到账 ${money(tc)}）` : '') + (f > 0 ? `，手续费 ${money(f)} 已单独记为支出` : ''))
    }

    if (!aid) return notify('请选择账户')
    const accountCurrency = assets.find((a) => a.assetId === aid)?.currency
    if (!hasCurrencyRate(currency, currencies, defaultCurrency)) return notify(`请先设置 ${currency} 汇率`)
    if (!hasCurrencyRate(accountCurrency, currencies, defaultCurrency)) return notify(`请先设置 ${accountCurrency} 汇率`)
    const foreign = currency !== defaultCurrency
    addBill({
      cost: foreign ? toBase(v, currency, currencies, defaultCurrency) : v,
      currencyInfo: foreign ? currency : undefined,
      currencyAssetNumber: foreign ? v : undefined,
      parentCategoryId: cur, childCategoryId: cid,
      assetId: aid, remark, time: new Date(time).getTime(), billType: 2
    })
    setCost(''); setRemark(''); setCid(0); setCurrency(defaultCurrency)
    notify(`${mode === 'expense' ? '支出' : '收入'} ${money(v)} 已记录`)
  }

  return (
    <section className="card">
      <div className="seg three">
        <button className={mode === 'expense' ? 'on' : ''} onClick={() => switchMode('expense')}>支出</button>
        <button className={mode === 'income' ? 'on' : ''} onClick={() => switchMode('income')}>收入</button>
        <button className={mode === 'transfer' ? 'on' : ''} onClick={() => switchMode('transfer')}>转账</button>
      </div>

      <div className="amount">
        <span>{currencySymbol(currencies, currency, defaultCurrency)}</span>
        <input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" inputMode="decimal" />
        {currencies.length > 1 && (
          <select className="cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        )}
      </div>
      {currency !== defaultCurrency && Number(cost) > 0 && (
        <p className="hint">
          折合 {currencySymbol(currencies, defaultCurrency, defaultCurrency)}
          {toBase(Number(cost), currency, currencies, defaultCurrency).toFixed(2)}
          {(() => {
            const c = findCurrency(currencies, currency)
            return c ? `（1 ${c.code} = ${c.rate} ${defaultCurrency}）` : ''
          })()}
        </p>
      )}

      {mode === 'transfer' ? (
        <>
          <div className="row2">
            <div>
              <div className="label">转出账户</div>
              <select value={aid} onChange={(e) => setAid(Number(e.target.value))}>
                <option value={0}>请选择</option>
                {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}（{accountMoney(a.assetNumber, a.currency, currencies, defaultCurrency)}）</option>)}
              </select>
            </div>
            <div>
              <div className="label">转入账户</div>
              <select value={toAid} onChange={(e) => setToAid(Number(e.target.value))}>
                <option value={0}>请选择</option>
                {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
              </select>
            </div>
          </div>
          <div className="row2">
            <div>
              <div className="label">手续费（可选）</div>
              <input value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" inputMode="decimal" />
            </div>
            <div>
              <div className="label">时间</div>
              <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="label">到账金额（跨币种或对方扣费时填，留空＝与金额相同）</div>
          <input value={toCost} onChange={(e) => setToCost(e.target.value.replace(/[^\d.]/g, ''))} placeholder="默认等于金额" inputMode="decimal" />
          <p className="tip">
            转账本金不计入收支；手续费会单独生成一条支出账单。
            {toCost && Number(toCost) !== Number(cost) && Number(cost) > 0 && (
              <> 转出 {money(Number(cost))}，到账 {money(Number(toCost))}。</>
            )}
          </p>
        </>
      ) : (
        <>
          <div className="label">分类</div>
          <div className="chips">
            {list.map((p) => (
              <button key={p.id} className={'chip' + (p.id === cur ? ' on' : '')} onClick={() => { setPid(p.id); setCid(0) }}>
                <CatIcon k={p.icon} size={16} />{p.name}
              </button>
            ))}
          </div>

          {subs.length > 0 && (
            <>
              <div className="label">子分类</div>
              <div className="chips small">
                <button className={'chip' + (cid === 0 ? ' on' : '')} onClick={() => setCid(0)}>不选</button>
                {subs.map((c) => (
                  <button key={c.id} className={'chip' + (cid === c.id ? ' on' : '')} onClick={() => setCid(c.id)}>{c.name}</button>
                ))}
              </div>
            </>
          )}

          <div className="row2">
            <div>
              <div className="label">账户</div>
              <select value={aid} onChange={(e) => setAid(Number(e.target.value))}>
                <option value={0}>请选择</option>
                {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}（{accountMoney(a.assetNumber, a.currency, currencies, defaultCurrency)}）</option>)}
              </select>
            </div>
            <div>
              <div className="label">时间</div>
              <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
        </>
      )}

      <div className="label">备注</div>
      <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="写点什么（可留空）" />

      <button className="primary" onClick={submit}>{mode === 'transfer' ? '确认转账' : '记一笔'}</button>
    </section>
  )
}
