/**
 * The month's goals at the top of „Tydzień” (D356, D360): the progress „x z y” in each of three areas – no grade, no
 * block (D72) – with the counters of the trading discipline beside it, and the goals set here at any moment. A number
 * saves when you leave its field (`trySaveGoals`, one change at a time); „Wyczyść” takes the goal away.
 */
import { useState } from 'react'
import { hasGoals, NO_GOALS, type GoalArea } from '@shared/model/goals'
import { trySaveGoals, useData } from '../../store/data'
import { useGoalsView } from '../../store/horizon'
import { cx } from '../../components/ui'
import { GoalFields, type GoalValues } from './GoalFields'
import { GOAL_HINTS, GOAL_LABELS, goalRows, monthLabel, progressNotes } from './weekText'

export function GoalsPanel({ month }: { month: string }) {
  const { view, failed } = useGoalsView(month)
  const goals = useData((s) => s.rd.goals[month]) ?? NO_GOALS
  const [editing, setEditing] = useState(false)
  const set = (area: GoalArea, value: number | null) => void trySaveGoals(month, { [area]: value })
  const values: GoalValues = { study: goals.study, regen: goals.regen, trading: goals.trading }
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line bg-panel px-4 py-3" data-testid="goals-panel" data-month={month}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium" data-testid="goals-title">
          Cele na {monthLabel(month)}
        </span>
        {view &&
          hasGoals(goals) &&
          progressNotes(view.progress).map((n) => (
            <span key={n.text} className="text-[12px] text-muted" title={n.title} data-testid="goals-note">
              {n.text}
            </span>
          ))}
        <span className="flex-1" />
        <button type="button" className="btn h-[26px]" onClick={() => setEditing(!editing)} aria-pressed={editing} data-testid="goals-edit">
          {editing ? 'Gotowe' : hasGoals(goals) ? 'Zmień cele' : 'Ustaw cele'}
        </button>
      </div>
      {editing ? (
        <GoalFields month={month} values={values} onChange={set} prefix="goal-set" />
      ) : !hasGoals(goals) ? (
        <span className="text-[12.5px] text-muted" data-testid="goals-none">
          Nie ustawiłeś celów na ten miesiąc. Cel to liczba na miesiąc – aplikacja pokazuje tylko, ile już jest; nic nie blokuje.
        </span>
      ) : !view ? (
        <span className="text-[12.5px] text-muted">{failed ? 'Nie da się teraz policzyć postępu celów.' : 'Liczę postęp…'}</span>
      ) : (
        <div className="grid gap-x-6 gap-y-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          {goalRows(view.progress).map((r) => (
            <div key={r.area} className="flex min-w-0 flex-col" data-testid={`goal-${r.area}`} title={GOAL_HINTS[r.area]}>
              <span className="text-[11.5px] text-muted">{GOAL_LABELS[r.area]}</span>
              <span className={cx('num text-[14px]', r.text == null && 'text-muted')} data-testid={`goal-${r.area}-text`}>
                {r.text ?? 'bez celu'}
              </span>
              {r.counters.length > 0 && r.text != null && (
                <span className="text-[11.5px] text-muted" data-testid={`goal-${r.area}-counters`}>
                  {r.counters.join(' · ')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
