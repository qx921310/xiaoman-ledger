import { useState } from 'react'
import { useLedger } from '../store'
import { CatIcon } from '../ui/icons'

/**
 * 智能分类（对齐一木 activity_self_ai_type / activity_add_ai_type / AddCategoryKeyActivity）
 * 列表：空态提示 + 「开始添加」；每项显示类别图标、类别名、关键词
 * 编辑：关键词 / 类别（大类 + 子分类）
 * 校验原文：「请输入记账关键词」「请选择记账分类」
 */
export function AiTypeManager({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const rules = useLedger((s) => s.aiTypeRules)
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const addAiTypeRule = useLedger((s) => s.addAiTypeRule)
  const deleteAiTypeRule = useLedger((s) => s.deleteAiTypeRule)

  const [editing, setEditing] = useState<null | { ruleId?: number; keywords: string; parentId: number; childId: number }>(null)

  const save = () => {
    if (!editing) return
    const raw = editing.keywords.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean)
    if (!raw.length) { notify('请输入记账关键词'); return }
    if (!editing.parentId) { notify('请选择记账分类'); return }
    addAiTypeRule({ keywords: raw, categoryId: editing.parentId, childCategoryId: editing.childId || undefined })
    notify('智能分类已添加')
    setEditing(null)
  }

  if (editing) {
    const childList = children.filter((c) => c.parentId === editing.parentId)
    return (
      <>
        <div className="subpage-head">
          <button type="button" className="link" onClick={() => setEditing(null)}>‹ 返回</button>
          <h3>新增智能分类</h3>
          <button type="button" className="link" onClick={save}>完成</button>
        </div>
        <div className="label">关键词</div>
        <input aria-label="记账关键词" value={editing.keywords}
          onChange={(e) => setEditing({ ...editing, keywords: e.target.value })} placeholder="多个关键词用逗号分隔" />
        <div className="label">类别</div>
        <select aria-label="记账分类" value={editing.parentId}
          onChange={(e) => setEditing({ ...editing, parentId: Number(e.target.value), childId: 0 })}>
          <option value={0}>请选择分类</option>
          {parents.filter((p) => !p.hide).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {childList.length > 0 && (
          <select aria-label="子分类" value={editing.childId} onChange={(e) => setEditing({ ...editing, childId: Number(e.target.value) })}>
            <option value={0}>不选子分类</option>
            {childList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </>
    )
  }

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>智能分类</h3>
        <button type="button" className="link" onClick={() => setEditing({ keywords: '', parentId: 0, childId: 0 })}>新增</button>
      </div>
      <p className="hint">记账时识别到关键词会自动选中对应分类。</p>

      {rules.length === 0 && (
        <>
          <p className="hint">还没有智能分类规则。</p>
          <button type="button" className="ghost wide" onClick={() => setEditing({ keywords: '', parentId: 0, childId: 0 })}>开始添加</button>
        </>
      )}

      {rules.map((r) => {
        const p = parents.find((x) => x.id === r.categoryId)
        return (
          <div key={r.ruleId} className="row">
            <CatIcon k={p?.icon} size={16} />
            <div className="grow">
              <div>{p?.name ?? '未分类'}{r.childCategoryId ? ` · ${children.find((c) => c.id === r.childCategoryId)?.name ?? ''}` : ''}</div>
              <small>{r.keywords.join('、')}</small>
            </div>
            <button type="button" className="del" onClick={() => {
              if (!confirm(`删除「${p?.name ?? '该规则'}」的智能分类？`)) return
              deleteAiTypeRule(r.ruleId)
            }}>删</button>
          </div>
        )
      })}
    </>
  )
}
