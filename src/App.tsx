import { useEffect, useMemo, useState } from 'react'
import { useLedger, useTotalAssets } from './store'
import { ASSET_TYPE, BILL_TYPE, LEND_TYPE } from './types'
import type { Cycle } from './types'
import type { Asset, Bill, Transfer } from './types'
import { api } from './api'
import type { ImportPlan } from './importer'
import { adoptAnonymousData, auth, books as bookApi, setCurrentUid, type BookInfo, type User } from './auth'
import { syncNow } from './sync'
import { currencySymbol, findCurrency, toBase } from './money'

const money = (n: number) => '¥' + (n < 0 ? '-' : '') + Math.abs(n).toFixed(2)
const pad = (n: number) => String(n).padStart(2, '0')
const monthOf = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
const dayOf = (t: number) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
const hhmm = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const toLocalInput = (t: number) => {
  const d = new Date(t - new Date().getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

type Tab = 'add' | 'bills' | 'assets' | 'stats' | 'settings'

const iconGroup = (k: string) =>
  k.startsWith('ic_parent_') ? 'parent'
    : (k.startsWith('ic_income_') || k.startsWith('ic_other_') || k.startsWith('ic_r_')) ? 'income'
      : 'child'

/** 分类图标：用 CSS mask 上色，跟随 currentColor */
function CatIcon({ k, size = 18 }: { k?: string; size?: number }) {
  if (!k) return null
  const url = `/icons/categories/${iconGroup(k)}/${k}.svg`
  return (
    <span
      className="cat-ico"
      style={{ width: size, height: size, WebkitMaskImage: `url(${url})`, maskImage: `url(${url})` } as React.CSSProperties}
    />
  )
}

/** 账户类型 → 账户图标（6–9 为近似映射） */
const ASSET_ICON: Record<number, string> = {
  1: 'ic_asset_wallet', 2: 'ic_asset_credit_card', 3: 'ic_asset_savings_card',
  4: 'ic_asset_investment', 5: 'ic_asset_default', 6: 'ic_asset_deposit',
  7: 'ic_asset_cash', 8: 'ic_asset_fixed_deposit', 9: 'ic_asset_insurance'
}
function AssetIcon({ type, size = 18 }: { type: number; size?: number }) {
  const k = ASSET_ICON[type] ?? 'ic_asset_default'
  return (
    <span
      className="asset-ico"
      style={{ width: size, height: size, WebkitMaskImage: `url(/icons/assets/${k}.svg)`, maskImage: `url(/icons/assets/${k}.svg)` } as React.CSSProperties}
    />
  )
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    auth.me().then(async (u) => {
      if (u) {
        setCurrentUid(u.id)
        adoptAnonymousData(u.id)
        await useLedger.persist.rehydrate()
        setUser(u)
        await loadBooks()
        autoSyncOnce()
      } else {
        setUser(null)
      }
    })
  }, [])

  // 打开应用时自动同步一次；失败不打扰用户，手动同步仍可用
  const autoSyncOnce = async () => {
    try {
      const r = await syncNow()
      console.log('[sync] 自动同步完成', r)
    } catch (e) {
      console.warn('[sync] 自动同步失败（可手动重试）', e)
    }
  }

  const loadBooks = async () => {
    try {
      const r = await bookApi.list()
      const list: BookInfo[] = r?.books ?? []
      const setBooks = useLedger.getState().setAccountBooks
      setBooks(list.map((b) => ({
        accountBookId: 0,
        accountBookName: b.name,
        userId: 0,
        createTime: 0,
        bookId: b.bookId,
        ownerId: b.ownerId,
        role: b.role
      })))
      if (list[0]) {
        // 老账单的 bookId 是数字，统一迁到服务端第一个账本
        useLedger.getState().migrateBookIds(list[0].bookId)
      }
      const cur = useLedger.getState().currentBookId
      const match = list.find((b) => b.bookId === localStorage.getItem('xm-current-book'))
      if (match) useLedger.getState().setBook(match.bookId as any)
      else if (list[0]) useLedger.getState().setBook(list[0].bookId as any)
      else if (!cur) useLedger.getState().setBook(0)
    } catch (e) {
      console.warn('[books] 加载失败', e)
    }
  }

  const afterAuth = async (u: User) => {
    setCurrentUid(u.id)
    adoptAnonymousData(u.id)
    await useLedger.persist.rehydrate()
    setUser(u)
    await loadBooks()
    autoSyncOnce()
  }

  const logout = async () => {
    try { await auth.logout() } catch { /* 忽略 */ }
    setCurrentUid(0)
    await useLedger.persist.rehydrate()
    setUser(null)
  }

  if (user === undefined) return <div className="boot">加载中…</div>
  if (user === null) return <AuthScreen onAuthed={afterAuth} />
  return <Shell user={user} onLogout={logout} />
}

function AuthScreen({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    if (!email.trim()) return setErr('请输入邮箱')
    if (pw.length < 8) return setErr('密码至少 8 位')
    if (mode === 'register' && pw !== pw2) return setErr('两次密码不一致')
    setBusy(true)
    try {
      const r = mode === 'login' ? await auth.login(email.trim(), pw) : await auth.register(email.trim(), pw)
      onAuthed(r.user)
    } catch (e: any) {
      setErr(e?.message || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/icons/brand/logo-mark.svg" alt="小满记账" />
          <div>
            <strong>小满记账</strong>
            <small>小有盈余，日子清楚</small>
          </div>
        </div>

        <div className="seg">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setErr('') }}>登录</button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setErr('') }}>注册</button>
        </div>

        <div className="label">邮箱</div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        <div className="label">密码</div>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          placeholder="至少 8 位" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {mode === 'register' && (
          <>
            <div className="label">确认密码</div>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="再输一次" autoComplete="new-password" />
          </>
        )}

        {err && <p className="warn">{err}</p>}

        <button className="primary" onClick={submit} disabled={busy}>{busy ? '处理中…' : (mode === 'login' ? '登录' : '注册并登录')}</button>
        <p className="hint">只支持邮箱注册，不接手机号和第三方登录。数据存在你自己的账号下。</p>
      </div>
    </div>
  )
}

function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('add')
  const mergeTaxonomy = useLedger((s) => s.mergeTaxonomy)

  const runCycles = useLedger((s) => s.runCycles)

  // 启动时补齐内置分类（幂等，不动用户已有分类）
  useEffect(() => { mergeTaxonomy() }, [mergeTaxonomy])
  // 启动时补生成到期的周期账单（幂等：同一月份只生成一次）
  useEffect(() => { runCycles() }, [runCycles])
  const [toast, setToast] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2200)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="logo-img" src="/icons/brand/logo-mark.svg" alt="小满记账" />
          <div>
            <strong>小满记账</strong>
            <small>小有盈余，日子清楚</small>
          </div>
        </div>
        <div className="userbox">
          <BookSwitch />
          <span className="uemail" title={user.email}>{user.email}</span>
          <button className="ghost tiny" onClick={onLogout}>退出</button>
        </div>
      </header>

      <nav className="nav">
        {([['add', '记账'], ['bills', '账单'], ['assets', '资产'], ['stats', '统计'], ['settings', '设置']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      <main className="main">
        {tab === 'add' && <AddBill notify={notify} />}
        {tab === 'bills' && <Bills me={user} />}
        {tab === 'assets' && <Assets notify={notify} />}
        {tab === 'stats' && <Stats />}
        {tab === 'settings' && <Settings notify={notify} />}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

const ROLE_LABEL: Record<string, string> = { silent: '静默', peer: '同伴', admin: '管理' }

function BookSwitch() {
  const books = useLedger((s) => s.accountBooks)
  const current = useLedger((s) => s.currentBookId)
  const setBook = useLedger((s) => s.setBook)
  const keyOf = (b: any) => String(b.bookId ?? b.accountBookId)
  return (
    <select
      value={String(current)}
      onChange={(e) => {
        const v = e.target.value
        localStorage.setItem('xm-current-book', v)
        setBook(/^\d+$/.test(v) ? Number(v) : v)
      }}
      className="book">
      <option value="0">全部账本</option>
      {books.map((b) => {
        const k = keyOf(b)
        const shared = b.role && b.role !== 'admin' || (b.ownerId && b.ownerId !== 0 && b.role)
        return (
          <option key={k} value={k}>
            {b.accountBookName}{b.role ? ` · ${ROLE_LABEL[b.role] ?? b.role}` : ''}
          </option>
        )
      })}
    </select>
  )
}

function AddBill({ notify }: { notify: (m: string) => void }) {
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

    if (mode === 'transfer') {
      if (!aid || !toAid) return notify('请选择转出和转入账户')
      if (aid === toAid) return notify('转出和转入不能是同一个账户')
      const f = Number(fee) || 0
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
                {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}（{money(a.assetNumber)}）</option>)}
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
                {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}（{money(a.assetNumber)}）</option>)}
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

function Bills({ me }: { me?: { id: number; email: string } }) {
  const bills = useLedger((s) => s.bills)
  const transfers = useLedger((s) => s.transfers)
  const parents = useLedger((s) => s.parentCategories)
  const assets = useLedger((s) => s.assets)
  const del = useLedger((s) => s.deleteBill)
  const delTransfer = useLedger((s) => s.deleteTransfer)
  const updateBill = useLedger((s) => s.updateBill)
  const reimbursements = useLedger((s) => s.reimbursements)
  const refunds = useLedger((s) => s.refunds)
  const currentBookId = useLedger((s) => s.currentBookId)
  const tags = useLedger((s) => s.tags)
  const tagsByName = useMemo(() => new Map(tags.map((t) => [t.name, t])), [tags])
  const accountBooks = useLedger((s) => s.accountBooks)
  const myRole = accountBooks.find((b) => b.bookId && String(b.bookId) === String(currentBookId))?.role
  const readOnly = myRole === 'silent'
  const updateTransfer = useLedger((s) => s.updateTransfer)
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null)

  const [month, setMonth] = useState(monthOf(Date.now()))
  const [kw, setKw] = useState('')
  const [fPid, setFPid] = useState(0)
  const [fAid, setFAid] = useState(0)
  const [editing, setEditing] = useState<Bill | null>(null)
  const [detail, setDetail] = useState<Bill | null>(null)

  const nameOf = (pid: number) => parents.find((p) => p.id === pid)?.name ?? ''
  const isIncome = (pid: number) => parents.find((p) => p.id === pid)?.kind === 'income'

  const match = (b: Bill) => {
    if (monthOf(b.time) !== month) return false
    if (currentBookId !== 0 && b.bookId !== currentBookId) return false
    if (fPid && b.parentCategoryId !== fPid) return false
    if (fAid && b.assetId !== fAid) return false
    if (kw) {
      const hay = (b.remark || '') + ' ' + nameOf(b.parentCategoryId) + ' ' + (b.tags || []).join(' ')
      if (!hay.toLowerCase().includes(kw.toLowerCase())) return false
    }
    return true
  }

  const list = useMemo(() => bills.filter(match).sort((a, b) => b.time - a.time), [bills, month, kw, fPid, fAid, parents, currentBookId])

  const tList = useMemo(() => transfers.filter((t) => {
    if (monthOf(t.time) !== month) return false
    if (fAid && t.fromAssetId !== fAid && t.toAssetId !== fAid) return false
    if (fPid) return false
    if (kw) {
      const hay = (t.remark || '') + ' 转账'
      if (!hay.toLowerCase().includes(kw.toLowerCase())) return false
    }
    return true
  }), [transfers, month, kw, fPid, fAid])

  const income = list.filter((b) => isIncome(b.parentCategoryId)).reduce((s, b) => s + b.cost, 0)
  const expense = list.filter((b) => !isIncome(b.parentCategoryId)).reduce((s, b) => s + b.cost, 0)

  type Item = { kind: 'bill'; time: number; b: Bill } | { kind: 'transfer'; time: number; t: typeof transfers[number] }
  const groups = useMemo(() => {
    const all: Item[] = [
      ...list.map((b) => ({ kind: 'bill' as const, time: b.time, b })),
      ...tList.map((t) => ({ kind: 'transfer' as const, time: t.time, t }))
    ].sort((x, y) => y.time - x.time)
    const m = new Map<string, Item[]>()
    all.forEach((it) => {
      const k = dayOf(it.time)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(it)
    })
    return [...m.entries()]
  }, [list, tList])

  return (
    <section className="card">
      <div className="row2">
        <div>
          <div className="label">月份</div>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="summary">
          <div><small>收入</small><b className="in">{money(income)}</b></div>
          <div><small>支出</small><b className="out">{money(expense)}</b></div>
          <div><small>结余</small><b>{money(income - expense)}</b></div>
        </div>
      </div>

      <div className="filters">
        <input className="kw" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索备注 / 分类 / 标签" />
        <select value={fPid} onChange={(e) => setFPid(Number(e.target.value))}>
          <option value={0}>全部分类</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={fAid} onChange={(e) => setFAid(Number(e.target.value))}>
          <option value={0}>全部账户</option>
          {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
        </select>
        {Boolean(kw || fPid || fAid) && <button className="ghost" onClick={() => { setKw(''); setFPid(0); setFAid(0) }}>重置</button>}
      </div>

      {groups.length === 0 && <p className="empty">没有符合条件的账单</p>}

      {groups.map(([day, rows]) => (
        <div key={day} className="group">
          <div className="day">{day}</div>
          {rows.map((it) => {
            if (it.kind === 'transfer') {
              const t = it.t
              const from = assets.find((a) => a.assetId === t.fromAssetId)
              const to = assets.find((a) => a.assetId === t.toAssetId)
              return (
                <div key={'t' + t.transferId} className="row">
                  <i className="dot arrow">⇄</i>
                  <div className="grow">
                    <div>转账 · {from?.assetName ?? '已删除账户'} → {to?.assetName ?? '已删除账户'}</div>
                    <small>
                      {hhmm(t.time)} · 不计收支
                      {t.serviceCharge > 0 ? ` · 手续费 ${money(t.serviceCharge)}` : ''}
                      {t.remark ? ` · ${t.remark}` : ''}
                    </small>
                  </div>
                  <b className="neutral">{money(t.cost)}</b>
                  <button className="link" onClick={() => setEditingTransfer(t)}>改</button>
                  <button className="del" onClick={() => delTransfer(t.transferId)}>删</button>
                </div>
              )
            }
            const b = it.b
            const p = parents.find((x) => x.id === b.parentCategoryId)
            const a = assets.find((x) => x.assetId === b.assetId)
            const inc = p?.kind === 'income'
            return (
              <div key={b.billId} className="row">
                <span className="dot-badge" style={{ background: p?.bg ?? '#F1EDE4', color: p?.color ?? '#7A5A3C' }}>
                  <CatIcon k={p?.icon} size={16} />
                </span>
                <div className="grow">
                  <div>{p?.name ?? '未分类'}{b.remark ? <span className="remark"> · {b.remark}</span> : null}</div>
                  <small>
                    {a?.assetName ?? '无账户'} · {hhmm(b.time)} · {BILL_TYPE[b.billType]}
                    {b.notIntoTotal ? ' · 不计收支' : ''}
                    {b.notIntoBudget ? ' · 不计预算' : ''}
                    {b.currencyInfo && b.currencyAssetNumber
                      ? ` · ${b.currencyInfo} ${b.currencyAssetNumber.toFixed(2)}`
                      : (b.currencyInfo ? ' · ' + b.currencyInfo : '')}
                    {b.files?.length ? ` · ${b.files.length} 个附件` : ''}
                  </small>
                  {(reimbursements.some((r) => r.billId === b.billId) || (b.refundNum ?? 0) > 0) && (
                    <div className="tags">
                      {reimbursements.filter((r) => r.billId === b.billId).map((r) => (
                        <span key={r.reimbursementId} className={'tag' + (r.status === 'done' ? ' ok' : '')}>
                          报销 {money(r.number)} · {r.status === 'done' ? '已到账' : '待报销'}
                        </span>
                      ))}
                      {(b.refundNum ?? 0) > 0 && <span className="tag">已退 {money(b.refundNum!)}</span>}
                      {(b.tags || []).map((name) => {
                        const t = tagsByName.get(name)
                        return <span key={name} className="tag" style={t ? { background: t.color, color: '#4a2f16' } : undefined}>{name}</span>
                      })}
                    </div>
                  )}
                </div>
                <b className={inc ? 'in' : 'out'}>{inc ? '+' : '-'}{money(b.cost)}</b>
                <button className="link" onClick={() => setDetail(b)}>明细</button>
                {!readOnly && <button className="link" onClick={() => setEditing(b)}>改</button>}
                {!readOnly && <button className="del" onClick={() => del(b.billId)}>删</button>}
              </div>
            )
          })}
        </div>
      ))}

      {detail && (
        <BillDetail
          bill={detail}
          me={me}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null) }}
        />
      )}

      {editingTransfer && (
        <TransferEditor
          transfer={editingTransfer}
          onClose={() => setEditingTransfer(null)}
          onSave={(patch) => { updateTransfer(editingTransfer.transferId, patch); setEditingTransfer(null) }}
        />
      )}

      {editing && (
        <EditBill bill={editing} onClose={() => setEditing(null)} onSave={(patch) => {
          updateBill(editing.billId, patch)
          setEditing(null)
        }} />
      )}
    </section>
  )
}

function BillDetail({ bill, me, onClose, onEdit }: {
  bill: Bill; me?: { id: number; email: string }
  onClose: () => void; onEdit: () => void
}) {
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const assets = useLedger((s) => s.assets)
  const books = useLedger((s) => s.accountBooks)
  const tags = useLedger((s) => s.tags)
  const updateBill = useLedger((s) => s.updateBill)
  const del = useLedger((s) => s.deleteBill)

  const p = parents.find((x) => x.id === bill.parentCategoryId)
  const c = children.find((x) => x.id === bill.childCategoryId)
  const a = assets.find((x) => x.assetId === bill.assetId)
  const bk = books.find((b) => String(b.bookId ?? b.accountBookId) === String(bill.bookId))
  const isIncome = p?.kind === 'income'
  const tagColor = (name: string) => tags.find((t) => t.name === name)?.color
  const [memberMap, setMemberMap] = useState<Record<number, string>>({})
  useEffect(() => {
    bookApi.members(String(bill.bookId)).then((r) => {
      const m: Record<number, string> = {}
      for (const x of r.members ?? []) m[x.userId] = x.email
      setMemberMap(m)
    }).catch(() => {})
  }, [bill.bookId])

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="drow"><span className="dl">{label}</span><span className="dv">{children}</span></div>
  )
  const Toggle = ({ label, on }: { label: string; on: boolean }) => (
    <div className="drow">
      <span className="dl">{label}</span>
      <button className={'switch' + (on ? ' on' : '')} onClick={() => updateBill(bill.billId, { [label === '不计入收支' ? 'notIntoTotal' : 'notIntoBudget']: !on } as any)}>
        <i />
      </button>
    </div>
  )

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal detail" onClick={(e) => e.stopPropagation()}>
        <div className="dhead" style={{ background: p?.bg ?? 'var(--accent-soft)', color: p?.color ?? 'var(--ink)' }}>
          <CatIcon k={p?.icon} size={34} />
          <div className="grow">
            <div className="dt">{p?.name}{c ? ` - ${c.name}` : ''}</div>
            <div className="ds">{dayOf(bill.time)} {hhmm(bill.time)}</div>
            {bill.remark && <div className="ds">{bill.remark}</div>}
          </div>
          <div className="damt">{isIncome ? '+' : '-'}{money(bill.cost)}</div>
        </div>

        <Row label="账单分类">{p?.name}{c ? ` - ${c.name}` : ''}</Row>
        <Row label="账单日期">{dayOf(bill.time)} {hhmm(bill.time)}</Row>
        <Row label="收支账户">{a?.assetName ?? '无'}</Row>
        <Row label="备注">{bill.remark || '无'}</Row>
        <Row label="标签">
          {(bill.tags && bill.tags.length)
            ? bill.tags.map((t) => (
              <span key={t} className="tag" style={{ background: tagColor(t) ?? undefined, color: '#4a2f16' }}>{t}</span>
            ))
            : '无'}
        </Row>
        <Row label="附件">{bill.files && bill.files.length ? `${bill.files.length} 个` : '无'}</Row>
        <Toggle label="不计入收支" on={!!bill.notIntoTotal} />
        <Toggle label="不计入预算" on={!!bill.notIntoBudget} />
        <Row label="所属账本">{bk?.accountBookName ?? '默认账本'}</Row>
        <Row label="记录时间">{dayOf(bill.recordTime ?? bill.time)} {hhmm(bill.recordTime ?? bill.time)}</Row>
        <Row label="记录方式">{BILL_TYPE[bill.billType] ?? '手动记账'}</Row>
        {bill.currencyInfo && (
          <Row label="币种">
            {bill.currencyInfo}{bill.currencyAssetNumber ? ` ${bill.currencyAssetNumber.toFixed(2)}` : ''}
          </Row>
        )}
        <Row label="记账人">
          {bill.ownerId == null || bill.ownerId === me?.id
            ? `${me?.email ?? '我'}（我）`
            : (memberMap[bill.ownerId] ?? `用户 #${bill.ownerId}`)}
        </Row>

        <div className="modal-btns">
          <button className="ghost" onClick={onClose}>关闭</button>
          <button className="ghost" onClick={() => { del(bill.billId); onClose() }}>删除</button>
          <button className="primary" onClick={onEdit}>编辑</button>
        </div>
      </div>
    </div>
  )
}

function EditBill({ bill, onClose, onSave }: { bill: Bill; onClose: () => void; onSave: (p: Partial<Bill>) => void }) {
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const assets = useLedger((s) => s.assets)
  const reimbursements = useLedger((s) => s.reimbursements)
  const refunds = useLedger((s) => s.refunds)
  const currentBookId = useLedger((s) => s.currentBookId)
  const tags = useLedger((s) => s.tags)
  const tagsByName = useMemo(() => new Map(tags.map((t) => [t.name, t])), [tags])
  const accountBooks = useLedger((s) => s.accountBooks)
  const myRole = accountBooks.find((b) => b.bookId && String(b.bookId) === String(currentBookId))?.role
  const readOnly = myRole === 'silent'
  const updateTransfer = useLedger((s) => s.updateTransfer)
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null)
  const addReimbursement = useLedger((s) => s.addReimbursement)
  const settleReimbursement = useLedger((s) => s.settleReimbursement)
  const deleteReimbursement = useLedger((s) => s.deleteReimbursement)
  const addRefund = useLedger((s) => s.addRefund)
  const deleteRefund = useLedger((s) => s.deleteRefund)

  const myReimb = reimbursements.find((r) => r.billId === bill.billId)
  const myRefund = refunds.find((r) => r.billId === bill.billId)
  const [rAsset, setRAsset] = useState(assets[0]?.assetId ?? 0)
  const [rAmount, setRAmount] = useState(String(bill.cost))
  const [fAmount, setFAmount] = useState('')
  const isExpense = parents.find((p) => p.id === bill.parentCategoryId)?.kind !== 'income'

  const [cost, setCost] = useState(String(bill.cost))
  const [pid, setPid] = useState(bill.parentCategoryId)
  const [cid, setCid] = useState(bill.childCategoryId)
  const [aid, setAid] = useState(bill.assetId)
  const [remark, setRemark] = useState(bill.remark)
  const [time, setTime] = useState(toLocalInput(bill.time))

  const subs = children.filter((c) => c.parentId === pid)

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>修改账单</h3>
        <div className="label">金额</div>
        <input
          value={cost}
          autoFocus

          onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
        />
        <div className="label">分类</div>
        <select value={pid} onChange={(e) => { setPid(Number(e.target.value)); setCid(0) }}>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {subs.length > 0 && (
          <>
            <div className="label">子分类</div>
            <select value={cid} onChange={(e) => setCid(Number(e.target.value))}>
              <option value={0}>不选</option>
              {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
        <div className="label">账户</div>
        <select value={aid} onChange={(e) => setAid(Number(e.target.value))}>
          {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
        </select>
        <div className="label">时间</div>
        <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
        <div className="label">备注</div>
        <input value={remark} onChange={(e) => setRemark(e.target.value)} />
        {isExpense && (
          <>
            <div className="label">报销</div>
            {myReimb ? (
              <div className="attach-line">
                <span>
                  {myReimb.status === 'done' ? '✅ 已到账' : '⏳ 待报销'} {money(myReimb.number)}
                  {myReimb.assetId ? ' → ' + (assets.find((a) => a.assetId === myReimb.assetId)?.assetName ?? '报销账户') : ''}
                </span>
                {myReimb.status !== 'done' && (
                  <button className="link" onClick={() => settleReimbursement(myReimb.reimbursementId)}>确认到账</button>
                )}
                <button className="del" onClick={() => deleteReimbursement(myReimb.reimbursementId)}>撤销</button>
              </div>
            ) : (
              <div className="row2">
                <select value={rAsset} onChange={(e) => setRAsset(Number(e.target.value))}>
                  <option value={0}>报销进哪个账户</option>
                  {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
                </select>
                <input value={rAmount} onChange={(e) => setRAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="报销金额" inputMode="decimal" />
              </div>
            )}
            {!myReimb && (
              <button className="ghost wide" onClick={() => addReimbursement({
                billId: bill.billId, assetId: rAsset, number: Number(rAmount) || 0, detail: remark
              })}>登记报销（钱到账后再确认）</button>
            )}

            <div className="label">退款</div>
            {myRefund ? (
              <div className="attach-line">
                <span>已退 {money(myRefund.number)}（已退回 {assets.find((a) => a.assetId === bill.assetId)?.assetName ?? '账户'}）</span>
                <button className="del" onClick={() => deleteRefund(myRefund.refundId)}>撤销</button>
              </div>
            ) : (
              <div className="row2">
                <input value={fAmount} onChange={(e) => setFAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="退款金额" inputMode="decimal" />
                <button className="ghost" onClick={() => { addRefund({ billId: bill.billId, number: Number(fAmount) || 0 }); setFAmount('') }}>登记退款</button>
              </div>
            )}
          </>
        )}

        <div className="modal-btns">
          <button className="ghost" onClick={onClose}>取消</button>
          <button className="primary" onClick={() => onSave({
            cost: Number(cost) || bill.cost,
            parentCategoryId: pid,
            childCategoryId: cid,
            assetId: aid,
            remark,
            time: new Date(time).getTime()
          })}>保存</button>
        </div>
      </div>
    </div>
  )
}

/** 汇率输入：内部保留草稿，失焦或回车才提交，输入过程不会写坏数据 */
function RateInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    if (Number.isFinite(n) && n > 0) onCommit(n)
    setDraft(null)
  }
  return (
    <input
      className="rate"
      inputMode="decimal"
      value={draft ?? String(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { commit(); (e.currentTarget as HTMLInputElement).blur() } }}
    />
  )
}

/** 把周期规则翻译成一句人话 */
function describeCycle(c: Cycle): string {
  const t = c.cycleType ?? 'month'
  if (t === 'week') {
    const names = ['日', '一', '二', '三', '四', '五', '六']
    const days = (c.weekdays && c.weekdays.length ? c.weekdays : [1]).map((d) => '周' + names[d]).join('、')
    return `每${days}`
  }
  if (t === 'year') {
    return `每年 ${c.monthOfYear ?? 1} 月 ${c.dayOfMonth} 日`
  }
  if (c.monthLast && !(c.monthDays && c.monthDays.length)) return '每月最后一天'
  const days = c.monthDays && c.monthDays.length ? c.monthDays : [c.dayOfMonth]
  return `每月 ${days.join('、')} 日`
}

function Assets({ notify }: { notify: (m: string) => void }) {
  const assets = useLedger((s) => s.assets)
  const total = useTotalAssets()
  const addAsset = useLedger((s) => s.addAsset)
  const updateAsset = useLedger((s) => s.updateAsset)
  const lends = useLedger((s) => s.lends)
  const addLend = useLedger((s) => s.addLend)
  const deleteLend = useLedger((s) => s.deleteLend)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [lendForm, setLendForm] = useState<{ type: 1 | 2 | 3 | 4; assetId: number; counterparty: string; number: string; interest: string; repaymentAssetId: number; remark: string } | null>(null)
  const receivable = lends.filter((l) => l.type === 1).reduce((s, l) => s + l.number + (l.interest ?? 0), 0)
    - lends.filter((l) => l.type === 2).reduce((s, l) => s + l.number, 0)
  const payable = lends.filter((l) => l.type === 3).reduce((s, l) => s + l.number + (l.interest ?? 0), 0)
    - lends.filter((l) => l.type === 4).reduce((s, l) => s + l.number, 0)

  const [name, setName] = useState('')
  const [type, setType] = useState(1)
  const [num, setNum] = useState('')

  const create = () => {
    if (!name.trim()) return notify('请输入账户名')
    addAsset({ assetName: name.trim(), assetType: type, assetNumber: Number(num) || 0 })
    setName(''); setNum('')
    notify('账户已添加')
  }

  const debts = assets.filter((a) => a.assetType === 2 || a.assetType === 7 || a.assetType === 8).reduce((s, a) => s + a.assetNumber, 0)

  return (
    <section className="card">
      <div className="totalbox">
        <small>净资产</small>
        <strong>{money(total)}</strong>
        <span>负资产 {money(debts)}</span>
      </div>

      <p className="hint">余额会随记账自动变动；点右侧「改」可填入实际余额（迁移后建议先对一次账）。</p>

      {assets.map((a) => (
        <div key={a.assetId} className="row">
          <span className="asset-badge"><AssetIcon type={a.assetType} size={16} /></span>
          <div className="grow">
            <div>
              {a.assetName}
              {a.cardCode && <span className="tag">尾号 {a.cardCode}</span>}
            </div>
            <small>{ASSET_TYPE[a.assetType]}{a.groupName ? ' · ' + a.groupName : ''}</small>
          </div>
          <b className={a.assetNumber < 0 ? 'out' : ''}>{money(a.assetNumber)}</b>
          <button className="link" onClick={() => setEditingAsset(a)}>改</button>
        </div>
      ))}

      {editingAsset && (
        <AssetEditor
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onSave={(next) => { updateAsset(next); setEditingAsset(null); notify('账户已更新') }}
        />
      )}

      <h3>借入借出</h3>
      {(receivable !== 0 || payable !== 0) && (
        <p className="hint">待收回 {money(receivable)} · 待归还 {money(payable)}</p>
      )}
      {lends.length === 0 && <p className="hint">还没有借贷记录。</p>}
      {lends.slice(0, 8).map((l) => (
        <div key={l.lendId} className="row">
          <div className="grow">
            <div>{LEND_TYPE[l.type]} · {l.counterparty || '未填对方'}</div>
            <small>
              {assets.find((a) => a.assetId === l.assetId)?.assetName ?? '账户'} · {dayOf(l.time)}
              {l.interest ? ` · 利息 ${money(l.interest)}` : ''}
              {l.remark ? ' · ' + l.remark : ''}
            </small>
          </div>
          <b className={l.type === 2 || l.type === 4 ? 'neutral' : ''}>{money(l.number)}</b>
          <button className="del" onClick={() => deleteLend(l.lendId)}>删</button>
        </div>
      ))}
      <button className="ghost wide" onClick={() => setLendForm({
        type: 1, assetId: assets[0]?.assetId ?? 0, counterparty: '', number: '',
        interest: '', repaymentAssetId: 0, remark: ''
      })}>记一笔借贷</button>

      {lendForm && (
        <div className="modal-mask" onClick={() => setLendForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>借入借出</h3>
            <div className="label">类型</div>
            <select value={lendForm.type} onChange={(e) => setLendForm({ ...lendForm, type: Number(e.target.value) as any })}>
              {Object.entries(LEND_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="label">对方</div>
            <input value={lendForm.counterparty} onChange={(e) => setLendForm({ ...lendForm, counterparty: e.target.value })} placeholder="借给谁 / 向谁借" />
            <div className="label">金额</div>
            <input value={lendForm.number} autoFocus inputMode="decimal"
              onChange={(e) => setLendForm({ ...lendForm, number: e.target.value.replace(/[^\d.]/g, '') })} />
            <div className="row2">
              <div>
                <div className="label">利息（可选）</div>
                <input value={lendForm.interest} inputMode="decimal"
                  onChange={(e) => setLendForm({ ...lendForm, interest: e.target.value.replace(/[^\d.]/g, '') })} />
              </div>
              <div>
                <div className="label">
                  {lendForm.type === 2 || lendForm.type === 4 ? '收款账户' : '资金账户'}
                </div>
                <select
                  value={lendForm.repaymentAssetId || lendForm.assetId}
                  onChange={(e) => setLendForm({
                    ...lendForm,
                    ...(lendForm.type === 2 || lendForm.type === 4
                      ? { repaymentAssetId: Number(e.target.value) }
                      : { assetId: Number(e.target.value) })
                  })}>
                  {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
                </select>
              </div>
            </div>
            <div className="label">备注</div>
            <input value={lendForm.remark} onChange={(e) => setLendForm({ ...lendForm, remark: e.target.value })} />
            <p className="hint">借出减少账户余额，收回与借入增加，归还减少；不计入收支。</p>
            <div className="modal-btns">
              <button className="ghost" onClick={() => setLendForm(null)}>取消</button>
              <button className="primary" onClick={() => {
                addLend({
                  type: lendForm.type, assetId: lendForm.assetId,
                  counterparty: lendForm.counterparty, number: Number(lendForm.number) || 0,
                  interest: Number(lendForm.interest) || 0,
                  repaymentAssetId: lendForm.repaymentAssetId || undefined,
                  remark: lendForm.remark
                })
                setLendForm(null)
              }}>保存</button>
            </div>
          </div>
        </div>
      )}

      <div className="label">新增账户</div>
      <div className="row2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="账户名" />
        <select value={type} onChange={(e) => setType(Number(e.target.value))}>
          {Object.entries(ASSET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="row2">
        <input value={num} onChange={(e) => setNum(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="余额（信用卡填负数）" />
        <button onClick={create}>添加</button>
      </div>
    </section>
  )
}

function TransferEditor({ transfer, onClose, onSave }: {
  transfer: Transfer; onClose: () => void
  onSave: (p: { fromAssetId: number; toAssetId: number; cost: number; toCost: number; serviceCharge: number; remark: string; time: number }) => void
}) {
  const assets = useLedger((s) => s.assets)
  const [from, setFrom] = useState(transfer.fromAssetId)
  const [to, setTo] = useState(transfer.toAssetId)
  const [cost, setCost] = useState(String(transfer.cost))
  const [fee, setFee] = useState(String(transfer.serviceCharge))
  const [toCost, setToCost] = useState(String(transfer.toCost ?? transfer.cost))
  const [remark, setRemark] = useState(transfer.remark)
  const [time, setTime] = useState(toLocalInput(transfer.time))

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>修改转账</h3>
        <div className="row2">
          <div>
            <div className="label">转出账户</div>
            <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
            </select>
          </div>
          <div>
            <div className="label">转入账户</div>
            <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
            </select>
          </div>
        </div>
        <div className="row2">
          <div>
            <div className="label">金额</div>
            <input value={cost} autoFocus inputMode="decimal"
              onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          <div>
            <div className="label">手续费</div>
            <input value={fee} inputMode="decimal"
              onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
        </div>
        <div className="label">到账金额</div>
        <input value={toCost} inputMode="decimal"
          onChange={(e) => setToCost(e.target.value.replace(/[^\d.]/g, ''))} />
        <div className="label">时间</div>
        <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
        <div className="label">备注</div>
        <input value={remark} onChange={(e) => setRemark(e.target.value)} />
        <p className="hint">保存会先撤销原转账（含手续费账单），再按新值重记。</p>
        <div className="modal-btns">
          <button className="ghost" onClick={onClose}>取消</button>
          <button className="primary" onClick={() => onSave({
            fromAssetId: from, toAssetId: to,
            cost: Number(cost) || 0,
            toCost: Number(toCost) || Number(cost) || 0,
            serviceCharge: Number(fee) || 0,
            remark, time: new Date(time).getTime()
          })}>保存</button>
        </div>
      </div>
    </div>
  )
}

function AssetEditor({ asset, onClose, onSave }: { asset: Asset; onClose: () => void; onSave: (a: Asset) => void }) {
  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const [currency, setCurrency] = useState(asset.currency ?? defaultCurrency)
  const [quota, setQuota] = useState(asset.totalQuota ? String(asset.totalQuota) : '')
  const [cardCode, setCardCode] = useState(asset.cardCode ?? '')
  const [name, setName] = useState(asset.assetName)
  const [type, setType] = useState(asset.assetType)
  // 留空＝保持原余额；填入即覆盖（避免把新值追加在旧值后面）
  const [num, setNum] = useState('')

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>编辑账户</h3>
        <div className="label">名称</div>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <div className="label">币种</div>
    <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
      {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
    </select>
    <div className="label">类型</div>
        <select value={type} onChange={(e) => setType(Number(e.target.value))}>
          {Object.entries(ASSET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="row2">
          <div>
            <div className="label">总额度（信用卡）</div>
            <input value={quota} inputMode="decimal" placeholder="可留空"
              onChange={(e) => setQuota(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          <div>
            <div className="label">卡号后四位</div>
            <input value={cardCode} placeholder="可留空" maxLength={4}
              onChange={(e) => setCardCode(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        <div className="label">设为实际余额（当前 {money(asset.assetNumber)}，信用卡填负数）</div>
        <input
          value={num}
          autoFocus
          placeholder="留空则保持不变"
          onChange={(e) => setNum(e.target.value.replace(/[^\d.-]/g, ''))}
          inputMode="decimal"
        />
        <div className="modal-btns">
          <button className="ghost" onClick={onClose}>取消</button>
          <button className="primary" onClick={() => onSave({
            ...asset,
            assetName: name.trim() || asset.assetName,
            assetType: type,
            assetNumber: num.trim() === '' ? asset.assetNumber : (Number(num) || 0)
          })}>保存</button>
        </div>
      </div>
    </div>
  )
}

function Stats() {
  const bills = useLedger((s) => s.bills)
  const parents = useLedger((s) => s.parentCategories)
  const budgets = useLedger((s) => s.budgets)
  const setBudget = useLedger((s) => s.setBudget)
  const removeBudget = useLedger((s) => s.removeBudget)
  const [month, setMonth] = useState(monthOf(Date.now()))
  const [editing, setEditing] = useState<{ categoryId: number; amount: string; addNum?: string; type?: 'month' | 'year' } | null>(null)

  const monthBills = useMemo(
    () => bills.filter((b) => monthOf(b.time) === month && parents.find((p) => p.id === b.parentCategoryId)?.kind !== 'income'),
    [bills, parents, month]
  )

  const rows = useMemo(() => {
    const m = new Map<number, number>()
    monthBills.forEach((b) => m.set(b.parentCategoryId, (m.get(b.parentCategoryId) ?? 0) + b.cost))
    return [...m.entries()]
      .map(([id, v]) => ({ p: parents.find((x) => x.id === id)!, v }))
      .sort((a, b) => b.v - a.v)
  }, [monthBills, parents])

  const max = rows[0]?.v ?? 1
  const total = rows.reduce((s, r) => s + r.v, 0)
  const spentOf = (cid: number) => cid === 0 ? total : (rows.find((r) => r.p.id === cid)?.v ?? 0)
  const limitOf = (b: { amount: number; addNum?: number }) => (b.amount ?? 0) + (b.addNum ?? 0)
  const monthBudgets = budgets.filter((b) => b.month === 'all' && (b.type ?? 'month') === 'month')
  const yearBudgets = budgets.filter((b) => b.month === 'all' && b.type === 'year')
  const totalBudget = limitOf(monthBudgets.find((b) => b.categoryId === 0) ?? { amount: 0 })
  const catBudgets = monthBudgets.filter((b) => b.categoryId !== 0)

  // 年度支出（当年）
  const yearSpend = useMemo(() => {
    const y = month.slice(0, 4)
    return bills.filter((b) => String(monthOf(b.time)).slice(0, 4) === y
      && parents.find((p) => p.id === b.parentCategoryId)?.kind !== 'income')
      .reduce((s, b) => s + b.cost, 0)
  }, [bills, parents, month])
  const totalYearBudget = limitOf(yearBudgets.find((b) => b.categoryId === 0) ?? { amount: 0 })

  return (
    <section className="card">
      <div className="label">月份</div>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />

      <div className="label">预算</div>
      {totalBudget > 0 ? (
        <div className="budget-box">
          <div className="budget-line">
            <span>本月总预算</span>
            <b>{money(spentOf(0))} / {money(totalBudget)}</b>
          </div>
          <div className="bar-track">
            <div className="bar" style={{
              width: `${Math.min(100, (spentOf(0) / totalBudget) * 100)}%`,
              background: spentOf(0) > totalBudget ? 'var(--out)' : 'var(--accent)'
            }} />
          </div>
          <div className="budget-foot">
            <span>剩余 {money(totalBudget - spentOf(0))}</span>
            <button className="link" onClick={() => setEditing({ categoryId: 0, amount: String(totalBudget) })}>调整</button>
          </div>
        </div>
      ) : (
        <button className="ghost wide" onClick={() => setEditing({ categoryId: 0, amount: '' })}>设置本月总预算</button>
      )}

      {totalYearBudget > 0 && (
        <div className="budget-box">
          <div className="budget-line">
            <span>本年总预算</span>
            <b>{money(yearSpend)} / {money(totalYearBudget)}</b>
          </div>
          <div className="bar-track">
            <div className="bar" style={{
              width: `${Math.min(100, (yearSpend / totalYearBudget) * 100)}%`,
              background: yearSpend > totalYearBudget ? 'var(--out)' : 'var(--accent)'
            }} />
          </div>
          <div className="budget-foot">
            <span>剩余 {money(totalYearBudget - yearSpend)}</span>
          </div>
        </div>
      )}

      {catBudgets.map((b) => {
        const p = parents.find((x) => x.id === b.categoryId)
        const used = spentOf(b.categoryId)
        return (
          <div key={b.categoryId} className="budget-box small">
            <div className="budget-line">
              <span><CatIcon k={p?.icon} size={14} /> {p?.name ?? '分类'}预算</span>
              <b>{money(used)} / {money(limitOf(b))}</b>
            </div>
            <div className="bar-track">
              <div className="bar" style={{
                width: `${Math.min(100, (used / Math.max(1, limitOf(b))) * 100)}%`,
                background: used > limitOf(b) ? 'var(--out)' : (p?.color === '#94a3b8' ? 'var(--accent)' : p?.color)
              }} />
            </div>
            <div className="budget-foot">
              <span>剩余 {money(limitOf(b) - used)}</span>
              <span>
                <button className="link" onClick={() => setEditing({ categoryId: b.categoryId, amount: String(b.amount) })}>调整</button>
                <button className="link" onClick={() => setEditing({ categoryId: b.categoryId, amount: String(b.amount), addNum: String(b.addNum ?? ''), type: b.type ?? 'month' })}>追加</button>
                <button className="del" onClick={() => removeBudget('all', b.categoryId)}>删</button>
              </span>
            </div>
          </div>
        )
      })}

      <button className="ghost wide" onClick={() => setEditing({ categoryId: catBudgets[0]?.categoryId ?? 1, amount: '' })}>
        添加分类预算
      </button>

      <div className="label">支出构成（合计 {money(total)}）</div>
      {rows.length === 0 && <p className="empty">暂无数据</p>}
      {rows.map((r) => (
        <div key={r.p.id} className="bar-row">
          <span className="bar-name"><CatIcon k={r.p.icon} size={15} /> {r.p.name}</span>
          <div className="bar-track">
            <div className="bar" style={{ width: `${(r.v / max) * 100}%`, background: r.p.color }} />
          </div>
          <span className="bar-val">{money(r.v)}</span>
          <span className="bar-pct">{((r.v / total) * 100).toFixed(0)}%</span>
        </div>
      ))}

      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>设置预算</h3>
            <div className="label">分类</div>
            <select value={editing.categoryId} onChange={(e) => setEditing({ ...editing, categoryId: Number(e.target.value) })}>
              <option value={0}>全部支出（总预算）</option>
              {parents.filter((p) => p.kind === 'expense').map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="label">周期</div>
            <select value={editing.type ?? 'month'}
              onChange={(e) => setEditing({ ...editing, type: e.target.value as 'month' | 'year' })}>
              <option value="month">按月</option>
              <option value="year">按年</option>
            </select>
            <div className="label">追加额度（可选）</div>
            <input value={editing.addNum ?? ''} inputMode="decimal" placeholder="在原额度上叠加"
              onChange={(e) => setEditing({ ...editing, addNum: e.target.value.replace(/[^\d.]/g, '') })} />
            <div className="label">基础额度</div>
            <input
              value={editing.amount}
              autoFocus
              placeholder="填 0 表示取消"
              onChange={(e) => setEditing({ ...editing, amount: e.target.value.replace(/[^\d.]/g, '') })}
              inputMode="decimal"
            />
            <p className="hint">预算按「每月固定」生效，不需要每月重设。</p>
            <div className="modal-btns">
              <button className="ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="primary" onClick={() => {
                setBudget({
                  month: 'all', categoryId: editing.categoryId,
                  amount: Number(editing.amount) || 0,
                  addNum: Number(editing.addNum) || 0,
                  type: editing.type ?? 'month'
                })
                setEditing(null)
              }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Settings({ notify, me }: { notify: (m: string) => void; me?: { id: number; email: string } }) {
  const seed = useLedger((s) => s.seed)
  const reset = useLedger((s) => s.reset)
  const exportAll = useLedger((s) => s.exportAll)
  const importAll = useLedger((s) => s.importAll)
  const applyImport = useLedger((s) => s.applyImport)
  const bills = useLedger((s) => s.bills)
  const assets = useLedger((s) => s.assets)
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const accountBooks = useLedger((s) => s.accountBooks)
  const reimbursements = useLedger((s) => s.reimbursements)
  const refunds = useLedger((s) => s.refunds)
  const currentBookId = useLedger((s) => s.currentBookId)
  const updateTransfer = useLedger((s) => s.updateTransfer)
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null)

  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState('')
  const [syncMsg, setSyncMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const setCurrencyRate = useLedger((s) => s.setCurrencyRate)
  const tags = useLedger((s) => s.tags)
  const addTag = useLedger((s) => s.addTag)
  const updateTag = useLedger((s) => s.updateTag)
  const deleteTag = useLedger((s) => s.deleteTag)
  const [newTag, setNewTag] = useState('')
  const setBook = useLedger((s) => s.setBook)
  const [members, setMembers] = useState<{ userId: number; role: string; email: string }[]>([])
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null)
  const currentBook = accountBooks.find((b) => b.bookId && String(b.bookId) === String(currentBookId))
  const reloadBooks = async () => {
    const r = await bookApi.list()
    useLedger.getState().setAccountBooks((r?.books ?? []).map((b: BookInfo) => ({
      accountBookId: 0, accountBookName: b.name, userId: 0, createTime: 0,
      bookId: b.bookId, ownerId: b.ownerId, role: b.role
    })))
  }
  useEffect(() => {
    if (!currentBook?.bookId) return
    bookApi.members(String(currentBook.bookId))
      .then((r) => setMembers(r.members))
      .catch(() => setMembers([]))
  }, [currentBook?.bookId])
  const lastSync = useLedger((s) => s.lastSync)
  const runSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const r = await syncNow()
      setSyncMsg(`已推送 ${r.pushed} 条（跳过 ${r.skipped} 条较旧记录），拉回 ${r.pulled} 条`)
    } catch (e: any) {
      setSyncMsg('同步失败：' + (e?.message || '未知错误'))
    } finally {
      setSyncing(false)
    }
  }
  const cycles = useLedger((s) => s.cycles)
  const addCycle = useLedger((s) => s.addCycle)
  const deleteCycle = useLedger((s) => s.deleteCycle)
  const toggleCycle = useLedger((s) => s.toggleCycle)
  const runCycles = useLedger((s) => s.runCycles)
  const [cycleForm, setCycleForm] = useState<{
    name: string; kind: 'expense' | 'income'; parentCategoryId: number; childCategoryId: number
    assetId: number; cost: string; dayOfMonth: number; remark: string
    cycleType: 'month' | 'week' | 'year'; weekdays: number[]; extraDays: string
    monthLast: boolean; monthOfYear: number
  } | null>(null)

  const fmtLabel = (f: string) =>
    f === 'yimu' ? '一木记账导出' : f === 'transfer' ? '转账流水' : f === 'generic' ? '通用账单表' : '未识别的表头'

  const pickFile = async (f: File) => {
    setErr('')
    setPlan(null)
    try {
      const { parseLedgerFile, buildImportPlan } = await import('./importer')
      const table = parseLedgerFile(await f.arrayBuffer(), f.name)
      const p = buildImportPlan({
        table, existingBills: bills, existingAssets: assets, existingBooks: accountBooks,
        parentCategories: parents, childCategories: children, userId: 1, bookId: 1
      })
      setFileName(f.name)
      setPlan(p)
      if (p.total === 0) setErr('文件里没有数据行')
    } catch (e: any) {
      setErr('解析失败：' + (e?.message || e))
      setFileName(f.name)
    }
  }

  const loadDemo = async () => {
    setErr('')
    try {
      const res = await fetch('/demo-yimu.xlsx')
      if (!res.ok) throw new Error('示例文件不可用')
      const buf = await res.arrayBuffer()
      const { parseLedgerFile, buildImportPlan } = await import('./importer')
      const table = parseLedgerFile(buf, 'demo-yimu.xlsx')
      const p = buildImportPlan({
        table, existingBills: bills, existingAssets: assets, existingBooks: accountBooks,
        parentCategories: parents, childCategories: children, userId: 1, bookId: 1
      })
      setFileName('内置示例 demo-yimu.xlsx')
      setPlan(p)
    } catch (e: any) {
      setErr('载入示例失败：' + (e?.message || e))
    }
  }

  const confirmImport = () => {
    if (!plan) return
    const n = plan.bills.length + plan.transfers.length
    applyImport(plan)
    setPlan(null)
    notify(`已导入 ${n} 条` + (plan.duplicates ? `，跳过重复 ${plan.duplicates} 条` : '') + '；账户余额已按流水推算，可在资产页调整')
  }

  const doExportJson = () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `qingzhang-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    notify('已导出 JSON')
  }

  const doExportXlsx = async () => {
    if (bills.length === 0) return notify('还没有账单可导出')
    const { exportXlsx } = await import('./importer')
    exportXlsx(bills, parents, children, assets, accountBooks, reimbursements, refunds)
    notify(`已导出 ${bills.length} 条为 Excel`)
  }

  const doImportJson = (f: File) => {
    const r = new FileReader()
    r.onload = () => {
      try {
        importAll(JSON.parse(String(r.result)))
        notify('已导入 JSON 备份')
      } catch { notify('文件格式不对') }
    }
    r.readAsText(f)
  }

  const doSync = async () => {
    setSyncMsg('连接中…')
    try {
      const h = await api.health()
      setSyncMsg(h?.result?.writable ? '服务端在线，可写' : '服务端在线，但只读（未配置写令牌）')
    } catch (e: any) {
      setSyncMsg('连接失败：' + e.message)
    }
  }

  return (
    <section className="card">
      <h3>从其他记账软件迁移</h3>
      <p className="hint">
        支持 <b>一木记账导出的 Excel/CSV</b>（表头含 日期/收支类型/金额/类别/二级分类/账户）、
        转账流水表，以及含时间与金额的通用表格。重复账单会自动跳过。
      </p>

      <label className="filebtn big">
        选择文件（.xlsx / .xls / .csv）
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
      </label>

      <button className="ghost wide" onClick={loadDemo}>没有数据？载入内置示例（471 条，走同一套导入流程）</button>

      {err && <p className="warn">{err}</p>}

      {plan && (
        <div className="preview">
          <div className="preview-head">
            <b>{fileName || '未选择'}</b>
            <span className="badge">{fmtLabel(plan.format)}</span>
          </div>
          <div className="preview-stats">
            <div><small>总行数</small><b>{plan.total}</b></div>
            <div><small>可导入</small><b className="in">{plan.bills.length + plan.transfers.length}</b></div>
            <div><small>重复跳过</small><b>{plan.duplicates}</b></div>
            <div><small>无法解析</small><b>{plan.skipped.length}</b></div>
          </div>
          <div className="preview-stats">
            <div><small>收入合计</small><b className="in">{money(plan.income)}</b></div>
            <div><small>支出合计</small><b className="out">{money(plan.expense)}</b></div>
            <div><small>新增分类</small><b>{plan.newParents.length}</b></div>
            <div><small>新增账户/账本</small><b>{plan.newAssets.length}/{plan.newBooks.length}</b></div>
          </div>
          {(plan.reimbursements.length > 0 || plan.refunds.length > 0) && (
            <p className="hint">带过来的附属记录：报销 {plan.reimbursements.length} 条、退款 {plan.refunds.length} 条。</p>
          )}
          {plan.columnCoverage.length > 0 && (
            <p className="hint">
              识别到的列：{plan.columnCoverage.map((c) => c.column).join('、')}
            </p>
          )}
          {plan.skipped.length > 0 && (
            <p className="hint">跳过示例：第 {plan.skipped.slice(0, 3).map((x) => x.row).join('、')} 行 —— {plan.skipped[0].reason}</p>
          )}
          <button className="primary" onClick={confirmImport} disabled={plan.bills.length + plan.transfers.length === 0}>
            确认导入 {plan.bills.length + plan.transfers.length} 条
          </button>
        </div>
      )}

      <h3>导出</h3>
      <div className="btns">
        <button onClick={doExportXlsx}>导出 Excel</button>
        <button onClick={doExportJson}>导出 JSON</button>
        <label className="filebtn">
          导入 JSON 备份
          <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && doImportJson(e.target.files[0])} />
        </label>
      </div>

      <h3>周期记账</h3>
      <p className="hint">每月固定日期自动生成账单；打开应用时补生成，不会重复。</p>
      {cycles.length === 0 && <p className="hint">还没有周期规则（比如房租、工资）。</p>}
      {cycles.map((c) => {
        const p = parents.find((x) => x.id === c.parentCategoryId)
        const a = assets.find((x) => x.assetId === c.assetId)
        return (
          <div key={c.cycleId} className="row">
            <div className="grow">
              <div>
                {c.name}
                <span className="tag">{describeCycle(c)}</span>
              </div>
              <small>{p?.name ?? '分类'} · {a?.assetName ?? '账户'} · {money(c.cost)} · {c.enabled ? '启用中' : '已暂停'}</small>
            </div>
            <button className="link" onClick={() => toggleCycle(c.cycleId)}>{c.enabled ? '暂停' : '启用'}</button>
            <button className="del" onClick={() => deleteCycle(c.cycleId)}>删</button>
          </div>
        )
      })}
      <button className="ghost wide" onClick={() => setCycleForm({
        name: '', kind: 'expense', parentCategoryId: 4, childCategoryId: 0,
        assetId: assets[0]?.assetId ?? 0, cost: '', dayOfMonth: 1, remark: '',
        cycleType: 'month', weekdays: [1], extraDays: '', monthLast: false, monthOfYear: 1
      })}>新增周期规则</button>

      {cycleForm && (
        <div className="modal-mask" onClick={() => setCycleForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>周期记账</h3>
            <div className="label">名称</div>
            <input value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} placeholder="如：房租、工资" />
            <div className="label">类型</div>
            <select value={cycleForm.kind} onChange={(e) => setCycleForm({ ...cycleForm, kind: e.target.value as any, parentCategoryId: e.target.value === 'income' ? 903 : 4 })}>
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
            <div className="label">分类</div>
            <select value={cycleForm.parentCategoryId} onChange={(e) => setCycleForm({ ...cycleForm, parentCategoryId: Number(e.target.value) })}>
              {parents.filter((p) => p.kind === cycleForm.kind).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="label">周期</div>
            <select value={cycleForm.cycleType} onChange={(e) => setCycleForm({ ...cycleForm, cycleType: e.target.value as any })}>
              <option value="month">每月</option>
              <option value="week">每周</option>
              <option value="year">每年</option>
            </select>
            <div className="row2">
              <div>
                <div className="label">金额</div>
                <input value={cycleForm.cost} inputMode="decimal" autoFocus
                  onChange={(e) => setCycleForm({ ...cycleForm, cost: e.target.value.replace(/[^\d.]/g, '') })} />
              </div>
              <div>
                <div className="label">
                  {cycleForm.cycleType === 'week' ? '星期' : (cycleForm.cycleType === 'year' ? '月份' : '日期')}
                </div>
                {cycleForm.cycleType === 'week' ? (
                  <div className="chips">
                    {['日', '一', '二', '三', '四', '五', '六'].map((w, i) => (
                      <button key={i} className={'chip small' + (cycleForm.weekdays.includes(i) ? ' on' : '')}
                        onClick={() => setCycleForm({
                          ...cycleForm,
                          weekdays: cycleForm.weekdays.includes(i)
                            ? cycleForm.weekdays.filter((x) => x !== i)
                            : [...cycleForm.weekdays, i].sort()
                        })}>{w}</button>
                    ))}
                  </div>
                ) : cycleForm.cycleType === 'year' ? (
                  <select value={cycleForm.monthOfYear}
                    onChange={(e) => setCycleForm({ ...cycleForm, monthOfYear: Number(e.target.value) })}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>{m} 月</option>
                    ))}
                  </select>
                ) : (
                  <input value={String(cycleForm.dayOfMonth)} inputMode="numeric"
                    onChange={(e) => {
                      const n = Math.min(28, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))
                      setCycleForm({ ...cycleForm, dayOfMonth: n })
                    }} />
                )}
              </div>
            </div>
            {cycleForm.cycleType !== 'week' && (
              <>
                <div className="label">额外日期（可选，逗号分隔，如 15,25）</div>
                <input value={cycleForm.extraDays} placeholder="留空则只用上面的日期"
                  onChange={(e) => setCycleForm({ ...cycleForm, extraDays: e.target.value.replace(/[^\d,，]/g, '') })} />
                <label className="inline">
                  <input type="checkbox" checked={cycleForm.monthLast}
                    onChange={(e) => setCycleForm({ ...cycleForm, monthLast: e.target.checked })} />
                  每月最后一天
                </label>
              </>
            )}
            <div className="label">账户</div>
            <select value={cycleForm.assetId} onChange={(e) => setCycleForm({ ...cycleForm, assetId: Number(e.target.value) })}>
              {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
            </select>
            <div className="label">备注</div>
            <input value={cycleForm.remark} onChange={(e) => setCycleForm({ ...cycleForm, remark: e.target.value })} />
            <p className="hint">保存后立即补生成当月已到期的账单。</p>
            <div className="modal-btns">
              <button className="ghost" onClick={() => setCycleForm(null)}>取消</button>
              <button className="primary" onClick={() => {
                const extra = cycleForm.extraDays
                  .split(/[,，]/).map((x) => Number(x.trim())).filter((x) => x >= 1 && x <= 28)
                addCycle({
                  name: cycleForm.name || '周期账单',
                  kind: cycleForm.kind,
                  parentCategoryId: cycleForm.parentCategoryId,
                  childCategoryId: cycleForm.childCategoryId,
                  assetId: cycleForm.assetId,
                  cost: Number(cycleForm.cost) || 0,
                  dayOfMonth: cycleForm.dayOfMonth,
                  cycleType: cycleForm.cycleType,
                  weekdays: cycleForm.cycleType === 'week' ? cycleForm.weekdays : undefined,
                  monthDays: extra.length ? [...new Set([cycleForm.dayOfMonth, ...extra])].sort((a, b) => a - b) : undefined,
                  monthLast: cycleForm.monthLast || undefined,
                  monthOfYear: cycleForm.monthOfYear,
                  remark: cycleForm.remark,
                  startTime: Date.now()
                })
                setCycleForm(null)
                setTimeout(() => runCycles(), 0)
                notify('周期规则已保存')
              }}>保存</button>
            </div>
          </div>
        </div>
      )}

      <h3>数据</h3>
      <div className="btns">
        <button onClick={() => { seed(); notify('已填充演示数据') }}>填充演示数据</button>
        <button className="danger" onClick={() => { reset(); notify('已清空') }}>清空数据</button>
      </div>

      <h3>账本与成员</h3>
      <p className="hint">
        共享账本支持 2–6 人共记共看。角色：<b>静默</b>只读、<b>同伴</b>可增删改账单、<b>管理</b>可改名/邀请/清空/删账本。
      </p>
      {accountBooks.filter((b) => b.bookId).map((b) => {
        const active = String(b.bookId) === String(currentBookId)
        return (
          <div key={String(b.bookId)} className="row">
            <div className="grow">
              <div>
                {b.accountBookName}
                <span className="tag">{ROLE_LABEL[b.role ?? ''] ?? b.role}</span>
                {active && <span className="tag ok">当前</span>}
              </div>
              <small>{b.ownerId === me?.id ? '我创建的' : `创建者 #${b.ownerId}`}</small>
            </div>
            <button className="link" onClick={() => { setBook(String(b.bookId)); localStorage.setItem('xm-current-book', String(b.bookId)) }}>进入</button>
          </div>
        )
      })}
      <div className="btns">
        <button onClick={async () => {
          const name = prompt('新账本名称', '家庭账本')
          if (!name) return
          await bookApi.create(name)
          await reloadBooks()
          notify('账本已创建')
        }}>新建账本</button>
        <button onClick={async () => {
          const code = prompt('输入邀请码')
          if (!code) return
          try {
            await bookApi.join(code.trim().toUpperCase())
            await reloadBooks()
            notify('已加入账本')
          } catch (e: any) { notify(e?.message || '加入失败') }
        }}>加入账本</button>
      </div>

      {currentBook && (
        <div className="row">
          <div className="grow">
            <div>当前：{currentBook.accountBookName}</div>
            <small>我的角色：{ROLE_LABEL[currentBook.role ?? ''] ?? currentBook.role}</small>
          </div>
          {currentBook.role === 'admin' && (
            <button className="ghost tiny" onClick={async () => {
              try {
                const r = await bookApi.invite(String(currentBook.bookId))
                setInvite({ code: r.code, expiresAt: r.expiresAt })
                notify(`邀请码 ${r.code}`)
              } catch (e: any) { notify(e?.message || '生成失败') }
            }}>生成邀请码</button>
          )}
        </div>
      )}
      {currentBook && currentBook.role === 'admin' && (
        <div className="btns">
          <button onClick={async () => {
            const name = prompt('账本名称', currentBook.accountBookName)
            if (!name) return
            await bookApi.rename(String(currentBook.bookId), name)
            await reloadBooks()
            notify('已重命名')
          }}>重命名</button>
          <button onClick={async () => {
            if (!confirm('清空这个账本里的所有账单？操作不可撤销')) return
            try {
              const r = await bookApi.clear(String(currentBook.bookId))
              notify(`已清空 ${r.removed} 条服务端记录（本地请点「清空数据」）`)
            } catch (e: any) { notify(e?.message || '失败') }
          }}>清空账本</button>
          {me?.id === currentBook.ownerId && (
            <button className="danger" onClick={async () => {
              if (!confirm('删除这个账本？所有成员都会失去它')) return
              try {
                await bookApi.remove(String(currentBook.bookId))
                await reloadBooks()
                notify('账本已删除')
              } catch (e: any) { notify(e?.message || '失败') }
            }}>删除账本</button>
          )}
        </div>
      )}

      {currentBook && currentBook.role !== 'admin' && currentBook.role && (
        <button className="ghost wide" onClick={async () => {
          if (!confirm('退出这个账本？你的历史账单会保留在账本里')) return
          await bookApi.leave(String(currentBook.bookId))
          await reloadBooks()
          notify('已退出账本')
        }}>退出账本</button>
      )}

      {members.length > 0 && (
        <>
          <div className="label">成员（{members.length}/6）</div>
          {members.map((m) => (
            <div key={m.userId} className="row">
              <div className="grow">
                <div>{m.email}{m.userId === me?.id ? '（我）' : ''}</div>
                <small>{ROLE_LABEL[m.role] ?? m.role}</small>
              </div>
              {currentBook?.role === 'admin' && m.userId !== currentBook.ownerId && (
                <select value={m.role} onChange={async (e) => {
                  await bookApi.setRole(String(currentBook.bookId), m.userId, e.target.value)
                  setMembers((await bookApi.members(String(currentBook.bookId))).members)
                }}>
                  <option value="silent">静默</option>
                  <option value="peer">同伴</option>
                  <option value="admin">管理</option>
                </select>
              )}
            </div>
          ))}
        </>
      )}

      {invite && (
        <div className="invite">
          <div>
            <span className="code">{invite.code}</span>
            <small>有效期至 {new Date(invite.expiresAt).toLocaleString('zh-CN')}</small>
          </div>
          <button className="link" onClick={() => setInvite(null)}>收起</button>
        </div>
      )}

      <h3>标签</h3>
      <p className="hint">标签可着色、可嵌套；记账时按名字自动关联。</p>
      {tags.length === 0 && <p className="hint">还没有标签。下面可以新建，或在记账备注里写 #标签。</p>}
      {tags.map((t) => (
        <div key={t.tagId} className="row">
          <span className="tag-dot" style={{ background: t.color }} />
          <div className="grow">
            <div>{t.name}{t.parentName ? <span className="tag">属于 {t.parentName}</span> : null}</div>
          </div>
          <input
            className="color"
            type="color"
            value={t.color}
            onChange={(e) => updateTag(t.tagId, { color: e.target.value })}
          />
          <button className="del" onClick={() => deleteTag(t.tagId)}>删</button>
        </div>
      ))}
      <div className="row2">
        <input value={newTag} placeholder="新标签名" onChange={(e) => setNewTag(e.target.value)} />
        <button className="ghost" onClick={() => {
          if (!newTag.trim()) return
          addTag({ name: newTag.trim(), color: '#FED778' })
          setNewTag('')
          notify('标签已添加')
        }}>添加标签</button>
      </div>

      <h3>币种与汇率</h3>
      <p className="hint">
        汇率含义：1 单位该币种 = 多少 {defaultCurrency}。记账时选外币会自动折算成本币入账。
      </p>
      {currencies.map((c) => (
        <div key={c.code} className="row">
          <div className="grow">
            <div>{c.name} <span className="tag">{c.code}</span></div>
            <small>
              {c.symbol}
              {c.code === defaultCurrency ? ' · 默认币种' : ` · 1 ${c.code} = ${c.rate} ${defaultCurrency}`}
            </small>
          </div>
          {c.code !== defaultCurrency && (
            <RateInput
              value={c.rate}
              onCommit={(v) => setCurrencyRate(c.code, v)}
            />
          )}
        </div>
      ))}

      <h3>云端同步</h3>
      <p className="hint">
        数据存在你自己的账号下。同步是<b>先推后拉</b>：本地改动推到服务器，再把别的设备改过的记录合并回来（逐条取更新时间晚的）。
      </p>
      <div className="btns">
        <button onClick={runSync} disabled={syncing}>{syncing ? '同步中…' : '立即同步'}</button>
      </div>
      {lastSync > 0 && <p className="hint">上次同步：{new Date(lastSync).toLocaleString('zh-CN')}</p>}
      {syncMsg && <p className="hint">{syncMsg}</p>}

      <h3>关于</h3>
      <p className="hint">
        数据默认只存本机浏览器；登录后可手动同步到你自己账号下，不传给第三方。导出 Excel 后可再导回或换工具。
      </p>
    </section>
  )
}
