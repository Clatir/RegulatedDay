/**
 * A day as the week's „Strona B” and the calibration read it: counted once, as its grade counts it (the events the
 * freeze names, as written), with the modules it had – its measure (none for a day without your presence), its samples
 * of time, its evidence of costs. The helper process runs it (two weeks or a calibration period at once).
 */
import { isKnown } from '../model/events'
import { dayEnd } from '../time/day'
import { activityOf } from './activity'
import { costEvidence, timeSamples, type CostEvidence, type TimeSample } from './calibration'
import { computeDay, type DayContext } from './day'
import { countedEvents, isFreeDay } from './freeze'
import { atOf } from './grid'
import { dayMeasure, modulesOfDay, type DayMeasure, type MeasureModules } from './sideB'

export interface DaySummary {
  /** Null: a day without your presence on any computer – nothing measured. */
  measure: DayMeasure | null
  samples: TimeSample[]
  costs: CostEvidence | null
}

/**
 * The day's summary, counting the events `know` names (a day not frozen yet: all of them); `start` – the modules before
 * the day's first change of them (a frozen day's grade has them for the whole day).
 */
export function daySummary(ctx: DayContext, know: Readonly<Record<string, number>>, start: MeasureModules): DaySummary {
  const counted: DayContext = { ...ctx, events: countedEvents(ctx.events, know), now: Math.max(ctx.now, dayEnd(ctx.date)), asWritten: true }
  const state = computeDay(counted)
  const modules = modulesOfDay(counted.events, start)
  const present = counted.events.some((e) => isKnown(e) && e.k === 'presence.first')
  const activity = present ? activityOf(counted.events, state.grid.start, atOf(state.grid, state.grid.length)) : null
  return {
    measure: activity ? dayMeasure(state, counted.events, activity, modules, isFreeDay(state, counted.events)) : null,
    samples: timeSamples(counted, state),
    costs: costEvidence(counted, state, modules.energy)
  }
}
