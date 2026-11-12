import { useEffect, useMemo, useState } from 'react'
import { useLedger } from '../store'
import { BILL_TYPE } from '../types'
import type { Bill, Transfer } from '../types'
import { books as bookApi } from '../auth'
import { money, dayOf, fullDay, hhmm, monthOf, toLocalInput, humanDay } from '../ui-format'
import imageCompression from 'browser-image-compression'
import { parseShares, splitAmounts } from '../domain/split'
import { AssetIcon, CatIcon } from '../ui/icons'
import { TransferEditor } from './transfer-editor'
import { Modal } from '../ui/modal'
import { accountMoney, fromBase, hasCurrencyRate } from '../money'
import { billNetAmount } from '../bill-amount'
import { resolveBillChild } from '../taxonomy'
import { summarizeBills } from '../bill-summary'

export function Bills({ me, onAdd, embedded = false, rangeAll = false, simpleView = false }: {
  me?: { id: number; email: string }
  onAdd?: () => void
  embedded?: boolean
  /** 一木「范围」菜单：全部 / 按月 */
  rangeAll?: boolean
  /** 一木「视图」菜单：简约 / 详细 */
  simpleView?: boolean
}) {
  const bills = useLedger((s) => s.bills)
  const transfers = useLedger((s) => s.transfers)
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const assets = useLedger((s) => s.assets)
  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const del = useLedger((s) => s.deleteBill)
  const duplicate = useLedger((s) => s.duplicateBill)
  const restore = useLedger((s) => s.restoreBill)
  const [undoBill, setUndoBill] = useState<Bill | null>(null)
  const removeWithUndo = (bill: Bill) => { del(bill.billId); setUndoBill(bill) }
  const delTransfer = useLedger((s) => s.deleteTransfer)
  const updateBill = useLedger((s) => s.updateBill)
  const reimbursements = useLedger((s) => s.reimbursements)
  const refunds = useLedger((s) => s.refunds)
  const userId = useLedger((s) => s.userId)
  const currentBookId = useLedger((s) => s.currentBookId)
  const allTags = useLedger((s) => s.tags)
  const tags = allTags.filter((t) => !t.hide)
  const tagsByName = useMemo(() => new Map(tags.map((t) => [t.name, t])), [tags])
  const accountBooks = useLedger((s) => s.accountBooks)
  const myRole = accountBooks.find((b) => b.bookId && String(b.bookId) === String(currentBookId))?.role
  const readOnly = myRole === 'silent'
  const updateTransfer = useLedger((s) => s.updateTransfer)
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null)

  const [month, setMonth] = useState(monthOf(Date.now()))
  const billGroups = useLedger((s) => s.billGroups)
  const dissolveBillGroup = useLedger((s) => s.dissolveBillGroup)
  const [kw, setKw] = useState('')
  const [fPid, setFPid] = useState(0)
  const [fAid, setFAid] = useState(0)
  const [fMin, setFMin] = useState('')
  const [fMax, setFMax] = useState('')
  const [fTag, setFTag] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [editing, setEditing] = useState<Bill | null>(null)
  const [detail, setDetail] = useState<Bill | null>(null)

  const nameOf = (pid: number) => parents.find((p) => p.id === pid)?.name ?? ''

  const dateRangeActive = Boolean(fFrom || fTo)
  const hasFilters = Boolean(kw || fPid || fAid || fTag || fMin || fMax || fFrom || fTo)
  const resetFilters = () => {
    setKw(''); setFPid(0); setFAid(0); setFTag('')
    setFMin(''); setFMax(''); setFFrom(''); setFTo('')
  }
  const match = (b: Bill) => {
    // 指定了日期范围时按范围过滤，不再受月份限制
    if (!rangeAll && !dateRangeActive && monthOf(b.time) !== month) return false
    if (currentBookId !== 0 && b.bookId !== currentBookId) return false
    if (fPid && b.parentCategoryId !== fPid) return false
    if (fAid && b.assetId !== fAid) return false
    // 金额范围（按账单金额，含边界）
    const amount = Number(b.cost) || 0
    if (fMin !== '' && amount < Number(fMin)) return false
    if (fMax !== '' && amount > Number(fMax)) return false
    // 标签
    if (fTag && !(b.tags ?? []).includes(fTag)) return false
    // 日期范围（含首尾）
    if (fFrom) {
      const from = new Date(fFrom + 'T00:00:00').getTime()
      if (b.time < from) return false
    }
    if (fTo) {
      const to = new Date(fTo + 'T23:59:59').getTime()
      if (b.time > to) return false
    }
    if (kw) {
      const hay = (b.remark || '') + ' ' + nameOf(b.parentCategoryId) + ' ' + (b.tags || []).join(' ')
      if (!hay.toLowerCase().includes(kw.toLowerCase())) return false
    }
    return true
  }

  const groupsInList = useMemo(() => {
    const inBook = billGroups.filter((g) => currentBookId === 0 || String(g.bookId ?? '') === String(currentBookId))
    return inBook.filter((g) => g.billList.some((id) => bills.some((b) => String(b.billId) === String(id) && match(b))))
  }, [billGroups, bills, currentBookId])
  const groupedIds = useMemo(() => new Set(groupsInList.flatMap((g) => g.billList.map(String))), [groupsInList])
  const list = useMemo(() => bills.filter((b) => !groupedIds.has(String(b.billId))).filter(match).sort((a, b) => b.time - a.time), [bills, month, kw, fPid, fAid, parents, currentBookId, fMin, fMax, fTag, fFrom, fTo, dateRangeActive])

  const tList = useMemo(() => transfers.filter((t) => {
    if (!rangeAll && !dateRangeActive && monthOf(t.time) !== month) return false
    if (currentBookId !== 0 && t.bookId !== undefined && String(t.bookId) !== String(currentBookId)) return false
    if (fAid && t.fromAssetId !== fAid && t.toAssetId !== fAid) return false
    if (fPid) return false
    // 金额范围同样作用于转账本金
    const amount = Number(t.cost) || 0
    if (fMin !== '' && amount < Number(fMin)) return false
    if (fMax !== '' && amount > Number(fMax)) return false
    // 标签筛选：转账通常没有标签，指定标签时不显示
    if (fTag) return false
    if (fFrom) {
      const from = new Date(fFrom + 'T00:00:00').getTime()
      if (t.time < from) return false
    }
    if (fTo) {
      const to = new Date(fTo + 'T23:59:59').getTime()
      if (t.time > to) return false
    }
    if (kw) {
      const hay = (t.remark || '') + ' 转账'
      if (!hay.toLowerCase().includes(kw.toLowerCase())) return false
    }
    return true
  }), [transfers, month, kw, fPid, fAid, currentBookId, fMin, fMax, fTag, fFrom, fTo, dateRangeActive])

  const { income, expense } = summarizeBills(list, parents, refunds)

  type Item = { kind: 'bill'; time: number; b: Bill } | { kind: 'transfer'; time: number; t: typeof transfers[number] }
  const groups = useMemo(() => {
    const all: Item[] = [
      ...list.map((b) => ({ kind: 'bill' as const, time: b.time, b })),
      ...tList.map((t) => ({ kind: 'transfer' as const, time: t.time, t }))
    ].sort((x, y) => y.time - x.time)
    const m = new Map<string, Item[]>()
    all.forEach((it) => {
      const k = fullDay(it.time)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(it)
    })
    return [...m.entries()]
  }, [list, tList])

  return (
    <section className={embedded ? 'card embedded' : 'card'}>
      {!embedded && (
      <div className="row2">
        <div>
          <div className="label">月份</div>
          <input aria-label="账单月份" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="summary">
          <div><small>收入</small><b className="in">{money(income)}</b></div>
          <div><small>支出</small><b className="out">{money(expense)}</b></div>
          <div><small>结余</small><b>{money(income - expense)}</b></div>
        </div>
      </div>
      )}

      {!embedded && (
      <div className="filters">
        <input className="kw" aria-label="搜索备注、分类或标签" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索备注 / 分类 / 标签" />
        <select aria-label="按分类筛选" value={fPid} onChange={(e) => setFPid(Number(e.target.value))}>
          <option value={0}>全部分类</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="按账户筛选" value={fAid} onChange={(e) => setFAid(Number(e.target.value))}>
          <option value={0}>全部账户</option>
          {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
        </select>
        <select aria-label="按标签筛选" value={fTag} onChange={(e) => setFTag(e.target.value)}>
          <option value="">全部标签</option>
          {tags.map((t) => <option key={t.tagId} value={t.name}>#{t.name}</option>)}
        </select>
        <input aria-label="最小金额" className="kw" inputMode="decimal" placeholder="金额 ≥" value={fMin}
          onChange={(e) => setFMin(e.target.value.replace(/[^\d.]/g, ''))} />
        <input aria-label="最大金额" className="kw" inputMode="decimal" placeholder="金额 ≤" value={fMax}
          onChange={(e) => setFMax(e.target.value.replace(/[^\d.]/g, ''))} />
        <input aria-label="起始日期" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
        <input aria-label="结束日期" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
        {hasFilters && <button className="ghost" onClick={resetFilters}>重置</button>}
      </div>
      )}

      {groups.length === 0 && <div className="empty">
        {hasFilters ? <><p>没有符合条件的账单</p><button className="ghost" onClick={() => { setKw(''); setFPid(0); setFAid(0) }}>清除筛选</button></>
          : <><p>本月还没有账单</p>{onAdd && <button className="ghost" onClick={onAdd}>记第一笔</button>}</>}
      </div>}

      {groupsInList.map((g) => {
        const members = g.billList.map((id) => bills.find((b) => String(b.billId) === String(id))).filter(Boolean) as Bill[]
        const first = members[0]
        if (!first) return null
        return (
          <div key={'g' + g.billGroupId} className="group">
            <div className="day"><span>账单组</span><small>{members.length} 笔 · 合计 {money(g.totalNumber)}</small></div>
            {members.map((m) => (
              <div key={'gm' + String(m.billId)} className="row">
                <i className="dot">·</i>
                <div className="grow">
                  <div>{parents.find((p) => p.id === m.parentCategoryId)?.name ?? '未分类'}{m.remark ? ` · ${m.remark}` : ''}</div>
                  <small>{dayOf(m.time)} · 组内明细</small>
                </div>
                <b className="out">{money(m.cost)}</b>
                <button className="link" onClick={() => setDetail(m)}>明细</button>
              </div>
            ))}
            <div className="row">
              <button className="link" onClick={() => dissolveBillGroup(g.billGroupId)}>解散账单组</button>
            </div>
          </div>
        )
      })}
      {groups.map(([day, rows]) => {
        const dayBills = rows.filter((it) => it.kind === 'bill').map((it) => (it as { b: Bill }).b)
        const daySum = summarizeBills(dayBills, parents, refunds)
        const label = humanDay(day)
        return (
        <div key={day} className="group">
          <div className="day">
            <span>{label}</span>
            <small>
              {daySum.income ? `收 ${money(daySum.income)}` : ''}
              {daySum.income && daySum.expense ? ' · ' : ''}
              {daySum.expense ? `支 ${money(daySum.expense)}` : ''}
            </small>
          </div>
          {rows.map((it) => {
            if (it.kind === 'transfer') {
              const t = it.t
              const from = assets.find((a) => a.assetId === t.fromAssetId)
              const to = assets.find((a) => a.assetId === t.toAssetId)
              return (
                <div key={'t' + t.transferId} className="row ledger-row">
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
                  <div className="ledger-actions">
                    <button className="link" aria-label="编辑转账" onClick={() => setEditingTransfer(t)}>编辑</button>
                    <button className="del" aria-label="删除转账" onClick={() => delTransfer(t.transferId)}>删除</button>
                  </div>
                </div>
              )
            }
            const b = it.b
            const p = parents.find((x) => x.id === b.parentCategoryId)
            const a = assets.find((x) => x.assetId === b.assetId)
            const inc = p?.kind === 'income'
            return (
              <div key={b.billId} className={'row ledger-row' + (simpleView ? ' simple' : '')}>
                <span className="dot-badge" style={{ background: p?.bg ?? 'var(--accent-soft)', color: p?.color ?? 'var(--ink)' }}>
                  <CatIcon k={p?.icon} size={16} />
                </span>
                <div className="grow">
                  <div>
                    {p?.name ?? '未分类'}
                    {!!b.childCategoryId && !resolveBillChild(b, children) && <span className="tag">分类待核对</span>}
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
                    {b.ownerId && b.ownerId !== userId ? ` · 由成员记账` : ''}
                  </small>
                  {(reimbursements.some((r) => r.billId === b.billId) || (b.refundNum ?? 0) > 0 || (b.tags?.length ?? 0) > 0 || (b.files?.length ?? 0) > 0) && (
                    <div className="tags">
                      {reimbursements.filter((r) => r.billId === b.billId).map((r) => (
                        <span key={r.reimbursementId} className={'tag' + (r.status === 'done' ? ' ok' : '')}>
                          报销 {accountMoney(r.number, assets.find((asset) => asset.assetId === r.assetId)?.currency, currencies, defaultCurrency)} · {r.status === 'done' ? '已到账' : r.status === 'ended' ? '已结束' : '待报销'}
                        </span>
                      ))}
                      {(b.refundNum ?? 0) > 0 && <span className="tag">已退 {money(b.refundNum!)}</span>}
                      {(b.files?.length ?? 0) > 0 && <span className="tag" title={b.files!.map((f) => f.name).join('、')}>附件 {b.files!.length}</span>}
                      {(b.tags || []).map((name) => {
                        const t = tagsByName.get(name)
                        return <span key={name} className="tag" style={t ? { background: t.color, color: 'var(--ink)' } : undefined}>{name}</span>
                      })}
                    </div>
                  )}
                </div>
                <span className="cost-cell">
                  {(b.discountNumber ?? 0) > 0 && (
                    <s className="old-cost">{money(+(b.cost + (b.discountNumber ?? 0)).toFixed(2))}</s>
                  )}
                  <b className={inc ? 'in' : 'out'}>{inc ? '+' : '-'}{money(inc ? b.cost : billNetAmount(b, refunds))}</b>
                </span>
                <div className="ledger-actions">
                  <button className="link" aria-label={`查看${p?.name ?? '账单'}明细`} onClick={() => setDetail(b)}>明细</button>
                  {!readOnly && <button className="link" aria-label={`编辑${p?.name ?? '账单'}`} onClick={() => setEditing(b)}>编辑</button>}
                  {!readOnly && <button className="link" aria-label={`复制${p?.name ?? '账单'}`} onClick={() => duplicate(b.billId)}>复制</button>}
                  {!readOnly && <button className="del" aria-label={`删除${p?.name ?? '账单'}`} onClick={() => removeWithUndo(b)}>删除</button>}
                </div>
              </div>
            )
          })}
        </div>
        )
      })}

      {undoBill && (
        <div className="undo-bar" role="status">
          <span>已删除 1 笔</span>
          <button className="link" onClick={() => { restore(undoBill); setUndoBill(null) }}>撤销</button>
          <button className="del" aria-label="关闭提示" onClick={() => setUndoBill(null)}>×</button>
        </div>
      )}

      {detail && bills.some((b) => b.billId === detail.billId) && (
        <BillDetail
          bill={bills.find((b) => b.billId === detail.billId)!}
          me={me}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(bills.find((b) => b.billId === detail.billId) ?? detail); setDetail(null) }}
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="drow"><span className="dl">{label}</span><span className="dv">{children}</span></div>
}

function DetailToggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return <div className="drow">
    <span className="dl">{label}</span>
    <button className={'switch' + (on ? ' on' : '')} role="switch" aria-label={label} aria-checked={on} onClick={onToggle}><i /></button>
  </div>
}

function BillDetail({ bill, me, onClose, onEdit }: {
  bill: Bill; me?: { id: number; email: string }
  onClose: () => void; onEdit: () => void
}) {
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const assets = useLedger((s) => s.assets)
  const books = useLedger((s) => s.accountBooks)
  const refunds = useLedger((s) => s.refunds)
  const splitGroups = useLedger((s) => s.splitGroups)
  const splitMembers = useLedger((s) => s.splitMembers)
  const splitExpenses = useLedger((s) => s.splitExpenses)
  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const allTags = useLedger((s) => s.tags)
  const tags = allTags.filter((t) => !t.hide)
  const updateBill = useLedger((s) => s.updateBill)
  const del = useLedger((s) => s.deleteBill)
  const bills = useLedger((s) => s.bills)
  const billRelated = useLedger((s) => s.billRelated)
  const unlinkBills = useLedger((s) => s.unlinkBills)
  const linkBills = useLedger((s) => s.linkBills)
  const createBillGroup = useLedger((s) => s.createBillGroup)
  const billGroupsAll = useLedger((s) => s.billGroups)
  const [linkTarget, setLinkTarget] = useState('')

  const p = parents.find((x) => x.id === bill.parentCategoryId)
  const c = resolveBillChild(bill, children)
  const a = assets.find((x) => x.assetId === bill.assetId)
  const billRefunds = refunds.filter((r) => r.billId === bill.billId)
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


  return (
    <Modal label="账单详情" className="detail" onClose={onClose}>
        <div className="dhead" style={{ background: p?.bg ?? 'var(--accent-soft)', color: p?.color ?? 'var(--ink)' }}>
          <CatIcon k={c?.icon ?? p?.icon} size={34} />
          <div className="grow">
            <div className="dt">{p?.name}{c ? ` - ${c.name}` : ''}</div>
            <div className="ds">{dayOf(bill.time)} {hhmm(bill.time)}</div>
            {bill.remark && <div className="ds">{bill.remark}</div>}
          </div>
          <div className="damt">{isIncome ? '+' : '-'}{money(isIncome ? bill.cost : billNetAmount(bill, refunds))}</div>
          <button type="button" className="detail-close" aria-label="关闭账单详情" onClick={onClose}>×</button>
        </div>

        {(() => {
          const shares = parseShares(bill.billShareInfo)
          if (!shares.length) return null
          const group = splitGroups.find((g) => g.splitGroupId === bill.splitGroupId)
          const members = splitMembers.filter((m) => m.splitGroupId === bill.splitGroupId)
          const expense = splitExpenses.find((x) => String(x.sourceBillId) === String(bill.billId))
          const { amounts } = splitAmounts(bill.cost, members, expense?.splitType ?? 0,
            Object.fromEntries(shares.map((x) => [x.memberId, x.value])))
          return (
            <Row label={`AA 分摊${group ? '（' + group.name + '）' : ''}`}>
              {members.map((m) => `${m.name}${m.self ? '（我）' : ''} ${money(amounts[m.splitMemberId] ?? 0)}`).join(' · ')}
            </Row>
          )
        })()}
        <Row label="账单分类"><CatIcon k={c?.icon ?? p?.icon} size={18} />{p?.name}{bill.childCategoryId && !c ? ' - 子分类待核对' : c ? ` - ${c.name}` : ''}</Row>
        <Row label="账单日期">{dayOf(bill.time)} {hhmm(bill.time)}</Row>
        <Row label="收支账户">{a && <AssetIcon type={a.assetType} name={a.assetName} icon={a.assetIcon} size={20} />}{a?.assetName ?? '无'}</Row>
        {billRefunds.map((refund) => {
          const refundAsset = assets.find((x) => x.assetId === (refund.assetId ?? bill.assetId))
          return <Row key={refund.refundId} label="已退款">{refund.baseAmount != null ? money(refund.baseAmount) : accountMoney(refund.number, refund.currency ?? refundAsset?.currency, currencies, defaultCurrency)} · {refundAsset?.assetName ?? '账户'}</Row>
        })}
        {bill.discountNumber ? <Row label="优惠">{money(bill.discountNumber)}</Row> : null}
        {bill.reimbursementEnd ? <Row label="报销">已结束</Row> : null}
        {bill.files?.length ? (
          <Row label="附件">
            {bill.files.map((f) => (
              <a key={f.remotePath} href={f.remotePath} target="_blank" rel="noreferrer" className="tag">{f.name}</a>
            ))}
          </Row>
        ) : null}
        {(() => {
          const links = billRelated.filter((r) =>
            String(r.oneBillId) === String(bill.billId) || String(r.twoBillId) === String(bill.billId))
          if (!links.length) return null
          return (
            <Row label="关联账单">
              {links.map((r) => {
                const otherId = String(r.oneBillId) === String(bill.billId) ? r.twoBillId : r.oneBillId
                const other = bills.find((b) => String(b.billId) === String(otherId))
                return (
                  <span key={r.relatedId} className="tag">
                    {other ? `${parents.find((p) => p.id === other.parentCategoryId)?.name ?? '未分类'} ${money(other.cost)}` : '已删除账单'}
                    <button className="link" onClick={() => unlinkBills(r.relatedId)}>解除</button>
                  </span>
                )
              })}
            </Row>
          )
        })()}
        <Row label="备注">{bill.remark || '无'}</Row>
        <Row label="标签">
          {(bill.tags && bill.tags.length)
            ? bill.tags.map((t) => (
              <span key={t} className="tag" style={{ background: tagColor(t) ?? undefined, color: 'var(--ink)' }}>{t}</span>
            ))
            : '无'}
        </Row>
        <Row label="附件">{bill.files && bill.files.length ? `${bill.files.length} 个` : '无'}</Row>
        <DetailToggle label="不计入收支" on={!!bill.notIntoTotal} onToggle={() => updateBill(bill.billId, { notIntoTotal: !bill.notIntoTotal })} />
        <DetailToggle label="不计入预算" on={!!bill.notIntoBudget} onToggle={() => updateBill(bill.billId, { notIntoBudget: !bill.notIntoBudget })} />
        <Row label="所属账本">{bk?.accountBookName ?? '默认账本'}</Row>
        <Row label="记录时间">{dayOf(bill.recordTime ?? bill.time)} {hhmm(bill.recordTime ?? bill.time)}</Row>
        <details className="detail-related">
          <summary>关联与合并账单</summary>
          <p className="hint"></p>
          <div className="row2">
            <select aria-label="选择要关联的账单" value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)}>
              <option value="">选择另一笔账单…</option>
              {bills.filter((b) => String(b.billId) !== String(bill.billId) && String(b.bookId ?? '') === String(bill.bookId ?? ''))
                .slice(0, 50)
                .map((b) => <option key={String(b.billId)} value={String(b.billId)}>
                  {dayOf(b.time)} {parents.find((p) => p.id === b.parentCategoryId)?.name ?? ''} {money(b.cost)}
                </option>)}
            </select>
            <button className="ghost" disabled={!linkTarget} onClick={() => {
              if (linkBills(bill.billId, linkTarget)) { onClose(); return }
              alert('这笔账单已在关联中或无法关联')
            }}>关联</button>
          </div>
          <button className="ghost wide" onClick={() => {
            const list: Array<string | number> = [bill.billId, ...billRelated
              .filter((r) => String(r.oneBillId) === String(bill.billId) || String(r.twoBillId) === String(bill.billId))
              .map((r) => (String(r.oneBillId) === String(bill.billId) ? r.twoBillId : r.oneBillId))]
            if (createBillGroup(list)) { onClose(); return }
            alert('合并需要至少两笔同账本账单，且不能已属于其他账单组')
          }}>合并为一组（含已关联的账单）</button>
          {billGroupsAll.some((g) => g.billList.map(String).includes(String(bill.billId))) && (
            <p className="hint"></p>
          )}
        </details>
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
    </Modal>
  )
}

function EditBill({ bill, onClose, onSave }: { bill: Bill; onClose: () => void; onSave: (p: Partial<Bill>) => void }) {
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const assets = useLedger((s) => s.assets)
  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const reimbursements = useLedger((s) => s.reimbursements)
  const refunds = useLedger((s) => s.refunds)
  const addReimbursement = useLedger((s) => s.addReimbursement)
  const settleReimbursement = useLedger((s) => s.settleReimbursement)
  const deleteReimbursement = useLedger((s) => s.deleteReimbursement)
  const endReimbursement = useLedger((s) => s.endReimbursement)
  const addRefund = useLedger((s) => s.addRefund)
  const deleteRefund = useLedger((s) => s.deleteRefund)
  const updateRefund = useLedger((s) => s.updateRefund)

  const myReimbs = reimbursements.filter((r) => r.billId === bill.billId)
  const claimedTotal = +myReimbs.reduce((sum, r) => sum + (Number(r.number) || 0), 0).toFixed(2)
  const claimRemaining = +Math.max(0, bill.cost - claimedTotal).toFixed(2)
  const myRefunds = refunds.filter((r) => r.billId === bill.billId)
  const hasLegacyRefund = myRefunds.some((r) => r.baseAmount == null)
  const refundedTotal = +myRefunds.reduce((sum, r) => sum + (Number(r.baseAmount) || 0), 0).toFixed(2)
  const refundRemaining = +Math.max(0, bill.cost - refundedTotal).toFixed(2)
  const [rAsset, setRAsset] = useState(bill.assetId || assets[0]?.assetId || 0)
  const [rAmount, setRAmount] = useState(() => {
    const account = assets.find((a) => a.assetId === bill.assetId) ?? assets[0]
    return (account?.currency ?? defaultCurrency) === defaultCurrency ? String(bill.cost) : ''
  })
  const [fAmount, setFAmount] = useState('')
  const [fAsset, setFAsset] = useState(0)
  const reimbursementCurrency = assets.find((a) => a.assetId === rAsset)?.currency ?? defaultCurrency
  const refundAccount = assets.find((a) => a.assetId === (fAsset || bill.assetId))
  const refundCurrency = refundAccount?.currency ?? defaultCurrency
  const refundBase = Number(fAmount)
  const refundRateAvailable = hasCurrencyRate(refundCurrency, currencies, defaultCurrency)
  const refundAccountAmount = refundRateAvailable && Number.isFinite(refundBase) ? fromBase(refundBase, refundCurrency, currencies, defaultCurrency) : 0
  const isExpense = parents.find((p) => p.id === bill.parentCategoryId)?.kind !== 'income'

  const [cost, setCost] = useState(String(bill.cost))
  const groups = useLedger((s) => s.splitGroups)
  const allSplitMembers = useLedger((s) => s.splitMembers)
  const applySplit = useLedger((s) => s.applySplit)
  const [splitGroupId, setSplitGroupId] = useState(Number(bill.splitGroupId ?? 0))
  const [splitType, setSplitType] = useState<0 | 1 | 2>(0)
  const [splitValues, setSplitValues] = useState<Record<number, string>>({})
  const groupMembers = allSplitMembers.filter((m) => m.splitGroupId === splitGroupId)
  const payerMemberId = groupMembers.find((m) => m.self)?.splitMemberId
  const [discount, setDiscount] = useState(bill.discountNumber != null ? String(bill.discountNumber) : '')
  const [pid, setPid] = useState(bill.parentCategoryId)
  const [cid, setCid] = useState(() => resolveBillChild(bill, children)?.id ?? 0)
  const [categoryConfirmed, setCategoryConfirmed] = useState(() => !bill.childCategoryId || !!resolveBillChild(bill, children))
  const [aid, setAid] = useState(bill.assetId)
  const [remark, setRemark] = useState(bill.remark)
  const [time, setTime] = useState(toLocalInput(bill.time))

  const subs = children.filter((c) => c.parentId === pid)

  return (
    <Modal label="修改账单" onClose={onClose}>
        <h3>修改账单</h3>
        <div className="label">金额</div>
        <input
          aria-label="账单原始金额"
          value={cost}
          autoFocus

          onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))}
          inputMode="decimal"
        />
        {Number(cost) < refundedTotal && <p className="hint">原账单金额不能小于已退款金额。</p>}
        <div className="label">分类</div>
        <select aria-label="账单分类" value={pid} onChange={(e) => { setPid(Number(e.target.value)); setCid(0); setCategoryConfirmed(true) }}>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {subs.length > 0 && (
          <>
            <div className="label">子分类</div>
            {!categoryConfirmed && <p className="warn">历史子分类编号有冲突，请重新选择，或明确选择“不选”。</p>}
            <select aria-label="账单子分类" value={categoryConfirmed ? cid : ''} onChange={(e) => { setCid(Number(e.target.value)); setCategoryConfirmed(true) }}>
              {!categoryConfirmed && <option value="" disabled>请选择正确的子分类</option>}
              <option value={0}>不选</option>
              {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
        <div className="label">账户</div>
        <select aria-label="账单账户" value={aid} onChange={(e) => setAid(Number(e.target.value))}>
          {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
        </select>
        <div className="label">时间</div>
        <input aria-label="账单时间" type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
        <div className="label">备注</div>
        <input aria-label="账单备注" value={remark} onChange={(e) => setRemark(e.target.value)} />
        <div className="label">附件（图片或 PDF，可选）</div>
        <p className="hint">附件仅保留 30 天，到期自动销毁；导出备份不含附件文件（原图会先压缩到 1MB 内再上传）。</p>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" aria-label="添加附件"
          onChange={async (e) => {
            let f = e.target.files?.[0]
            if (!f) return
            try {
              // 图片先压缩再上传：手机原图 3-8MB，压到 1MB 内；附件只保留 30 天
              if (f.type.startsWith('image/')) {
                f = await imageCompression(f, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true })
              }
              const res = await fetch(`/api/files?name=${encodeURIComponent(f.name)}`, {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/octet-stream' }, body: f
              })
              const data = await res.json()
              if (data.code !== 0) throw new Error(data.msg || '上传失败')
              onSave({
                files: [...(bill.files ?? []), {
                  fileId: Date.now(),
                  billId: bill.billId,
                  fileName: data.result.name,
                  name: data.result.name,
                  fileSize: f.size,
                  remotePath: data.result.url
                }]
              })
            } catch (err) { alert((err as Error).message) }
          }} />
        {bill.files?.length ? <p className="hint">已有 {bill.files.length} 个附件</p> : null}

        <div className="label">优惠金额（可选，本币）</div>
        <input aria-label="优惠金额" value={discount} inputMode="decimal" placeholder="例如商家满减 10"
          onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))} />
        <p className="hint"></p>

        <div className="label">AA 分摊（一木：群组 + 均分/按金额/按份额）</div>
        {groups.length === 0 ? (
          <p className="hint">还没有 AA 群组，去「我的 → AA 群组」先建一个。</p>
        ) : (
          <>
            <div className="row2">
              <select aria-label="AA 群组" value={splitGroupId}
                onChange={(e) => setSplitGroupId(Number(e.target.value))}>
                <option value={0}>不分摊</option>
                {groups.map((g) => <option key={g.splitGroupId} value={g.splitGroupId}>{g.name}</option>)}
              </select>
              <select aria-label="分摊方式" value={splitType}
                onChange={(e) => setSplitType(Number(e.target.value) as 0 | 1 | 2)}>
                <option value={0}>均分</option>
                <option value={1}>按金额</option>
                <option value={2}>按份额</option>
              </select>
            </div>
            {splitGroupId > 0 && (
              <>
                <div className="hint">成员：{groupMembers.map((m) => m.name).join('、')}</div>
                {splitType !== 0 && groupMembers.map((m) => (
                  <div key={m.splitMemberId} className="cat-child">
                    <span className="grow">{m.name}</span>
                    <input aria-label={`${m.name} 的${splitType === 1 ? '金额' : '份额'}`} inputMode="decimal"
                      value={splitValues[m.splitMemberId] ?? ''}
                      onChange={(e) => setSplitValues({ ...splitValues, [m.splitMemberId]: e.target.value.replace(/[^\d.]/g, '') })} />
                  </div>
                ))}
                <button className="ghost wide" onClick={() => {
                  const values: Record<number, number> = {}
                  for (const m of groupMembers) values[m.splitMemberId] = Number(splitValues[m.splitMemberId]) || 0
                  if (!applySplit(bill.billId, splitGroupId, splitType, values, payerMemberId)) {
                    alert(splitType === 1 ? '按金额分摊时，各人金额合计必须等于账单金额' : '请填写有效的份额')
                    return
                  }
                  onSave({ splitGroupId })
                }}>应用分摊</button>
              </>
            )}
          </>
        )}
        {isExpense && (
          <>
            <div className="label">报销</div>
            {myReimbs.length > 0 && (
              <p className="hint">
                已报 {money(claimedTotal)}
                {claimRemaining > 0 ? ` · 还可报 ${money(claimRemaining)}` : ' · 已报完'}
              </p>
            )}
            {myReimbs.map((r) => (
              <div key={r.reimbursementId} className="attach-line">
                <span>
                  {r.status === 'done' ? '✅ 已到账' : r.status === 'ended' ? '⏹ 已结束' : '⏳ 待报销'} {accountMoney(r.number, assets.find((a) => a.assetId === r.assetId)?.currency, currencies, defaultCurrency)}
                  {r.assetId ? ' → ' + (assets.find((a) => a.assetId === r.assetId)?.assetName ?? '报销账户') : ''}
                </span>
                {r.status === 'pending' && (
                  <button className="link" onClick={() => settleReimbursement(r.reimbursementId)}>确认到账</button>
                )}
                <button className="del" onClick={() => deleteReimbursement(r.reimbursementId)}>撤销</button>
              </div>
            ))}
            {claimRemaining > 0 && (
              <div className="row2">
                <select aria-label="报销账户" value={rAsset} onChange={(e) => { setRAsset(Number(e.target.value)); setRAmount('') }}>
                  <option value={0}>报销进哪个账户</option>
                  {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
                </select>
                <input value={rAmount} onChange={(e) => setRAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`本次报销（${reimbursementCurrency}，最多 ${claimRemaining}）`} aria-label={`报销金额（${reimbursementCurrency}）`} inputMode="decimal" />
              </div>
            )}
            {bill.reimbursementEnd ? (
              <p className="hint">报销流程已结束（不再等待报销）。</p>
            ) : (
              <button className="ghost wide" onClick={() => { endReimbursement(bill.billId); onSave({ reimbursementEnd: true }) }}>
                结束报销（不再等待）
              </button>
            )}
            {claimRemaining > 0 && (
              <button className="ghost wide" disabled={!rAsset || !Number.isFinite(Number(rAmount)) || Number(rAmount) <= 0 || Number(rAmount) > claimRemaining} onClick={() => { addReimbursement({
                billId: bill.billId, assetId: rAsset, number: Number(rAmount) || 0, detail: remark
              }); setRAmount('') }}>登记报销（钱到账后再确认）</button>
            )}

            <div className="label">退款</div>
            {myRefunds.length > 0 && (
              <p className="hint">已退 {money(refundedTotal)} · 还可退 {money(refundRemaining)}</p>
            )}
            {myRefunds.map((r) => (
              <div key={r.refundId} className="attach-line">
                <span>{r.baseAmount == null ? '原币退款' : money(r.baseAmount)}（到账 {accountMoney(r.number, r.currency ?? assets.find((a) => a.assetId === (r.assetId ?? bill.assetId))?.currency, currencies, defaultCurrency)} · {assets.find((a) => a.assetId === (r.assetId ?? bill.assetId))?.assetName ?? '账户'}）</span>
                <input aria-label={`退款金额 ${r.refundId}`} className="kw" inputMode="decimal"
                  defaultValue={String(r.baseAmount ?? r.number)}
                  onBlur={(e) => {
                    const v = Number(e.target.value)
                    if (!Number.isFinite(v) || v <= 0) return
                    if (!updateRefund(r.refundId, { baseAmount: v })) {
                      alert('改动超过了账单可退金额')
                      e.target.value = String(r.baseAmount ?? r.number)
                    }
                  }} />
                <button className="del" onClick={() => deleteRefund(r.refundId)}>撤销</button>
              </div>
            ))}
            {hasLegacyRefund && <p className="hint">旧退款缺本币金额，请先核对。</p>}
            {!hasLegacyRefund && refundRemaining > 0 && (
              <>
                <input value={fAmount} onChange={(e) => setFAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`本次退款金额（${defaultCurrency}，最多 ${refundRemaining}）`} aria-label={`本次退款金额（${defaultCurrency}）`} inputMode="decimal" />
                <select value={fAsset} onChange={(e) => setFAsset(Number(e.target.value))} aria-label="退款账户">
                  <option value={0}>默认退回支付账户（{assets.find((a) => a.assetId === bill.assetId)?.assetName ?? '未找到'}）</option>
                  {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}（{a.currency ?? defaultCurrency}）</option>)}
                </select>
                {!refundRateAvailable && <p className="hint">请先设置 {refundCurrency} 汇率。</p>}
                {refundBase > refundRemaining && <p className="hint">本次退款 {money(refundBase)} 超过还可退的 {money(refundRemaining)}。</p>}
                {refundAccount && refundCurrency !== defaultCurrency && refundBase > 0 && refundRateAvailable && <p className="hint">按当前汇率预计到账 {accountMoney(refundAccountAmount, refundCurrency, currencies, defaultCurrency)}</p>}
                <button className="ghost wide" disabled={!refundAccount || !Number.isFinite(refundBase) || refundBase <= 0 || refundBase > refundRemaining || !refundRateAvailable || refundAccountAmount <= 0} onClick={() => { addRefund({ billId: bill.billId, assetId: fAsset || undefined, number: refundAccountAmount, baseAmount: refundBase }); setFAmount('') }}>保存退款</button>
              </>
            )}
          </>
        )}

        <div className="modal-btns">
          <button className="ghost" onClick={onClose}>取消</button>
          <button className="primary" disabled={!categoryConfirmed || Number(cost) < refundedTotal} onClick={() => onSave({
            cost: Number(cost) || bill.cost,
            parentCategoryId: pid,
            childCategoryId: cid,
            assetId: aid,
            remark,
            time: new Date(time).getTime(),
            // 优惠金额必须真的提交，否则用户填了等于没填
            discountNumber: discount.trim() === '' ? undefined : Number(discount)
          })}>保存</button>
        </div>
    </Modal>
  )
}

/** 汇率输入：内部保留草稿，失焦或回车才提交，输入过程不会写坏数据 */
