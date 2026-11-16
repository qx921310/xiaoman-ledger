import { useState } from 'react'

/**
 * 自有下拉选择器：外观与应用其它控件一致，点开是底部弹层（一木用自绘选择器，不用系统下拉）。
 * 用法：<SelectSheet ariaLabel="币种" value={v} options={[{value:'CNY',label:'人民币 ¥'}]} onChange={setV} />
 */
export function SelectSheet({ ariaLabel, value, options, onChange, disabled, className }: {
  ariaLabel: string
  value: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
  onChange: (v: string) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <>
      <button type="button" className={'select-sheet' + (className ? ' ' + className : '')}
        aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled}
        onClick={() => setOpen(true)}>
        <span className="ss-value">{current?.label ?? value ?? '请选择'}</span>
        <i className="ss-arrow" aria-hidden="true" />
      </button>
      {open && (
        <div className="sheet-mask" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="listbox" aria-label={ariaLabel}>
            <div className="sheet-hd"><b>{ariaLabel}</b></div>
            <div className="sheet-body ss-list">
              {options.map((o) => (
                <button key={o.value} type="button" role="option" aria-selected={o.value === value}
                  className={'ss-item' + (o.value === value ? ' on' : '')}
                  disabled={o.disabled}
                  onClick={() => { if (o.disabled) return; onChange(o.value); setOpen(false) }}>
                  <span>{o.label}</span>
                  {o.value === value && <i aria-hidden="true">✓</i>}
                </button>
              ))}
              {options.length === 0 && <p className="hint">没有可选项</p>}
            </div>
            <div className="sheet-ft">
              <button type="button" className="ghost" onClick={() => setOpen(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
