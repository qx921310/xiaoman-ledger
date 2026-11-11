import { useEffect, useId, useRef, useState } from 'react'
import { AssetIcon } from './icons'

export interface MobilePickerOption {
  value: string
  label: string
  detail?: string
  icon?: string
  assetType?: number
}

/** A touch-friendly single-choice sheet shared by the mobile entry controls. */
export function MobilePicker({ label, value, options, onChange, className = '', placeholder = '请选择' }: {
  label: string
  value: string
  options: MobilePickerOption[]
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLElement>(null)
  const titleId = useId()
  const selected = options.find((option) => option.value === value)
  const close = () => { setOpen(false); trigger.current?.focus() }

  useEffect(() => {
    if (!open) return
    const first = sheet.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?? sheet.current?.querySelector<HTMLButtonElement>('button')
    first?.focus()
  }, [open])

  return <>
    <button ref={trigger} type="button" className={'mobile-picker-trigger ' + className} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span>{selected?.label ?? placeholder}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
    </button>
    {open && <div className="mobile-picker-scrim" onClick={close}>
      <section ref={sheet} className="mobile-picker-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); return }
        if (e.key !== 'Tab') return
        const buttons = Array.from(sheet.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
        if (!buttons.length) return
        if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons[buttons.length - 1].focus() }
        else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) { e.preventDefault(); buttons[0].focus() }
      }}>
        <div className="mobile-picker-handle" />
        <header><div><small>小满记账</small><h2 id={titleId}>{label}</h2></div><button type="button" className="mobile-picker-close" aria-label="关闭" onClick={close}>×</button></header>
        <div className="mobile-picker-options" role="radiogroup" aria-label={label} onKeyDown={(e) => {
          if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) return
          const choices = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'))
          const current = choices.findIndex((choice) => choice === document.activeElement)
          if (current < 0 || !choices.length) return
          e.preventDefault()
          const direction = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1
          choices[(current + direction + choices.length) % choices.length].focus()
        }}>
          {options.length ? options.map((option) => <button type="button" role="radio" key={option.value} aria-checked={option.value === value} onClick={() => { onChange(option.value); close() }}>
            <span className="mobile-picker-option-icon" aria-hidden="true">{option.icon ? <b>{option.icon}</b> : option.assetType != null
              ? <AssetIcon type={option.assetType} name={option.label} size={19} /> : label === '选择账本'
              ? <svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16" rx="3"/><path d="M9 4v16m3-11h4m-4 4h4"/></svg>
              : <svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="13" rx="4"/><path d="M7 6V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1M15 12h3"/></svg>}</span>
            <span className="mobile-picker-option-copy"><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>
            {option.value === value && <span className="mobile-picker-check" aria-hidden="true">✓</span>}
          </button>) : <p className="mobile-picker-empty">还没有可选项</p>}
        </div>
      </section>
    </div>}
  </>
}
