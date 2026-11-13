/**
 * „Tydzień” (D356, E10 Horyzont): the month's goals at the top, then seven columns Monday to Sunday on one axis of hours –
 * above each its type, the boundary (kept, not kept, in progress, free, no data) and the regeneration against the minimum;
 * the blocks as planned, on days gone by as it was (`DayGrid`). A click on the heading of a day or on a block opens its plan, as
 * in the calendar (D295); a click on an empty place of a column (or a drag over it) opens the small window of a new block
 * there (D366); a block that may be moved is dragged to another hour or day (D417). The arrows move by a week; the goals shown
 * are the month of the week (`goalsMonthOfWeek`).
 *
 * The heading of the page switches the view (SNT1, T936; remembered by this computer): „Tydzień”, „3 dni” (D417 – yesterday,
 * today and tomorrow in a larger scale, the arrows move by a day) and „Agenda” (D418 – seven days from today as a list).
 */
import { useEffect, useState } from 'react'
import { threeDays, agendaDates } from '@shared/engine/week'
import { weekStart } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { useData } from '../../store/data'
import { useDaysView, useWeekView } from '../../store/horizon'
import { takeFoundPick, useUi } from '../../store/ui'
import { pendingCard } from '../allday/allDayView'
import { AllDayLines } from '../allday/AllDayLines'
import { AgendaView } from './AgendaView'
import { DayGrid } from './DayGrid'
import { GoalsPanel } from './GoalsPanel'
import { THREE_DAYS_PPM, goalsMonthOfWeek } from './weekLayout'
import { weekTitle } from './weekText'
import { WeekPushLine } from './WeekPushLine'
import { lastWeekMode, rememberWeekMode, shiftDay, threeDaysTitle, WEEK_MODES, type WeekMode } from './weekViews'

export { BlockBox } from './DayGrid'

export function WeekPage() {
  const today = useData((s) => s.view?.today ?? '')
  const [mode, setMode] = useState<WeekMode>(lastWeekMode)
  const [week, setWeek] = useState(() => weekStart(today))
  // The middle day of „3 dni”: today until the arrows move it.
  const [anchor, setAnchor] = useState<string | null>(null)
  const middle = anchor ?? today
  const thisWeek = weekStart(today)
  // Ctrl K on an all-day event (D405, as the other results): the week of its first day, set once; its card the strip of that
  // week opens (`card`, until it has). One that is gone says so (`takeFoundPick`). The ask is forgotten as soon as it cannot be
  // met – the event gone before the week was counted, or another week shown (the arrows): the card never opens later by itself.
  // The card is the strip of the week's: the page shows „Tydzień” for it, whatever view it was in.
  const pick = useUi((s) => s.pick)
  const events = useData((s) => s.allDay)
  const [card, setCard] = useState<string | null>(null)
  useEffect(() => {
    const p = takeFoundPick((x) => x.kind === 'allDay', (x) => events.some((e) => e.id === x.id), 'Tego wydarzenia już nie ma.')
    const e = p ? events.find((x) => x.id === p.id) : undefined
    if (!e) return
    setMode('week')
    setWeek(weekStart(e.startDate))
    setCard(e.id)
  }, [pick, events])
  const waiting = mode === 'week' ? pendingCard(card, week, events) : null
  useEffect(() => {
    if (card != null && waiting == null) setCard(null)
  }, [card, waiting])
  const choose = (m: WeekMode) => {
    setMode(m)
    rememberWeekMode(m)
  }
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="week" data-mode={mode}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 inline-flex gap-1" role="group" aria-label="Widok" data-testid="week-modes">
          {WEEK_MODES.map((m) => (
            <button key={m.id} type="button" className="btn" aria-pressed={mode === m.id} onClick={() => choose(m.id)} data-testid={`week-mode-${m.id}`}>
              {m.label}
            </button>
          ))}
        </div>
        {mode === 'week' && (
          <>
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
          </>
        )}
        {mode === '3days' && (
          <>
            <button type="button" className="btn" onClick={() => setAnchor(shiftDay(middle, -1))} aria-label="Poprzedni dzień" data-testid="three-prev">
              ‹
            </button>
            <span className="num min-w-[190px] text-center text-[14px] font-medium" data-testid="three-title" data-middle={middle}>
              {threeDaysTitle(threeDays(middle))}
            </span>
            <button type="button" className="btn" onClick={() => setAnchor(shiftDay(middle, 1))} aria-label="Następny dzień" data-testid="three-next">
              ›
            </button>
            <button type="button" className="btn" disabled={middle === today} onClick={() => setAnchor(null)} data-testid="three-today">
              Dziś
            </button>
          </>
        )}
        {mode === 'agenda' && (
          <span className="text-[14px] font-medium" data-testid="agenda-title">
            7 dni od dziś
          </span>
        )}
      </div>
      <WeekPushLine />
      <AllDayLines page="week" />
      {mode === 'week' && <WeekBody week={week} today={today} openCard={waiting} onCardOpened={() => setCard(null)} />}
      {mode === '3days' && <ThreeDaysBody middle={middle} />}
      {mode === 'agenda' && <AgendaBody today={today} />}
    </div>
  )
}

/** „Tydzień”: the month's goals, then the seven columns. */
function WeekBody({ week, today, openCard, onCardOpened }: { week: string; today: string; openCard: string | null; onCardOpened: () => void }) {
  const { view, failed } = useWeekView(week)
  return (
    <>
      <GoalsPanel month={goalsMonthOfWeek(week, today)} />
      {view ? (
        // Keyed by the week: another week is another grid – a window of a new block or a drag never goes with it (D371).
        <DayGrid key={view.days[0]?.date} days={view.days} from={view.from} to={view.to} openCard={openCard} onCardOpened={onCardOpened} />
      ) : (
        <span className="text-[12.5px] text-muted" data-testid="week-loading">
          {failed ? 'Nie da się teraz policzyć tego tygodnia.' : 'Liczę tydzień…'}
        </span>
      )}
      {view && failed && <span className="text-[12px] text-muted">Odświeżenie tygodnia się nie udało – widać ostatni odczyt.</span>}
    </>
  )
}

/** „3 dni” (D417): the day before, the day, the day after on one axis in a larger scale – the same columns as „Tydzień”. */
function ThreeDaysBody({ middle }: { middle: string }) {
  const { view, failed } = useDaysView(threeDays(middle))
  return (
    <>
      {view ? (
        <DayGrid key={view.days[0]?.date} days={view.days} from={view.from} to={view.to} ppm={THREE_DAYS_PPM} mode="3days" openCard={null} onCardOpened={() => undefined} />
      ) : (
        <span className="text-[12.5px] text-muted" data-testid="three-loading">
          {failed ? 'Nie da się teraz policzyć tych dni.' : 'Liczę dni…'}
        </span>
      )}
      {view && failed && <span className="text-[12px] text-muted">Odświeżenie dni się nie udało – widać ostatni odczyt.</span>}
    </>
  )
}

/** „Agenda” (D418): the seven days from today. */
function AgendaBody({ today }: { today: string }) {
  const { view, failed } = useDaysView(agendaDates(today))
  return (
    <>
      {view ? (
        <AgendaView days={view.days} today={today} />
      ) : (
        <span className="text-[12.5px] text-muted" data-testid="agenda-loading">
          {failed ? 'Nie da się teraz policzyć tych dni.' : 'Liczę dni…'}
        </span>
      )}
      {view && failed && <span className="text-[12px] text-muted">Odświeżenie dni się nie udało – widać ostatni odczyt.</span>}
    </>
  )
}
