/**
 * A dialog of the main window: over the page, closed by Esc (one order of Esc – a field's edit first, then the dialog)
 * and by its own buttons. The main window's dialogs open only on your click (never by themselves, D229). Tab stays inside
 * it, the focus goes back where it was when it closes, and the pages' shortcuts wait meanwhile (A6-21).
 */
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { onModal, tabTarget, useEscapeLayer } from '../lib/escape'
import { cx } from './ui'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({
  title,
  children,
  actions,
  onClose,
  wide,
  ...rest
}: {
  title: ReactNode
  children: ReactNode
  actions?: ReactNode
  onClose: () => void
  wide?: boolean
  'data-testid'?: string
}) {
  useEscapeLayer(true, onClose)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const off = onModal()
    // The first field (or the box) takes the focus, so keys go to the dialog.
    const first = box.current?.querySelector<HTMLElement>('input, textarea, select, button[data-autofocus]')
    ;(first ?? box.current)?.focus()
    return () => {
      off()
      if (before?.isConnected) before.focus()
    }
  }, [])
  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !box.current) return
    const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null)
    const to = tabTarget(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey)
    if (to == null) return
    e.preventDefault()
    ;(items[to] ?? box.current).focus()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onKeyDown={trapTab}
        data-testid={rest['data-testid']}
        className={cx('flex w-full animate-fade-in flex-col rounded-lg border border-line-strong bg-panel outline-none', wide ? 'max-w-[760px]' : 'max-w-[520px]')}
      >
        <h2 className="border-b border-line px-4 py-2.5 text-[14px] font-medium">{title}</h2>
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-4 py-3">{children}</div>
        {actions && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-2.5">{actions}</div>}
      </div>
    </div>
  )
}
