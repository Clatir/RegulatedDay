/**
 * „Tydzień” (D356, E10 Horyzont): the month's goals at the top, then seven columns Monday to Sunday on one axis of hours –
 * above each its type, the boundary (kept, not kept, in progress, free, no data) and the regeneration against the minimum;
 * the blocks as planned, on days gone by as it was. A click on the heading of a day or on a block opens its plan, as in the
 * calendar (D295); a click on an empty place of a column (or a drag over it) opens the small window of a new block there
 * (D366). The arrows move by a week; the goals shown are the month of the week (`goalsMonthOfWeek`).
 */
import { useMemo, useRef, useState } from 'react'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import { logicalClock } from '@shared/format'
import { settingsOn, DAY_TYPE_NAMES, type DayTypeId } from '@shared/model/settings'
import { blockEdgeDim, blockFill, blockFillDim } from '@shared/theme'
import { weekStart } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { cx } from '../../components/ui'
import { useData } from '../../store/data'
import { useWeekView } from '../../store/horizon'
import { useMachine } from '../../store/machine'
import { openDay, setBlockDraft } from '../../store/ui'
import { DAY_TYPE_COLORS } from '../calendar/dayTypes'
import { blockColor, blockName, type Names } from '../plan/blockView'
import { DEFAULT_NEW_BLOCK_MIN, snapMinute, type GridRange } from '../plan/gridCreate'
import { NO_GRID, RangeBand, useGridCreate } from '../plan/gridDrag'
import { GoalsPanel } from './GoalsPanel'
import { NewBlockPopover } from './NewBlockPopover'
import { axisHeight, axisRange, axisY, blockSpan, columnAt, dayIndexes, goalsMonthOfWeek, hourMarks, laneLayout, NEW_BLOCK_WIDTH, popoverPlace, sameDrag, WEEK_PPM } from './weekLayout'
import { blockDashed, blockRinged, blockStateText, boundaryLine, columnLabel, dayHeading, regenLine, WEEKDAY_FULL, weekTitle, type Tone } from './weekText'

const AXIS_PX = 48
const TONE_CLASS: Record<Tone, string> = { ok: 'text-sea', bad: 'text-rose', muted: 'text-muted', plain: 'text-fg' }

export function WeekPage() {
  const today = useData((s) => s.view?.today ?? '')
  const [week, setWeek] = useState(() => weekStart(today))
  const { view, failed } = useWeekView(week)
  const thisWeek = weekStart(today)
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="week">
      <div className="flex items-center gap-2">
        <button type="button" className="btn" onClick={() => setWeek(addDays(week, -7))} aria-label="Poprzedni tydzień" data-testid="week-prev">
          ‹
        </button>
        <span className="num min-w-[150px] text-center text-[14px] font-medium" data-testid="week-title" data-week={week}>
          {weekTitle(week)}
        </span>
        <button type="button" className="btn" onClick={() => setWeek(addDays(week, 7))} aria-label="Następny tydzień" data-testid="week-next">
          ›
        </button>
        <button type="button" className="btn" disabled={week === thisWeek} onClick={() => setWeek(thisWeek)} data-testid="week-today">
          Ten tydzień
        </button>
      </div>
      <GoalsPanel month={goalsMonthOfWeek(week, today)} />
      {view ? (
        // Keyed by the week: another week is another grid – a window of a new block or a drag never goes with it (D371).
        <WeekGrid key={view.days[0]?.date} days={view.days} from={view.from} to={view.to} />
      ) : (
        <span className="text-[12.5px] text-muted" data-testid="week-loading">
          {failed ? 'Nie da się teraz policzyć tego tygodnia.' : 'Liczę tydzień…'}
        </span>
      )}
      {view && failed && <span className="text-[12px] text-muted">Odświeżenie tygodnia się nie udało – widać ostatni odczyt.</span>}
    </div>
  )
}

/**
 * The new block asked for on the grid (D366, D371): the days in a row it is for (one, or those a drag crossed), its span, and
 * where its small window stands (pixels from the grid's corner); `seq` – which ask it is (a new ask is a new window).
 */
interface NewPick {
  seq: number
  dates: string[]
  startMin: number
  durationMin: number
  place: { left: number; top: number }
}

/** A drag over the columns in progress (D371): the column it began in, the one under the pointer now, its span of hours. */
interface Held {
  from: number
  to: number
  range: GridRange
}

function WeekGrid({ days, from, to }: { days: HorizonDay[]; from: number; to: number }) {
  const { rd, routines, requests } = useData()
  const today = useData((s) => s.view?.today ?? '')
  const bodyRef = useRef<HTMLDivElement>(null)
  const asks = useRef(0)
  const [pick, setPick] = useState<NewPick | null>(null)
  const [held, setHeld] = useState<Held | null>(null)
  const brightness = useMachine((s) => s.prefs.brightness)
  const { lo, hi } = axisRange(from, to)
  const height = axisHeight(lo, hi)
  const marks = hourMarks(lo, hi)
  const namesOf = useMemo(() => (date: string): Names => ({ rd, settings: settingsOn(rd.settings, date), routines, requests }), [rd, routines, requests])
  const cols = { gridTemplateColumns: `${AXIS_PX}px repeat(7, minmax(0, 1fr))` }
  /** The rectangle a column has on the screen; null when it is not there. */
  const columnRect = (i: number): DOMRect | null => bodyRef.current?.querySelector(`[data-testid="week-col-${days[i]?.date}"]`)?.getBoundingClientRect() ?? null
  // The columns do not move while a drag goes on: their rectangles are read once, when the pointer first asks.
  const rects = useRef<Array<{ left: number; right: number }> | null>(null)
  const readRects = (): Array<{ left: number; right: number }> => {
    const out: Array<{ left: number; right: number }> = []
    for (let i = 0; i < days.length; i++) {
      const r = columnRect(i)
      if (!r) return []
      out.push({ left: r.left, right: r.right })
    }
    return out
  }
  /** The column under `x` (the pointer of a drag may be in another one than where it began); `fallback` where the grid cannot be read. */
  const columnUnder = (x: number, fallback: number): number => columnAt(x, (rects.current ??= readRects()), fallback)
  /** A click (an hour long) or a drag over an empty place of the columns `first`–`last` asks for a new block there. */
  const pickOn = (first: number, last: number, r: GridRange) => {
    const body = bodyRef.current?.getBoundingClientRect()
    if (!body) return
    const idx = dayIndexes(first, last)
    const side = columnRect
    const a = side(idx[0]!)
    const b = side(idx.at(-1)!)
    if (!a || !b) return
    const place = popoverPlace({ gridWidth: body.width, colLeft: a.left - body.left, colRight: b.right - body.left, top: a.top - body.top + axisY(r.startMin, lo), width: NEW_BLOCK_WIDTH })
    setPick({ seq: ++asks.current, dates: idx.map((i) => days[i]!.date), startMin: r.startMin, durationMin: r.endMin - r.startMin, place })
  }
  const spanHeld = held ? dayIndexes(held.from, held.to) : []
  return (
    <div className="flex select-none flex-col" data-testid="week-grid">
      {/* The headings stay in view while the axis scrolls. */}
      <div className="sticky top-0 z-10 grid gap-x-1 border-b border-line bg-bg pb-1" style={cols}>
        <span />
        {days.map((d, i) => (
          <ColumnHeading key={d.date} day={d} index={i} brightness={brightness} />
        ))}
      </div>
      <div className="relative grid gap-x-1" style={cols} ref={bodyRef}>
        <div className="relative" style={{ height }} aria-hidden="true">
          {marks.map((h) => (
            <span key={h} className="num absolute right-1.5 -translate-y-1/2 text-[11px] text-muted" style={{ top: Math.max(axisY(h, lo), 7) }} data-testid={`week-hour-${h}`}>
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
          />
        ))}
        {pick && (
          <NewBlockPopover
            key={pick.seq}
            dates={pick.dates}
            startMin={pick.startMin}
            durationMin={pick.durationMin}
            today={today}
            namesOf={namesOf}
            place={pick.place}
            onClose={() => setPick(null)}
            onDates={(dates) => setPick((p) => p && { ...p, dates })}
            onMore={(block) => {
              // The full editing of the day, the block not saved yet: the draft of „Dziś” (A6-17) – its „Dodaj” saves it.
              setBlockDraft(pick.dates[0]!, block)
              setPick(null)
              openDay(pick.dates[0]!)
            }}
          />
        )}
      </div>
    </div>
  )
}

function ColumnHeading({ day, index, brightness }: { day: HorizonDay; index: number; brightness: number }) {
  const today = day.when === 'today'
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
 * the band of a drag in progress that takes this day, `waiting` – the block whose small window is open (kept drawn).
 */
function DayColumn({
  day,
  index,
  lo,
  hi,
  height,
  marks,
  names,
  brightness,
  columnUnder,
  onHold,
  onPick,
  held,
  waiting
}: {
  day: HorizonDay
  index: number
  lo: number
  hi: number
  height: number
  marks: number[]
  names: Names
  brightness: number
  columnUnder: (x: number, fallback: number) => number
  onHold: (range: GridRange | null, x: number) => void
  onPick: (first: number, last: number, range: GridRange) => void
  held: GridRange | null
  waiting: NewPick | null
}) {
  const lanes = useMemo(() => laneLayout(day.blocks), [day.blocks])
  const grid = useGridCreate({
    lo,
    hi,
    ppm: WEEK_PPM,
    axis: 'xy',
    flatMin: DEFAULT_NEW_BLOCK_MIN,
    onClick: (min, rect) => {
      const startMin = Math.min(Math.max(snapMinute(min), lo), hi)
      onPick(index, index, { startMin, endMin: startMin + DEFAULT_NEW_BLOCK_MIN })
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
      aria-label={columnLabel(index, day.blocks.length)}
    >
      {marks.map((h) => (
        <div key={h} className="pointer-events-none absolute right-0 left-0 border-t border-line/60" style={{ top: axisY(h, lo) }} />
      ))}
      {lanes.map(({ item, lane, lanes: n }) => (
        <BlockBox key={item.id} block={item} lo={lo} lane={lane} lanes={n} names={names} brightness={brightness} date={day.date} />
      ))}
      {shown && <RangeBand range={shown} lo={lo} ppm={WEEK_PPM} testId={held ? 'week-range' : 'week-range-waiting'} />}
    </div>
  )
}

/** A block on the axis: its colour as on the day's axis; not begun on a day gone by – dimmed; taken off – dimmed too. A click opens its day (D366). */
function BlockBox({ block: b, lo, lane, lanes, names, brightness, date }: { block: HorizonBlock; lo: number; lane: number; lanes: number; names: Names; brightness: number; date: string }) {
  const { top, height } = blockSpan(b, lo)
  const color = blockColor(b.categoryId, names)
  const dim = b.state === 'missed' || b.state === 'parked' || b.state === 'cancelled'
  const name = blockName(b.named, names)
  const title = `${name} · ${logicalClock(b.startMin)}–${logicalClock(b.endMin)} · ${blockStateText(b.state, b.outsidePlan)}${b.background ? ' · w tle' : ''}`
  return (
    <button
      type="button"
      onClick={() => openDay(date)}
      {...NO_GRID}
      title={title}
      data-testid={`week-block-${date}-${b.id}`}
      data-state={b.state}
      data-outside={b.outsidePlan ? 'true' : undefined}
      className={cx('absolute cursor-pointer overflow-hidden rounded-[3px] border-l-[3px] px-1 text-left text-[11px] leading-tight', blockRinged(b.state) && 'ring-1 ring-lamp', blockDashed(b.state) && 'border-dashed', b.state === 'cancelled' && 'line-through')}
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
      </span>
      {height >= 30 && (
        <span className="num block truncate text-muted">
          {logicalClock(b.startMin)}–{logicalClock(b.endMin)}
        </span>
      )}
    </button>
  )
}
