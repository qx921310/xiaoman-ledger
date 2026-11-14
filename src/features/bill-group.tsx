import { useMemo, useState } from 'react'
import { useLedger } from '../store'
import { money, fullDay } from '../ui-format'
import { CatIcon } from '../ui/icons'

/**
 * 账单组合（对齐一木 activity_bill_group.xml / BillGroupActivity）
 * 结构：合计金额 / 分类选择（图标+名称）/ 备注 / 组内账单列表 / 新增账单
 * 校验：完成时「请至少选择两笔账单」「请选择分类」
 * 数据：BillGroup{ billList, totalNumber, parentCategoryId, childCategoryId, remark }
 */
export function BillGroupEditor({ groupId, billIds, onDone, notify }: {
  /** 编辑已有组合时传；新建时传 billIds */
  groupId?: number
  billIds?: Array<string | number>
  onDone: () => void
  notify: (m: string) => void
}) {
  const bills = useLedger((s) => s.bills)
  const groups = useLedger((s) => s.billGroups)
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const createBillGroup = useLedger((s) => s.createBillGroup)
  const updateBillGroup = useLedger((s) => s.updateBillGroup)
  const dissolveBillGroup = useLedger((s) => s.dissolveBillGroup)

  const existing = groupId != null ? groups.find((g) => g.billGroupId === groupId) : undefined
  const [members, setMembers] = useState<Array<string | number>>(existing?.billList ?? billIds ?? [])
  const [parentId, setParentId] = useState(existing?.parentCategoryId ?? 0)
  const [childId, setChildId] = useState(existing?.childCategoryId ?? 0)
  const [remark, setRemark] = useState(existing?.remark ?? '')
  const [picking, setPicking] = useState(false)

  const picked = useMemo(() => bills.filter((b) => members.map(String).includes(String(b.billId))), [bills, members])
  const total = +picked.reduce((n, b) => n + b.cost, 0).toFixed(2)
  const parent = parents.find((p) => p.id === parentId)
  const childList = children.filter((c) => c.parentId === parentId)
  const candidates = useMemo(() => bills
    .filter((b) => !groups.some((g) => g.billList.map(String).includes(String(b.billId)) && String(g.billGroupId) !== String(groupId ?? '')))
    .filter((b) => !members.map(String).includes(String(b.billId)))
    .sort((a, b) => b.time - a.time)
    .slice(0, 100), [bills, groups, members, groupId])

  const complete = () => {
    if (members.length < 2) { notify('请至少选择两笔账单'); return }
    if (!parentId) { notify('请选择分类'); return }
    if (existing) {
      const ok = updateBillGroup(existing.billGroupId, {
        billList: members, parentCategoryId: parentId,
        childCategoryId: childId || undefined, remark
      })
      notify(ok ? '账单组合已保存' : '保存失败：账本只读，或成员不属于同一可写账本')
      if (!ok) return
    } else {
      const ok = createBillGroup(members, { parentCategoryId: parentId, childCategoryId: childId || undefined, remark })
      notify(ok ? '账单组合已创建' : '创建失败：账本只读，或成员重复、跨账本')
      if (!ok) return
    }
    onDone()
  }

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onDone}>‹ 返回</button>
        <h3>账单组合</h3>
        {existing && (
          <button type="button" className="del" onClick={() => {
            if (!confirm('删除这个账单组合？组内账单仍会保留。')) return
            const ok = dissolveBillGroup(existing.billGroupId)
            notify(ok ? '已删除组合' : '删除失败：当前账本只读')
            if (ok) onDone()
          }}>删除</button>
        )}
        <button type="button" className="link" onClick={complete}>完成</button>
      </div>

      <div className="row"><span className="grow">金额</span><b>{money(total)}</b></div>

      <div className="label">分类</div>
      <button type="button" className="row" onClick={() => setPicking((v) => !v)}>
        {parent ? <><CatIcon k={parent.icon} size={16} /><span className="grow">{parent.name}</span></> : <span className="grow muted">请选择分类</span>}
        <span className="muted">更改</span>
      </button>
      {picking && (
        <div className="cat-grid">
          {parents.filter((p) => !p.hide).map((p) => (
            <button key={p.id} type="button" className={p.id === parentId ? 'cat-cell on' : 'cat-cell'}
              onClick={() => { setParentId(p.id); setChildId(0); setPicking(false) }}>
              <CatIcon k={p.icon} size={20} /><small>{p.name}</small>
            </button>
          ))}
        </div>
      )}
      {childList.length > 0 && (
        <select aria-label="子分类" value={childId} onChange={(e) => setChildId(Number(e.target.value))}>
          <option value={0}>不选子分类</option>
          {childList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}

      <div className="label">备注</div>
      <input aria-label="组合备注" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="可选" />

      <div className="label">组内账单（{members.length} 笔）</div>
      {picked.map((b) => (
        <div key={b.billId} className="row">
          <div className="grow">
            <div>{parents.find((p) => p.id === b.parentCategoryId)?.name ?? '未分类'}{b.remark ? ` · ${b.remark}` : ''}</div>
            <small>{fullDay(b.time)}</small>
          </div>
          <b>{money(b.cost)}</b>
          <button type="button" className="del" onClick={() => setMembers((m) => m.filter((x) => String(x) !== String(b.billId)))}>移</button>
        </div>
      ))}
      <button type="button" className="ghost wide" onClick={() => setPicking(false)} disabled>
        新增账单（在下方选择）
      </button>

      <div className="label">可加入的账单</div>
      {candidates.length === 0 && <p className="hint">没有可以加入的账单。</p>}
      {candidates.map((b) => (
        <button key={b.billId} type="button" className="row"
          onClick={() => setMembers((m) => [...m, b.billId])}>
          <div className="grow">
            <div>{parents.find((p) => p.id === b.parentCategoryId)?.name ?? '未分类'}{b.remark ? ` · ${b.remark}` : ''}</div>
            <small>{fullDay(b.time)}</small>
          </div>
          <b>{money(b.cost)}</b>
          <span className="muted">加入</span>
        </button>
      ))}
    </>
  )
}
