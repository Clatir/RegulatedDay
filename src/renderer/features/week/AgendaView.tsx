/**
 * „Agenda” (D418): the days from today as a list, one day after another – the all-day events on top, then the blocks by the
 * hour (its hour, its name, its length, its category); a day with nothing is one line. A click on a day or a block opens
 * that day, as in „Tydzień” (`openDay`).
 */
import { useMemo } from 'react'
import { agendaOf, type AgendaDay } from '@shared/engine/calendarViews'
import type { HorizonDay } from '@shared/engine/week'
import { logicalClock } from '@shared/format'
import { rangeText } from '@shared/model/allDay'
import { settingsOn } from '@shared/model/settings'
import { ALL_DAY_COLOR_HEX } from '@shared/theme'
import { cx } from '../../components/ui'
import { useData } from '../../store/data'
import { openDay } from '../../store/ui'
import { blockColor, type Names } from '../plan/blockView'
import { blockStateText } from './weekText'
import { AGENDA_EMPTY, agendaHeading, agendaRow } from './weekViews'

export function AgendaView({ days, today }: { days: readonly HorizonDay[]; today: string }) {
  const { rd, routines, requests } = useData()
  const allDay = useData((s) => s.allDay)
  const agenda = useMemo(() => agendaOf(days, allDay), [days, allDay])
  const namesOf = (date: string): Names => ({ rd, settings: settingsOn(rd.settings, date), routines, requests })
  return (
    <div className="flex flex-col gap-2" data-testid="agenda">
      {agenda.map((d) => (
        <AgendaDayCard key={d.date} day={d} today={today} names={namesOf(d.date)} />
      ))}
    </div>
  )
}

function AgendaDayCard({ day, today, names }: { day: AgendaDay; today: string; names: Names }) {
  const empty = day.allDay.length === 0 && day.blocks.length === 0
  return (
    <section className={cx('rounded border px-3 py-2', day.date === today ? 'border-lamp bg-lamp-soft' : 'border-line bg-panel')} data-testid={`agenda-day-${day.date}`} data-when={day.when}>
      <button type="button" className={cx('num text-left text-[13px] font-medium hover:underline', day.date === today && 'text-lamp')} onClick={() => openDay(day.date)} title="Otwórz plan dnia" data-testid={`agenda-heading-${day.date}`}>
        {agendaHeading(day.date, today)}
      </button>
      {day.read === 'unknown' ? (
        <p className="mt-1 text-[12.5px] text-muted" data-testid={`agenda-unknown-${day.date}`}>
          nie da się teraz odczytać
        </p>
      ) : empty ? (
        <p className="mt-1 text-[12.5px] text-muted" data-testid={`agenda-empty-${day.date}`}>
          {AGENDA_EMPTY}
        </p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {day.allDay.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-[12.5px]" data-testid={`agenda-allday-${e.id}`}>
              <span className="inline-block h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: ALL_DAY_COLOR_HEX[e.color] }} aria-hidden="true" />
              <span className="min-w-0 truncate text-fg">{e.title}</span>
              <span className="num shrink-0 text-muted">{rangeText(e)}</span>
            </li>
          ))}
          {day.blocks.map((b) => {
            const row = agendaRow(b, names)
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => openDay(day.date)}
                  className="grid w-full grid-cols-[48px_minmax(0,1fr)_auto_minmax(0,150px)] items-center gap-2 rounded border-l-[3px] px-1.5 py-0.5 text-left text-[12.5px] hover:bg-hover"
                  style={{ borderLeftColor: blockColor(b.categoryId, names) }}
                  data-testid={`agenda-block-${day.date}-${b.id}`}
                  data-state={b.state}
                >
                  <span className="num text-fg">{logicalClock(b.startMin)}</span>
                  <span className="min-w-0 truncate text-fg">
                    {row.name}
                    {b.state !== 'planned' && <span className="ml-1 text-muted">{`· ${blockStateText(b.state, b.outsidePlan)}`}</span>}
                  </span>
                  <span className="num text-muted">{row.length}</span>
                  <span className="min-w-0 truncate text-muted" data-testid="agenda-category">
                    {/* A block named after its category would say it twice. */}
                    {row.name.replace(/^\+ /, '') === row.category ? '' : row.category}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
