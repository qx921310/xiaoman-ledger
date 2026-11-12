import { useState } from 'react'
import { useLedger } from '../store'
import { money } from '../ui-format'
import { Modal } from '../ui/modal'

/**
 * 愿望清单（对应一木 DreamListActivity / AddDreamActivity）
 * 结构：tool_bar（返回 + 标题 + 添加）+ tip + 列表（名称/目标/已攒/进度）
 * 空态文案沿用一木：找到你想要变得富有的理由 / 添加第一个愿望
 */
export function DreamList({ onBack }: { onBack: () => void }) {
  const dreams = useLedger((s) => s.dreams ?? [])
  const addDream = useLedger((s) => s.addDream)
  const updateDream = useLedger((s) => s.updateDream)
  const deleteDream = useLedger((s) => s.deleteDream)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', totalNum: '', startNum: '', remark: '' })

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>愿望清单</h3>
        <button type="button" className="link" onClick={() => setOpen(true)}>添加</button>
      </div>

      {dreams.length === 0 && (
        <>
          <p className="hint">找到你想要变得富有的理由</p>
          <button type="button" className="primary" onClick={() => setOpen(true)}>添加第一个愿望</button>
        </>
      )}

      {dreams.map((d) => {
        const pct = d.totalNum > 0 ? Math.min(100, Math.round((d.startNum / d.totalNum) * 100)) : 0
        return (
          <div key={d.dreamId} className="row dream-row">
            <div className="grow">
              <div>{d.name}</div>
              <small>{money(d.startNum)} / {money(d.totalNum)}</small>
              <div className="hb-bar"><i style={{ width: `${pct}%` }} /></div>
            </div>
            <button type="button" className="link" onClick={() => {
              const v = prompt('更新已攒金额', String(d.startNum))
              if (v != null) updateDream(d.dreamId, { startNum: Number(v) || 0 })
            }}>存钱</button>
            <button type="button" className="del" onClick={() => { if (confirm(`删除愿望「${d.name}」？`)) deleteDream(d.dreamId) }}>删</button>
          </div>
        )
      })}

      {open && (
        <Modal label="新增愿望" onClose={() => setOpen(false)}>
          <h3>新增愿望</h3>
          <div className="label">愿望名称</div>
          <input aria-label="愿望名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="label">目标金额</div>
          <input aria-label="目标金额" inputMode="decimal" value={form.totalNum}
            onChange={(e) => setForm({ ...form, totalNum: e.target.value.replace(/[^\d.]/g, '') })} />
          <div className="label">已攒金额</div>
          <input aria-label="已攒金额" inputMode="decimal" value={form.startNum}
            onChange={(e) => setForm({ ...form, startNum: e.target.value.replace(/[^\d.]/g, '') })} />
          <div className="label">备注</div>
          <input aria-label="备注" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setOpen(false)}>取消</button>
            <button type="button" className="primary" onClick={() => {
              if (!form.name.trim()) return
              addDream({ name: form.name.trim(), totalNum: Number(form.totalNum) || 0, startNum: Number(form.startNum) || 0, remark: form.remark })
              setForm({ name: '', totalNum: '', startNum: '', remark: '' })
              setOpen(false)
            }}>保存</button>
          </div>
        </Modal>
      )}
    </>
  )
}
