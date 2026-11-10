import { useEffect, useMemo, useState } from 'react'
import { useLedger, useTotalAssets } from './store'
import { ASSET_TYPE, BILL_TYPE } from './types'
import type { Asset, Bill } from './types'
import { api } from './api'
import type { ImportPlan } from './importer'

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
  const mergeTaxonomy = useLedger((s) => s.mergeTaxonomy)

  // 启动时补齐内置分类（幂等，不动用户已有分类）
  useEffect(() => { mergeTaxonomy() }, [mergeTaxonomy])
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

  const lastParentId = useLedger((s) => s.lastParentId)
  const lastChildId = useLedger((s) => s.lastChildId)
  const lastAssetId = useLedger((s) => s.lastAssetId)

  const [mode, setMode] = useState<'expense' | 'income' | 'transfer'>('expense')
  const [cost, setCost] = useState('')
  const [pid, setPid] = useState(lastParentId)
  const [cid, setCid] = useState(lastChildId)
  const [aid, setAid] = useState(lastAssetId || 0)
  const [toAid, setToAid] = useState(0)
  const [fee, setFee] = useState('')
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
                <span className="ico">{p.icon ?? '•'}</span>{p.name}
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
  const delTransfer = useLedger((s) => s.deleteTransfer)
  const updateBill = useLedger((s) => s.updateBill)

  const [month, setMonth] = useState(monthOf(Date.now()))
  const [kw, setKw] = useState('')
  const [fPid, setFPid] = useState(0)
  const [fAid, setFAid] = useState(0)
  const [editing, setEditing] = useState<Bill | null>(null)

  const nameOf = (pid: number) => parents.find((p) => p.id === pid)?.name ?? ''
  const isIncome = (pid: number) => parents.find((p) => p.id === pid)?.kind === 'income'

  const match = (b: Bill) => {
    if (monthOf(b.time) !== month) return false
    if (fPid && b.parentCategoryId !== fPid) return false
    if (fAid && b.assetId !== fAid) return false
    if (kw) {
      const hay = (b.remark || '') + ' ' + nameOf(b.parentCategoryId) + ' ' + (b.tags || []).join(' ')
      if (!hay.toLowerCase().includes(kw.toLowerCase())) return false
    }
    return true
  }

  const list = useMemo(() => bills.filter(match).sort((a, b) => b.time - a.time), [bills, month, kw, fPid, fAid, parents])

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
                    <div>转账 · {from?.assetName ?? '?'} → {to?.assetName ?? '?'}</div>
                    <small>
                      {hhmm(t.time)} · 不计收支
                      {t.serviceCharge > 0 ? ` · 手续费 ${money(t.serviceCharge)}` : ''}
                      {t.remark ? ` · ${t.remark}` : ''}
                    </small>
                  </div>
                  <b className="neutral">{money(t.cost)}</b>
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
                <i className="dot" style={{ background: p?.color ?? '#94a3b8' }} />
                <div className="grow">
                  <div>{p?.name ?? '未分类'}{b.remark ? <span className="remark"> · {b.remark}</span> : null}</div>
                  <small>{a?.assetName ?? '无账户'} · {hhmm(b.time)} · {BILL_TYPE[b.billType]}</small>
                </div>
                <b className={inc ? 'in' : 'out'}>{inc ? '+' : '-'}{money(b.cost)}</b>
                <button className="link" onClick={() => setEditing(b)}>改</button>
                <button className="del" onClick={() => del(b.billId)}>删</button>
              </div>
            )
          })}
        </div>
      ))}

      {editing && (
        <EditBill bill={editing} onClose={() => setEditing(null)} onSave={(patch) => {
          updateBill(editing.billId, patch)
          setEditing(null)
        }} />
      )}
    </section>
  )
}

function EditBill({ bill, onClose, onSave }: { bill: Bill; onClose: () => void; onSave: (p: Partial<Bill>) => void }) {
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const assets = useLedger((s) => s.assets)

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

function Assets({ notify }: { notify: (m: string) => void }) {
  const assets = useLedger((s) => s.assets)
  const total = useTotalAssets()
  const addAsset = useLedger((s) => s.addAsset)
  const updateAsset = useLedger((s) => s.updateAsset)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)

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
          <div className="grow">
            <div>{a.assetName}</div>
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

function AssetEditor({ asset, onClose, onSave }: { asset: Asset; onClose: () => void; onSave: (a: Asset) => void }) {
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
        <div className="label">类型</div>
        <select value={type} onChange={(e) => setType(Number(e.target.value))}>
          {Object.entries(ASSET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
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
  const [editing, setEditing] = useState<{ categoryId: number; amount: string } | null>(null)

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
  const totalBudget = budgets.find((b) => b.month === 'all' && b.categoryId === 0)?.amount ?? 0
  const catBudgets = budgets.filter((b) => b.month === 'all' && b.categoryId !== 0)

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

      {catBudgets.map((b) => {
        const p = parents.find((x) => x.id === b.categoryId)
        const used = spentOf(b.categoryId)
        return (
          <div key={b.categoryId} className="budget-box small">
            <div className="budget-line">
              <span>{p?.icon ?? ''} {p?.name ?? '分类'}预算</span>
              <b>{money(used)} / {money(b.amount)}</b>
            </div>
            <div className="bar-track">
              <div className="bar" style={{
                width: `${Math.min(100, (used / b.amount) * 100)}%`,
                background: used > b.amount ? 'var(--out)' : (p?.color === '#94a3b8' ? 'var(--accent)' : p?.color)
              }} />
            </div>
            <div className="budget-foot">
              <span>剩余 {money(b.amount - used)}</span>
              <span>
                <button className="link" onClick={() => setEditing({ categoryId: b.categoryId, amount: String(b.amount) })}>调整</button>
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
          <span className="bar-name">{r.p.icon} {r.p.name}</span>
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
                <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
              ))}
            </select>
            <div className="label">每月预算金额</div>
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
                setBudget({ month: 'all', categoryId: editing.categoryId, amount: Number(editing.amount) || 0 })
                setEditing(null)
              }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Settings({ notify }: { notify: (m: string) => void }) {
  const seed = useLedger((s) => s.seed)
  const reset = useLedger((s) => s.reset)
  const exportAll = useLedger((s) => s.exportAll)
  const importAll = useLedger((s) => s.importAll)
  const applyImport = useLedger((s) => s.applyImport)
  const bills = useLedger((s) => s.bills)
  const assets = useLedger((s) => s.assets)
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)

  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState('')
  const [syncMsg, setSyncMsg] = useState('')

  const fmtLabel = (f: string) =>
    f === 'yimu' ? '一木记账导出' : f === 'transfer' ? '转账流水' : f === 'generic' ? '通用账单表' : '未识别的表头'

  const pickFile = async (f: File) => {
    setErr('')
    setPlan(null)
    try {
      const { parseLedgerFile, buildImportPlan } = await import('./importer')
      const table = parseLedgerFile(await f.arrayBuffer(), f.name)
      const p = buildImportPlan({
        table, existingBills: bills, existingAssets: assets,
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
        table, existingBills: bills, existingAssets: assets,
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
    exportXlsx(bills, parents, children, assets)
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
            <div><small>新增账户</small><b>{plan.newAssets.length}</b></div>
          </div>
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

      <h3>数据</h3>
      <div className="btns">
        <button onClick={() => { seed(); notify('已填充演示数据') }}>填充演示数据</button>
        <button className="danger" onClick={() => { reset(); notify('已清空') }}>清空数据</button>
      </div>

      <h3>服务端</h3>
      <button onClick={doSync}>测试连接</button>
      {syncMsg && <p className="hint">{syncMsg}</p>}

      <h3>关于</h3>
      <p className="hint">
        数据只存在本机浏览器（localStorage），不登录、不上传。导出 Excel 后可再导回或导入其他工具。
      </p>
    </section>
  )
}
