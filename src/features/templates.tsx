import { useLedger } from '../store'
import { money, dayOf } from '../ui-format'

/**
 * 模板记账（对应一木 activity_module_manager.xml）
 * 结构：tool_bar（返回 + 标题「模板记账」+ 新增）+ tip + 列表 + 空态「没有任何数据」
 * 模板来源于记账页的「存为模板」；这里可一键再记一笔或删除。
 */
export function TemplateList({ onBack, onAdd, notify }: { onBack: () => void; onAdd: () => void; notify: (m: string) => void }) {
  const templates = useLedger((s) => s.templates ?? [])
  const apply = useLedger((s) => s.applyTemplate)
  const del = useLedger((s) => s.deleteTemplate)
  const parents = useLedger((s) => s.parentCategories)

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>模板记账</h3>
        <button type="button" className="link" onClick={onAdd}>新增</button>
      </div>

      <p className="hint">在记账页点「存为模板」即可保存常用记账。</p>

      {templates.length === 0 && <p className="hint">没有任何数据</p>}

      {templates.map((t) => {
        const cat = t.bill?.parentCategoryId ? parents.find((p) => p.id === t.bill!.parentCategoryId)?.name : ''
        return (
          <div key={t.templateId} className="row">
            <div className="grow">
              <div>{t.name}</div>
              <small>
                {t.mode === 'transfer' ? '转账模板' : (cat || '记账模板')}
                {t.bill?.cost != null ? ` · ${money(t.bill.cost)}` : ''}
                {t.updateTime ? ` · ${dayOf(t.updateTime)}` : ''}
              </small>
            </div>
            <button type="button" className="link" onClick={() => {
              const ok = apply(t.templateId)
              notify(ok ? '已按模板记一笔' : '模板不可用')
            }}>记一笔</button>
            <button type="button" className="del" onClick={() => del(t.templateId)}>删</button>
          </div>
        )
      })}
    </>
  )
}
