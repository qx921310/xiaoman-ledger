import { useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

let lastOutsideDialog: HTMLElement | null = null

/** Accessible dialog shared by edit and confirmation flows. */
export function Modal({ label, onClose, children, className = '' }: {
  label: string; onClose: () => void; children: ReactNode; className?: string
}) {
  const dialog = useRef<HTMLDivElement>(null)
  const previous = useRef<HTMLElement | null>(typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const fallback = useRef(lastOutsideDialog)
  const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
  ) ?? []).filter((element) => element.getClientRects().length > 0)

  useLayoutEffect(() => {
    if (previous.current && !previous.current.closest('[role="dialog"]')) lastOutsideDialog = previous.current
    const focusDialog = () => {
      if (!dialog.current?.contains(document.activeElement)) dialog.current?.focus()
    }
    focusDialog()
    // Pointer activation can finish after the mounting layout effect and move focus away.
    const frame = requestAnimationFrame(focusDialog)
    return () => {
      cancelAnimationFrame(frame)
      const target = previous.current?.isConnected ? previous.current : fallback.current
      if (target?.isConnected) target.focus()
    }
  }, [])

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab') return
    const items = focusable()
    if (!items.length) { event.preventDefault(); dialog.current?.focus(); return }
    if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === dialog.current)) { event.preventDefault(); items[items.length - 1].focus() }
    else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus() }
  }

  return <div className="modal-mask" onClick={onClose}>
    <div ref={dialog} className={'modal' + (className ? ` ${className}` : '')} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
      onClick={(event) => event.stopPropagation()} onKeyDown={handleKey}>{children}</div>
  </div>
}
