/**
 * A sprawa dragged from one field of the matrix to another (HKU3, D450) – the gesture of `useCaseDrag` (the pointer's, D305: a
 * press on a card, a move past 4 px starts it, a short move is a click), the target a field under the pointer instead of the
 * axis: its `data-matrix-field` („p1” … „p4”, „none”). Without a new dependency. The matrix shows what is dragged
 * (`MatrixDragState`), the page what a drop does.
 */
import { useEffect, useRef, useState } from 'react'
import type { MatrixField } from '@shared/engine/casePriority'
import { isPriority } from '@shared/model/requests'
import { dragStarted } from '../plan/gridCreate'

/** What is held: the sprawa, where the pointer is, and the field under it (null – none). */
export interface MatrixDragState {
  id: string
  x: number
  y: number
  over: MatrixField | null
}

/** A press on something of a card that is its own (a button, a field) does not start a drag. */
const ownControl = (t: EventTarget): boolean => t instanceof Element && t.closest('button, input, select, textarea, a') != null

/** The field of the matrix under a point of the window; null – none (outside the matrix). */
export function fieldAt(x: number, y: number): MatrixField | null {
  const f = document.elementFromPoint(x, y)?.closest('[data-matrix-field]')?.getAttribute('data-matrix-field')
  return f === 'none' || isPriority(f) ? f : null
}

export function useMatrixDrag(onDrop: (id: string, field: MatrixField) => void): { drag: MatrixDragState | null; grab: (id: string, e: { button: number; clientX: number; clientY: number; target: EventTarget }) => void } {
  const [drag, setDrag] = useState<MatrixDragState | null>(null)
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
    const move = (ev: PointerEvent) => {
      if (!moved && !dragStarted(ev.clientX - x0, ev.clientY - y0, 'xy')) return
      moved = true
      setDrag({ id, x: ev.clientX, y: ev.clientY, over: fieldAt(ev.clientX, ev.clientY) })
    }
    const end = (ev: PointerEvent) => {
      off.current?.()
      setDrag(null)
      if (!moved || ev.type === 'pointercancel') return
      const field = fieldAt(ev.clientX, ev.clientY)
      if (field != null) drop.current(id, field)
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
