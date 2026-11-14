/**
 * The columns of days on one axis of hours (D356; „Tydzień” – seven of them, „3 dni” – three, D417, in a larger scale): above
 * each its type, the boundary (kept, not kept, in progress, free, no data) and the regeneration against the minimum; the
 * blocks as planned, on days gone by as it was, with the energy's curve behind them (D417, D422). A click on the heading of a
 * day or on a block opens its plan, as in the calendar (D295); a click on an empty place of a column (or a drag over it) opens
 * the small window of a new block there (D366). A block that may be moved (`HorizonBlock.movable`) is dragged to another hour
 * or another day (D305, D417, D422): the place it would take is shown while it is held, the drop is `moveWeekBlock`.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import { logicalClock } from '@shared/format'
import { attachmentsOfBlock, type BlockPlace } from '@shared/model/attachment'
import { settingsOn, DAY_TYPE_NAMES, type DayTypeId } from '@shared/model/settings'
import { stepsCounter } from '@shared/model/steps'
import { SERIES_MARK } from '@shared/seriesText'
import { blockEdgeDim, blockFill, blockFillDim } from '@shared/theme'
import { weekday } from '@shared/time/zone'
import { cx } from '../../components/ui'
import { useData } from '../../store/data'
import { useMachine } from '../../store/machine'
import { openDay, setBlockDraft, toast } from '../../store/ui'
import { showWeekPush } from '../../store/weekPush'
import { DAY_TYPE_COLORS } from '../calendar/dayTypes'
import { blockColor, blockKind, blockName, type Names } from '../plan/blockView'
import { DEFAULT_NEW_BLOCK_MIN, dragStarted, snapMinute, type GridRange } from '../plan/gridCreate'
import { NO_GRID, RangeBand, useGridCreate } from '../plan/gridDrag'
import { AllDayBar } from '../allday/AllDayBar'
import { attachBadge, attachBadgeTitle, dayPlace } from '../attachments/attachView'
import { EnergyBackdrop } from './EnergyBackdrop'
import { NewBlockPopover } from './NewBlockPopover'
import { axisHeight, axisRange, axisY, blockSpan, columnAt, dayIndexes, hourMarks, laneLayout, NEW_BLOCK_WIDTH, popoverPlace, sameDrag, WEEK_PPM } from './weekLayout'
import { moveWeekBlock } from './weekMove'
import { blockDashed, blockRinged, blockStateText, boundaryLine, columnLabel, dayHeading, regenLine, WEEKDAY_FULL, type Tone } from './weekText'
import { DENIED_TEXT, dropOn, dropStart, dropStays, sameDrop, type BlockDrop } from './weekViews'

const AXIS_PX = 48
const TONE_CLASS: Record<Tone, string> = { ok: 'text-sea', bad: 'text-rose', muted: 'text-muted', plain: 'text-fg' }

/** The drop of a block into a day gone by changes nothing (D417) – said when the save is refused after all (the day turned over). */
export const PAST_DROP_TEXT = 'Dni minionych nie zmieniasz przeciąganiem.'

/**
 * The new block asked for on the grid (D366, D371): the days in a row it is for (one, or those a drag crossed), its span, and
 * where its small window stands (pixels from the grid's corner); `seq` – which ask it is (a new ask is a new window).
 */
interface NewPick {
  seq: number
  dates: string[]
  startMin: number
  durationMin: number
  /** Dragged out (a range, also across days) – intended: saved by a click outside even untouched (D461); a bare click is not. */
  dragged: boolean
  place: { left: number; top: number }
}

/** A drag over the columns in progress (D371): the column it began in, the one under the pointer now, its span of hours. */
interface Held {
  from: number
  to: number
  range: GridRange
}

/** A block lifted by the pointer (D417): where it was, how it was grasped, and the last place it would take. */
interface Lift {
  id: string
  date: string
  name: string
  durationMin: number
  startMin: number
  /** The column it came from. */
  col: number
  pointer: number
  x0: number
  y0: number
  /** Pixels from the top of the block where it was grasped – the block follows the hand, not the pointer's point. */
  grabPx: number
  moved: boolean
  last: BlockDrop | null
}

/** What a block needs to be dragged (`BlockBox`): the press, whether a drag has just ended on it (its click is not a click), whether it is the one held. */
export interface BlockGrab {
  down: (e: PointerEvent<HTMLElement>) => void
  consumed: () => boolean
  dragging: boolean
}

export function DayGrid({
  days,
  from,
  to,
  ppm = WEEK_PPM,
  mode = 'week',
  openCard,
  onCardOpened
}: {
  days: HorizonDay[]
  from: number
  to: number
  /** Pixels a minute (`WEEK_PPM`; „3 dni” – larger). */
  ppm?: number
  mode?: 'week' | '3days'
  openCard: string | null
  onCardOpened: () => void
}) {
  const { rd, routines, requests } = useData()
  const today = useData((s) => s.view?.today ?? '')
  const bodyRef = useRef<HTMLDivElement>(null)
  const asks = useRef(0)
  const [pick, setPick] = useState<NewPick | null>(null)
  const [held, setHeld] = useState<Held | null>(null)
  const brightness = useMachine((s) => s.prefs.brightness)
  const { lo, hi } = axisRange(from, to)
  const height = axisHeight(lo, hi, ppm)
  const marks = hourMarks(lo, hi)
  const namesOf = useMemo(() => (date: string): Names => ({ rd, settings: settingsOn(rd.settings, date), routines, requests }), [rd, routines, requests])
  const cols = { gridTemplateColumns: `${AXIS_PX}px repeat(${days.length}, minmax(0, 1fr))` }
  const dates = useMemo(() => days.map((d) => d.date), [days])
  /** The rectangle a column has on the screen; null when it is not there. */
  const columnRect = (i: number): DOMRect | null => bodyRef.current?.querySelector(`[data-testid="week-col-${days[i]?.date}"]`)?.getBoundingClientRect() ?? null
  // The columns do not move while a drag goes on: their rectangles are read once, when the pointer first asks – with the
  // column's distance from the top of the grid's body (`off`), so that a page scrolled meanwhile is followed by one read of the body.
  type ColumnBox = { left: number; right: number; off: number }
  const rects = useRef<ColumnBox[] | null>(null)
  const readRects = (): ColumnBox[] => {
    const out: ColumnBox[] = []
    const body = bodyRef.current?.getBoundingClientRect()
    if (!body) return []
    for (let i = 0; i < days.length; i++) {
      const r = columnRect(i)
      if (!r) return []
      out.push({ left: r.left, right: r.right, off: r.top - body.top })
    }
    return out
  }
  /** The column under `x` (the pointer of a drag may be in another one than where it began); `fallback` where the grid cannot be read. */
  const columnUnder = (x: number, fallback: number): number => columnAt(x, (rects.current ??= readRects()), fallback)
  /** A click (an hour long) or a drag over an empty place of the columns `first`–`last` asks for a new block there. */
  const pickOn = (first: number, last: number, r: GridRange, dragged = true) => {
    const body = bodyRef.current?.getBoundingClientRect()
    if (!body) return
    const idx = dayIndexes(first, last)
    const side = columnRect
    const a = side(idx[0]!)
    const b = side(idx.at(-1)!)
    if (!a || !b) return
    const place = popoverPlace({ gridWidth: body.width, colLeft: a.left - body.left, colRight: b.right - body.left, top: a.top - body.top + axisY(r.startMin, lo, ppm), width: NEW_BLOCK_WIDTH })
    setPick({ seq: ++asks.current, dates: idx.map((i) => days[i]!.date), startMin: r.startMin, durationMin: r.endMin - r.startMin, dragged, place })
  }
  const spanHeld = held ? dayIndexes(held.from, held.to) : []

  // A block dragged (D417): its listeners are the window's (the pointer leaves the block at once), they read what the page has now.
  const latest = useRef({ days, lo, hi, ppm, today })
  latest.current = { days, lo, hi, ppm, today }
  const lift = useRef<Lift | null>(null)
  const unlisten = useRef<(() => void) | null>(null)
  const busy = useRef(false)
  const muted = useRef(false)
  const [flight, setFlight] = useState<string | null>(null)
  /** The block held, where it would land and how long it is (the band of its drop – kept from the lift, the view may change meanwhile). */
  const [drop, setDrop] = useState<{ blockId: string; at: BlockDrop; durationMin: number } | null>(null)
  const unmute = useRef<(() => void) | null>(null)
  useEffect(
    () => () => {
      unlisten.current?.()
      unmute.current?.()
    },
    []
  )
  const stop = () => {
    unlisten.current?.()
    unlisten.current = null
    lift.current = null
    setFlight(null)
  }
  /**
   * The click that follows a drag is no click on the block (it would open the day) – whenever the button is let go: the mute
   * lasts to the next click (the window hears it after the block) or the next press, not for one turn of the loop (Esc comes first).
   */
  const muteClick = () => {
    unmute.current?.()
    muted.current = true
    const off = () => {
      muted.current = false
      window.removeEventListener('click', off)
      window.removeEventListener('pointerdown', off, true)
      unmute.current = null
    }
    window.addEventListener('click', off)
    window.addEventListener('pointerdown', off, true)
    unmute.current = off
  }
  /** The block put down on `at`: the move, and the line with „Cofnij” it leaves (a refusal has said why by its toast). */
  const land = async (h: Lift, at: BlockDrop) => {
    busy.current = true
    try {
      const res = await moveWeekBlock({ blockId: h.id, name: h.name, names: namesOf(h.date), from: h.date, to: latest.current.days[at.index]!.date, startMin: at.startMin })
      if (res.push) showWeekPush(res.push)
      if (res.status === 'refused') toast(PAST_DROP_TEXT, 'info')
    } catch (e) {
      toast(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
    } finally {
      busy.current = false
      setDrop(null)
    }
  }
  const grab = (b: HorizonBlock, date: string, col: number) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !b.movable || busy.current || lift.current) return
    const h: Lift = { id: b.id, date, name: blockName(b.named, namesOf(date)), durationMin: b.endMin - b.startMin, startMin: b.startMin, col, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, grabPx: e.clientY - e.currentTarget.getBoundingClientRect().top, moved: false, last: null }
    lift.current = h
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== h.pointer) return
      // No button held: the release was never heard (outside the window) – no drag without a button.
      if (ev.buttons === 0) {
        stop()
        setDrop(null)
        return
      }
      if (!h.moved) {
        if (!dragStarted(ev.clientX - h.x0, ev.clientY - h.y0, 'xy')) return
        h.moved = true
        rects.current = null
        setFlight(h.id)
      }
      const L = latest.current
      const boxes = (rects.current ??= readRects())
      const body = bodyRef.current?.getBoundingClientRect()
      const i = columnAt(ev.clientX, boxes, h.col)
      if (!body || !boxes[i] || !L.days[i]) return
      const startMin = dropStart({ pointerY: ev.clientY, colTop: body.top + boxes[i]!.off, grabPx: h.grabPx, ppm: L.ppm, lo: L.lo, hi: L.hi, durationMin: h.durationMin })
      const next = dropOn(i, startMin, h.date, L.days[i].date, L.today)
      h.last = next
      setDrop((was) => (was && sameDrop(was.at, next) ? was : { blockId: h.id, at: next, durationMin: h.durationMin }))
    }
    const up = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== h.pointer) return
      const at = h.last
      stop()
      if (!h.moved) return
      muteClick()
      // A day gone by, or the place it already has: nothing is written.
      if (!at || at.denied || dropStays(h.date, latest.current.days[at.index]?.date ?? h.date, h.startMin, at.startMin)) {
        setDrop(null)
        return
      }
      void land(h, at)
    }
    const cancel = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== h.pointer) return
      if (h.moved) muteClick()
      stop()
      setDrop(null)
    }
    // Esc of a drag in progress is the drag's alone (heard first, in the capture phase): it must not close a layer under it too.
    const escape = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !h.moved) return
      ev.preventDefault()
      ev.stopPropagation()
      muteClick()
      stop()
      setDrop(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', escape, true)
    unlisten.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', escape, true)
    }
  }
  const refusing = drop?.at.denied === true && flight != null
  return (
    <div
      className={cx('flex select-none flex-col', flight != null && (refusing ? '[&_*]:cursor-not-allowed!' : '[&_*]:cursor-grabbing!'))}
      data-testid="week-grid"
      data-mode={mode}
      data-dragging={flight != null ? 'true' : undefined}
    >
      {/* The headings stay in view while the axis scrolls. */}
      {/* The strip of all-day events (D405) stays with them, in the same columns. */}
      <div className="sticky top-0 z-10 border-b border-line bg-bg pb-1">
        <div className="grid gap-x-1" style={cols}>
          <span />
          {days.map((d) => (
            <ColumnHeading key={d.date} day={d} brightness={brightness} />
          ))}
        </div>
        <div className="mt-1">
          <AllDayBar dates={dates} page="week" today={today} axisPx={AXIS_PX} gapClass="gap-x-1" openId={openCard} onOpened={onCardOpened} />
        </div>
      </div>
      <div className="relative grid gap-x-1" style={cols} ref={bodyRef} data-testid="week-body">
        <div className="relative" style={{ height }} aria-hidden="true">
          {marks.map((h) => (
            <span key={h} className="num absolute right-1.5 -translate-y-1/2 text-[11px] text-muted" style={{ top: Math.max(axisY(h, lo, ppm), 7) }} data-testid={`week-hour-${h}`}>
              {logicalClock(h)}
            </span>
          ))}
        </div>
        {days.map((d, i) => (
          <DayColumn
            key={d.date}
            day={d}
            index={i}
            lo={lo}
            hi={hi}
            ppm={ppm}
            height={height}
            marks={marks}
            names={namesOf(d.date)}
            brightness={brightness}
            columnUnder={columnUnder}
            onHold={(range, x) => {
              // Only a change of the columns or the hours is drawn again – the pointer moves on a good deal more often.
              if (!range) rects.current = null
              const next = range ? { from: i, to: columnUnder(x, i), range } : null
              setHeld((was) => (sameDrag(was, next) ? was : next))
            }}
            onPick={pickOn}
            held={held && spanHeld.includes(i) ? held.range : null}
            waiting={pick?.dates.includes(d.date) ? pick : null}
            grab={(b) => ({ down: grab(b, d.date, i), consumed: () => muted.current, dragging: flight === b.id })}
            drop={drop && drop.at.index === i ? { ...drop.at, durationMin: drop.durationMin } : null}
          />
        ))}
        {pick && (
          <NewBlockPopover
            key={pick.seq}
            dates={pick.dates}
            startMin={pick.startMin}
            durationMin={pick.durationMin}
            dragged={pick.dragged}
            today={today}
            namesOf={namesOf}
            place={pick.place}
            onClose={() => setPick(null)}
            onDates={(dates) => setPick((p) => p && { ...p, dates })}
            onMore={(block) => {
              // The full editing of the day, the block not saved yet: the draft of „Dziś” (A6-17, D461) – saved at its first field or when you leave it.
              setBlockDraft(pick.dates[0]!, block, true)
              setPick(null)
              openDay(pick.dates[0]!)
            }}
          />
        )}
      </div>
    </div>
  )
}

function ColumnHeading({ day, brightness }: { day: HorizonDay; brightness: number }) {
  const today = day.when === 'today'
  // The weekday of the date, not the place of the column: „3 dni” does not start on a Monday.
  const index = weekday(day.date) - 1
  const type = day.dayType != null && day.dayType in DAY_TYPE_COLORS ? (day.dayType as DayTypeId) : null
  const boundary = boundaryLine(day)
  const regen = regenLine(day)
  return (
    <button
      type="button"
      onClick={() => openDay(day.date)}
      title={`${WEEKDAY_FULL[index]} – otwórz plan dnia`}
      data-testid={`week-day-${day.date}`}
      data-when={day.when}
      aria-current={today ? 'date' : undefined}
      className={cx('flex min-w-0 flex-col items-stretch gap-1 rounded border px-1.5 py-1.5 text-left text-[11.5px] leading-snug [overflow-wrap:anywhere]', today ? 'border-lamp bg-lamp-soft' : 'border-line bg-panel hover:bg-hover')}
    >
      <span className={cx('num text-[12.5px] font-medium', today && 'text-lamp')}>
        {dayHeading(day.date, index)}
        {today && <span className="ml-1 text-[11px] font-normal">dziś</span>}
      </span>
      {type && (
        <span className="rounded-sm border px-1 text-fg" style={{ background: blockFill(DAY_TYPE_COLORS[type], brightness), borderColor: DAY_TYPE_COLORS[type] }} data-testid={`week-type-${day.date}`}>
          {DAY_TYPE_NAMES[type]}
        </span>
      )}
      {boundary && (
        <span className={TONE_CLASS[boundary.tone]} title={boundary.title} data-testid={`week-boundary-${day.date}`}>
          {boundary.text}
        </span>
      )}
      {regen && (
        <span className={TONE_CLASS[regen.tone]} title={regen.title} data-testid={`week-regen-${day.date}`}>
          {regen.text}
        </span>
      )}
    </button>
  )
}

/**
 * A column of a day (D366, D371): a click on an empty place of it asks for a new block there, on the 5-min grid and an hour
 * long; a drag over it for a block as long as the range, in as many days as the pointer crossed (`columnUnder`). `held` –
 * the band of a drag in progress that takes this day, `waiting` – the block whose small window is open (kept drawn). `drop` –
 * where the block being dragged would land in this day (D417), `grab` – what lets a block of it be dragged.
 */
function DayColumn({
  day,
  index,
  lo,
  hi,
  ppm,
  height,
  marks,
  names,
  brightness,
  columnUnder,
  onHold,
  onPick,
  held,
  waiting,
  grab,
  drop
}: {
  day: HorizonDay
  index: number
  lo: number
  hi: number
  ppm: number
  height: number
  marks: number[]
  names: Names
  brightness: number
  columnUnder: (x: number, fallback: number) => number
  onHold: (range: GridRange | null, x: number) => void
  onPick: (first: number, last: number, range: GridRange, dragged?: boolean) => void
  held: GridRange | null
  waiting: NewPick | null
  grab: (b: HorizonBlock) => BlockGrab
  drop: (BlockDrop & { durationMin: number }) | null
}) {
  const lanes = useMemo(() => laneLayout(day.blocks), [day.blocks])
  // D410: the attachments of each block (its own, the template's, the series') – 📎N on its tile.
  const attachments = useData((s) => s.attachments)
  const templates = useData((s) => s.templates)
  const place = useMemo<BlockPlace>(() => dayPlace(day.date, day.templateId, templates), [day.date, day.templateId, templates])
  const attachCount = (b: HorizonBlock): number => (b.outsidePlan ? 0 : attachmentsOfBlock(attachments, { id: b.id, origin: b.named.origin ?? 'user', sourceId: b.named.sourceId ?? null }, place).length)
  const grid = useGridCreate({
    lo,
    hi,
    ppm,
    axis: 'xy',
    flatMin: DEFAULT_NEW_BLOCK_MIN,
    onClick: (min) => {
      const startMin = Math.min(Math.max(snapMinute(min), lo), hi)
      onPick(index, index, { startMin, endMin: startMin + DEFAULT_NEW_BLOCK_MIN }, false)
    },
    onHold,
    onRange: (r, _rect, x) => onPick(index, columnUnder(x, index), r)
  })
  const shown = held ?? (waiting ? { startMin: waiting.startMin, endMin: waiting.startMin + waiting.durationMin } : null)
  return (
    <div
      className={cx('relative overflow-hidden rounded-sm border-x border-line', day.when === 'today' ? 'bg-panel' : 'bg-transparent')}
      style={{ height }}
      {...grid.bind}
      data-testid={`week-col-${day.date}`}
      aria-label={columnLabel(weekday(day.date) - 1, day.blocks.length)}
    >
      {marks.map((h) => (
        <div key={h} className="pointer-events-none absolute right-0 left-0 border-t border-line/60" style={{ top: axisY(h, lo, ppm) }} />
      ))}
      <EnergyBackdrop date={day.date} track={day.energy} lo={lo} ppm={ppm} height={height} />
      {lanes.map(({ item, lane, lanes: n }) => (
        <BlockBox key={item.id} block={item} lo={lo} ppm={ppm} lane={lane} lanes={n} names={names} brightness={brightness} date={day.date} attach={attachCount(item)} grab={item.movable ? grab(item) : undefined} />
      ))}
      {shown && <RangeBand range={shown} lo={lo} ppm={ppm} testId={held ? 'week-range' : 'week-range-waiting'} />}
      {drop && <DropBand range={{ startMin: drop.startMin, endMin: drop.startMin + drop.durationMin }} lo={lo} ppm={ppm} denied={drop.denied} />}
    </div>
  )
}

/** The place a block being dragged would take (D417): its hours; over a day gone by – refused, said in words. */
function DropBand({ range, lo, ppm, denied }: { range: GridRange; lo: number; ppm: number; denied: boolean }) {
  return (
    <div
      className={cx('num pointer-events-none absolute right-0 left-0 z-20 overflow-hidden rounded-[3px] border border-dashed px-1 text-[11px] leading-[14px] text-fg', denied ? 'border-rose bg-rose/10' : 'border-lamp bg-lamp/20')}
      style={{ top: (range.startMin - lo) * ppm, height: Math.max(14, (range.endMin - range.startMin) * ppm) }}
      data-testid="week-drop"
      data-start={range.startMin}
      data-end={range.endMin}
      data-denied={denied ? 'true' : undefined}
    >
      {logicalClock(range.startMin)}–{logicalClock(range.endMin)}
      {denied ? ` · ${DENIED_TEXT}` : ''}
    </div>
  )
}

/** A block on the axis: its colour as on the day's axis; not begun on a day gone by – dimmed; taken off – dimmed too. A click opens its day (D366). */
export function BlockBox({ block: b, lo, ppm = WEEK_PPM, lane, lanes, names, brightness, date, attach, grab }: { block: HorizonBlock; lo: number; ppm?: number; lane: number; lanes: number; names: Names; brightness: number; date: string; attach: number; grab?: BlockGrab }) {
  const { top, height } = blockSpan(b, lo, ppm)
  const color = blockColor(b.categoryId, names)
  const dim = b.state === 'missed' || b.state === 'parked' || b.state === 'cancelled'
  const name = blockName(b.named, names)
  // D430: a block with its own name says its category beside its hours.
  const kind = blockKind(b.named, names)
  // D440: the counter of the steps „✓ 3/4” (none – nothing).
  const counter = stepsCounter(b.steps)
  const title = `${name} · ${logicalClock(b.startMin)}–${logicalClock(b.endMin)} · ${blockStateText(b.state, b.outsidePlan)}${b.background ? ' · w tle' : ''}${attach ? ` · ${attachBadgeTitle(attach)}` : ''}`
  return (
    <button
      type="button"
      onClick={() => {
        if (!grab?.consumed()) openDay(date)
      }}
      onPointerDown={grab?.down}
      {...NO_GRID}
      title={title}
      data-testid={`week-block-${date}-${b.id}`}
      data-state={b.state}
      data-outside={b.outsidePlan ? 'true' : undefined}
      data-movable={grab ? 'true' : undefined}
      className={cx('absolute overflow-hidden rounded-[3px] border-l-[3px] px-1 text-left text-[11px] leading-tight', grab ? 'cursor-grab' : 'cursor-pointer', grab?.dragging && 'opacity-40', blockRinged(b.state) && 'ring-1 ring-lamp', blockDashed(b.state) && 'border-dashed', b.state === 'cancelled' && 'line-through')}
      // Dimmed by its fill and edge, never its text (as on the day's axis, A8-05).
      style={{
        top,
        height,
        left: `calc(${(lane / lanes) * 100}% + 1px)`,
        width: `calc(${100 / lanes}% - 2px)`,
        background: dim ? blockFillDim(color, brightness) : blockFill(color, brightness),
        borderLeftColor: dim ? blockEdgeDim(color) : color
      }}
    >
      <span className="block truncate pt-px text-fg">
        {b.outsidePlan ? '+ ' : ''}
        {name}
        {b.named.origin === 'series' && (
          <span className="ml-1 text-muted" title="Z serii" aria-label="z serii" data-testid="series-mark">
            {SERIES_MARK}
          </span>
        )}
        {counter && (
          <span className="num ml-1 text-muted" title="Kroki" data-testid="steps-counter">
            {counter}
          </span>
        )}
        {attach > 0 && height < 30 && (
          <span className="num ml-1 text-muted" data-testid="attach-badge">
            {attachBadge(attach)}
          </span>
        )}
      </span>
      {height >= 30 && (
        <span className="num block truncate text-muted">
          {logicalClock(b.startMin)}–{logicalClock(b.endMin)}
          {kind ? ` · ${kind}` : ''}
          {attach > 0 && (
            <span className="ml-1" data-testid="attach-badge">
              {attachBadge(attach)}
            </span>
          )}
        </span>
      )}
    </button>
  )
}
