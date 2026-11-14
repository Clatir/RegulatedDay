/**
 * A press of the pointer outside a part of the screen (D461: leaving a new block – the panel of „Dziś”, the small window of
 * „Tydzień”): heard in the capture phase, before whatever the press starts where it lands (another block, a day, a screen), with
 * the active field committed first – what it holds goes with what the leave saves. A dialog (the exchange, a question) with the
 * overlay it stands on and a toast are never „outside”; nor is what `inside` names (the part's element, or a selector of the
 * elements that belong to it).
 */
import { useEffect, useRef, type RefObject } from 'react'
import { commitActiveField } from './commit'

/** The overlay a dialog stands on (`Dialog`, the search): its own, never „elsewhere” – a press on it is for the dialog. */
export const DIALOG_BACKDROP = 'data-dialog-backdrop'
/** A dialog over the window with the overlay it stands on (the overlay is no `role="dialog"`). */
export const IN_DIALOG = `[role="dialog"], [${DIALOG_BACKDROP}]`
/** What is never a click „elsewhere”: a dialog standing over the window (with its overlay) and a toast (its „Cofnij”). */
const NEVER_OUTSIDE = `${IN_DIALOG}, [role="status"]`

export function useOutsidePointer(active: boolean, inside: RefObject<Element | null> | string, onLeave: (e: PointerEvent) => void): void {
  const leave = useRef(onLeave)
  leave.current = onLeave
  useEffect(() => {
    if (!active) return
    const away = (e: PointerEvent) => {
      const t = e.target
      if (!(t instanceof Element) || t.closest(NEVER_OUTSIDE)) return
      if (typeof inside === 'string' ? t.closest(inside) : !inside.current || inside.current.contains(t)) return
      commitActiveField()
      leave.current(e)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [active, inside])
}

/**
 * The press `e` (heard in the capture phase of the document) and the click it ends in reach nothing below: what they would start
 * (a new window on the grid, a day, a screen) does not happen – the part stays, for a question it asks first or a save it waits
 * for. Only a click of the pointer is held (`detail` > 0) – a click made by the keyboard (Enter, Space) always goes on. The press
 * let go (or cancelled) with no click – the hold ends a moment after (its click, if any, comes in the same turn), and the next
 * press ends it too.
 */
export function holdGesture(e: PointerEvent): void {
  e.preventDefault()
  e.stopImmediatePropagation()
  let later: ReturnType<typeof setTimeout> | null = null
  const stop = (c: MouseEvent) => {
    if (c.detail === 0) return
    c.preventDefault()
    c.stopImmediatePropagation()
    off()
  }
  const soon = () => {
    if (later == null) later = setTimeout(off, 0)
  }
  const off = () => {
    if (later != null) clearTimeout(later)
    later = null
    document.removeEventListener('click', stop, true)
    document.removeEventListener('pointerdown', off, true)
    document.removeEventListener('pointerup', soon, true)
    document.removeEventListener('pointercancel', soon, true)
  }
  document.addEventListener('click', stop, true)
  // Added while this press is heard on the document: it is not run for this press, only for the next one (DOM dispatch).
  document.addEventListener('pointerdown', off, true)
  document.addEventListener('pointerup', soon, true)
  document.addEventListener('pointercancel', soon, true)
}
