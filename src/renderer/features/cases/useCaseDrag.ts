/**
 * A sprawa dragged from the panel beside the axis of „Dziś” onto the axis (D384). The gesture is the pointer's (as every
 * other drag of the plan, D305): press on a row, a move past 4 px starts it, the axis shows where the block would stand, and
 * letting go over the axis drops it. A short move is a click. The panel says what is dragged (`DragState`), the page what a
 * drop does.
 */
import { useEffect, useRef, useState } from 'react'
import { axisPoint, dropMinute } from '../plan/axisDrop'
import { dragStarted } from '../plan/gridCreate'

/** What is held: the sprawa, where the pointer is, and the minute of the axis under it (null – not over the axis). */
export interface CaseDragState {
  id: string
  x: number
  y: number
  minute: number | null
}

/** A press on something of a row that is its own (a button, a field) does not start a drag. */
const ownControl = (t: EventTarget): boolean => t instanceof Element && t.closest('button, input, select, textarea, a') != null

export function useCaseDrag(onDrop: (id: string, minute: number) => void): { drag: CaseDragState | null; grab: (id: string, e: { button: number; clientX: number; clientY: number; target: EventTarget }) => void } {
  const [drag, setDrag] = useState<CaseDragState | null>(null)
  const drop = useRef(onDrop)
  drop.current = onDrop
  const off = useRef<(() => void) | null>(null)
  useEffect(() => () => off.current?.(), [])
  const grab = (id: string, e: { button: number; clientX: number; clientY: number; target: EventTarget }) => {
    if (e.button !== 0 || ownControl(e.target)) return
    off.current?.()
    const x0 = e.clientX
    const y0 = e.clientY
    let moved = false
    const at = (x: number, y: number) => {
      const p = axisPoint()
      return p ? dropMinute(p, x, y) : null
    }
    const move = (ev: PointerEvent) => {
      if (!moved && !dragStarted(ev.clientX - x0, ev.clientY - y0, 'xy')) return
      moved = true
      setDrag({ id, x: ev.clientX, y: ev.clientY, minute: at(ev.clientX, ev.clientY) })
    }
    const end = (ev: PointerEvent) => {
      off.current?.()
      setDrag(null)
      if (!moved || ev.type === 'pointercancel') return
      const minute = at(ev.clientX, ev.clientY)
      if (minute != null) drop.current(id, minute)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    off.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      off.current = null
    }
  }
  return { drag, grab }
}
