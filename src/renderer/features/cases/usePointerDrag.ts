/**
 * The pointer's drag of a sprawa, one for the panel beside the axis (`useCaseDrag`, D384) and the matrix (`useMatrixDrag`, D450);
 * as every other drag of the plan (D305): a press on a row or a card, a move past 4 px starts it, a short move is a click, letting
 * go over a target drops. What the target is – a minute of the axis, a field of the matrix – the caller's `resolve` says.
 * It ends without a write (the ghost and the dimming go) when the pointer is lost: Esc (once the drag has started), the window
 * losing focus, `pointercancel`, a move with no button held (the release happened outside the window and was not seen), and
 * a release over no target. Window listeners only – nothing is attached to the page's elements.
 */
import { useEffect, useRef, useState } from 'react'
import { dragStarted } from '../plan/gridCreate'

/** What is held: the sprawa, where the pointer is, and what is under it (null – nothing a drop could land on). */
export interface PointerDragState<T> {
  id: string
  x: number
  y: number
  target: T | null
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

export function usePointerDrag<T>(resolve: (x: number, y: number) => T | null, onDrop: (id: string, target: T) => void): { drag: PointerDragState<T> | null; grab: (id: string, e: GrabEvent) => void } {
  const [drag, setDrag] = useState<PointerDragState<T> | null>(null)
  const at = useRef(resolve)
  at.current = resolve
  const drop = useRef(onDrop)
  drop.current = onDrop
  const off = useRef<(() => void) | null>(null)
  useEffect(() => () => off.current?.(), [])
  const grab = (id: string, e: GrabEvent) => {
    if (e.button !== 0 || ownControl(e.target)) return
    off.current?.()
    const x0 = e.clientX
    const y0 = e.clientY
    let moved = false
    const stop = () => {
      off.current?.()
      setDrag(null)
    }
    const move = (ev: PointerEvent) => {
      // A move with no button held: the release was outside the window – the gesture is over, nothing is written.
      if (ev.buttons === 0) return stop()
      if (!moved && !dragStarted(ev.clientX - x0, ev.clientY - y0, 'xy')) return
      moved = true
      setDrag({ id, x: ev.clientX, y: ev.clientY, target: at.current(ev.clientX, ev.clientY) })
    }
    const end = (ev: PointerEvent) => {
      stop()
      if (!moved || ev.type === 'pointercancel') return
      const target = at.current(ev.clientX, ev.clientY)
      if (target != null) drop.current(id, target)
    }
    // Esc cancels a drag that has started (before it, Esc is the window's as ever); the capture phase and `preventDefault` keep it from closing a layer too.
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !moved) return
      ev.preventDefault()
      ev.stopPropagation()
      stop()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', stop)
    window.addEventListener('keydown', key, true)
    off.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('blur', stop)
      window.removeEventListener('keydown', key, true)
      off.current = null
    }
  }
  return { drag, grab }
}
