/**
 * „Cele na <miesiąc>” – the step of the morning plan after „Strona B tygodnia” and before the questions about symptoms
 * (D356, D360): at every morning plan of the month while none of its goals is set and the step was not skipped. The numbers
 * start as the month before's (clamped to this month's range) – change, clear or take them as they are; „Zapisz” keeps them,
 * „Pomiń” hides the step for the month on every computer. The goals can be set on „Tydzień” at any moment; nothing is
 * blocked by them (D72).
 */
import { useState } from 'react'
import { GOAL_AREAS, goalRange, previousMonth, type GoalArea, type GoalsPatch } from '@shared/model/goals'
import { useBusy } from '../../lib/busy'
import { trySaveGoals } from '../../store/data'
import { useGoalsView } from '../../store/horizon'
import { GoalFields, type GoalValues } from '../week/GoalFields'
import { monthName } from '../week/weekText'

/** The month before's goals taken over for `month`: a number above the new month's range is cut to it (29–31 days of regeneration). */
export function suggestedGoals(month: string, previous: Partial<Record<GoalArea, number | null>> | null | undefined): GoalValues {
  const out: GoalValues = { study: null, regen: null, trading: null }
  for (const area of GOAL_AREAS) {
    const v = previous?.[area]
    if (v != null) out[area] = Math.min(Math.max(v, goalRange(area, month)[0]), goalRange(area, month)[1])
  }
  return out
}

export function GoalsStep({ month }: { month: string }) {
  const { view } = useGoalsView(month)
  const [edited, setEdited] = useState<Partial<GoalValues>>({})
  const [busy, run] = useBusy()
  const suggested = suggestedGoals(month, view?.previous)
  const values: GoalValues = { study: suggested.study, regen: suggested.regen, trading: suggested.trading, ...edited }
  const taken = view?.previous != null && GOAL_AREAS.some((a) => suggested[a] != null && !(a in edited))
  const patch: GoalsPatch = {}
  for (const a of GOAL_AREAS) if (values[a] != null) patch[a] = values[a]
  const has = Object.keys(patch).length > 0
  return (
    <div className="flex flex-col gap-2.5" data-testid="goals-step">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-medium">Cele na {monthName(month)}</span>
        <span className="text-[12px] text-muted">liczba na miesiąc – nic nie blokuje; w „Tydzień” ustawisz je w każdej chwili</span>
      </div>
      <GoalFields month={month} values={values} onChange={(area, v) => setEdited((e) => ({ ...e, [area]: v }))} prefix="goals-step" />
      {taken && (
        <span className="text-[12px] text-muted" data-testid="goals-step-previous">
          Liczby z poprzedniego miesiąca ({monthName(previousMonth(month))}) – zmień je, wyczyść albo zostaw.
        </span>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn btn-accent" disabled={busy || !has} onClick={() => void run(() => trySaveGoals(month, patch))} data-testid="goals-step-save">
          Zapisz
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(() => trySaveGoals(month, { skipped: true }))} data-testid="goals-skip">
          Pomiń
        </button>
      </div>
    </div>
  )
}
