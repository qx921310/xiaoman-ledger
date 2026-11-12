import { useState } from 'react'
import { useLedger } from '../store'
import { Modal } from '../ui/modal'

/**
 * 自定义智能分类（对应一木 CategoryKeyManagerActivity / AddAiTypeActivity）
 * 结构：tip + 「开始添加」+ 规则列表（关键词 → 类别），新增弹窗：关键词 + 类别
 * 一木的 item_ai_type：type_icon + type(类别) + text_list(关键词)
 */
export function AiTypeManager({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const rules = useLedger((s) => s.aiTypeRules ?? [])
  const parents = useLedger((s) => s.parentCategories)
  const addRule = useLedger((s) => s.addAiTypeRule)
  const delRule = useLedger((s) => s.deleteAiTypeRule)
  const [open, setOpen] = useState(false)
  const [kw, setKw] = useState('')
  const [catId, setCatId] = useState<number>(parents[0]?.id ?? 1)

  const catName = (id: number) => parents.find((p) => p.id === id)?.name ?? '未分类'

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>自定义智能分类</h3>
        <button type="button" className="link" onClick={() => setOpen(true)}>开始添加</button>
      </div>

      <p className="hint">关键词命中时自动归到对应类别。</p>

      {rules.length === 0 && (
        <button type="button" className="primary" onClick={() => setOpen(true)}>开始添加</button>
      )}

      {rules.map((r) => (
        <div key={r.ruleId} className="row">
          <div className="grow">
            <div>{catName(r.categoryId)}</div>
            <small>{r.keywords.join('、')}</small>
          </div>
          <button type="button" className="del" onClick={() => delRule(r.ruleId)}>删</button>
        </div>
      ))}

      {open && (
        <Modal label="新增智能分类" onClose={() => setOpen(false)}>
          <h3>新增智能分类</h3>
          <div className="label">关键词</div>
          <input aria-label="关键词" placeholder="多个关键词用逗号分隔" value={kw} onChange={(e) => setKw(e.target.value)} />
          <div className="label">类别</div>
          <select aria-label="类别" value={catId} onChange={(e) => setCatId(Number(e.target.value))}>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setOpen(false)}>取消</button>
            <button type="button" className="primary" onClick={() => {
              const list = kw.split(/[,，、\s]+/).map((x) => x.trim()).filter(Boolean)
              if (!list.length) { notify('请填写关键词'); return }
              addRule({ keywords: list, categoryId: catId })
              setKw(''); setOpen(false)
            }}>保存</button>
          </div>
        </Modal>
      )}
    </>
  )
}
