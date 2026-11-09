/**
 * The three fields of a month's goals (D356): studies in hours, regeneration in days, trading discipline in sessions –
 * whole numbers within `goalRange` (a value out of it is refused with its message under the field, D347), „Wyczyść”
 * takes the goal away (no goal is no number, never a zero). Shared by the top of „Tydzień” and the morning's step „Cele na
 * <miesiąc>”; what a change does is the caller's (the page saves each one, the step keeps them until „Zapisz”).
 */
import { GOAL_AREAS, goalRange, type GoalArea } from '@shared/model/goals'
import { IntegerField } from '../../components/fields'
import { GOAL_HINTS, GOAL_LABELS, GOAL_UNITS } from './weekText'

export type GoalValues = Record<GoalArea, number | null>

export function GoalFields({ month, values, onChange, prefix }: { month: string; values: GoalValues; onChange: (area: GoalArea, value: number | null) => void; prefix: string }) {
  return (
    <div className="flex flex-col gap-2.5" data-testid={`${prefix}-fields`}>
      {GOAL_AREAS.map((area) => {
        const [min, max] = goalRange(area, month)
        const value = values[area]
        return (
          <div key={area} className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <span className="w-[170px] shrink-0 pt-[5px] text-[12.5px]" title={GOAL_HINTS[area]}>
              {GOAL_LABELS[area]}
            </span>
            <IntegerField
              min={min}
              max={max}
              value={value}
              onCommit={(v) => onChange(area, v)}
              shellClassName="w-[84px]"
              errorPlacement="below"
              aria-label={`Cel: ${GOAL_LABELS[area].toLowerCase()} (${GOAL_UNITS[area]})`}
              data-testid={`${prefix}-${area}`}
            />
            <span className="pt-[5px] text-[12px] text-muted">
              {GOAL_UNITS[area]} · {GOAL_HINTS[area]}
            </span>
            {value != null && (
              <button type="button" className="h-[24px] px-1.5 pt-[3px] text-[12px] text-muted hover:text-lamp" onClick={() => onChange(area, null)} data-testid={`${prefix}-${area}-clear`}>
                Wyczyść
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
