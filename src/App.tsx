import { useEffect, useMemo, useState } from 'react'
import { useLedger, useTotalAssets } from './store'
import { ASSET_TYPE, BILL_TYPE } from './types'
import { api } from './api'

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

export default function App() {
  const [tab, setTab] = useState<Tab>('add')
  const [toast, setToast] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2200)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">青</span>
          <div>
            <strong>青账</strong>
            <small>个人记账 · 自建版</small>
          </div>
        </div>
        <BookSwitch />
      </header>

      <nav className="nav">
        {([['add', '记账'], ['bills', '账单'], ['assets', '资产'], ['stats', '统计'], ['settings', '设置']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      <main className="main">
        {tab === 'add' && <AddBill notify={notify} />}
        {tab === 'bills' && <Bills />}
        {tab === 'assets' && <Assets notify={notify} />}
        {tab === 'stats' && <Stats />}
        {tab === 'settings' && <Settings notify={notify} />}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function BookSwitch() {
  const books = useLedger((s) => s.accountBooks)
  const current = useLedger((s) => s.currentBookId)
  const setBook = useLedger((s) => s.setBook)
  return (
    <select value={current} onChange={(e) => setBook(Number(e.target.value))} className="book">
      {books.map((b) => <option key={b.accountBookId} value={b.accountBookId}>{b.accountBookName}</option>)}
    </select>
  )
}

function AddBill({ notify }: { notify: (m: string) => void }) {
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const assets = useLedger((s) => s.assets)
  const addBill = useLedger((s) => s.addBill)
  const addTransfer = useLedger((s) => s.addTransfer)

  const [mode, setMode] = useState<'expense' | 'income' | 'transfer'>('expense')
  const [cost, setCost] = useState('')
  const [pid, setPid] = useState(100)
  const [cid, setCid] = useState(0)
  const [aid, setAid] = useState(0)
  const [toAid, setToAid] = useState(0)
  const [fee, setFee] = useState('')
  const [remark, setRemark] = useState('')
  const [time, setTime] = useState(toLocalInput(Date.now()))

  // 默认选中第一个账户，减少一次点击
  useEffect(() => {
    if (!aid && assets[0]) setAid(assets[0].assetId)
    if (!toAid && assets[1]) setToAid(assets[1].assetId)
  }, [assets, aid, toAid])

  const catKind = mode === 'income' ? 'income' : 'expense'
  const list = parents.filter((p) => p.kind === catKind)
  const cur = list.some((p) => p.id === pid) ? pid : (list[0]?.id ?? 199)
  const subs = children.filter((c) => c.parentId === cur)

  const switchMode = (m: 'expense' | 'income' | 'transfer') => {
    setMode(m)
    setCid(0)
    if (m === 'expense') setPid(100)
    if (m === 'income') setPid(200)
  }

  const submit = () => {
    const v = Number(cost)
    if (!v || v <= 0) return notify('请输入金额')

    if (mode === 'transfer') {
      if (!aid || !toAid) return notify('请选择转出和转入账户')
      if (aid === toAid) return notify('转出和转入不能是同一个账户')
      const f = Number(fee) || 0
      addTransfer({
        fromAssetId: aid, toAssetId: toAid, cost: v,
        serviceCharge: f, remark, time: new Date(time).getTime()
      })
      setCost(''); setFee(''); setRemark('')
      return notify(`已转账 ${money(v)}` + (f > 0 ? `，手续费 ${money(f)} 已单独记为支出` : ''))
    }

    if (!aid) return notify('请选择账户')
    addBill({
      cost: v, parentCategoryId: cur, childCategoryId: cid,
      assetId: aid, remark, time: new Date(time).getTime(), billType: 2
    })
    setCost(''); setRemark(''); setCid(0)
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
        <span>¥</span>
        <input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" inputMode="decimal" />
      </div>

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
          <p className="tip">转账本金不计入收支；手续费会单独生成一条支出账单。</p>
        </>
      ) : (
        <>
          <div className="label">分类</div>
          <div className="chips">
            {list.map((p) => (
              <button key={p.id} className={'chip' + (p.id === cur ? ' on' : '')} onClick={() => { setPid(p.id); setCid(0) }}>
                <i style={{ background: p.color }} />{p.name}
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

function Bills() {
  const bills = useLedger((s) => s.bills)
  const transfers = useLedger((s) => s.transfers)
  const parents = useLedger((s) => s.parentCategories)
  const assets = useLedger((s) => s.assets)
  const del = useLedger((s) => s.deleteBill)
  const [month, setMonth] = useState(monthOf(Date.now()))

  type Item =
    | { kind: 'bill'; id: number; time: number; data: typeof bills[number] }
    | { kind: 'transfer'; id: number; time: number; data: typeof transfers[number] }

  const items = useMemo<Item[]>(() => {
    const inMonth = (t: number) => monthOf(t) === month
    const a = bills.filter((b) => inMonth(b.time)).map((b) => ({ kind: 'bill' as const, id: b.billId, time: b.time, data: b }))
    const t = transfers.filter((x) => inMonth(x.time)).map((x) => ({ kind: 'transfer' as const, id: x.transferId, time: x.time, data: x }))
    return [...a, ...t].sort((x, y) => y.time - x.time)
  }, [bills, transfers, month])

  const isIncome = (pid: number) => parents.find((p) => p.id === pid)?.kind === 'income'
  const income = bills.filter((b) => monthOf(b.time) === month && isIncome(b.parentCategoryId)).reduce((s, b) => s + b.cost, 0)
  const expense = bills.filter((b) => monthOf(b.time) === month && !isIncome(b.parentCategoryId)).reduce((s, b) => s + b.cost, 0)

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>()
    items.forEach((b) => {
      const k = dayOf(b.time)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(b)
    })
    return [...m.entries()]
  }, [items])

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

      {groups.length === 0 && <p className="empty">这个月还没有账单</p>}

      {groups.map(([day, rows]) => (
        <div key={day} className="group">
          <div className="day">{day}</div>
          {rows.map((it) => {
            if (it.kind === 'transfer') {
              const t = it.data
              const from = assets.find((a) => a.assetId === t.fromAssetId)
              const to = assets.find((a) => a.assetId === t.toAssetId)
              return (
                <div key={'t' + t.transferId} className="row">
                  <i className="dot arrow">⇄</i>
                  <div className="grow">
                    <div>转账 · {from?.assetName ?? '?'} → {to?.assetName ?? '?'}</div>
                    <small>
                      {hhmm(t.time)} · 不计收支
                      {t.serviceCharge > 0 ? ` · 手续费 ${money(t.serviceCharge)}` : ''}
                      {t.remark ? ` · ${t.remark}` : ''}
                    </small>
                  </div>
                  <b className="neutral">{money(t.cost)}</b>
                </div>
              )
            }
            const b = it.data
            const p = parents.find((x) => x.id === b.parentCategoryId)
            const a = assets.find((x) => x.assetId === b.assetId)
            const inc = p?.kind === 'income'
            return (
              <div key={b.billId} className="row">
                <i className="dot" style={{ background: p?.color ?? '#94a3b8' }} />
                <div className="grow">
                  <div>{p?.name ?? '未分类'}{b.remark ? <span className="remark"> · {b.remark}</span> : null}</div>
                  <small>{a?.assetName ?? '无账户'} · {hhmm(b.time)} · {BILL_TYPE[b.billType]}</small>
                </div>
                <b className={inc ? 'in' : 'out'}>{inc ? '+' : '-'}{money(b.cost)}</b>
                <button className="del" onClick={() => del(b.billId)}>删</button>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}

function Assets({ notify }: { notify: (m: string) => void }) {
  const assets = useLedger((s) => s.assets)
  const total = useTotalAssets()
  const addAsset = useLedger((s) => s.addAsset)

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

      {assets.map((a) => (
        <div key={a.assetId} className="row">
          <div className="grow">
            <div>{a.assetName}</div>
            <small>{ASSET_TYPE[a.assetType]}{a.groupName ? ' · ' + a.groupName : ''}</small>
          </div>
          <b className={a.assetNumber < 0 ? 'out' : ''}>{money(a.assetNumber)}</b>
        </div>
      ))}

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

function Stats() {
  const bills = useLedger((s) => s.bills)
  const parents = useLedger((s) => s.parentCategories)
  const [month, setMonth] = useState(monthOf(Date.now()))

  const rows = useMemo(() => {
    const m = new Map<number, number>()
    bills.filter((b) => monthOf(b.time) === month).forEach((b) => {
      const p = parents.find((x) => x.id === b.parentCategoryId)
      if (p?.kind === 'income') return
      m.set(b.parentCategoryId, (m.get(b.parentCategoryId) ?? 0) + b.cost)
    })
    const arr = [...m.entries()].map(([id, v]) => ({ p: parents.find((x) => x.id === id)!, v }))
    arr.sort((a, b) => b.v - a.v)
    return arr
  }, [bills, parents, month])

  const max = rows[0]?.v ?? 1
  const total = rows.reduce((s, r) => s + r.v, 0)

  return (
    <section className="card">
      <div className="label">月份</div>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      <div className="label">支出构成（合计 {money(total)}）</div>
      {rows.length === 0 && <p className="empty">暂无数据</p>}
      {rows.map((r) => (
        <div key={r.p.id} className="bar-row">
          <span className="bar-name">{r.p.name}</span>
          <div className="bar-track">
            <div className="bar" style={{ width: `${(r.v / max) * 100}%`, background: r.p.color }} />
          </div>
          <span className="bar-val">{money(r.v)}</span>
          <span className="bar-pct">{((r.v / total) * 100).toFixed(0)}%</span>
        </div>
      ))}
    </section>
  )
}

function Settings({ notify }: { notify: (m: string) => void }) {
  const seed = useLedger((s) => s.seed)
  const reset = useLedger((s) => s.reset)
  const exportAll = useLedger((s) => s.exportAll)
  const importAll = useLedger((s) => s.importAll)
  const [syncMsg, setSyncMsg] = useState('')

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ledger-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    notify('已导出')
  }

  const doImport = (f: File) => {
    const r = new FileReader()
    r.onload = () => {
      try {
        importAll(JSON.parse(String(r.result)))
        notify('已导入')
      } catch { notify('文件格式不对') }
    }
    r.readAsText(f)
  }

  const doSync = async () => {
    setSyncMsg('连接中…')
    try {
      await api.health()
      const data = exportAll()
      await api.syncPush({ bills: (data as any).bills, assets: (data as any).assets })
      setSyncMsg('已推送到服务端')
    } catch (e: any) {
      setSyncMsg('服务端未启动：' + e.message)
    }
  }

  return (
    <section className="card">
      <h3>数据</h3>
      <div className="btns">
        <button onClick={() => { seed(); notify('已填充演示数据') }}>填充演示数据</button>
        <button onClick={doExport}>导出 JSON</button>
        <label className="filebtn">
          导入 JSON
          <input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        </label>
        <button className="danger" onClick={() => { reset(); notify('已清空') }}>清空数据</button>
      </div>

      <h3>服务端</h3>
      <p className="hint">本地优先存储，服务端仅做同步演示（需先启动 <code>pnpm api</code>）。</p>
      <button onClick={doSync}>测试同步</button>
      {syncMsg && <p className="hint">{syncMsg}</p>}

      <h3>关于</h3>
      <p className="hint">
        自建记账应用，功能对齐常见个人记账产品：两级分类、多账户、账单流水、资产统计。
        数据只存在本机浏览器，不采集任何信息。
      </p>
    </section>
  )
}
