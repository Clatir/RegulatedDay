/**
 * The pointer's drag of a sprawa, one for the panel beside the axis (`useCaseDrag`, D384) and the matrix (`useMatrixDrag`, D450);
 * as every other drag of the plan (D305): a press on a row or a card, a move past 4 px starts it, a short move is a click, letting
 * go over a target drops. What the target is – a minute of the axis, a field of the matrix – the caller's `resolve` says.
 * It ends without a write (the ghost and the dimming go) when the pointer is lost: Esc (once the drag has started), the window
 * losing focus, `pointercancel`, a move with no button held (the release happened outside the window and was not seen), and
 * a release over no target. Window listeners only – nothing is attached to the page's elements. Ctrl held (D513) – `copy` while it is
 * held (the page shows the cursor with „+”), and at the release the drop is a copy (`onDrop`'s `copy`; the matrix ignores it).
 */
import { useEffect, useRef, useState } from 'react'
import { dragStarted } from '../plan/gridCreate'

/** What is held: the sprawa, where the pointer is, and what is under it (null – nothing a drop could land on); `copy` – Ctrl is held (D513). */
export interface PointerDragState<T> {
  id: string
  x: number
  y: number
  target: T | null
  copy: boolean
}

/** The part of a `pointerdown` the gesture needs. */
export interface GrabEvent {
  button: number
  clientX: number
  clientY: number
  target: EventTarget
}

/** A press on something of a row or card that is its own (a button, a field) does not start a drag. */
export const ownControl = (t: EventTarget): boolean => t instanceof Element && t.closest('button, input, select, textarea, a') != null

/**
 * `started` – a ref that says whether the gesture of the last press went past the threshold (a drag, whatever came of it: dropped, cancelled, brought back to
 * where it began); the click the browser sends after the release asks it (UX17: a drag is never a click on the card).
 */
export function usePointerDrag<T>(resolve: (x: number, y: number) => T | null, onDrop: (id: string, target: T, copy: boolean) => void): { drag: PointerDragState<T> | null; grab: (id: string, e: GrabEvent) => void; started: { readonly current: boolean } } {
  const [drag, setDrag] = useState<PointerDragState<T> | null>(null)
  const started = useRef(false)
  const at = useRef(resolve)
  at.current = resolve
  const drop = useRef(onDrop)
  drop.current = onDrop
  const off = useRef<(() => void) | null>(null)
  useEffect(() => () => off.current?.(), [])
  const grab = (id: string, e: GrabEvent) => {
    if (e.button !== 0 || ownControl(e.target)) return
    off.current?.()
    started.current = false
    const x0 = e.clientX
    const y0 = e.clientY
    let moved = false
    let last: { x: number; y: number } | null = null
    const stop = () => {
      off.current?.()
      setDrag(null)
    }
    const move = (ev: PointerEvent) => {
      // A move with no button held: the release was outside the window – the gesture is over, nothing is written.
      if (ev.buttons === 0) return stop()
      if (!moved && !dragStarted(ev.clientX - x0, ev.clientY - y0, 'xy')) return
      moved = true
      started.current = true
      last = { x: ev.clientX, y: ev.clientY }
      setDrag({ id, x: ev.clientX, y: ev.clientY, target: at.current(ev.clientX, ev.clientY), copy: ev.ctrlKey })
    }
    const end = (ev: PointerEvent) => {
      stop()
      if (!moved || ev.type === 'pointercancel') return
      const target = at.current(ev.clientX, ev.clientY)
      if (target != null) drop.current(id, target, ev.ctrlKey)
    }
    // Esc cancels a drag that has started (before it, Esc is the window's as ever); the capture phase, `preventDefault` and `stopImmediatePropagation` keep it from closing a layer too (another listener of the window included).
    const key = (ev: KeyboardEvent) => {
      // D513: Ctrl pressed or let go while held – the cursor says what the drop will do (a copy, or the sprawa itself).
      if (ev.key === 'Control' && moved && last) {
        const p = last
        setDrag((d) => (d && d.copy !== ev.ctrlKey ? { ...d, x: p.x, y: p.y, copy: ev.ctrlKey } : d))
        return
      }
      // Esc only when pressed: letting it go (keyup, heard for Ctrl) changes nothing.
      if (ev.type !== 'keydown' || ev.key !== 'Escape' || !moved) return
      ev.preventDefault()
      ev.stopPropagation()
      ev.stopImmediatePropagation()
      stop()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    // A mere press is not a drag: losing the focus cancels only the one that has started.
    const blur = () => {
      if (moved) stop()
    }
    window.addEventListener('blur', blur)
    window.addEventListener('keydown', key, true)
    window.addEventListener('keyup', key, true)
    off.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('blur', blur)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('keyup', key, true)
      off.current = null
    }
  }
  return { drag, grab, started }
}
