/**
 * The plan of a day as a vertical axis of time (D293): a block's height follows its length, gaps without a block are
 * seen, collisions and blocks in the background go to a narrow column beside it, the energy forecast runs beside the
 * axis, and the lines of the wake, the boundary, the maximum, the hard end, the bedtime and now cross it. A click on a
 * block selects it (its editing panel opens on the right), a click on a gap creates a block there; a movable block is
 * dragged with the left button to a new start, in steps of 5 min (D305).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { logicalClock } from '@shared/format'
import type { Pool } from '@shared/model/categories'
import { blockEdgeDim, blockFill, blockFillDim } from '@shared/theme'
import { cx } from '../../components/ui'
import { useMachine } from '../../store/machine'

export interface TimelineItem {
  id: string
  startMin: number
  endMin: number
  title: string
  marks: string[]
  color: string
  background: boolean
  /** Passed, parked or cancelled: shown dimmed. */
  dim?: boolean
  /** Waits for „Zacznij” (a session, the second shift, the weekly analysis). */
  waits?: boolean
  /** Its planned start may be dragged (D305): not begun, with its own start time. */
  movable?: boolean
}

export interface TimelineMarker {
  at: number
  label: string
  tone: 'lamp' | 'rose' | 'sea' | 'muted' | 'fg'
  dashed?: boolean
}

export interface EnergyTrack {
  /** Samples of the three pools (0–100) at logical minutes. */
  samples: Array<{ at: number; head: number; emotions: number; senses: number }>
  reserve: number
}

const POOL_COLOR: Record<Pool, string> = { head: '#F2B66D', emotions: '#D49A97', senses: '#79AFAB' }
const POOL_NAME: Record<Pool, string> = { head: 'głowa', emotions: 'emocje', senses: 'bodźce' }
const TONE: Record<TimelineMarker['tone'], string> = { lamp: '#F2B66D', rose: '#D49A97', sea: '#79AFAB', muted: '#B8AAB0', fg: '#EEE3D6' }
/** Pixels per minute of the axis. */
const PPM = 1.1
const MIN_H = 20
/** A dragged start stands on the grid of these minutes (D305); a drag starts past 4 px – a shorter move is a click. */
export const DRAG_STEP_MIN = 5
const DRAG_FROM_PX = 4
/** A dropped block waits this long at its new start for the day to bring it there (the edit refused: it goes back). */
const DROP_HOLD_MS = 2000

/** The start of a block shown at `startMin` and dragged by `dy` pixels: the minute under its top, on the 5-min grid. */
export const draggedStart = (startMin: number, dy: number): number => Math.round((startMin + dy / PPM) / DRAG_STEP_MIN) * DRAG_STEP_MIN

/**
 * A dropped block's hold ends when the day's items no longer show it at its old place (or at all) – items counted again
 * from the day before the edit came back would put it there for a moment (A6-16). Its new place may differ from the one
 * dropped on (kept in the logical day, a flexible block before now placed at now): any other place is the edit read back;
 * the edit refused – the hold's time runs out.
 */
export const dropSettled = (items: readonly TimelineItem[], d: { id: string; from: number }): boolean => {
  const i = items.find((x) => x.id === d.id)
  return !i || i.startMin !== d.from
}

/** A block being dragged: its pointer, where it went down, its start then and now; dropped – waiting for the day. */
interface Drag {
  id: string
  pointer: number
  y0: number
  from: number
  start: number
  moved: boolean
  dropped: boolean
}

export function Timeline({
  items,
  markers,
  energy,
  selected,
  onSelect,
  onCreate,
  onMove,
  from,
  to,
  ...rest
}: {
  items: TimelineItem[]
  markers: TimelineMarker[]
  energy?: EnergyTrack | null
  selected: string | null
  onSelect: (id: string) => void
  onCreate?: (min: number) => void
  /** A movable block dragged with the left button to a new start (logical minute). */
  onMove?: (id: string, startMin: number) => void
  /** The range shown (logical minutes); the blocks and lines widen it. */
  from: number
  to: number
  'data-testid'?: string
}) {
  const brightness = useMachine((s) => s.prefs.brightness)
  // The block being dragged (the ref for the handlers, the state for drawing).
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDragState] = useState<Drag | null>(null)
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }
  // The click that ends a drag selects nothing.
  const dropped = useRef(false)
  // A dropped block stands at its new start until the day's items bring it there (the edit read back).
  useEffect(() => {
    const d = dragRef.current
    if (d?.dropped && dropSettled(items, d)) setDrag(null)
  }, [items])
  // Let go anywhere (the block drawn anew in another column loses the pointer): the drag ends without a move.
  const holding = drag != null && !drag.dropped
  useEffect(() => {
    if (!holding) return
    const end = (e: PointerEvent) => {
      const d = dragRef.current
      if (d && !d.dropped && d.pointer === e.pointerId) setDrag(null)
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [holding])
  const lo = Math.floor(Math.min(from, ...items.map((i) => i.startMin), ...markers.map((m) => m.at)) / 60) * 60
  const hi = Math.ceil(Math.max(to, ...items.map((i) => i.endMin), ...markers.map((m) => m.at)) / 60) * 60
  const y = (min: number) => (min - lo) * PPM
  const height = (hi - lo) * PPM

  // The foreground column takes the blocks in time order; one that overlaps the one before goes beside it (a collision).
  const lanes = useMemo(() => {
    const main: TimelineItem[] = []
    const side: TimelineItem[] = []
    let end = Number.NEGATIVE_INFINITY
    for (const i of [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)) {
      if (i.background || i.dim) {
        ;(i.background ? side : main).push(i)
        continue
      }
      if (i.startMin < end) side.push(i)
      else {
        main.push(i)
        end = i.endMin
      }
    }
    return { main, side }
  }, [items])

  const hours: number[] = []
  for (let h = lo; h <= hi; h += 60) hours.push(h)

  const box = (i: TimelineItem, narrow: boolean) => {
    const dragged = drag?.id === i.id && drag.moved
    const moving = dragged ? drag.start - i.startMin : 0
    const start = i.startMin + moving
    const end = i.endMin + moving
    const top = y(start)
    const h = Math.max(MIN_H, (i.endMin - i.startMin) * PPM - 1)
    const tiny = h < 34
    const draggable = !!onMove && i.movable === true
    return (
      <button
        key={i.id}
        type="button"
        data-testid={`block-${i.id}`}
        data-block-title={i.title}
        data-movable={draggable ? 'true' : undefined}
        data-selected={selected === i.id ? 'true' : undefined}
        onClick={(e) => {
          e.stopPropagation()
          if (dropped.current) {
            dropped.current = false
            return
          }
          onSelect(i.id)
        }}
        // D305: the left button drags a movable block from where it is shown; its start goes on the 5-min grid.
        onPointerDown={(e) => {
          if (!draggable || e.button !== 0) return
          dropped.current = false
          e.currentTarget.setPointerCapture(e.pointerId)
          setDrag({ id: i.id, pointer: e.pointerId, y0: e.clientY, from: i.startMin, start: i.startMin, moved: false, dropped: false })
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d || d.id !== i.id || d.pointer !== e.pointerId || d.dropped) return
          const dy = e.clientY - d.y0
          if (!d.moved && Math.abs(dy) < DRAG_FROM_PX) return
          const start = draggedStart(d.from, dy)
          if (!d.moved || start !== d.start) setDrag({ ...d, moved: true, start })
        }}
        onPointerUp={(e) => {
          const d = dragRef.current
          if (!d || d.id !== i.id || d.pointer !== e.pointerId || d.dropped) return
          if (!d.moved || d.start === d.from) {
            setDrag(null)
            if (!d.moved) return
          } else {
            const held = { ...d, dropped: true }
            setDrag(held)
            onMove!(i.id, d.start)
            setTimeout(() => dragRef.current === held && setDrag(null), DROP_HOLD_MS)
          }
          // The click comes right after this event, if at all: it alone is swallowed, never a later one.
          dropped.current = true
          setTimeout(() => (dropped.current = false), 0)
        }}
        className={cx(
          'absolute right-0 left-0 overflow-hidden rounded-[3px] border-l-[3px] px-1.5 text-left leading-tight transition-colors',
          selected === i.id ? 'ring-1 ring-lamp' : 'hover:brightness-110',
          i.waits && 'border-dashed',
          draggable && (dragged ? 'z-20 cursor-grabbing shadow-lg' : 'cursor-grab')
        )}
        // Dimmed by its fill and edge, never its text (A8-05).
        style={{ top, height: h, background: i.dim ? blockFillDim(i.color, brightness) : blockFill(i.color, brightness), borderLeftColor: i.dim ? blockEdgeDim(i.color) : i.color }}
        data-dim={i.dim ? 'on' : undefined}
      >
        <div className={cx('flex min-w-0 items-baseline gap-1.5', tiny ? 'text-[11px]' : 'pt-0.5 text-[12px]')}>
          {!narrow && <span className="num shrink-0 text-[11px] text-muted">{logicalClock(start)}</span>}
          <span className="truncate text-fg">{i.title}</span>
        </div>
        {!tiny && !narrow && (
          <div className="truncate text-[11px] text-muted">
            {logicalClock(start)}–{logicalClock(end)}
            {i.marks.length ? ` · ${i.marks.join(' · ')}` : ''}
          </div>
        )}
      </button>
    )
  }

  const energyPath = (pool: Pool) =>
    energy?.samples
      .filter((s) => Number.isFinite(s[pool]))
      .map((s, k) => `${k ? 'L' : 'M'}${((s[pool] / 100) * 40).toFixed(1)},${y(s.at).toFixed(1)}`)
      .join(' ') ?? ''

  return (
    <div className="flex select-none" data-testid={rest['data-testid'] ?? 'timeline'}>
      {/* Hours. */}
      <div className="relative w-[46px] shrink-0" style={{ height }}>
        {hours.map((h) => (
          <div key={h} className="num absolute right-2 -translate-y-1/2 text-[11px] text-muted" style={{ top: y(h) }}>
            {logicalClock(h)}
          </div>
        ))}
      </div>
      {/* The axis: the main column with the lines across it. */}
      <div
        className="relative min-w-0 flex-1 border-l border-line"
        style={{ height }}
        onClick={(e) => {
          if (!onCreate) return
          const rect = e.currentTarget.getBoundingClientRect()
          const min = lo + (e.clientY - rect.top) / PPM
          onCreate(Math.round(min / 15) * 15)
        }}
        data-testid="timeline-axis"
      >
        {hours.map((h) => (
          <div key={h} className="pointer-events-none absolute right-0 left-0 border-t border-line/60" style={{ top: y(h) }} />
        ))}
        <div className="absolute inset-y-0 right-[96px] left-1.5">{lanes.main.map((i) => box(i, false))}</div>
        <div className="absolute inset-y-0 right-1.5 w-[86px]">{lanes.side.map((i) => box(i, true))}</div>
        {markers.map((m) => (
          <div key={`${m.label}-${m.at}`} className="pointer-events-none absolute right-0 left-0 z-10" style={{ top: y(m.at) }} data-testid={`marker-${m.label.split(' ')[0]}`}>
            <div className={cx('border-t', m.dashed && 'border-dashed')} style={{ borderColor: TONE[m.tone] }} />
            <span className="num absolute right-1 -translate-y-full rounded-sm bg-bg/80 px-1 text-[10.5px]" style={{ color: TONE[m.tone] }}>
              {m.label}
            </span>
          </div>
        ))}
      </div>
      {/* The energy forecast beside the axis: the three pools, the reserve as a line. */}
      {energy && energy.samples.length > 0 && (
        <div className="relative w-[48px] shrink-0 border-l border-line" style={{ height }} data-testid="energy-track">
          <svg width={44} height={height} className="absolute top-0 left-1">
            <line x1={(energy.reserve / 100) * 40} x2={(energy.reserve / 100) * 40} y1={0} y2={height} stroke="#D49A97" strokeDasharray="2 3" strokeWidth={1} />
            {(['head', 'emotions', 'senses'] as Pool[]).map((p) => (
              <path key={p} d={energyPath(p)} fill="none" stroke={POOL_COLOR[p]} strokeWidth={1.4} opacity={0.9}>
                <title>{POOL_NAME[p]}</title>
              </path>
            ))}
          </svg>
        </div>
      )}
    </div>
  )
}

/** The legend of the energy track. */
export function EnergyLegend({ reserve }: { reserve: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
      {(['head', 'emotions', 'senses'] as Pool[]).map((p) => (
        <span key={p} className="inline-flex items-center gap-1">
          <span className="inline-block h-[2px] w-3" style={{ background: POOL_COLOR[p] }} />
          {POOL_NAME[p]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-0 border-l border-dashed" style={{ borderColor: '#D49A97' }} />
        rezerwa {reserve}
      </span>
    </div>
  )
}
