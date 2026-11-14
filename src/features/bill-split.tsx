import { useMemo, useState } from 'react'
import { useLedger } from '../store'
import { money, fullDay } from '../ui-format'
import { CatIcon } from '../ui/icons'
import type { Bill } from '../types'

/**
 * 账单拆分（对齐一木 activity_bill_split.xml / BillSplitActivity）
 * 结构：原账单信息（分类/金额/时间/账户/标签/备注）+ 每笔拆分（分类、子分类、金额、账户、备注）+ 新增拆分账单
 * 校验：「至少拆分成两笔账单」（金额为 0 的分录先剔除）
 * 结果：拆出的多笔账单用 BillGroup 关联（与一木一致）
 */
interface SplitRow { num: string; parentCategoryId: number; childCategoryId: number; assetId: number; remark: string }

export function BillSplitEditor({ bill, onDone, notify }: { bill: Bill; onDone: () => void; notify: (m: string) => void }) {
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const assets = useLedger((s) => s.assets)
  const refunds = useLedger((s) => s.refunds)
  const reimbursements = useLedger((s) => s.reimbursements)
  const splitBill = useLedger((s) => s.splitBill)

  const [rows, setRows] = useState<SplitRow[]>([
    { num: '', parentCategoryId: bill.parentCategoryId, childCategoryId: bill.childCategoryId ?? 0, assetId: bill.assetId, remark: bill.remark },
    { num: '', parentCategoryId: bill.parentCategoryId, childCategoryId: bill.childCategoryId ?? 0, assetId: bill.assetId, remark: '' }
  ])

  const total = useMemo(() => +rows.reduce((n, r) => n + (Number(r.num) || 0), 0).toFixed(2), [rows])
  const diff = +(bill.cost - total).toFixed(2)

  const update = (i: number, patch: Partial<SplitRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const complete = () => {
    const parts = rows
      .filter((r) => Number(r.num) > 0)
      .map((r) => ({
        num: Number(r.num),
        parentCategoryId: r.parentCategoryId,
        childCategoryId: r.childCategoryId || undefined,
        assetId: r.assetId,
        remark: r.remark
      }))
    if (parts.length < 2) { notify('至少拆分成两笔账单'); return }
    const ok = splitBill(bill.billId, parts)
    notify(ok ? '账单已拆分' : '拆分失败：请检查金额、分类方向、账户币种、退款/报销状态及账本权限')
    if (ok) onDone()
  }

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onDone}>‹ 返回</button>
        <h3>账单拆分</h3>
        <button type="button" className="link" onClick={complete}>完成</button>
      </div>

      <div className="row">
        <div className="grow">
          <div>{parents.find((p) => p.id === bill.parentCategoryId)?.name ?? '未分类'}</div>
          <small>{fullDay(bill.time)}</small>
        </div>
        <b>{money(bill.cost)}</b>
      </div>
      <p className="hint">拆出金额合计 {money(total)}{diff !== 0 ? `（与原账单相差 ${money(diff)}）` : ''}</p>

      {/* 原账单信息（对齐 activity_bill_split 的展示项：标签/优惠/退款/报销/不计收支/不计预算） */}
      <div className="cat-block">
        <div className="row"><span className="grow muted">标签</span><span>{bill.tags?.length ? bill.tags.join('、') : '无'}</span></div>
        {(bill.discountNumber ?? 0) > 0 && <div className="row"><span className="grow muted">优惠</span><span>{money(bill.discountNumber!)}</span></div>}
        {refunds.some((r) => String(r.billId) === String(bill.billId)) && (
          <div className="row"><span className="grow muted">退款</span><span>{money(refunds.filter((r) => String(r.billId) === String(bill.billId)).reduce((n, r) => n + r.number, 0))}</span></div>
        )}
        {reimbursements.some((r) => String(r.billId) === String(bill.billId)) && (
          <div className="row"><span className="grow muted">报销</span><span>{money(reimbursements.filter((r) => String(r.billId) === String(bill.billId)).reduce((n, r) => n + r.number, 0))}</span></div>
        )}
        {(bill.notIntoTotal || bill.notIntoBudget) && (
          <div className="row"><span className="grow muted">其他</span><span>{[bill.notIntoTotal ? '不计收支' : '', bill.notIntoBudget ? '不计预算' : ''].filter(Boolean).join(' · ')}</span></div>
        )}
      </div>

      {rows.map((r, i) => {
        const childList = children.filter((c) => c.parentId === r.parentCategoryId)
        return (
          <div key={i} className="split-item">
            <div className="split-row">
              <CatIcon k={parents.find((p) => p.id === r.parentCategoryId)?.icon} size={16} />
              <select className="split-cat" aria-label={`第 ${i + 1} 笔分类`} value={r.parentCategoryId}
                onChange={(e) => update(i, { parentCategoryId: Number(e.target.value), childCategoryId: 0 })}>
                {parents.filter((p) => !p.hide).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input className="split-num" aria-label={`第 ${i + 1} 笔金额`} inputMode="decimal" value={r.num}
                onChange={(e) => update(i, { num: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0.00" />
              {rows.length > 2 && (
                <button type="button" className="del" aria-label={`删除第 ${i + 1} 笔`}
                  onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
              )}
            </div>
            <div className="split-row">
              {childList.length > 0 && (
                <select aria-label={`第 ${i + 1} 笔子分类`} value={r.childCategoryId}
                  onChange={(e) => update(i, { childCategoryId: Number(e.target.value) })}>
                  <option value={0}>不选子分类</option>
                  {childList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <select aria-label={`第 ${i + 1} 笔账户`} value={r.assetId}
                onChange={(e) => update(i, { assetId: Number(e.target.value) })}>
                {assets.filter((a) => !a.hide).map((a) => <option key={a.assetId} value={a.assetId}>{a.simpleName || a.assetName}</option>)}
              </select>
              <input aria-label={`第 ${i + 1} 笔备注`} value={r.remark} onChange={(e) => update(i, { remark: e.target.value })}
                placeholder="备注（可选）" />
            </div>
          </div>
        )
      })}

      <button type="button" className="ghost wide"
        onClick={() => setRows((prev) => [...prev, { num: '', parentCategoryId: bill.parentCategoryId, childCategoryId: 0, assetId: bill.assetId, remark: '' }])}>
        新增拆分账单
      </button>
    </>
  )
}
