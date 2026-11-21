/**
 * „Dzień w liczbach” (the side panel of „Dziś”) and the summary line over the axis, each number with a hint of what it is (D7): the
 * words are the specification's (boundary and maximum, the end of work, the hard end of projects, the pool, the minimum of regeneration).
 * A hint is a `title` – it shows under the pointer; nothing here changes the day.
 */
import { Fragment } from 'react'
import { logicalClock } from '@shared/format'
import { atOf } from '@shared/engine/grid'
import { logicalMinuteOf } from '@shared/time/day'
import type { DayModel } from '../../store/day'
import { daySummaryParts } from '../plan/dayItems'

export const DAY_NUMBER_HINTS = {
  boundary: 'Do kiedy planujesz dziś pracę. Zatwierdzenie planu zatwierdza granicę; praca po niej zmniejsza pulę projektów.',
  max: 'Najpóźniejsza granica, jaką dopuszcza ten typ dnia (z wyjątkiem granicy). Minuty pracy po maksimum to przekroczenie – tylko ostrzeżenie, nic się nie blokuje.',
  workEnd: 'Kiedy według planu kończy się ostatni blok pracy.',
  hardEnd: 'Najpóźniejsza chwila, po której do pory snu zostaje dość czasu na minimum regeneracji. Projekt po niej skraca regenerację.',
  bedtime: 'Prognozowana pora snu tego dnia.'
} as const

const hint = 'cursor-help underline decoration-dotted decoration-muted underline-offset-2'

export function DayNumbers({ model }: { model: DayModel }) {
  const s = model.state
  const lm = (idx: number) => logicalClock(logicalMinuteOf(model.date, atOf(s.grid, idx)))
  return (
    <>
      <h3 className="text-[13px] font-medium">Dzień w liczbach</h3>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
        <dt className={`text-muted ${hint}`} title={DAY_NUMBER_HINTS.boundary}>
          Granica
        </dt>
        <dd className="num" data-testid="side-boundary">
          {s.boundary.approved != null ? `${lm(s.boundary.approved)} (zatwierdzona)` : s.boundary.proposal != null ? `${lm(s.boundary.proposal)} (propozycja)` : s.noWorkDay ? 'dzień bez pracy' : '—'}
        </dd>
        <dt className={`text-muted ${hint}`} title={DAY_NUMBER_HINTS.max}>
          Maksimum
        </dt>
        <dd className="num">{lm(s.boundary.max)}</dd>
        <dt className={`text-muted ${hint}`} title={DAY_NUMBER_HINTS.workEnd}>
          Koniec pracy (prognoza)
        </dt>
        <dd className="num">{s.forecastWorkEnd != null ? lm(s.forecastWorkEnd) : '—'}</dd>
        <dt className={`text-muted ${hint}`} title={DAY_NUMBER_HINTS.hardEnd}>
          Twardy koniec projektów
        </dt>
        <dd className="num">{s.hardEnd.unreachable ? 'nie mieści się' : lm(s.hardEnd.at)}</dd>
        <dt className={`text-muted ${hint}`} title={DAY_NUMBER_HINTS.bedtime}>
          Pora snu
        </dt>
        <dd className="num">{lm(s.bedtime.forecast)}</dd>
      </dl>
    </>
  )
}

/** The line over the axis: the budget, the minimum of regeneration and the pool, the parts with their hints. */
export function DaySummary({ model }: { model: DayModel }) {
  return (
    <span className="text-[12px] text-muted" data-testid="day-summary">
      {daySummaryParts(model).map((p, i) => (
        <Fragment key={p.text}>
          {i > 0 && ' · '}
          <span className={hint} title={p.hint}>
            {p.text}
          </span>
        </Fragment>
      ))}
    </span>
  )
}
