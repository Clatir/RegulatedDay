/**
 * The plan of a day as a vertical axis of time (D293): a block's height follows its length, gaps without a block are
 * seen, blocks that overlap – parallel ones (D476), in the background, collisions – stand side by side, the energy forecast runs beside the
 * axis, and the lines of the wake, the boundary, the maximum, the hard end, the bedtime and now cross it. A click on a
 * block selects it (its editing panel opens on the right), a click on a gap creates a block there; a movable block is
 * dragged with the left button to a new start, in steps of 5 min (D305), and by its edges to a new length (D365): the
 * bottom edge moves its end, the top one its start with the same end. A drag over a gap creates a block with that start
 * and end (D366); the column of hours counts as the axis for both. While a block is dragged, the blocks it pushes apart
 * stand at their new places (D367, `pushPreview`); dropped onto the right part of another block, it stands beside it (D492,
 * `parallelPreview` – „Równolegle z …”). Ctrl held when it is let go (D513, `onCopy`): the block stays, its copy stands there – the
 * cursor has „+” and a dashed tile shows the copy while Ctrl is held. A block of a selection of two and more (D531, `groupDrag`) drags the
 * whole group: every selected block moves by the same difference, each drawn at its new place dashed round while it is held, Esc ends it with
 * nothing changed; with Ctrl – the group's copy.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { durationLabel, logicalClock } from '@shared/format'
import type { EnergyTrack } from '@shared/engine/energyTrack'
import type { DragPreview } from '@shared/engine/groupDrag'
import type { TileCost as TileCostInfo } from '@shared/model/blockCosts'
import type { Costs } from '@shared/model/categories'
import { DRAG_STEP_MIN, MAX_BLOCK_MIN, MIN_BLOCK_MIN } from '@shared/model/plan'
import type { DueBadge } from '@shared/engine/caseDates'
import type { Priority } from '@shared/model/requests'
import { SERIES_MARK } from '@shared/seriesText'
import { blockEdgeDim, blockFill, blockFillDim } from '@shared/theme'
import { menuBind } from '../../components/ContextMenu'
import { cx } from '../../components/ui'
import { attachable, hasFiles, textTarget } from '../attachments/attachDrop'
import { attachBadge, attachBadgeTitle } from '../attachments/attachView'
import type { SaveAnswer } from '../../store/data'
import { useMachine } from '../../store/machine'
import { DueMark } from '../cases/DueMark'
import { PriorityMark } from '../cases/PriorityMark'
import { EnergyLanes } from './EnergyLanes'
import { hasEnergy } from './energyDraw'
import { DEFAULT_NEW_BLOCK_MIN, DRAG_FROM_PX } from './gridCreate'
import { NO_GRID, RangeBand, useGridCreate } from './gridDrag'
import { inParallelZone, tileAt, tileLanes } from './parallelDrag'
import type { CostAsk } from './costSave'
import { costRoom, TileCost } from './TileCost'
import { COPY_SPAN_ID } from '../today/dayPush'

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
  /** Done (D477): ended and not left unfinished – ✓ before its name, no strike-through (its tile dimmed as every ended one). */
  finished?: boolean
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
  /**
   * The cost per hour on the tile's bottom right (D501, D524: four numbers in the colours of the pools); absent – none (a template's, the wizard's axis).
   * `edit` – a click on it opens the window that changes it (`Timeline.onCosts`).
   */
  cost?: TileCostInfo
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
  /** The line „teraz” (D500: the four numbers of the energy stand at it). */
  now?: true
}

/** The energy's curve beside the axis (the one sampling: `@shared/engine/energyTrack`). */
export type { EnergyTrack }

const TONE: Record<TimelineMarker['tone'], string> = { lamp: '#F2B66D', rose: '#D49A97', sea: '#79AFAB', muted: '#B8AAB0', fg: '#EEE3D6' }
/** Pixels per minute of the axis. */
export const PPM = 1.1
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

/**
 * Where the dragged block is drawn – or its copy (D513: under `COPY_SPAN_ID`, never the block's own key): beside the block it is
 * dropped onto (D492), where the preview puts it (D372), else under the pointer.
 */
export const shownSpan = (d: { id: string; copy: boolean; start: number; end: number }, hint: ParallelHint | null, pushed: ReadonlyMap<string, BlockSpan> | null): BlockSpan =>
  hint && !hint.same ? hint.span : (pushed?.get(d.copy ? COPY_SPAN_ID : d.id) ?? { startMin: d.start, endMin: d.end })

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
  /** Ctrl is held (D513): dropped so, the block stays and its copy goes to the hour (never beside another block). */
  copy: boolean
  /** A block of a selection of two and more dragged by its body (D531): the whole group goes (never beside another block). */
  group: boolean
}

/**
 * D531: the drag of a block of the selection of many (two and more) is the group's. `has` – the block is in such a selection; `preview` – where
 * the group (`moved`, the grabbed one too), the blocks it pushes apart (`pushed`) and the copies (`copies`, Ctrl) would stand with every selected
 * block `minutes` later (earlier) – the grabbed one's drop less where its tile stood – null: nothing moves; `drop` – let go there.
 */
export interface TimelineGroupDrag {
  has: (id: string) => boolean
  preview: (id: string, minutes: number, copy: boolean) => DragPreview | null
  drop: (id: string, minutes: number, copy: boolean) => void
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
  marked,
  onContext,
  onCreate,
  clickCreates = true,
  onMove,
  onResize,
  resizeNote,
  edgeLimits,
  pushPreview,
  parallelPreview,
  onParallel,
  onCopy,
  groupDrag,
  attached,
  onAttachDrop,
  onCosts,
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
  /** A click on a block; `mods` – Ctrl and Shift held (D527: they select without opening, the screen decides what a plain click does). */
  onSelect: (id: string, mods: { ctrl: boolean; shift: boolean }) => void
  /**
   * The blocks of the selection of many (D527) – each is ringed. Left out: the ring is the open block's alone (`selected`), as before. The right
   * button or Shift+F10 on a block asks the screen for its menu (`onContext`, D528) – nothing on an empty place of the axis.
   */
  marked?: (id: string) => boolean
  onContext?: (id: string, at: { x: number; y: number }) => void
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
  pushPreview?: (id: string, span: BlockSpan, edge: DragEdge | null, shown: BlockSpan, copy: boolean) => ReadonlyMap<string, BlockSpan> | null
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
   * D513: a movable block dragged by its body and let go with Ctrl held – its copy at that start (logical minute); the block stays.
   * While Ctrl is held the preview (`pushPreview` with `copy`) is what the copy pushes apart and, under `COPY_SPAN_ID`, where the copy
   * will stand (none – under the pointer); the block itself is never drawn pushed (a copy never changes it). Left out – Ctrl changes nothing.
   */
  onCopy?: (id: string, startMin: number) => void
  /** D531: the drag of a selected block of a selection of two and more moves (with Ctrl – copies) the group; left out – every drag is one block's. */
  groupDrag?: TimelineGroupDrag
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
  /** The block's own cost set in the window of its tile (D501), or null – the category's again; left out – the cost is only told. */
  onCosts?: (id: string, costs: Costs | null, ask: CostAsk) => void | Promise<SaveAnswer>
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
  // D531 (T1764): the click after a group's drag ended by Esc is no click either – to it, or to the next press (whatever comes first).
  const escaped = useRef<(() => void) | null>(null)
  useEffect(() => () => escaped.current?.(), [])
  const muteAfterEscape = () => {
    escaped.current?.()
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = () => {
      window.removeEventListener('pointerdown', off, true)
      window.removeEventListener('pointerup', release, true)
      window.removeEventListener('lostpointercapture', release, true)
      if (timer) clearTimeout(timer)
      escaped.current = null
    }
    // T1777: the click of this press comes right after its release – the mute ends after it, also when the release is outside the window (no
    // click comes) or the capture is lost; the next press ends it too.
    const release = () => {
      timer ??= setTimeout(off, 0)
    }
    window.addEventListener('pointerdown', off, true)
    window.addEventListener('pointerup', release, true)
    window.addEventListener('lostpointercapture', release, true)
    escaped.current = off
  }
  // Where the last press on a tile went down (a click that is far from it ends a drag – D527).
  const pressed = useRef<{ x: number; y: number } | null>(null)
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
    // D513: Ctrl pressed or let go while the body is held (no move of the pointer) – the copy is shown or goes.
    const key = (e: KeyboardEvent) => {
      const d = dragRef.current
      if (e.key !== 'Control' || !d || d.dropped) return
      const copy = copyOn(d, e)
      if (copy !== d.copy) setDrag({ ...d, copy, onto: copy ? null : d.onto })
    }
    // D531 (T1764): Esc while a group is held – moved or not yet past the 4 px – ends its gesture with nothing changed; it is the drag's alone
    // (heard first, in the capture phase): it never clears the selection under it, and the click after it is muted.
    const escape = (e: KeyboardEvent) => {
      const d = dragRef.current
      if (e.key !== 'Escape' || !d || d.dropped || !d.group) return
      e.preventDefault()
      e.stopPropagation()
      setDrag(null)
      muteAfterEscape()
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', key)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('keydown', key)
      window.removeEventListener('keyup', key)
      window.removeEventListener('keydown', escape, true)
    }
  }, [holding])
  // The range of the axis (and so the place a click or a drag creates a block in) is that of ALL the day's blocks, the hidden ones too
  // (D427): hiding a calendar never moves the hours.
  const span = [...(extent ?? items), ...(draft ? [draft] : [])]
  const lo = Math.floor(Math.min(from, ...span.map((i) => i.startMin), ...markers.map((m) => m.at)) / 60) * 60
  const hi = Math.ceil(Math.max(to, ...span.map((i) => i.endMin), ...markers.map((m) => m.at)) / 60) * 60
  // The line „teraz” of the axis: the lanes stand its numbers on it and draw it in its colour (D500).
  const nowMarker = markers.find((m) => m.now)
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
  const pushKey = drag?.moved && pushPreview && !drag.onto && !drag.group ? `${drag.id}|${drag.edge ?? ''}|${drag.start}|${drag.end}|${drag.from}|${drag.fromEnd}|${drag.copy}` : null
  const pushedByMove = useMemo(
    () => (pushKey && drag ? (previewOf.current?.(drag.id, { startMin: drag.start, endMin: drag.end }, drag.edge, { startMin: drag.from, endMin: drag.fromEnd }, drag.copy) ?? null) : null),
    // The drag's place is in the key; a new count of the day brings new items.
    [pushKey, items]
  )
  // D531: a group – every selected block at its new place and what they push apart, counted once for each place of the drag; once let go it
  // stays as it was (the day counted again after the save would move it a second time) until the day shows the drop.
  const groupOf = useRef(groupDrag)
  groupOf.current = groupDrag
  const groupLast = useRef<{ key: string; preview: DragPreview | null } | null>(null)
  const groupKeyOf = (d: Pick<Drag, 'id' | 'start' | 'from'>, copy: boolean) => `${d.id}|${d.start - d.from}|${copy}`
  /** The preview of the group at the drag's place `d` (counted once for each place – the last one kept). */
  const groupPreviewAt = (d: Pick<Drag, 'id' | 'start' | 'from'>, copy: boolean): DragPreview | null => {
    const key = groupKeyOf(d, copy)
    if (groupLast.current?.key !== key) groupLast.current = { key, preview: groupOf.current?.preview(d.id, d.start - d.from, copy) ?? null }
    return groupLast.current.preview
  }
  const groupKey = drag?.moved && drag.group ? groupKeyOf(drag, drag.copy) : null
  const groupShown = useMemo(
    () => {
      if (!groupKey || !drag) return (groupLast.current = null)
      if (drag.dropped) return groupLast.current?.preview ?? null
      return groupPreviewAt(drag, drag.copy)
    },
    // The drag's place is in the key; a new count of the day brings new items – not once it is let go.
    [groupKey, drag?.dropped ? null : items]
  )
  const groupPushed = useMemo(() => (groupShown ? new Map([...groupShown.pushed, ...groupShown.moved]) : null), [groupShown])
  const pushed = onto ? (hint?.pushed ?? null) : drag?.group ? groupPushed : pushedByMove
  // Where the dragged block is drawn: under the pointer, where it will stand (`pushPreview` with its own id), or beside the
  // block it is dropped onto (D492).
  const dragShown: BlockSpan | null = drag ? shownSpan(drag, hint, pushed) : null

  // D513: a copy being dragged – the block stays at its place among the others (a copy never changes it: never drawn pushed), a
  // dashed tile of the copy goes with the pointer (D531: of every copy of the group, where it will stand).
  const copying = drag != null && drag.moved && drag.copy
  const groupCopies = copying && drag.group ? (groupShown?.copies ?? null) : null
  /** Where a tile is drawn now: dragged, pushed apart by the drag, waiting for a confirmation of its end, or at its place. */
  const spanOf = (i: TimelineItem) => {
    const dragged = drag?.id === i.id && drag.moved && !drag.copy
    const pushedTo = dragged || (copying && drag.id === i.id) ? undefined : pushed?.get(i.id)
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
      .filter((i) => !(drag?.moved && !drag.copy && drag.id === i.id))
      .map((i) => {
        const s = spanOf(i)
        return { id: i.id, startMin: s.start, endMin: s.end }
      }),
    MIN_H / PPM
  )
  const draggedLane = (id: string) => (onto && drag?.id === id ? { lane: 1, lanes: 2 } : drag?.moved && !drag.copy && drag.id === id ? { lane: 0, lanes: 1 } : null)

  /** The tile under the pointer at (`x`, `y`) whose right part takes the dragged block `id` (D492), or null. */
  const ontoAt = (id: string, x: number, py: number): string | null => {
    const tile = parallelPreview ? tileAt(x, py, id) : null
    return tile && inParallelZone(x, py, tile.rect) && hintOf(id, tile.id) ? tile.id : null
  }

  /** D513: the drag `d` makes a copy – Ctrl held (`e`: the last event of the pointer or of the key), the body dragged, a copy taken here. */
  const copyOn = (d: Drag, e: { ctrlKey: boolean }): boolean => (!!onCopy || d.group) && d.edge == null && e.ctrlKey
  /** D513: the copy where it would stand while it is held – a dashed tile with its name and hours (the block stays at its place). */
  const copyGhost = (i: TimelineItem | undefined, at: BlockSpan) =>
    i && (
      <div
        key={`copy-${i.id}`}
        data-of={i.id}
        className="pointer-events-none absolute right-0 left-0 z-20 overflow-hidden rounded-[3px] border border-dashed px-1.5 text-left leading-tight shadow-lg"
        style={{ top: y(at.startMin), height: Math.max(MIN_H, (at.endMin - at.startMin) * PPM - 1), background: blockFill(i.color, brightness), borderColor: i.color }}
        data-testid="copy-ghost"
        data-start={at.startMin}
        data-end={at.endMin}
      >
        <div className="flex min-w-0 items-baseline gap-1.5 pt-0.5 text-[12px]">
          <span className="shrink-0 text-muted" aria-hidden="true">
            +
          </span>
          <span className="truncate text-fg">{i.title}</span>
        </div>
        <div className="num truncate text-[11px] text-muted">
          {logicalClock(at.startMin)}–{logicalClock(at.endMin)}
        </div>
      </div>
    )

  const box = (i: TimelineItem) => {
    const { dragged, pushedTo, waiting, start, end } = spanOf(i)
    const lane = draggedLane(i.id) ?? lanes.get(i.id) ?? { lane: 0, lanes: 1 }
    // Three tiles side by side and more: no hours on them (narrow), as the old column of the background had it.
    const narrow = lane.lanes >= 3
    const top = y(start)
    const h = Math.max(MIN_H, (end - start) * PPM - 1)
    const tiny = h < 34
    const draggable = !!onMove && i.movable === true
    // D527: the ring of the selection of many – or, without one, of the open block.
    const ringed = marked ? marked(i.id) : selected === i.id
    // D365: a movable block has both edges; one that only runs on – the bottom one.
    const topEdge = !!onResize && i.movable === true
    const endEdge = !!onResize && (i.movable === true || i.resize === 'end')
    // D501: the cost stands in the tile's bottom right corner; a low tile has it at the end of the name's row, a low one beside another (or a
    // narrow one) shows it only while the pointer is over the tile.
    const costAt = !i.cost ? null : !tiny && !narrow ? 'corner' : tiny && lane.lanes === 1 ? 'row' : 'hover'
    const costLabel = (className: string) =>
      i.cost && costAt && (
        <TileCost cost={i.cost} id={`tile:${i.id}`} testId={`block-${i.id}-cost`} className={className} place={costAt} onChange={onCosts ? (costs, ask) => onCosts(i.id, costs, ask) : undefined} />
      )
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
        data-marked={marked?.(i.id) ? 'true' : undefined}
        // D462: Del on the focused tile removes the block (the screen says what – `useDeleteResolver('block')`).
        data-del={`block:${i.id}`}
        onClick={(e) => {
          e.stopPropagation()
          if (dropped.current) {
            dropped.current = false
            return
          }
          // A click of the keyboard (no pointer) is never muted.
          if (escaped.current && e.detail > 0) {
            escaped.current()
            return
          }
          // D527: a press that moved this far is a drag, not a click – also on a tile that cannot be dragged (it has no drag to say so); a click of the
          // keyboard (no pointer) is always one.
          const from = pressed.current
          pressed.current = null
          if (from && e.detail > 0 && Math.hypot(e.clientX - from.x, e.clientY - from.y) >= DRAG_FROM_PX) return
          onSelect(i.id, { ctrl: e.ctrlKey, shift: e.shiftKey })
        }}
        // D528: the right button and the menu key open the menu of the selection (the screen puts this block into it first).
        {...(onContext ? menuBind((at) => onContext(i.id, at)) : {})}
        // D305: the left button drags a movable block from where it is shown; its start goes on the 5-min grid. D365: from
        // an edge's handle the edge goes (never both at once), a block with no handle under the pointer is moved as before.
        onPointerDown={(e) => {
          if (e.button !== 0) return
          pressed.current = { x: e.clientX, y: e.clientY }
          const at = (e.target as HTMLElement).dataset.edge
          const edge: DragEdge | null = at === 'top' && topEdge ? 'top' : at === 'end' && endEdge ? 'end' : null
          if (edge == null && !draggable) return
          dropped.current = false
          e.currentTarget.setPointerCapture(e.pointerId)
          const limits = (edge === 'end' && i.resize === 'end' ? edgeLimits?.(i.id) : null) ?? {}
          const group = edge == null && !!groupDrag?.has(i.id)
          setDrag({ id: i.id, pointer: e.pointerId, y0: e.clientY, edge, from: i.startMin, fromEnd: i.endMin, start: i.startMin, end: i.endMin, limits, exact: edge === 'end' && i.movable !== true, moved: false, dropped: false, onto: null, copy: (!!onCopy || group) && edge == null && e.ctrlKey, group })
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
          // D492: the body over the right part of another tile – a drop onto it; with Ctrl held (D513) – a copy to the hour, never beside.
          const copy = copyOn(d, e)
          const over = d.edge == null && !copy && !d.group ? ontoAt(d.id, e.clientX, e.clientY) : null
          if (!d.moved || span.startMin !== d.start || span.endMin !== d.end || over !== d.onto || copy !== d.copy) setDrag({ ...d, moved: true, start: span.startMin, end: span.endMin, onto: over, copy })
        }}
        onPointerUp={(e) => {
          const d = dragRef.current
          if (!d || d.id !== i.id || d.pointer !== e.pointerId || d.dropped) return
          // D531: a group let go – every selected block by the difference (with Ctrl – copied); the group stays drawn where it goes until the
          // day shows the grabbed one moved (or the hold runs out). The same place – nothing.
          if (d.group) {
            const minutes = d.start - d.from
            const copy = copyOn(d, e)
            if (!d.moved || minutes === 0) setDrag(null)
            else {
              // T1776: the preview of the very place it is let go at (a release in the frame of the last move has no render of it yet) – what it holds.
              const shown = groupPreviewAt(d, copy)
              groupDrag?.drop(i.id, minutes, copy)
              // The grabbed block stays where it is (its rule leaves it, T1767), or a copy: nothing to hold – back at once.
              if (copy || !shown?.moved.has(d.id)) setDrag(null)
              else {
                const held = { ...d, copy, dropped: true }
                setDrag(held)
                setTimeout(() => dragRef.current === held && setDrag(null), DROP_HOLD_MS)
              }
            }
            if (!d.moved) return
            dropped.current = true
            setTimeout(() => (dropped.current = false), 0)
            return
          }
          // Where it will stand: as drawn now (`dragShown`), under the pointer otherwise.
          const at = drag?.id === d.id && dragShown ? dragShown : { startMin: d.start, endMin: d.end }
          // D513: let go with Ctrl held – a copy at that hour (the block stays: nothing to hold); at its own place – nothing.
          if (d.moved && copyOn(d, e)) {
            setDrag(null)
            if (!staysPut(at, d)) onCopy!(i.id, d.start)
            dropped.current = true
            setTimeout(() => (dropped.current = false), 0)
            return
          }
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
          'group absolute overflow-hidden rounded-[3px] border-l-[3px] px-1.5 text-left leading-tight transition-colors',
          ringed ? 'ring-1 ring-lamp' : 'hover:brightness-110',
          i.waits && 'border-dashed',
          draggable && !dragged && 'cursor-grab',
          dropOver === i.id && 'ring-2 ring-lamp',
          dragged && 'z-20 shadow-lg',
          dragged && (drag?.edge ? 'cursor-ns-resize' : 'cursor-grabbing'),
          copying && drag.id === i.id && 'cursor-copy',
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
        // D531: a block of the group dragged with the grabbed one, at its new place.
        data-group-moved={drag?.group && !drag.copy && drag.id !== i.id && groupShown?.moved.has(i.id) ? 'true' : undefined}
        data-dim={i.dim ? 'on' : undefined}
        data-drop={dropOver === i.id ? 'on' : undefined}
        {...(onAttachDrop && i.attach !== undefined ? tileDrop(i.id, onAttachDrop, dropOver, setDropOver) : {})}
      >
        {i.priority && <PriorityMark priority={i.priority} testId="block-priority" apart />}
        {/* The edges over everything in the tile (z-30 – the cost's label in the corner or shown on hover is z-20): the whole width resizes (D365, D501). */}
        {topEdge && <span data-edge="top" data-testid={`block-${i.id}-edge-top`} className={cx('absolute inset-x-0 top-0 z-30 cursor-ns-resize hover:bg-fg/25', tiny ? 'h-[5px]' : 'h-[6px]')} />}
        {endEdge && <span data-edge="end" data-testid={`block-${i.id}-edge-end`} className={cx('absolute inset-x-0 bottom-0 z-30 cursor-ns-resize hover:bg-fg/25', tiny ? 'h-[5px]' : 'h-[6px]')} />}
        <div className={cx('flex min-w-0 items-baseline gap-1.5', tiny ? 'text-[11px]' : 'pt-0.5 text-[12px]')}>
          {!narrow && <span className="num shrink-0 text-[11px] text-muted">{logicalClock(start)}</span>}
          <span className="truncate text-fg">
            {i.finished && (
              <span className="text-muted" aria-label="ukończony" data-testid="block-finished">
                ✓{' '}
              </span>
            )}
            {i.title}
          </span>
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
          {costAt === 'row' && costLabel('ml-auto shrink-0')}
        </div>
        {!tiny && !narrow && (
          <div className={cx('truncate text-[11px] text-muted', costAt === 'corner' && costRoom(false))}>
            {logicalClock(start)}–{logicalClock(end)}
            {i.kind ? ` · ${i.kind}` : ''}
            {i.marks.length ? ` · ${i.marks.join(' · ')}` : ''}
          </div>
        )}
        {costAt === 'corner' && costLabel('absolute right-1 bottom-px z-20')}
        {costAt === 'hover' && costLabel('absolute top-px right-1 z-20 hidden group-hover:inline-block')}
      </button>
    )
  }

  return (
    <div className={cx('flex select-none', copying && '[&_*]:cursor-copy!')} data-testid={rest['data-testid'] ?? 'timeline'} data-axis="true" data-copying={copying ? 'true' : undefined}>
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
          {copying && !drag.group && dragShown && copyGhost(items.find((x) => x.id === drag.id), dragShown)}
          {groupCopies && [...groupCopies].map(([of, at]) => copyGhost(items.find((x) => x.id === of), at))}
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
      {/* D500: the energy beside the axis – four lanes G · E · B · C (`EnergyLanes`). */}
      {hasEnergy(energy) && <EnergyLanes track={energy} lo={lo} ppm={PPM} height={height} nowAt={nowMarker?.at ?? null} nowColor={TONE[nowMarker?.tone ?? 'fg']} />}
    </div>
  )
}
