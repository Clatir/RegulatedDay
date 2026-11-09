/**
 * „Cele na <miesiąc>” – the step of the morning plan after „Strona B tygodnia” and before the questions about symptoms
 * (D356, D360): at every morning plan of the month while none of its goals is set and the step was not skipped. The numbers
 * start as the month before's (from the window's own data, clamped to this month's range) – change, clear or take them as
 * they are; „Zapisz” keeps them, „Pomiń” closes the step here at once and hides it for the month on every computer. The goals
 * can be set on „Tydzień” at any moment; nothing is blocked by them (D72) – a save that fails leaves „Pomiń” beside it.
 */
import { useState } from 'react'
import { previousMonth, type GoalArea } from '@shared/model/goals'
import { useBusy } from '../../lib/busy'
import { trySaveGoals, useData } from '../../store/data'
import { closeGoals, toast } from '../../store/ui'
import { GoalFields } from '../week/GoalFields'
import { monthName } from '../week/weekText'
import { saveGoalsStep, skipGoals, stepPatch, stepValues, suggestedGoalsOf, type StepEdits } from './goalsStepLogic'

export function GoalsStep({ month }: { month: string }) {
  // The month before's numbers come from the window's own data at once (no reading of the progress, which counts the whole month).
  const goals = useData((s) => s.rd.goals)
  const [edits, setEdits] = useState<StepEdits | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, run] = useBusy()
  const suggested = suggestedGoalsOf(month, goals)
  const values = stepValues(month, goals, edits)
  const taken = (Object.keys(suggested) as GoalArea[]).some((a) => suggested[a] != null && !(edits?.month === month && a in edits.values))
  const has = Object.keys(stepPatch(values)).length > 0
  const change = (area: GoalArea, v: number | null) => {
    setFailed(false)
    setEdits((e) => ({ month, values: { ...(e?.month === month ? e.values : {}), [area]: v } }))
  }
  return (
    <div className="flex flex-col gap-2.5" data-testid="goals-step">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-medium">Cele na {monthName(month)}</span>
        <span className="text-[12px] text-muted">liczba na miesiąc – nic nie blokuje; w „Tydzień” ustawisz je w każdej chwili</span>
      </div>
      <GoalFields month={month} values={values} onChange={change} prefix="goals-step" />
      {taken && (
        <span className="text-[12px] text-muted" data-testid="goals-step-previous">
          Liczby z poprzedniego miesiąca ({monthName(previousMonth(month))}) – zmień je, wyczyść albo zostaw.
        </span>
      )}
      {failed && (
        <span className="text-[12px] text-rose" role="alert" data-testid="goals-step-error">
          Nie zapisano celów – spróbuj jeszcze raz albo pomiń krok.
        </span>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-accent"
          disabled={busy || !has}
          onClick={() => void run(async () => setFailed(!(await saveGoalsStep(month, values, { save: trySaveGoals }))))}
          data-testid="goals-step-save"
        >
          Zapisz
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(() => skipGoals(month, { save: trySaveGoals, close: closeGoals, notify: (t) => toast(t, 'error', 8000) }))} data-testid="goals-skip">
          Pomiń
        </button>
      </div>
    </div>
  )
}
