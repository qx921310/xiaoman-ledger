import { useMemo, useState } from 'react'
import { useLedger } from '../store'
import { money, fullDay } from '../ui-format'

/**
 * AA 分账（对齐一木 activity/split：SplitGroupActivity / SplitGroupEditActivity / SplitExpenseEditActivity）
 * 校验原文：
 *  · 群组：「请输入群组名称」「请至少再添加 1 位成员」「已存在成员：X」
 *  · 删成员：「X 已有分账记录，请先删除相关记录」
 *  · 记录：「请输入金额」「请至少选择 1 位参与人」「每人金额合计 X，与总额 Y 不一致」
 */
export function SplitManager({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const groups = useLedger((s) => s.splitGroups)
  const members = useLedger((s) => s.splitMembers)
  const expenses = useLedger((s) => s.splitExpenses)
  const addSplitGroup = useLedger((s) => s.addSplitGroup)
  const updateSplitGroup = useLedger((s) => s.updateSplitGroup)
  const addSplitMember = useLedger((s) => s.addSplitMember)
  const deleteSplitMember = useLedger((s) => s.deleteSplitMember)
  const addSplitExpense = useLedger((s) => s.addSplitExpense)
  const settleSplit = useLedger((s) => s.settleSplit)
  const deleteSplitExpense = useLedger((s) => s.deleteSplitExpense)

  const [openGroup, setOpenGroup] = useState<number | null>(null)
  const [editing, setEditing] = useState<null | { groupId: number; name: string }>(null)
  const [newMemberName, setNewMemberName] = useState('')
  const [expenseOpen, setExpenseOpen] = useState(false)
  const today = () => new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState<{ title: string; amount: string; payer: number; splitType: 0 | 1 | 2; values: Record<number, string>; date: string }>(
    { title: '', amount: '', payer: 0, splitType: 0, values: {}, date: today() }
  )

  const group = groups.find((g) => g.splitGroupId === openGroup)
  const groupMembers = members.filter((m) => m.splitGroupId === openGroup)
  const groupExpenses = expenses.filter((e) => e.splitGroupId === openGroup)

  const unsettled = useMemo(() => groupExpenses.filter((e) => !e.settlement).reduce((n, e) => n + e.amount, 0), [groupExpenses])

  const createGroup = () => {
    const name = editing?.name.trim() ?? ''
    if (!name) { notify('请输入群组名称'); return }
    if (!editing?.groupId) {
      const g = addSplitGroup({ name })
      addSplitMember(g.splitGroupId, '我', true)
      setEditing({ groupId: g.splitGroupId, name: g.name })
    } else {
      updateSplitGroup(editing.groupId, { name })
      setEditing(null)
    }
  }

  const addMember = () => {
    const name = newMemberName.trim()
    if (!editing?.groupId) { notify('请先保存群组名称'); return }
    if (!name) return
    if (groupMembers.some((m) => m.name === name)) { notify(`已存在成员：${name}`); return }
    addSplitMember(editing.groupId, name)
    setNewMemberName('')
  }

  const saveExpense = () => {
    if (!group) return
    const amount = Number(form.amount)
    if (!(amount > 0)) { notify('请输入金额'); return }
    const picked = groupMembers.filter((m) => Number(form.values[m.splitMemberId]) > 0 || form.splitType === 0)
    if (!picked.length) { notify('请至少选择 1 位参与人'); return }
    if (form.splitType === 1) {
      const sum = +picked.reduce((n, m) => n + (Number(form.values[m.splitMemberId]) || 0), 0).toFixed(2)
      if (sum !== +amount.toFixed(2)) {
        notify(`每人金额合计 ${money(sum)}，与总额 ${money(amount)} 不一致`)
        return
      }
    }
    const ok = addSplitExpense({
      splitGroupId: group.splitGroupId,
      title: form.title,
      amount,
      payerMemberId: form.payer || groupMembers[0]?.splitMemberId,
      splitType: form.splitType,
      participants: picked.map((m) => ({ memberId: m.splitMemberId, value: Number(form.values[m.splitMemberId]) || 0 })),
      time: form.date ? new Date(form.date).getTime() : Date.now()
    })
    notify(ok ? '分账已记录' : '记录失败，请检查金额')
    if (ok) { setExpenseOpen(false); setForm({ title: '', amount: '', payer: 0, splitType: 0, values: {}, date: today() }) }
  }

  // 群组列表
  if (openGroup == null && !editing) {
    return (
      <>
        <div className="subpage-head">
          <button type="button" className="link" onClick={onBack}>‹ 返回</button>
          <h3>AA 分账</h3>
          <button type="button" className="link" onClick={() => setEditing({ groupId: 0, name: '' })}>新建群组</button>
        </div>
        {groups.length === 0 && <p className="hint">还没有 AA 群组。</p>}
        {groups.map((g) => {
          const gMembers = members.filter((m) => m.splitGroupId === g.splitGroupId)
          const list = expenses.filter((e) => e.splitGroupId === g.splitGroupId)
          const pending = list.filter((e) => !e.settlement).reduce((n, e) => n + e.amount, 0)
          return (
            <button key={g.splitGroupId} type="button" className="row" onClick={() => setOpenGroup(g.splitGroupId)}>
              <div className="grow">
                <div>{g.name}</div>
                <small>{gMembers.length} 人 · {list.length} 笔{list.length ? ` · 未结算 ${money(pending)}` : ''}</small>
              </div>
              <span className="muted">›</span>
            </button>
          )
        })}
      </>
    )
  }

  // 群组编辑（名称 + 成员）
  if (editing) {
    const list = editing.groupId ? members.filter((m) => m.splitGroupId === editing.groupId) : []
    return (
      <>
        <div className="subpage-head">
          <button type="button" className="link" onClick={() => setEditing(null)}>‹ 返回</button>
          <h3>{editing.groupId ? '编辑群组' : '新建群组'}</h3>
          <button type="button" className="link" onClick={createGroup}>完成</button>
        </div>
        <div className="label">群组名称</div>
        <input aria-label="群组名称" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="如 周末出游" />
        {editing.groupId > 0 && (
          <>
            <div className="label">成员（{list.length}）</div>
            {list.map((m) => (
              <div key={m.splitMemberId} className="row">
                <span className="grow">{m.name}{m.self ? '（我）' : ''}</span>
                <button type="button" className="del" onClick={() => {
                  const used = expenses.some((e) => e.splitGroupId === editing.groupId
                    && (e.payerMemberId === m.splitMemberId || (e.shares ?? []).some((s) => s.memberId === m.splitMemberId)))
                  if (used) { notify(`${m.name} 已有分账记录，请先删除相关记录`); return }
                  deleteSplitMember(m.splitMemberId)
                }}>删除</button>
              </div>
            ))}
            <div className="row">
              <input aria-label="新成员名称" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="成员名称" />
              <button type="button" className="link" onClick={addMember}>添加</button>
            </div>
          </>
        )}
        <div className="modal-btns">
          <button type="button" className="ghost" onClick={() => setEditing(null)}>取消</button>
          <button type="button" className="primary" onClick={() => {
            if (!editing.groupId) { createGroup(); return }
            if (list.length < 2) { notify('请至少再添加 1 位成员'); return }
            updateSplitGroup(editing.groupId, { name: editing.name.trim() })
            setEditing(null)
            notify('群组已保存')
          }}>保存</button>
        </div>
      </>
    )
  }

  // 群组详情：分账记录
  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={() => setOpenGroup(null)}>‹ 返回</button>
        <h3>{group?.name}</h3>
        <button type="button" className="link" onClick={() => setEditing({ groupId: group!.splitGroupId, name: group!.name })}>设置</button>
      </div>
      <p className="hint">{groupMembers.length} 人 · 未结算 {money(unsettled)}</p>
      <button type="button" className="del wide" onClick={() => {
        if (!group) return
        if (groupExpenses.length) { notify('群组已有分账记录，请先删除相关记录'); return }
        if (!confirm(`删除群组「${group.name}」？`)) return
        useLedger.getState().deleteSplitGroup(group.splitGroupId)
        setOpenGroup(null)
        notify('群组已删除')
      }}>删除群组</button>

      <button type="button" className="ghost wide" onClick={() => { setExpenseOpen(true); setForm({ title: '', amount: '', payer: groupMembers[0]?.splitMemberId ?? 0, splitType: 0, values: {}, date: today() }) }}>
        记一笔 AA
      </button>

      {groupExpenses.length === 0 && <p className="hint">还没有分账记录。</p>}
      {groupExpenses.map((e) => (
        <div key={e.splitExpenseId} className="row">
          <div className="grow">
            <div>{e.title}</div>
            <small>{fullDay(e.time)} · {groupMembers.find((m) => m.splitMemberId === e.payerMemberId)?.name ?? '我'} 先付 · {e.settlement ? '已结算' : '未结算'}</small>
          </div>
          <b>{money(e.amount)}</b>
          <button type="button" className="link" onClick={() => settleSplit(e.splitExpenseId, !e.settlement)}>
            {e.settlement ? '撤销' : '结算'}
          </button>
          <button type="button" className="del" onClick={() => deleteSplitExpense(e.splitExpenseId)}>删</button>
        </div>
      ))}

      {expenseOpen && (
        <div className="cat-block">
          <h3>记一笔 AA</h3>
          <div className="label">标题</div>
          <input aria-label="AA 标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如 午餐" />
          <div className="label">金额</div>
          <input aria-label="AA 金额" inputMode="decimal" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} />
          <div className="label">日期</div>
          <input aria-label="AA 日期" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <div className="label">谁先付</div>
          <select aria-label="付款人" value={form.payer} onChange={(e) => setForm({ ...form, payer: Number(e.target.value) })}>
            {groupMembers.map((m) => <option key={m.splitMemberId} value={m.splitMemberId}>{m.name}</option>)}
          </select>
          <div className="label">分摊方式</div>
          <div className="seg">
            {([[0, '均分'], [1, '按金额'], [2, '按份额']] as [0 | 1 | 2, string][]).map(([k, label]) => (
              <button key={k} type="button" className={form.splitType === k ? 'on' : ''} onClick={() => setForm({ ...form, splitType: k })}>{label}</button>
            ))}
          </div>
          <div className="label">参与人</div>
          {groupMembers.map((m) => (
            <div key={m.splitMemberId} className="row">
              <span className="grow">{m.name}</span>
              {form.splitType !== 0 && (
                <input aria-label={`${m.name} 的金额`} inputMode="decimal" value={form.values[m.splitMemberId] ?? ''}
                  onChange={(e) => setForm({ ...form, values: { ...form.values, [m.splitMemberId]: e.target.value.replace(/[^\d.]/g, '') } })} />
              )}
            </div>
          ))}
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setExpenseOpen(false)}>取消</button>
            <button type="button" className="primary" onClick={saveExpense}>保存</button>
          </div>
        </div>
      )}
    </>
  )
}
