/**
 * The plan of a day as a vertical axis of time (D293): a block's height follows its length, gaps without a block are
 * seen, blocks that overlap – parallel ones (D476), in the background, collisions – stand side by side, the energy forecast runs beside the
 * axis, and the lines of the wake, the boundary, the maximum, the hard end, the bedtime and now cross it. A click on a
 * block selects it (its editing panel opens on the right), a click on a gap creates a block there; a movable block is
 * dragged with the left button to a new start, in steps of 5 min (D305), and by its edges to a new length (D365): the
 * bottom edge moves its end, the top one its start with the same end. A drag over a gap creates a block with that start
 * and end (D366); the column of hours counts as the axis for both. While a block is dragged, the blocks it pushes apart
 * stand at their new places (D367, `pushPreview`); dropped onto the right part of another block, it stands beside it (D492,
 * `parallelPreview` – „Równolegle z …”).
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { durationLabel, logicalClock } from '@shared/format'
import type { EnergyTrack } from '@shared/engine/energyTrack'
import type { Pool } from '@shared/model/categories'
import { DRAG_STEP_MIN, MAX_BLOCK_MIN, MIN_BLOCK_MIN } from '@shared/model/plan'
import type { DueBadge } from '@shared/engine/caseDates'
import type { Priority } from '@shared/model/requests'
import { SERIES_MARK } from '@shared/seriesText'
import { blockEdgeDim, blockFill, blockFillDim } from '@shared/theme'
import { cx } from '../../components/ui'
import { attachable, hasFiles, textTarget } from '../attachments/attachDrop'
import { attachBadge, attachBadgeTitle } from '../attachments/attachView'
import { useMachine } from '../../store/machine'
import { DueMark } from '../cases/DueMark'
import { PriorityMark } from '../cases/PriorityMark'
import { poolPath, POOL_COLOR, POOL_NAME } from './energyDraw'
import { DEFAULT_NEW_BLOCK_MIN, DRAG_FROM_PX } from './gridCreate'
import { NO_GRID, RangeBand, useGridCreate } from './gridDrag'
import { inParallelZone, tileAt, tileLanes } from './parallelDrag'

export interface TimelineItem {
  id: string
  startMin: number
  endMin: number
  title: string
  /**
   * A block with its own name (D430): what it is besides the name (its category or variant – `blockKind`), said small beside
   * its hours („09:00–09:45 · Analiza”); absent – no name of its own (the title is that already).
   */
  kind?: string
  marks: string[]
  color: string
  /** The block's category – the calendar it belongs to (D419: the views of the window hide the unchecked calendars' blocks). */
  categoryId: string
  /** Drawn in spite of its calendar being unchecked (D427: the block whose panel is open): the calendar's name, said on the tile. */
  hiddenIn?: string
  background: boolean
  /** Passed, parked or cancelled: shown dimmed. */
  dim?: boolean
  /** Waits for „Zacznij” (a fixed session). */
  waits?: boolean
  /** An occurrence of a series: the mark `SERIES_MARK` stands by its name (D401). */
  series?: boolean
  /** The due date of the task the block is of (D409): „Po terminie” (red) or „Termin jutro” … (muted) by its name; none for days gone by. */
  badge?: DueBadge
  /** The priority of the task the block is of (D450): a narrow stripe on the tile's left, inside the category's edge; the colour of the block stays the category's. */
  priority?: Priority
  /** The counter of the block's steps „✓ 3/4” (D440, `stepsCounter`); none – no steps. */
  steps?: string
  /** Its planned start may be dragged (D305): not begun, with its own start time. */
  movable?: boolean
  /**
   * A block that is not `movable` (D305) but whose planned length may be changed by its bottom edge alone (D365: one that
   * runs, of a kind that has its own hour) – no handle on its top, its start stays.
   */
  resize?: 'end'
  /**
   * The number of the block's attachments (D410: 📎N on the tile when above 0); any number, 0 too, makes the tile take files
   * and links dropped on it (`onAttachDrop`). Left out – a tile that takes no drop (a block begun outside the plan).
   */
  attach?: number
}

/**
 * The new block not saved yet (D466), drawn on the axis where it will stand: dashed all round, with its hours – it grows with
 * the panel's start, end and length, and gives way to the real tile when it is saved or goes when it is thrown away.
 */
export interface DraftTile {
  startMin: number
  endMin: number
  title: string
  color: string
  /** The category beside the hours when the block has its own name (D430). */
  kind?: string
}

/** What bounds a block's bottom edge besides the 5 min and the day's length (D365: a running block – not before now, not past the day). */
export interface EdgeLimits {
  minEndMin?: number
  maxEndMin?: number
}

/** A span of a block shown on the axis after an edge was dragged (logical minutes). */
export interface BlockSpan {
  startMin: number
  endMin: number
}

/**
 * A block dragged onto another one (D492): what the drop would do – said on the axis (`text`: „Równolegle z …”, or the note of
 * a full group), where the dragged block would stand (`span`) and the blocks it pushes apart (by id, null – none); `same` – a
 * block of its own group: the drop changes nothing.
 */
export interface ParallelHint {
  text: string
  span: BlockSpan
  pushed: ReadonlyMap<string, BlockSpan> | null
  same?: boolean
}

/** The edge of a block dragged by its handle: the top one moves its start, the bottom one its end (D365). */
export type DragEdge = 'top' | 'end'

export interface TimelineMarker {
  at: number
  label: string
  tone: 'lamp' | 'rose' | 'sea' | 'muted' | 'fg'
  dashed?: boolean
}

/** The energy's curve beside the axis (the one sampling: `@shared/engine/energyTrack`). */
export type { EnergyTrack }

const TONE: Record<TimelineMarker['tone'], string> = { lamp: '#F2B66D', rose: '#D49A97', sea: '#79AFAB', muted: '#B8AAB0', fg: '#EEE3D6' }
/** Pixels per minute of the axis. */
const PPM = 1.1
const MIN_H = 20
/** A dropped block waits this long at its new start for the day to bring it there (the edit refused: it goes back). */
const DROP_HOLD_MS = 2000

/** The start of a block shown at `startMin` and dragged by `dy` pixels: the minute under its top, on the 5-min grid. */
export const draggedStart = (startMin: number, dy: number): number => Math.round((startMin + dy / PPM) / DRAG_STEP_MIN) * DRAG_STEP_MIN

/**
 * The end of a block shown over `startMin`–`endMin` and its bottom edge dragged by `dy` pixels (D365): the minute under
 * the edge, on the 5-min grid; never a block shorter than 5 min nor longer than the plan holds, within `limits` (a running
 * block: not before now rounded up, not past the day). A move up never lengthens the block – past a limit that lies
 * after its shown end (a block that ran over its plan, the end shown at now) the end stays where it is – and a move down
 * never shortens it (a limit before its shown end, off the grid or under 5 min, does not pull it back), nor ends it under
 * 5 min after its start.
 */
export const draggedEnd = (startMin: number, endMin: number, dy: number, limits: EdgeLimits = {}): number => {
  const shortest = Math.ceil(Math.max(startMin + MIN_BLOCK_MIN, limits.minEndMin ?? Number.NEGATIVE_INFINITY) / DRAG_STEP_MIN) * DRAG_STEP_MIN
  const longest = Math.floor(Math.min(startMin + MAX_BLOCK_MIN, limits.maxEndMin ?? Number.POSITIVE_INFINITY) / DRAG_STEP_MIN) * DRAG_STEP_MIN
  const under = Math.round((endMin + dy / PPM) / DRAG_STEP_MIN) * DRAG_STEP_MIN
  if (under < endMin) return Math.min(Math.max(under, shortest), endMin)
  return Math.max(Math.min(under, longest), endMin, shortest)
}

/**
 * The hold of a dropped block ends when its end waits for a confirmation: the drop `d` is the one `attached` is about (the
 * same block, the end the drop asked for) – another, earlier wait does not end the hold of a new drop.
 */
/**
 * A drop that changes nothing: the block would stand where it stood when grabbed – compared at where it will stand (`at`,
 * after a template's morning found its place – D372), not under the pointer.
 */
export const staysPut = (at: BlockSpan, d: { from: number; fromEnd: number }): boolean => at.startMin === d.from && at.endMin === d.fromEnd

export const holdEnds = (d: { dropped: boolean; id: string; end: number }, attached: { id: string; endMin: number } | null | undefined): boolean =>
  d.dropped && attached != null && d.id === attached.id && d.end === attached.endMin

/**
 * The start of a block shown over `startMin`–`endMin` and its top edge dragged by `dy` pixels (D365): on the 5-min grid, the
 * end staying – never a block shorter than 5 min nor longer than the plan holds.
 */
export const draggedTopStart = (startMin: number, endMin: number, dy: number): number => {
  const latest = Math.floor((endMin - MIN_BLOCK_MIN) / DRAG_STEP_MIN) * DRAG_STEP_MIN
  const earliest = Math.ceil((endMin - MAX_BLOCK_MIN) / DRAG_STEP_MIN) * DRAG_STEP_MIN
  return Math.max(Math.min(Math.round((startMin + dy / PPM) / DRAG_STEP_MIN) * DRAG_STEP_MIN, latest), Math.min(earliest, latest))
}

/**
 * A dropped block's hold ends when the day's items no longer show it at its old place (or at all) – items counted again
 * from the day before the edit came back would put it there for a moment (A6-16). Its new place may differ from the one
 * dropped on (kept in the logical day, a flexible block before now placed at now): any other place is the edit read back;
 * the edit refused – the hold's time runs out.
 */
export const dropSettled = (items: readonly TimelineItem[], d: { id: string; from: number; fromEnd?: number; exactEnd?: number }): boolean => {
  const i = items.find((x) => x.id === d.id)
  // A running block's end the timer sets exactly (`exactEnd`): until it stands there nothing is read back (its shown end
  // moves with the clock when it ran over its plan – not the edit).
  if (d.exactEnd != null) return !i || i.endMin === d.exactEnd
  return !i || i.startMin !== d.from || (d.fromEnd != null && i.endMin !== d.fromEnd)
}

/**
 * A block being dragged (`edge` null: the whole block – its start; else the edge – D365): its pointer, where it went down,
 * its span then (`from`, `fromEnd`) and now (`start`, `end`); dropped – waiting for the day.
 */
interface Drag {
  id: string
  pointer: number
  y0: number
  edge: DragEdge | null
  from: number
  fromEnd: number
  start: number
  end: number
  /** What bounds the bottom edge, taken when it was grabbed (now moves on while it is held). */
  limits: EdgeLimits
  /** The end is set exactly by the timer (a running block): the hold waits for it (`dropSettled`). */
  exact: boolean
  moved: boolean
  dropped: boolean
  /** The block whose right part it is over (D492: dropped there, it stands beside it); null – a move to its hour. */
  onto: string | null
}

/**
 * The handlers of a tile that takes files and links dropped on it (D410): `dragover` is cancelled only for a file or a link (a
 * drag of text over a field is not taken), the tile is lit while they are over it, the drop goes to `take`.
 */
function tileDrop(id: string, take: (id: string, dt: DataTransfer) => void, over: string | null, setOver: (id: string | null) => void) {
  const accepts = (e: DragEvent): boolean => attachable(e.dataTransfer) && (hasFiles(e.dataTransfer) || !textTarget(e.target))
  const enter = (e: DragEvent) => {
    if (!accepts(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (over !== id) setOver(id)
  }
  return {
    onDragEnter: enter,
    onDragOver: enter,
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
    },
    onDrop: (e: DragEvent) => {
      setOver(null)
      if (!accepts(e)) return
      e.preventDefault()
      e.stopPropagation()
      take(id, e.dataTransfer)
    }
  }
}

export function Timeline({
  items,
  markers,
  energy,
  selected,
  onSelect,
  onCreate,
  clickCreates = true,
  onMove,
  onResize,
  resizeNote,
  edgeLimits,
  pushPreview,
  parallelPreview,
  onParallel,
  attached,
  onAttachDrop,
  ghost,
  draft,
  from,
  to,
  extent,
  ...rest
}: {
  items: TimelineItem[]
  /** The spans that bound the axis, when they are more than `items` (the blocks of an unchecked calendar are not drawn – D427). */
  extent?: ReadonlyArray<Pick<TimelineItem, 'startMin' | 'endMin'>>
  markers: TimelineMarker[]
  energy?: EnergyTrack | null
  selected: string | null
  onSelect: (id: string) => void
  /**
   * A new block from an empty place: a click gives its start (on the quarter, `durationMin` left out), a drag over it the
   * start and the length of the range (on the 5-min grid, D366).
   */
  onCreate?: (min: number, durationMin?: number) => void
  /** Whether a bare click on an empty place makes a draft too (D366); false – only a drag creates (D496, „Dziś”). */
  clickCreates?: boolean
  /**
   * A movable block dragged with the left button to a new start (logical minute); it may return the span the block stands
   * at after it (a template's morning the day's wake moves – D372), where it is held until the day shows it.
   */
  onMove?: (id: string, startMin: number) => BlockSpan | void
  /**
   * A block's edge dragged (D365): its new span – the end moved alone (`end`) or the start with the same end (`top`) – and
   * the span it was shown over when grabbed (`shown`: what the drop is counted against, not what the day shows by then).
   * Returns the span the block is held at until the day shows the change, or false when nothing was asked (nothing to save):
   * the block then goes back at once.
   */
  onResize?: (id: string, span: BlockSpan, edge: DragEdge, shown: BlockSpan) => BlockSpan | false
  /**
   * What the drop would save, said beside the hours while an edge is dragged (D365: the saved length, the cost of a running
   * block's extension); null or left out – the length of the span the block is drawn over (where it will stand). Asked
   * only for a drop that changes something.
   */
  resizeNote?: (id: string, span: BlockSpan, edge: DragEdge, shown: BlockSpan) => string | null
  /** What bounds the bottom edge of a block when it is grabbed (D365: a running block – not before now, not past the day). */
  edgeLimits?: (id: string) => EdgeLimits | null
  /**
   * D367 (rozsuwanie): the blocks a drag pushes apart and where they would stand (by id) while a block is dragged by its
   * body (`edge` null) or an edge to `span`, grabbed at `shown`; null or empty – nothing pushed. They are drawn there,
   * dashed, until the day shows the drop. The dragged block's own id: where it will stand when that is not under the
   * pointer (D372) – drawn and said there.
   */
  pushPreview?: (id: string, span: BlockSpan, edge: DragEdge | null, shown: BlockSpan) => ReadonlyMap<string, BlockSpan> | null
  /**
   * D492: what dropping the dragged block `id` onto block `target` does (null – `target` takes no drop: the drag stays a move to
   * its hour). Asked while the pointer is over the right part of another tile; with it the tile is drawn where the drop puts it.
   */
  parallelPreview?: (id: string, target: string) => ParallelHint | null
  /**
   * D492: the block `id` dropped onto block `target`: the span it is held at until the day shows it, or false when nothing was
   * asked (the day changed since the preview) – it goes back at once.
   */
  onParallel?: (id: string, target: string) => BlockSpan | false
  /**
   * A block's end waiting for a confirmation (D365: a running block's extension past the boundary): the block is drawn
   * down to `endMin` (its added part dashed), `node` – „Potwierdź · Anuluj” – stands at that edge. Gone: the block is at its end.
   */
  attached?: { id: string; endMin: number; seq: number; node: ReactNode } | null
  /**
   * Files or a link from outside the window dropped on a tile that has `attach` (D410): the block's id and the transfer. The tile
   * is lit while they are over it; the gestures of the axis (the drag of a block, the edges, a new block) are pointer ones and stay as they were.
   */
  onAttachDrop?: (id: string, dt: DataTransfer) => void
  /** The span a sprawa dragged from outside the axis would take (D384) – drawn as a band while it is held; null – none. */
  ghost?: BlockSpan | null
  /** The new block not saved yet (D466): a dashed tile with its hours; null – none. The axis widens to hold it. */
  draft?: DraftTile | null
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
  // The tile a file or a link is dragged over (D410).
  const [dropOver, setDropOver] = useState<string | null>(null)
  // A dropped block stands at its new start until the day's items bring it there (the edit read back).
  useEffect(() => {
    const d = dragRef.current
    if (d?.dropped && dropSettled(items, { ...d, exactEnd: d.exact ? d.end : undefined })) setDrag(null)
  }, [items])
  // A running block's end waiting for „Potwierdź · Anuluj”: the block is drawn there by `attached`, the hold is over.
  // (`seq` counts the waits: a second drop to the same end is a new wait.)
  const waitingSeq = attached?.seq
  useEffect(() => {
    const d = dragRef.current
    if (d && attached && holdEnds(d, attached)) setDrag(null)
  }, [waitingSeq])
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
  // The range of the axis (and so the place a click or a drag creates a block in) is that of ALL the day's blocks, the hidden ones too
  // (D427): hiding a calendar never moves the hours.
  const span = [...(extent ?? items), ...(draft ? [draft] : [])]
  const lo = Math.floor(Math.min(from, ...span.map((i) => i.startMin), ...markers.map((m) => m.at)) / 60) * 60
  const hi = Math.ceil(Math.max(to, ...span.map((i) => i.endMin), ...markers.map((m) => m.at)) / 60) * 60
  // D366: a click on a gap (or in the column of hours) creates a block on the quarter, a drag one with its start and end;
  // with `clickCreates` off (D496, „Dziś”) a bare click makes nothing – only a drag does.
  const grid = useGridCreate({
    lo,
    hi,
    ppm: PPM,
    flatMin: DEFAULT_NEW_BLOCK_MIN,
    onClick: (min) => {
      if (clickCreates) onCreate?.(Math.round(min / 15) * 15)
    },
    onRange: (r) => onCreate?.(r.startMin, r.endMin - r.startMin)
  })
  const gridBind = onCreate ? grid.bind : {}
  const y = (min: number) => (min - lo) * PPM
  const height = (hi - lo) * PPM

  const hours: number[] = []
  for (let h = lo; h <= hi; h += 60) hours.push(h)

  // D367: where the blocks the dragged one pushes apart would stand – while it is held, and after the drop until the day
  // shows it (the hold); counted once for each place of the drag on the day shown (`items`), not on every render.
  const previewOf = useRef(pushPreview)
  previewOf.current = pushPreview
  // D492: the drop onto another block – counted once for each block the dragged one is over during one drag on one count of
  // the day (`items`), not on every move of the pointer (a full count of the day and its push each time).
  const hints = useRef<{ items: TimelineItem[]; id: string; of: Map<string, ParallelHint | null> } | null>(null)
  const hintOf = (id: string, target: string): ParallelHint | null => {
    if (!parallelPreview) return null
    if (hints.current?.items !== items || hints.current.id !== id) hints.current = { items, id, of: new Map() }
    const of = hints.current.of
    if (!of.has(target)) of.set(target, parallelPreview(id, target))
    return of.get(target) ?? null
  }
  // Kept after the drop until the day shows it (the hold): the pushed blocks stay drawn where the drop puts them.
  const onto = drag?.moved ? drag.onto : null
  const hint = drag && onto ? hintOf(drag.id, onto) : null
  const pushKey = drag?.moved && pushPreview && !drag.onto ? `${drag.id}|${drag.edge ?? ''}|${drag.start}|${drag.end}|${drag.from}|${drag.fromEnd}` : null
  const pushedByMove = useMemo(
    () => (pushKey && drag ? (previewOf.current?.(drag.id, { startMin: drag.start, endMin: drag.end }, drag.edge, { startMin: drag.from, endMin: drag.fromEnd }) ?? null) : null),
    // The drag's place is in the key; a new count of the day brings new items.
    [pushKey, items]
  )
  const pushed = onto ? (hint?.pushed ?? null) : pushedByMove
  // Where the dragged block is drawn: under the pointer, where it will stand (`pushPreview` with its own id), or beside the
  // block it is dropped onto (D492).
  const dragShown: BlockSpan | null = drag ? (hint && !hint.same ? hint.span : (pushed?.get(drag.id) ?? { startMin: drag.start, endMin: drag.end })) : null

  /** Where a tile is drawn now: dragged, pushed apart by the drag, waiting for a confirmation of its end, or at its place. */
  const spanOf = (i: TimelineItem) => {
    const dragged = drag?.id === i.id && drag.moved
    const pushedTo = dragged ? undefined : pushed?.get(i.id)
    // Waiting for a confirmation (and not being dragged again): at the end it asks for.
    const waiting = !dragged && attached?.id === i.id
    const start = dragged ? dragShown!.startMin : pushedTo ? pushedTo.startMin : i.startMin
    const end = dragged ? dragShown!.endMin : waiting ? attached.endMin : pushedTo ? pushedTo.endMin : i.endMin
    return { dragged, pushedTo, waiting, start, end }
  }
  // D476: tiles that overlap where they are drawn stand side by side (a tile at least `MIN_H` high).
  // The dragged one is not among them: the tiles under it keep their places while it is held (the one it would be dropped onto
  // stays under the pointer); it is drawn over the whole column, or – dropped onto a block (D492) – in the right half of it.
  const lanes = tileLanes(
    items
      .filter((i) => !(drag?.moved && drag.id === i.id))
      .map((i) => {
        const s = spanOf(i)
        return { id: i.id, startMin: s.start, endMin: s.end }
      }),
    MIN_H / PPM
  )
  const draggedLane = (id: string) => (onto && drag?.id === id ? { lane: 1, lanes: 2 } : drag?.moved && drag.id === id ? { lane: 0, lanes: 1 } : null)

  /** The tile under the pointer at (`x`, `y`) whose right part takes the dragged block `id` (D492), or null. */
  const ontoAt = (id: string, x: number, py: number): string | null => {
    const tile = parallelPreview ? tileAt(x, py, id) : null
    return tile && inParallelZone(x, py, tile.rect) && hintOf(id, tile.id) ? tile.id : null
  }

  const box = (i: TimelineItem) => {
    const { dragged, pushedTo, waiting, start, end } = spanOf(i)
    const lane = draggedLane(i.id) ?? lanes.get(i.id) ?? { lane: 0, lanes: 1 }
    // Three tiles side by side and more: no hours on them (narrow), as the old column of the background had it.
    const narrow = lane.lanes >= 3
    const top = y(start)
    const h = Math.max(MIN_H, (end - start) * PPM - 1)
    const tiny = h < 34
    const draggable = !!onMove && i.movable === true
    // D365: a movable block has both edges; one that only runs on – the bottom one.
    const topEdge = !!onResize && i.movable === true
    const endEdge = !!onResize && (i.movable === true || i.resize === 'end')
    return (
      <button
        key={i.id}
        type="button"
        data-testid={`block-${i.id}`}
        data-tile-id={i.id}
        data-lane={lane.lanes > 1 ? `${lane.lane}/${lane.lanes}` : undefined}
        {...NO_GRID}
        data-block-title={i.title}
        data-movable={draggable ? 'true' : undefined}
        data-selected={selected === i.id ? 'true' : undefined}
        // D462: Del on the focused tile removes the block (the screen says what – `useDeleteResolver('block')`).
        data-del={`block:${i.id}`}
        onClick={(e) => {
          e.stopPropagation()
          if (dropped.current) {
            dropped.current = false
            return
          }
          onSelect(i.id)
        }}
        // D305: the left button drags a movable block from where it is shown; its start goes on the 5-min grid. D365: from
        // an edge's handle the edge goes (never both at once), a block with no handle under the pointer is moved as before.
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const at = (e.target as HTMLElement).dataset.edge
          const edge: DragEdge | null = at === 'top' && topEdge ? 'top' : at === 'end' && endEdge ? 'end' : null
          if (edge == null && !draggable) return
          dropped.current = false
          e.currentTarget.setPointerCapture(e.pointerId)
          const limits = (edge === 'end' && i.resize === 'end' ? edgeLimits?.(i.id) : null) ?? {}
          setDrag({ id: i.id, pointer: e.pointerId, y0: e.clientY, edge, from: i.startMin, fromEnd: i.endMin, start: i.startMin, end: i.endMin, limits, exact: edge === 'end' && i.movable !== true, moved: false, dropped: false, onto: null })
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d || d.id !== i.id || d.pointer !== e.pointerId || d.dropped) return
          const dy = e.clientY - d.y0
          if (!d.moved && Math.abs(dy) < DRAG_FROM_PX) return
          const span: BlockSpan =
            d.edge === 'end'
              ? { startMin: d.from, endMin: draggedEnd(d.from, d.fromEnd, dy, d.limits) }
              : d.edge === 'top'
                ? { startMin: draggedTopStart(d.from, d.fromEnd, dy), endMin: d.fromEnd }
                : (() => {
                    const s = draggedStart(d.from, dy)
                    return { startMin: s, endMin: d.fromEnd + s - d.from }
                  })()
          // D492: the body over the right part of another tile – a drop onto it.
          const over = d.edge == null ? ontoAt(d.id, e.clientX, e.clientY) : null
          if (!d.moved || span.startMin !== d.start || span.endMin !== d.end || over !== d.onto) setDrag({ ...d, moved: true, start: span.startMin, end: span.endMin, onto: over })
        }}
        onPointerUp={(e) => {
          const d = dragRef.current
          if (!d || d.id !== i.id || d.pointer !== e.pointerId || d.dropped) return
          // Where it will stand: as drawn now (`dragShown`), under the pointer otherwise.
          const at = drag?.id === d.id && dragShown ? dragShown : { startMin: d.start, endMin: d.end }
          // D492: dropped onto another block – beside it (onto a block of its own group: nothing changes). What it does is read now,
          // for the drag as the last move left it (`dragRef`), not from the last render.
          const over = d.moved && d.onto && onParallel ? hintOf(d.id, d.onto) : null
          if (d.moved && d.onto && over && onParallel) {
            const asked = over.same ? false : onParallel(i.id, d.onto)
            // Nothing saved (its own group, or the day changed since the preview): the block goes back at once.
            if (!asked) setDrag(null)
            else {
              const held = { ...d, start: asked.startMin, end: asked.endMin, dropped: true }
              setDrag(held)
              setTimeout(() => dragRef.current === held && setDrag(null), DROP_HOLD_MS)
            }
          } else if (!d.moved || staysPut(at, d)) {
            setDrag(null)
            if (!d.moved) return
          } else {
            // The block stays where it was dropped until the day shows it there – at the end the edit asked for.
            const asked: BlockSpan | false = d.edge ? onResize!(i.id, { startMin: d.start, endMin: d.end }, d.edge, { startMin: d.from, endMin: d.fromEnd }) : (onMove!(i.id, d.start) ?? { startMin: d.start, endMin: d.end })
            if (asked === false) setDrag(null)
            else {
              const held = { ...d, start: asked.startMin, end: asked.endMin, dropped: true }
              setDrag(held)
              setTimeout(() => dragRef.current === held && setDrag(null), DROP_HOLD_MS)
            }
          }
          // The click comes right after this event, if at all: it alone is swallowed, never a later one.
          dropped.current = true
          setTimeout(() => (dropped.current = false), 0)
        }}
        className={cx(
          'absolute overflow-hidden rounded-[3px] border-l-[3px] px-1.5 text-left leading-tight transition-colors',
          selected === i.id ? 'ring-1 ring-lamp' : 'hover:brightness-110',
          i.waits && 'border-dashed',
          draggable && !dragged && 'cursor-grab',
          dropOver === i.id && 'ring-2 ring-lamp',
          dragged && 'z-20 shadow-lg',
          dragged && (drag?.edge ? 'cursor-ns-resize' : 'cursor-grabbing'),
          // D492: the tile the dragged one is dropped onto is lit.
          onto === i.id && 'ring-2 ring-lamp'
        )}
        // Dimmed by its fill and edge, never its text (A8-05).
        style={{
          top,
          height: h,
          // Its lane across the column (D476): side by side with the tiles it overlaps, 2 px apart.
          left: `calc(${(lane.lane / lane.lanes) * 100}% + ${lane.lane ? 1 : 0}px)`,
          width: `calc(${100 / lane.lanes}% - ${lane.lanes > 1 ? 2 : 0}px)`,
          background: i.dim ? blockFillDim(i.color, brightness) : blockFill(i.color, brightness),
          borderLeftColor: i.dim ? blockEdgeDim(i.color) : i.color,
          ...(waiting ? { borderBottom: `2px dashed ${i.color}` } : {}),
          // Pushed apart by the drag (D367): at its new place, dashed round – not written until the drop (its text never
          // dimmed, A8-05).
          ...(pushedTo ? { outline: `1px dashed ${i.color}`, outlineOffset: -1 } : {})
        }}
        title={i.hiddenIn ? `${i.title} · z ukrytego kalendarza ${i.hiddenIn}` : undefined}
        data-hidden-calendar={i.hiddenIn}
        data-waiting={waiting ? 'true' : undefined}
        data-pushed={pushedTo ? 'true' : undefined}
        data-dim={i.dim ? 'on' : undefined}
        data-drop={dropOver === i.id ? 'on' : undefined}
        {...(onAttachDrop && i.attach !== undefined ? tileDrop(i.id, onAttachDrop, dropOver, setDropOver) : {})}
      >
        {i.priority && <PriorityMark priority={i.priority} testId="block-priority" apart />}
        {topEdge && <span data-edge="top" data-testid={`block-${i.id}-edge-top`} className={cx('absolute inset-x-0 top-0 z-10 cursor-ns-resize hover:bg-fg/25', tiny ? 'h-[5px]' : 'h-[6px]')} />}
        {endEdge && <span data-edge="end" data-testid={`block-${i.id}-edge-end`} className={cx('absolute inset-x-0 bottom-0 z-10 cursor-ns-resize hover:bg-fg/25', tiny ? 'h-[5px]' : 'h-[6px]')} />}
        <div className={cx('flex min-w-0 items-baseline gap-1.5', tiny ? 'text-[11px]' : 'pt-0.5 text-[12px]')}>
          {!narrow && <span className="num shrink-0 text-[11px] text-muted">{logicalClock(start)}</span>}
          <span className="truncate text-fg">{i.title}</span>
          {i.badge && !narrow && <DueMark badge={i.badge} compact testId="block-due" />}
          {i.hiddenIn && (
            <span className={cx('truncate text-muted', tiny ? 'text-[10px]' : 'text-[11px]')} data-testid="hidden-calendar">
              z ukrytego kalendarza {i.hiddenIn}
            </span>
          )}
          {i.series && (
            <span className="shrink-0 text-muted" title="Z serii" aria-label="z serii" data-testid="series-mark">
              {SERIES_MARK}
            </span>
          )}
          {i.steps && (
            <span className="num shrink-0 text-[11px] text-muted" title="Kroki" data-testid="steps-counter">
              {i.steps}
            </span>
          )}
          {i.attach ? (
            <span className="num shrink-0 text-[11px] text-muted" title={attachBadgeTitle(i.attach)} aria-label={attachBadgeTitle(i.attach)} data-testid="attach-badge">
              {attachBadge(i.attach)}
            </span>
          ) : null}
        </div>
        {!tiny && !narrow && (
          <div className="truncate text-[11px] text-muted">
            {logicalClock(start)}–{logicalClock(end)}
            {i.kind ? ` · ${i.kind}` : ''}
            {i.marks.length ? ` · ${i.marks.join(' · ')}` : ''}
          </div>
        )}
      </button>
    )
  }

  const energyPath = (pool: Pool) => poolPath(energy, pool, (v) => (v / 100) * 40, y)

  return (
    <div className="flex select-none" data-testid={rest['data-testid'] ?? 'timeline'}>
      {/* Hours. */}
      <div className="relative w-[46px] shrink-0" style={{ height }} data-testid="timeline-hours" {...gridBind}>
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
        {...gridBind}
        data-testid="timeline-axis"
        // The scale a drop from outside reads (`axisDrop.ts`): the minute at the top and at the bottom, pixels a minute.
        data-lo={lo}
        data-hi={hi}
        data-ppm={PPM}
      >
        {hours.map((h) => (
          <div key={h} className="pointer-events-none absolute right-0 left-0 border-t border-line/60" style={{ top: y(h) }} />
        ))}
        <div className="absolute inset-y-0 right-1.5 left-1.5">
          {items.map((i) => box(i))}
          {draft && (
            <div
              className="absolute right-0 left-0 z-10 cursor-default overflow-hidden rounded-[3px] border border-dashed px-1.5 text-left leading-tight"
              style={{ top: y(draft.startMin), height: Math.max(MIN_H, (draft.endMin - draft.startMin) * PPM - 1), background: blockFill(draft.color, brightness), borderColor: draft.color }}
              onClick={(e) => e.stopPropagation()}
              {...NO_GRID}
              data-draft-tile="true"
              data-testid="draft-tile"
              data-start={draft.startMin}
              data-end={draft.endMin}
            >
              <div className="flex min-w-0 items-baseline gap-1.5 pt-0.5 text-[12px]">
                <span className="truncate text-fg">{draft.title}</span>
              </div>
              <div className="num truncate text-[11px] text-muted" data-testid="draft-tile-hours">
                {logicalClock(draft.startMin)}–{logicalClock(draft.endMin)}
                {draft.kind ? ` · ${draft.kind}` : ''}
              </div>
            </div>
          )}
        </div>
        {attached && (
          <div className="absolute right-3 z-30" style={{ top: y(attached.endMin) }} onClick={(e) => e.stopPropagation()} {...NO_GRID}>
            {attached.node}
          </div>
        )}
        {/* D366: the range of a new block being dragged over an empty place. */}
        {grid.range && <RangeBand range={grid.range} lo={lo} ppm={PPM} withLength testId="create-range" />}
        {/* D384: where a sprawa dragged from the panel beside the axis would stand. */}
        {ghost && <RangeBand range={ghost} lo={lo} ppm={PPM} withLength testId="case-ghost" />}
        {/* D492: what the drop onto another block does – „Równolegle z …”, or the note of a full group. */}
        {hint && dragShown && !drag?.dropped && (
          <div
            className="num pointer-events-none absolute right-3 z-30 -translate-y-full rounded-sm border border-line bg-bg/90 px-1.5 py-0.5 text-[11px] text-fg"
            style={{ top: y(dragShown.startMin) }}
            data-testid="parallel-hint"
          >
            {hint.text}
          </div>
        )}
        {/* D365: the hours of an edge being dragged, and what the end costs. */}
        {drag?.moved && !drag.dropped && drag.edge && (
          <div
            className={cx('num pointer-events-none absolute right-3 z-30 rounded-sm border border-line bg-bg/90 px-1.5 py-0.5 text-[11px] text-fg', drag.edge === 'top' && '-translate-y-full')}
            style={{ top: y(drag.edge === 'top' ? dragShown!.startMin : dragShown!.endMin) }}
            data-testid="edge-hint"
          >
            {logicalClock(dragShown!.startMin)}–{logicalClock(dragShown!.endMin)} ·{' '}
            {staysPut(dragShown!, drag)
              ? 'bez zmian'
              : (resizeNote?.(drag.id, { startMin: drag.start, endMin: drag.end }, drag.edge, { startMin: drag.from, endMin: drag.fromEnd }) ?? durationLabel(dragShown!.endMin - dragShown!.startMin))}
          </div>
        )}
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
