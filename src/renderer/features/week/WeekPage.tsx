/**
 * „Tydzień” (D356, E10 Horyzont): the month's goals at the top, then seven columns Monday to Sunday on one axis of hours –
 * above each its type, the boundary (kept, not kept, in progress, free, no data) and the regeneration against the minimum;
 * the blocks as planned, on days gone by as it was. Only a view: nothing is dragged. A click on a day opens its plan, as in
 * the calendar (D295). The arrows move by a week; the goals shown are the month of the week (`goalsMonthOfWeek`).
 */
import { useMemo, useState } from 'react'
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
import { openDay } from '../../store/ui'
import { DAY_TYPE_COLORS } from '../calendar/dayTypes'
import { blockColor, blockName, type Names } from '../plan/blockView'
import { GoalsPanel } from './GoalsPanel'
import { axisHeight, axisRange, axisY, blockSpan, goalsMonthOfWeek, hourMarks, laneLayout } from './weekLayout'
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
        <WeekGrid days={view.days} from={view.from} to={view.to} />
      ) : (
        <span className="text-[12.5px] text-muted" data-testid="week-loading">
          {failed ? 'Nie da się teraz policzyć tego tygodnia.' : 'Liczę tydzień…'}
        </span>
      )}
      {view && failed && <span className="text-[12px] text-muted">Odświeżenie tygodnia się nie udało – widać ostatni odczyt.</span>}
    </div>
  )
}

function WeekGrid({ days, from, to }: { days: HorizonDay[]; from: number; to: number }) {
  const { rd, routines, requests } = useData()
  const brightness = useMachine((s) => s.prefs.brightness)
  const { lo, hi } = axisRange(from, to)
  const height = axisHeight(lo, hi)
  const marks = hourMarks(lo, hi)
  const namesOf = useMemo(() => (date: string): Names => ({ rd, settings: settingsOn(rd.settings, date), routines, requests }), [rd, routines, requests])
  const cols = { gridTemplateColumns: `${AXIS_PX}px repeat(7, minmax(0, 1fr))` }
  return (
    <div className="flex flex-col" data-testid="week-grid">
      {/* The headings stay in view while the axis scrolls. */}
      <div className="sticky top-0 z-10 grid gap-x-1 border-b border-line bg-bg pb-1" style={cols}>
        <span />
        {days.map((d, i) => (
          <ColumnHeading key={d.date} day={d} index={i} brightness={brightness} />
        ))}
      </div>
      <div className="grid gap-x-1" style={cols}>
        <div className="relative" style={{ height }} aria-hidden="true">
          {marks.map((h) => (
            <span key={h} className="num absolute right-1.5 -translate-y-1/2 text-[11px] text-muted" style={{ top: Math.max(axisY(h, lo), 7) }}>
              {logicalClock(h)}
            </span>
          ))}
        </div>
        {days.map((d, i) => (
          <DayColumn key={d.date} day={d} index={i} lo={lo} height={height} marks={marks} names={namesOf(d.date)} brightness={brightness} />
        ))}
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

function DayColumn({ day, index, lo, height, marks, names, brightness }: { day: HorizonDay; index: number; lo: number; height: number; marks: number[]; names: Names; brightness: number }) {
  const lanes = useMemo(() => laneLayout(day.blocks), [day.blocks])
  return (
    <div
      className={cx('relative cursor-pointer overflow-hidden rounded-sm border-x border-line', day.when === 'today' ? 'bg-panel' : 'bg-transparent')}
      style={{ height }}
      onClick={() => openDay(day.date)}
      data-testid={`week-col-${day.date}`}
      aria-label={columnLabel(index, day.blocks.length)}
    >
      {marks.map((h) => (
        <div key={h} className="absolute right-0 left-0 border-t border-line/60" style={{ top: axisY(h, lo) }} />
      ))}
      {lanes.map(({ item, lane, lanes: n }) => (
        <BlockBox key={item.id} block={item} lo={lo} lane={lane} lanes={n} names={names} brightness={brightness} date={day.date} />
      ))}
    </div>
  )
}

/** A block on the axis (view only): its colour as on the day's axis; not begun on a day gone by – dimmed; taken off – dimmed too. */
function BlockBox({ block: b, lo, lane, lanes, names, brightness, date }: { block: HorizonBlock; lo: number; lane: number; lanes: number; names: Names; brightness: number; date: string }) {
  const { top, height } = blockSpan(b, lo)
  const color = blockColor(b.categoryId, names)
  const dim = b.state === 'missed' || b.state === 'parked' || b.state === 'cancelled'
  const name = blockName(b.named, names)
  const title = `${name} · ${logicalClock(b.startMin)}–${logicalClock(b.endMin)} · ${blockStateText(b.state, b.outsidePlan)}${b.background ? ' · w tle' : ''}`
  return (
    <div
      title={title}
      data-testid={`week-block-${date}-${b.id}`}
      data-state={b.state}
      data-outside={b.outsidePlan ? 'true' : undefined}
      className={cx('absolute overflow-hidden rounded-[3px] border-l-[3px] px-1 text-[11px] leading-tight', blockRinged(b.state) && 'ring-1 ring-lamp', blockDashed(b.state) && 'border-dashed', b.state === 'cancelled' && 'line-through')}
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
    </div>
  )
}
