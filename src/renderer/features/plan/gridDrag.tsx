/**
 * The gesture of a new block on a column of time (D366): a click on an empty place gives the minute under it, a drag over
 * it (past 4 px, D305) the range from where it went down to where it is, shown as a band while it is held. What starts on
 * a block or on anything marked `data-no-grid` (a confirmation, a block's handles) is not this gesture's. The axes of
 * „Dziś”, „Szablony” and the columns of „Tydzień” all use it; what a click or a drop creates is theirs to say.
 */
import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { durationLabel, logicalClock } from '@shared/format'
import { DRAG_FROM_PX, gridRange, minuteAtPx, type GridRange } from './gridCreate'

/** Marks what the gesture leaves alone: a block, a confirmation standing on the axis. */
export const NO_GRID = { 'data-no-grid': 'true' } as const

const inNoGrid = (target: EventTarget): boolean => target instanceof Element && target.closest('[data-no-grid]') != null

interface Held {
  pointer: number
  y0: number
  top: number
  moved: boolean
}

/**
 * Handlers for the element of a column (`lo`–`hi` minutes from its top, `ppm` pixels a minute): `onClick` gets the minute
 * under a click as it is (the caller rounds it) with the column's rectangle, `onRange` the range of a finished drag, `onHold`
 * hears the drag as it goes. `range` is the one being dragged – null when nothing is held.
 */
export function useGridCreate(o: {
  lo: number
  hi: number
  ppm: number
  onClick: (minute: number, rect: DOMRect) => void
  /** A finished drag: its range, the column's rectangle and where the pointer let go (`clientX`: a drag may leave the column, D371). */
  onRange: (range: GridRange, rect: DOMRect, clientX: number) => void
  /** A drag in progress (the range and where the pointer is), null when it ends – for what is drawn beyond the column. */
  onHold?: (range: GridRange | null, clientX: number) => void
}) {
  const held = useRef<Held | null>(null)
  const [range, setRange] = useState<GridRange | null>(null)
  // The click that comes right after a drop creates nothing.
  const swallow = useRef(false)
  const end = () => {
    held.current = null
    setRange(null)
    o.onHold?.(null, 0)
  }
  const bind = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || inNoGrid(e.target)) return
      held.current = { pointer: e.pointerId, y0: e.clientY, top: e.currentTarget.getBoundingClientRect().top, moved: false }
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const h = held.current
      if (!h || h.pointer !== e.pointerId) return
      if (!h.moved) {
        if (Math.abs(e.clientY - h.y0) < DRAG_FROM_PX) return
        // From here the column follows the pointer wherever it goes (not before: a click on a button inside stays one).
        e.currentTarget.setPointerCapture(e.pointerId)
        h.moved = true
      }
      const next = gridRange(h.y0 - h.top, e.clientY - h.top, o.lo, o.hi, o.ppm)
      setRange((r) => (r && r.startMin === next.startMin && r.endMin === next.endMin ? r : next))
      o.onHold?.(next, e.clientX)
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const h = held.current
      if (!h || h.pointer !== e.pointerId) return
      const done = h.moved ? gridRange(h.y0 - h.top, e.clientY - h.top, o.lo, o.hi, o.ppm) : null
      const rect = e.currentTarget.getBoundingClientRect()
      end()
      if (!done) return
      swallow.current = true
      setTimeout(() => (swallow.current = false), 0)
      o.onRange(done, rect, e.clientX)
    },
    onPointerCancel: (e: PointerEvent<HTMLElement>) => {
      if (held.current?.pointer === e.pointerId) end()
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (swallow.current) {
        swallow.current = false
        return
      }
      if (inNoGrid(e.target)) return
      const rect = e.currentTarget.getBoundingClientRect()
      o.onClick(minuteAtPx(e.clientY - rect.top, o.lo, o.ppm), rect)
    }
  }
  return { bind, range }
}

/**
 * The span being taken (a drag in progress, or the new block waiting in its small window): a band over the minutes with
 * their hours. `withLength` adds the length (a wide axis); `testId` names it.
 */
export function RangeBand({ range, lo, ppm, withLength, testId }: { range: GridRange; lo: number; ppm: number; withLength?: boolean; testId?: string }) {
  return (
    <div
      className="num pointer-events-none absolute right-0 left-0 z-20 overflow-hidden rounded-[3px] border border-lamp bg-lamp/20 px-1 text-[11px] leading-[14px] text-fg"
      style={{ top: (range.startMin - lo) * ppm, height: Math.max(14, (range.endMin - range.startMin) * ppm) }}
      data-testid={testId ?? 'grid-range'}
      data-start={range.startMin}
      data-end={range.endMin}
    >
      {logicalClock(range.startMin)}–{logicalClock(range.endMin)}
      {withLength ? ` · ${durationLabel(range.endMin - range.startMin)}` : ''}
    </div>
  )
}
