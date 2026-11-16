import { useEffect, useRef, useState } from 'react'

/**
 * 全局下拉兜底：拦截页面上所有原生 <select> 的点击，改用应用自己的底部弹层。
 * 这样无需逐页改造：外观统一、交互统一；选中后写回 select 并派发 change，
 * React 受控组件也能正常收到。
 */
type Item = { value: string; label: string; disabled: boolean }

export function SelectShim() {
  const [state, setState] = useState<{ el: HTMLSelectElement; items: Item[]; current: string; title: string } | null>(null)

  useEffect(() => {
    const onPointerDown = (e: Event) => {
      const target = e.target as HTMLElement | null
      const select = target?.closest?.('select') as HTMLSelectElement | null
      if (!select || select.disabled) return
      const items = [...select.options].map((o) => ({ value: o.value, label: o.text, disabled: o.disabled }))
      if (!items.length) return
      e.preventDefault()
      const label = select.getAttribute('aria-label') || select.id || '请选择'
      setState({ el: select, items, current: select.value, title: label })
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  const firstRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (state) firstRef.current?.focus()
  }, [state])

  if (!state) return null

  const commit = (value: string) => {
    const el = state.el
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    setter?.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
    setState(null)
  }

  return (
    <div className="sheet-mask" onClick={() => setState(null)}>
      <div className="sheet" role="dialog" aria-label={state.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-hd"><b>{state.title}</b></div>
        <div className="sheet-body ss-list">
          {state.items.map((it, index) => (
            <button key={it.value} type="button" role="option" aria-selected={it.value === state.current}
              className={'ss-item' + (it.value === state.current ? ' on' : '')}
              disabled={it.disabled}
              onClick={() => commit(it.value)}>
              <span>{it.label}</span>
              {it.value === state.current && <i aria-hidden="true">✓</i>}
            </button>
          ))}
        </div>
        <div className="sheet-ft">
          <button type="button" className="ghost" onClick={() => setState(null)}>取消</button>
        </div>
      </div>
    </div>
  )
}
