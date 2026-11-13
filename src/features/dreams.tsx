import { useMemo, useState } from 'react'
import { useLedger } from '../store'
import { money, fullDay } from '../ui-format'
import { CatIcon } from '../ui/icons'

/**
 * 愿望清单（对齐一木 activity_dream_list / activity_add_dream / AddDreamActivity）
 * 列表：右上角设置可将愿望清单显示在首页；空态「找到你想要变得富有的理由」+「添加第一个愿望」
 * 编辑：愿望名称 / 目标金额 / 已攒金额 / 备注 / 愿望图标 / 开始日期 / 预期达成（可无期限）
 * 校验原文：「请输入愿望名称」「请输入正确的目标金额」
 */
const DREAM_ICONS = ['ic_parent_daily', 'ic_parent_travel', 'ic_parent_shopping', 'ic_parent_fun',
  'ic_parent_home', 'ic_parent_education', 'ic_parent_medical', 'ic_parent_traffic']

export function DreamList({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const dreams = useLedger((s) => s.dreams)
  const addDream = useLedger((s) => s.addDream)
  const updateDream = useLedger((s) => s.updateDream)
  const deleteDream = useLedger((s) => s.deleteDream)

  const [editing, setEditing] = useState<null | {
    dreamId?: number; name: string; totalNum: string; startNum: string
    remark: string; icon: string; startTime: string
  }>(null)

  const ordered = useMemo(() => [...dreams].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0)), [dreams])

  const save = () => {
    if (!editing) return
    const name = editing.name.trim()
    const total = Number(editing.totalNum)
    if (!name) { notify('请输入愿望名称'); return }
    if (!(total > 0)) { notify('请输入正确的目标金额'); return }
    const start = editing.startTime ? new Date(editing.startTime).getTime() : Date.now()
    if (editing.dreamId != null) {
      updateDream(editing.dreamId, {
        name, totalNum: total, startNum: Number(editing.startNum) || 0,
        remark: editing.remark, icon: editing.icon, startTime: start
      })
      notify('愿望已保存')
    } else {
      addDream({
        name, totalNum: total, startNum: Number(editing.startNum) || 0,
        remark: editing.remark, startTime: start
      })
      notify('愿望已创建')
    }
    setEditing(null)
  }

  if (editing) {
    return (
      <>
        <div className="subpage-head">
          <button type="button" className="link" onClick={() => setEditing(null)}>‹ 返回</button>
          <h3>{editing.dreamId ? '编辑愿望' : '新增愿望'}</h3>
          <button type="button" className="link" onClick={save}>完成</button>
        </div>
        <div className="label">愿望名称</div>
        <input aria-label="愿望名称" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="如 环岛旅行" />
        <div className="label">目标金额</div>
        <input aria-label="目标金额" inputMode="decimal" value={editing.totalNum}
          onChange={(e) => setEditing({ ...editing, totalNum: e.target.value.replace(/[^\d.]/g, '') })} />
        <div className="label">已攒金额</div>
        <input aria-label="已攒金额" inputMode="decimal" value={editing.startNum}
          onChange={(e) => setEditing({ ...editing, startNum: e.target.value.replace(/[^\d.]/g, '') })} />
        <div className="label">备注</div>
        <input aria-label="愿望备注" value={editing.remark} onChange={(e) => setEditing({ ...editing, remark: e.target.value })} placeholder="可选" />
        <div className="label">愿望图标</div>
        <div className="icon-grid">
          {DREAM_ICONS.map((k) => (
            <button key={k} type="button" className={editing.icon === k ? 'icon-cell on' : 'icon-cell'}
              aria-label={`图标 ${k}`} onClick={() => setEditing({ ...editing, icon: k })}>
              <CatIcon k={k} size={20} />
            </button>
          ))}
        </div>
        <div className="label">开始日期</div>
        <input aria-label="开始日期" type="date" value={editing.startTime}
          onChange={(e) => setEditing({ ...editing, startTime: e.target.value })} />
      </>
    )
  }

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>愿望清单</h3>
        <button type="button" className="link" onClick={() => setEditing({
          name: '', totalNum: '', startNum: '', remark: '', icon: DREAM_ICONS[0],
          startTime: new Date().toISOString().slice(0, 10)
        })}>新增</button>
      </div>
      <p className="hint">右上角设置可将愿望清单显示在首页。</p>

      {ordered.length === 0 && (
        <>
          <p className="hint">找到你想要变得富有的理由</p>
          <button type="button" className="ghost wide" onClick={() => setEditing({
            name: '', totalNum: '', startNum: '', remark: '', icon: DREAM_ICONS[0],
            startTime: new Date().toISOString().slice(0, 10)
          })}>添加第一个愿望</button>
        </>
      )}

      {ordered.map((d) => {
        const pct = d.totalNum > 0 ? Math.min(100, ((d.startNum ?? 0) / d.totalNum) * 100) : 0
        const done = (d.startNum ?? 0) >= d.totalNum
        return (
          <div key={d.dreamId} className="cat-block">
            <div className="row">
              <CatIcon k={(d as { icon?: string }).icon ?? DREAM_ICONS[0]} size={16} />
              <div className="grow">
                <div>{d.name}{done ? ' · 已达成' : ''}</div>
                <small>{money(d.startNum ?? 0)} / {money(d.totalNum)}{d.startTime ? ` · 开始于 ${fullDay(d.startTime)}` : ''}</small>
              </div>
              <button type="button" className="link" onClick={() => setEditing({
                dreamId: d.dreamId, name: d.name, totalNum: String(d.totalNum),
                startNum: String(d.startNum ?? 0), remark: d.remark ?? '',
                icon: (d as { icon?: string }).icon ?? DREAM_ICONS[0],
                startTime: d.startTime ? new Date(d.startTime).toISOString().slice(0, 10) : ''
              })}>编辑</button>
              <button type="button" className="del" onClick={() => {
                if (!confirm(`删除愿望「${d.name}」？`)) return
                deleteDream(d.dreamId)
              }}>删</button>
            </div>
            <div className="bar-track"><div className="bar" style={{ width: `${pct}%`, background: done ? 'var(--in)' : 'var(--accent)' }} /></div>
            {d.remark && <small className="muted">{d.remark}</small>}
          </div>
        )
      })}
    </>
  )
}
