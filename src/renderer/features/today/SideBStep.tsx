/**
 * „Strona B tygodnia” – the Monday step of the morning plan before the questions about symptoms (spec „Plan poranny”,
 * D322): the table of the week that ended beside the week before; preliminary until its Sunday is frozen. „Dalej” (or
 * „Pomiń”, also while the table is being counted) closes it for the day on every computer – here at once, whatever the
 * day's file does (OneDrive may still be bringing it, A6-15).
 */
import { useEffect, useState } from 'react'
import type { SideB } from '@shared/engine/sideB'
import { plDate } from '@shared/format'
import { setAsked } from '@shared/data/dayEdits'
import { addDays, weekday } from '@shared/time/zone'
import { useData } from '../../store/data'
import { closeSideB } from '../../store/ui'
import type { DayModel } from '../../store/day'
import { saveDay } from './dayActions'
import { sideBRows } from './sideBRows'

/** The Monday step shows: Monday, not answered in the day's file, not closed in this window. */
export function sideBShown(date: string, asked: boolean, closedHere: string | null): boolean {
  return weekday(date) === 1 && !asked && closedHere !== date
}

export function SideBStep({ model }: { model: DayModel }) {
  const rd = useData((s) => s.rd)
  const [b, setB] = useState<SideB | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    void window.rd
      .sideB()
      .then(setB)
      .catch(() => setFailed(true))
  }, [model.date])
  const done = () => {
    closeSideB(model.date)
    void saveDay(model.date, model.data.dayFile, (r) => setAsked(r, 'sideB', 'seen'))
  }
  if (failed)
    return (
      <div className="flex items-center gap-2 text-[12.5px]" data-testid="side-b">
        <span className="flex-1 text-muted">„Strony B” nie da się teraz policzyć.</span>
        <button type="button" className="btn" onClick={done}>
          Pomiń
        </button>
      </div>
    )
  if (!b)
    return (
      <div className="flex items-center gap-2 text-[12.5px]" data-testid="side-b">
        <span className="flex-1 text-muted">Liczę „Stronę B”…</span>
        <button type="button" className="btn" onClick={done} data-testid="side-b-skip">
          Pomiń
        </button>
      </div>
    )
  const rows = sideBRows(b.totals, b.previous, rd)
  return (
    <div className="flex flex-col gap-2" data-testid="side-b">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-medium">Strona B tygodnia</span>
        <span className="text-[12px] text-muted">
          {plDate(b.week)}–{plDate(addDays(b.week, 6))}
          {b.preliminary ? ' · wstępna – niedziela nie jest jeszcze zamrożona' : ''}
        </span>
      </div>
      <table className="w-full max-w-[720px] text-[12.5px]">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 pr-3 font-normal" />
            <th className="py-1 pr-3 font-normal">ten tydzień</th>
            <th className="py-1 pr-3 font-normal">poprzedni</th>
            <th className="py-1 font-normal" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="py-1 pr-3 text-muted">{r.label}</td>
              <td className="py-1 pr-3">{r.now}</td>
              <td className="py-1 pr-3 text-muted">{r.before}</td>
              <td className="py-1 text-muted" aria-label={r.arrow ? 'wobec poprzedniego' : undefined}>
                {r.arrow}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2">
        <button type="button" className="btn btn-accent" onClick={done} data-testid="side-b-done">
          Dalej
        </button>
      </div>
    </div>
  )
}
