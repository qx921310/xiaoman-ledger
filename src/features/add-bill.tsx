import { useEffect, useRef, useState } from 'react'
import { useLedger } from '../store'
import { useSpeech } from '../ui/use-speech'
import { accountMoney, currencySymbol, findCurrency, hasCurrencyRate, toBase } from '../money'
import { money, toLocalInput } from '../ui-format'
import { CatIcon } from '../ui/icons'
import { editAmount, evaluateAmount, formatAmount } from '../ui/keypad'
import { MobilePicker } from '../ui/mobile-picker'
import { leaksPrivateAccount, visibleAssets } from '../domain/asset-scope'
import { sortCategories } from '../domain/category-order'

export function AddBill({ notify, onClose, onNeedAsset }: { notify: (m: string) => void; onClose?: () => void; onNeedAsset?: () => void }) {
  const accountBooks = useLedger((s) => s.accountBooks)
  const curBookId = useLedger((s) => s.currentBookId)
  const setBook = useLedger((s) => s.setBook)
  const myRole = accountBooks.find((b) => b.bookId && String(b.bookId) === String(curBookId))?.role
  const readOnly = myRole === 'silent'
  const allParents = useLedger((s) => s.parentCategories)
  const allChildren = useLedger((s) => s.childCategories)
  // 隐藏分类：记账时不显示（一木 hide / hideBook）
  const parents = allParents.filter((p) => !p.hide || (p.hideBook?.length
    ? !p.hideBook.some((b) => String(b) === String(curBookId)) : false))
  const children = allChildren.filter((c) => !c.hide)
  const allAssets = useLedger((s) => s.assets)
  const meId = useLedger((s) => s.userId)
  const assets = visibleAssets(allAssets, curBookId, meId)
  const addBill = useLedger((s) => s.addBill)
  const addTemplate = useLedger((s) => s.addTemplate)
  // Hook 必须在组件顶层，不能放在条件分支里
  const holdRef = useRef<{ delay?: ReturnType<typeof setTimeout>; timer?: ReturnType<typeof setInterval> }>({})
  const [notIntoTotal, setNotIntoTotal] = useState(false)
  const [notIntoBudget, setNotIntoBudget] = useState(false)
  const addTransfer = useLedger((s) => s.addTransfer)

  const lastParentId = useLedger((s) => s.lastParentId)
  const lastChildId = useLedger((s) => s.lastChildId)
  const lastAssetId = useLedger((s) => s.lastAssetId)

  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const [currency, setCurrency] = useState(defaultCurrency)
  const [mode, setMode] = useState<'expense' | 'income' | 'transfer' | 'debt'>('expense')
  // 债务模式（一木 AddBillActivity 的债务 tab：借出/借入/收款/还款）
  const [debtType, setDebtType] = useState<1 | 2 | 3 | 4>(1)
  const [counterparty, setCounterparty] = useState('')
  const [cost, setCost] = useState('')
  // 语音记账：识别文本取第一个数字当金额，其余作为备注（一木 SpeechActivity 同类行为）
  // 备注变更统一入口：移动端与桌面端共用（避免只在桌面分支生效）
  // 存为模板：移动端与桌面端共用
  const saveTemplate = () => {
    const costNum = evaluateAmount(cost) ?? 0
    if (!(costNum > 0) || !pid) return notify('先把金额和分类填好')
    const aid2 = aid || assets[0]?.assetId || 0
    if (!aid2) return notify('请先选择账户')
    addTemplate({
      name: remark.trim() || (parents.find((p) => p.id === pid)?.name ?? '模板'),
      mode: 'bill',
      bill: {
        assetId: aid2, parentCategoryId: pid, childCategoryId: cid,
        cost: costNum, remark, notIntoTotal, notIntoBudget
      }
    })
    notify('已存为模板')
  }

  const onRemarkChange = (v: string) => {
    setRemark(v)
    const hit = aiTypeRules.find((r) => r.keywords.some((k) => k && v.includes(k)))
    if (hit) { setPid(hit.categoryId); setCid(0) }
  }
  const speech = useSpeech((text) => {
    const num = text.match(/\d+(?:\.\d+)?/)
    if (num) setCost(num[0])
    const rest = text.replace(/\d+(?:\.\d+)?/g, '').replace(/[元块钱了]/g, '').trim()
    if (rest) setRemark(rest)
  })
  const [pid, setPid] = useState(lastParentId)
  const [cid, setCid] = useState(lastChildId)
  const [aid, setAid] = useState(lastAssetId || 0)
  // 选中账户与隐私校验必须在 aid 之后计算
  const pickedAsset = assets.find((a) => a.assetId === aid)
  const privacyBlocked = leaksPrivateAccount(pickedAsset, curBookId, accountBooks, meId)
  const [toAid, setToAid] = useState(0)
  const [fee, setFee] = useState('')
  const [toCost, setToCost] = useState('')
  const [remark, setRemark] = useState('')
  const aiTypeRules = useLedger((s) => s.aiTypeRules ?? [])
  const addLend = useLedger((s) => s.addLend)
  const [time, setTime] = useState(toLocalInput(Date.now()))
  const [keypadOpen, setKeypadOpen] = useState(true)
  const [keypadField, setKeypadField] = useState<'cost' | 'fee' | 'toCost'>('cost')
  const [mobileKeypad, setMobileKeypad] = useState(() => window.matchMedia('(max-width: 600px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)')
    const update = () => setMobileKeypad(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // 账户默认取上次使用的，没有就取第一个
  useEffect(() => {
    if (!aid && assets[0]) setAid(assets[0].assetId)
    if (!toAid && assets[1]) setToAid(assets[1].assetId)
  }, [assets, aid, toAid])

  const catKind = mode === 'income' ? 'income' : 'expense'
  const list = sortCategories(parents.filter((p) => p.kind === catKind))
  const cur = list.some((p) => p.id === pid) ? pid : (list[0]?.id ?? 7)
  const subs = sortCategories(children.filter((c) => c.parentId === cur))

  const switchMode = (m: 'expense' | 'income' | 'transfer' | 'debt') => {
    setMode(m)
    setKeypadField('cost')
    // 切到支出/收入时，父分类跟着换，并自动选中它的第一个子分类
    const nextPid = m === 'income' ? (sortCategories(parents.filter((p) => p.kind === 'income'))[0]?.id ?? 901) : m === 'expense' ? 7 : pid
    setPid(nextPid)
    const first = sortCategories(children.filter((c) => c.parentId === nextPid))[0]
    setCid(m === 'transfer' ? 0 : (first?.id ?? 0))
  }

  const submit = (): boolean => {
    const fail = (message: string) => { notify(message); return false }
    const v = evaluateAmount(cost)
    if (v == null || v <= 0) return fail('请输入有效金额')
    if (String(curBookId) === '0') return fail('请先选择一个具体账本')

    if (mode === 'debt') {
      if (!counterparty.trim()) return fail('请选择债务')
      if (!aid) return fail('请选择账户')
      const typeMap: Record<1 | 2 | 3 | 4, string> = { 1: '资金借出', 2: '收款', 3: '资金借入', 4: '还款' }
      addLend({
        type: debtType, assetId: aid, counterparty: counterparty.trim(), number: v,
        time: Date.now(), remark: `${typeMap[debtType]}-${assets.find((a) => a.assetId === aid)?.assetName ?? ''}`
      })
      notify(`${typeMap[debtType]} ${money(v)} 已记录`)
      setCost(''); setCounterparty('')
      return true
    }

    if (mode === 'transfer') {
      if (!aid || !toAid) return fail('请选择转出和转入账户')
      if (aid === toAid) return fail('转出和转入不能是同一个账户')
      const f = fee ? evaluateAmount(fee) : 0
      const tc = toCost ? evaluateAmount(toCost) : 0
      if (f == null || f < 0 || tc == null || tc < 0) return fail('请输入有效的手续费和到账金额')
      const fromCurrency = assets.find((a) => a.assetId === aid)?.currency
      if (f > 0 && !hasCurrencyRate(fromCurrency, currencies, defaultCurrency)) return fail(`请先设置 ${fromCurrency} 汇率`)
      addTransfer({
        toCost: tc > 0 ? tc : undefined,
        fromAssetId: aid, toAssetId: toAid, cost: v,
        serviceCharge: f, remark, time: new Date(time).getTime()
      })
      setCost(''); setFee(''); setRemark(''); setToCost('')
      notify(`已转账 ${money(v)}` + (tc > 0 && tc !== v ? `（到账 ${money(tc)}）` : '') + (f > 0 ? `，手续费 ${money(f)} 已单独记为支出` : ''))
      return true
    }

    if (!aid) return fail('请选择账户')
    // 统一校验：私有账户不许记进多人账本（再记、完成、桌面端都会走到这里）
    if (leaksPrivateAccount(assets.find((a) => a.assetId === aid), curBookId, accountBooks, meId)) {
      return fail('该账户是私有账户，记到多人账本会让成员看到；请先设为共享或换账户')
    }
    const accountCurrency = assets.find((a) => a.assetId === aid)?.currency
    if (!hasCurrencyRate(currency, currencies, defaultCurrency)) return fail(`请先设置 ${currency} 汇率`)
    if (!hasCurrencyRate(accountCurrency, currencies, defaultCurrency)) return fail(`请先设置 ${accountCurrency} 汇率`)
    const foreign = currency !== defaultCurrency
    addBill({
      cost: foreign ? toBase(v, currency, currencies, defaultCurrency) : v,
      currencyInfo: foreign ? currency : undefined,
      currencyAssetNumber: foreign ? v : undefined,
      parentCategoryId: cur, childCategoryId: cid,
      assetId: aid, remark, time: new Date(time).getTime(), billType: 2,
      notIntoTotal, notIntoBudget
    })
    setCost(''); setRemark(''); setCid(0); setCurrency(defaultCurrency)
    notify(`${mode === 'expense' ? '支出' : '收入'} ${money(v)} 已记录`)
    return true
  }

  // 没有任何账户时，一木会引导先去建账户；我们不展示空选择器
  if (assets.length === 0) {
    return (
      <section className="card">
        <h3>还没有账户</h3>
        <p className="hint">先在「资产」建一个账户。</p>
        <button className="primary" onClick={() => onNeedAsset?.()}>去添加账户</button>
        {onClose && <button className="ghost" onClick={onClose}>稍后再说</button>}
      </section>
    )
  }

  if (mobileKeypad) {
    const displayCurrency = mode === 'transfer' ? (assets.find((a) => a.assetId === aid)?.currency ?? defaultCurrency) : currency
    const evaluatedCost = evaluateAmount(cost)
    const startHold = () => {
      holdRef.current.delay = setTimeout(() => {
        holdRef.current.timer = setInterval(() => setKey('退格'), 100)
      }, 400)
    }
    const stopHold = () => {
      if (holdRef.current.delay) clearTimeout(holdRef.current.delay)
      if (holdRef.current.timer) clearInterval(holdRef.current.timer)
      holdRef.current = {}
    }
    const setKey = (key: string) => {
      const setter = keypadField === 'fee' ? setFee : keypadField === 'toCost' ? setToCost : setCost
      setter((value) => editAmount(value, key))
    }
    const key = (label: string, extra = '') => label === '退格'
      ? <button type="button" aria-label="退格" className={extra} onClick={() => setKey(label)}
          onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
          onContextMenu={(e) => e.preventDefault()}
        ><svg className="entry-key-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L3 12l6-7Z"/><path d="m12 9 4 6m0-6-4 6"/></svg></button>
      : <button type="button" aria-label={label} className={extra} onClick={() => setKey(label)}>{label === '退格' ? <svg className="entry-key-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L3 12l6-7Z"/><path d="m12 9 4 6m0-6-4 6"/></svg> : label}</button>
    const assetOptions = [{ value: '0', label: '请选择账户' }, ...assets.map((a) => ({ value: String(a.assetId), label: a.simpleName || a.assetName, detail: accountMoney(a.assetNumber, a.currency, currencies, defaultCurrency), assetType: a.assetType, icon: a.assetIcon }))]
    return (
      <section className="mobile-entry" aria-label="记账">
        <div className="entry-toolbar">
          <button className="entry-back" type="button" aria-label="返回账单" onClick={onClose}>‹</button>
          <div className="entry-tabs">
            {(['expense', 'income', 'transfer', 'debt'] as const).map((item, index) => <button key={item} type="button" aria-pressed={mode === item} className={mode === item ? 'on' : ''} onClick={() => switchMode(item)}>{['支出', '收入', '转账', '债务'][index]}</button>)}
          </div>
          <MobilePicker className="entry-book" label="选择账本" value={String(curBookId)} options={[
            { value: '0', label: '全部账本' }, ...accountBooks.map((b) => ({ value: String(b.bookId ?? b.accountBookId), label: b.accountBookName }))
          ]} onChange={(value) => { localStorage.setItem('xm-current-book', value); setBook(/^\d+$/.test(value) ? Number(value) : value) }} />
        </div>

        <div className="entry-scroll">
          {mode === 'transfer' ? <div className="entry-transfer">
            <div className="entry-transfer-field"><span>转出账户</span><MobilePicker label="选择转出账户" value={String(aid)} options={assetOptions} onChange={(value) => setAid(Number(value))} /></div>
            <div className="entry-transfer-arrow">↓</div>
            <div className="entry-transfer-field"><span>转入账户</span><MobilePicker label="选择转入账户" value={String(toAid)} options={assetOptions} onChange={(value) => setToAid(Number(value))} /></div>
            <label>到账金额<input value={toCost} placeholder="留空与转出相同" inputMode="none" onFocus={() => { setKeypadField('toCost'); setKeypadOpen(true) }} onChange={(e) => setToCost(e.target.value.replace(/[^\d.]/g, ''))} /></label>
            <label>手续费<input value={fee} placeholder="0.00" inputMode="none" onFocus={() => { setKeypadField('fee'); setKeypadOpen(true) }} onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ''))} /></label>
          </div> : <>
            <div className="entry-categories" aria-label="大类">
              {list.map((p) => <button key={p.id} type="button" aria-pressed={p.id === cur} className={'entry-category' + (p.id === cur ? ' on' : '')} onClick={() => {
                  setPid(p.id)
                  const first = sortCategories(children.filter((c) => c.parentId === p.id))[0]
                  setCid(first ? first.id : 0)
                }}>
                <span className="entry-category-icon" style={{ '--category-color': p.color, '--category-bg': p.bg ?? 'var(--accent-soft)' } as React.CSSProperties}><CatIcon k={p.icon} size={22} /></span><span>{p.name}</span>
              </button>)}
            </div>
            {subs.length > 0 && <div className="entry-subsection"><div className="entry-subtitle">{parents.find((p) => p.id === cur)?.name}</div>
              <div className="entry-categories" aria-label="子分类">
                {subs.map((c) => <button key={c.id} type="button" aria-pressed={cid === c.id} className={'entry-category child' + (cid === c.id ? ' on' : '')} onClick={() => setCid(c.id)}>
                  <span className="entry-category-icon"><CatIcon k={c.icon} size={19} /></span><span>{c.name}</span>
                </button>)}
              </div>
            </div>}
          </>}
        </div>

        <div className="entry-bottom">
          <div className="entry-amount-row">
            <input className="entry-remark" aria-label="备注" value={remark} placeholder="写备注…"
              onFocus={() => setKeypadOpen(false)} onBlur={() => setKeypadOpen(true)}
              onChange={(e) => onRemarkChange(e.target.value)} />
            <button type="button" className="ghost" aria-label="语音"
              onClick={() => speech.listening ? speech.stop() : speech.start()}>
              {speech.listening ? '停' : '语'}
            </button>
            {mode === 'transfer' ? <span className="entry-currency-code">{displayCurrency}</span> : <MobilePicker className="entry-currency" label="选择币种" value={currency} options={currencies.map((c) => ({ value: c.code, label: c.code, detail: c.name, icon: c.symbol }))} onChange={setCurrency} />}
            <span className="entry-symbol">{currencySymbol(currencies, displayCurrency, defaultCurrency)}</span>
            <input className="entry-value" aria-label="记账金额" value={formatAmount(cost)} placeholder="0.00" inputMode="none" onFocus={() => { setKeypadField('cost'); setKeypadOpen(true) }} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          {mode !== 'transfer' && currency !== defaultCurrency && evaluatedCost != null && evaluatedCost > 0 && <div className="entry-fx">{hasCurrencyRate(currency, currencies, defaultCurrency) ? `折合 ${currencySymbol(currencies, defaultCurrency, defaultCurrency)}${toBase(evaluatedCost, currency, currencies, defaultCurrency).toFixed(2)}` : '请先设置汇率'}</div>}
          <div className="entry-options">
            <label className="entry-date"><span>日期</span><strong>{time.slice(0, 10) === toLocalInput(Date.now()).slice(0, 10) ? '今天' : time.slice(5, 10).replace('-', '/')}</strong><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="3"/><path d="M8 3v6m8-6v6M4 10h16"/></svg><input aria-label="日期" type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            {mode !== 'transfer' && <div className="entry-account"><span>账户</span><MobilePicker className="entry-account-picker" label="选择账户" value={String(aid)} options={assetOptions} onChange={(value) => setAid(Number(value))} /></div>}
            {!keypadOpen && <button type="button" onClick={() => { setKeypadField('cost'); setKeypadOpen(true) }}>数字键盘</button>}
          </div>
          {privacyBlocked && (
            <p className="hint due-hint">
              「{pickedAsset?.assetName}」是私有账户，记到共享账本会让成员看到它的名字。
              请先把该账户设为共享到本账本，或换用共享账户。
            </p>
          )}
          {keypadOpen && <div className="entry-keypad" aria-label="数字键盘">
            {key('1')}{key('2')}{key('3')}{key('退格', 'key-control')}
            {key('4')}{key('5')}{key('6')}<div className="entry-operators">{key('+')}{key('-')}</div>
            {key('7')}{key('8')}{key('9')}<div className="entry-operators">{key('×')}{key('÷')}</div>
            <button type="button" className="key-control" disabled={readOnly} onClick={() => { submit() }}>再记</button>{key('0')}{key('.')}
            <button type="button" className="key-finish" disabled={readOnly} onClick={() => { if (submit()) onClose?.() }}>完成</button>
            {mode !== 'transfer' && (
              <button type="button" className="ghost" aria-label="存为模板" onClick={saveTemplate}>存模板</button>
            )}
          </div>}
        </div>
      </section>
    )
  }

  return (
    <section className="card add-bill">
      <div className="seg three">
        <button className={mode === 'expense' ? 'on' : ''} onClick={() => switchMode('expense')}>支出</button>
        <button className={mode === 'income' ? 'on' : ''} onClick={() => switchMode('income')}>收入</button>
        <button className={mode === 'transfer' ? 'on' : ''} onClick={() => switchMode('transfer')}>转账</button>
        <button className={mode === 'debt' ? 'on' : ''} onClick={() => switchMode('debt')}>债务</button>
      </div>

      <div className="amount">
        <span>{currencySymbol(currencies, currency, defaultCurrency)}</span>
        <input value={formatAmount(cost)} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" aria-label="记账金额" inputMode="decimal" />
        {currencies.length > 1 && (
          <select aria-label="记账币种" className="cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
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
              <select aria-label="转出账户" value={aid} onChange={(e) => setAid(Number(e.target.value))}>
                <option value={0}>{assets.length ? '请选择账户' : '请先添加账户'}</option>
                {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}（{accountMoney(a.assetNumber, a.currency, currencies, defaultCurrency)}）</option>)}
              </select>
            </div>
            <div>
              <div className="label">转入账户</div>
              <select aria-label="转入账户" value={toAid} onChange={(e) => setToAid(Number(e.target.value))}>
                <option value={0}>{assets.length ? '请选择账户' : '请先添加账户'}</option>
                {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
              </select>
            </div>
          </div>
          <div className="row2">
            <div>
              <div className="label">手续费（可选）</div>
              <input aria-label="转账手续费" value={fee} onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" inputMode="decimal" />
            </div>
            <div>
              <div className="label">时间</div>
              <input aria-label="转账时间" type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="label">到账金额（跨币种或对方扣费时填，留空＝与金额相同）</div>
          <input aria-label="转账到账金额" value={toCost} onChange={(e) => setToCost(e.target.value.replace(/[^\d.]/g, ''))} placeholder="默认等于金额" inputMode="decimal" />
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
          <div className="chips category-grid">
            {list.map((p) => (
                <button key={p.id} aria-pressed={p.id === cur} className={'chip' + (p.id === cur ? ' on' : '')} onClick={() => {
                  setPid(p.id)
                  const first = sortCategories(children.filter((c) => c.parentId === p.id))[0]
                  setCid(first ? first.id : 0)
                }}>
                <CatIcon k={p.icon} size={16} />{p.name}
              </button>
            ))}
          </div>

          {subs.length > 0 && (
            <>
              <div className="label">子分类</div>
              <div className="chips small category-grid">
                {subs.map((c) => (
                  <button key={c.id} aria-pressed={cid === c.id} className={'chip' + (cid === c.id ? ' on' : '')} onClick={() => setCid(c.id)}><CatIcon k={c.icon} size={16} />{c.name}</button>
                ))}
              </div>
            </>
          )}

          <div className="row2">
            <div>
              <div className="label">账户</div>
              <select aria-label="记账账户" value={aid} onChange={(e) => setAid(Number(e.target.value))}>
                <option value={0}>{assets.length ? '请选择账户' : '请先添加账户'}</option>
                {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}（{accountMoney(a.assetNumber, a.currency, currencies, defaultCurrency)}）</option>)}
              </select>
            </div>
            <div>
              <div className="label">时间</div>
              <input aria-label="记账时间" type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
        </>
      )}

      <div className="label">备注</div>
      <div className="row">
        <input className="grow" aria-label="备注" value={remark} onChange={(e) => {
          const v = e.target.value
          setRemark(v)
          // 智能分类：关键词命中时自动切到对应分类（人工后续修改优先）
          const hit = aiTypeRules.find((r) => r.keywords.some((k) => k && v.includes(k)))
          if (hit) { setPid(hit.categoryId); setCid(0) }
        }} placeholder="写点什么（可留空）" />
        <button type="button" className="ghost" onClick={() => speech.listening ? speech.stop() : speech.start()}>
          {speech.listening ? '停止' : '语音'}
        </button>
      </div>
      {speech.unsupported && <p className="hint">当前浏览器不支持语音识别。</p>}

      {mode !== 'transfer' && (
        <div className="entry-attrs">
          <label>
            <input type="checkbox" checked={notIntoTotal} onChange={(e) => setNotIntoTotal(e.target.checked)} />
            不计收支
          </label>
          <label>
            <input type="checkbox" checked={notIntoBudget} onChange={(e) => setNotIntoBudget(e.target.checked)} />
            不计预算
          </label>
        </div>
      )}
      {mode === 'debt' && (
        <div className="debt-box">
          <div className="label">债务类型</div>
          <div className="seg">
            {([1, 3, 2, 4] as const).map((t) => (
              <button key={t} type="button" className={debtType === t ? 'on' : ''} onClick={() => setDebtType(t)}>
                {t === 1 ? '资金借出' : t === 3 ? '资金借入' : t === 2 ? '收款' : '还款'}
              </button>
            ))}
          </div>
          <div className="label">债务</div>
          <input aria-label="债务" value={counterparty} placeholder="对方名称" onChange={(e) => setCounterparty(e.target.value)} />
        </div>
      )}

      {mode === 'transfer' && (
        <button className="ghost wide" onClick={() => {
          const v = evaluateAmount(cost) ?? 0
          if (!(v > 0) || !aid || !toAid) return notify('先把金额、转出和转入账户填好')
          addTemplate({
            name: `${assets.find((a) => a.assetId === aid)?.assetName ?? '转出'} → ${assets.find((a) => a.assetId === toAid)?.assetName ?? '转入'}`,
            mode: 'transfer',
            transfer: { fromAssetId: aid, toAssetId: toAid, cost: v, serviceCharge: Number(fee) || 0, remark }
          })
          notify('已存为转账模板')
        }}>存为转账模板</button>
      )}
      {mode !== 'transfer' && (
        <button className="ghost wide" onClick={saveTemplate}>存为模板</button>
      )}
      <button className="primary" disabled={readOnly} onClick={() => { submit() }}>{mode === 'transfer' ? '确认转账' : '记一笔'}</button>
    </section>
  )
}
