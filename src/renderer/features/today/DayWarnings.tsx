/**
 * The day's warnings: work past the maximum, the minimum of regeneration, the budget (`morningWarnings`, with the morning plan's words –
 * the hour of the maximum, the numbers of the budget, what may be done) and the forecast of energy at the reserve (`EnergyState.warnings`).
 * D563 P10: they stand in one place at a time – the side panel of „Dziś” and, when a block's panel is open instead of it, that panel
 * (D3) – never over the axis and never in the morning plan. Only words: nothing is blocked (D72).
 */
import { morningWarnings, type MorningWarning } from '@shared/engine/morning'
import { atOf } from '@shared/engine/grid'
import { durationLabel, logicalClock } from '@shared/format'
import { logicalMinuteOf } from '@shared/time/day'
import type { DayModel } from '../../store/day'

/** What may be done about it – only for a day that is not gone by (on a day gone by the words are neutral). */
const ADVICE_MAX = ' Możesz przenieść blok na inny dzień albo dodać wyjątek granicy – albo zostawić plan; minuty po maksimum będą przekroczeniem.'

const WORDS: Record<MorningWarning, (m: DayModel, lm: (i: number) => string, past: boolean) => string> = {
  max: (m, lm, past) => `Praca kończy się po maksimum (${lm(m.state.boundary.max)}).${past ? '' : ADVICE_MAX}`,
  // One kind of the engine, two causes: the minimum does not fit before the bedtime at all, or the hard end of projects falls before the end of work.
  minimum: (m) => (m.state.hardEnd.unreachable ? 'Minimum regeneracji nie mieści się przed porą snu.' : 'Twardy koniec projektów wypada przed końcem pracy.'),
  budget: (m) => `Plan przekracza budżet pracy (${durationLabel(m.state.budgetUsedMin + m.state.budget.forecastMin)} z ${durationLabel(m.state.budget.limitMin)}) – to tylko ostrzeżenie.`
}

/** The warnings of the day in words, the engine's order (the plan's three, then the energy's); `past` – a day gone by: no advice. */
export function dayWarningTexts(model: Pick<DayModel, 'date' | 'state' | 'energy'>, past = false): string[] {
  const m = model as DayModel
  const lm = (idx: number) => logicalClock(logicalMinuteOf(m.date, atOf(m.state.grid, idx)))
  const energy = m.energy.warnings.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  return [...morningWarnings(m.state).map((w) => WORDS[w](m, lm, past)), ...energy]
}

export function DayWarnings({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 rounded border border-rose/40 bg-rose-soft px-2 py-1.5 text-[12.5px]" data-testid="day-warnings">
      {warnings.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  )
}
