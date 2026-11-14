/**
 * A press of the pointer outside a part of the screen (D461: leaving a new block – the panel of „Dziś”, the small window of
 * „Tydzień”): heard in the capture phase, before whatever the press starts where it lands (another block, a day, a screen), with
 * the active field committed first – what it holds goes with what the leave saves. A dialog (the exchange, a question) and a toast
 * are never „outside”; nor is what `inside` names (the part's element, or a selector of the elements that belong to it).
 */
import { useEffect, useRef, type RefObject } from 'react'
import { commitActiveField } from './commit'

/** What is never a click „elsewhere”: a dialog standing over the window and a toast (its „Cofnij”). */
const NEVER_OUTSIDE = '[role="dialog"], [role="status"]'

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
 * for. A click that never comes (the pointer let go elsewhere) – the next press ends the hold.
 */
export function holdGesture(e: PointerEvent): void {
  e.preventDefault()
  e.stopImmediatePropagation()
  const stop = (c: MouseEvent) => {
    c.preventDefault()
    c.stopImmediatePropagation()
    off()
  }
  const off = () => {
    document.removeEventListener('click', stop, true)
    document.removeEventListener('pointerdown', off, true)
  }
  document.addEventListener('click', stop, true)
  // Added while this press is heard on the document: it is not run for this press, only for the next one (DOM dispatch).
  document.addEventListener('pointerdown', off, true)
}
