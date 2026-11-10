import { useEffect, useMemo, useState } from 'react'
import { useLedger } from '../store'
import { BILL_TYPE } from '../types'
import type { Bill, Transfer } from '../types'
import { books as bookApi } from '../auth'
import { money, dayOf, hhmm, monthOf, toLocalInput } from '../ui-format'
import { CatIcon } from '../ui/icons'
import { TransferEditor } from './transfer-editor'

export function Bills({ me }: { me?: { id: number; email: string } }) {
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
                  <div>
                    {p?.name ?? '未分类'}
                    {b.conflict && <span className="foreign" title="并发冲突：与他人同一秒记账撞了 ID，可能有一条未并入 — 点「明细」查看">❗</span>}
                    {b.remark ? <span className="remark"> · {b.remark}</span> : null}
                  </div>
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
        {bill.conflict && (
          <Row label="冲突提示">
            <span style={{ color: 'var(--out)' }}>
              与他人同一秒记账撞了 ID，这条已保留{bill.conflictOwnerId != null ? `（对方 #${bill.conflictOwnerId}）` : ''}
            </span>
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
