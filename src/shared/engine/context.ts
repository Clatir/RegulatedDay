/**
 * What the engine counts a day from (spec principle 10: one definition of every rule): the snapshot from the log, or –
 * before the leader wrote it (and for days to come) – the one this computer computes from the same files; the plan is
 * the snapshot with your edits. The main process (the leader's tasks) and the main window (the plan and its previews)
 * build it with this one function.
 */
import type { NamingDay } from '../blockName'
import { daySnapshotOf, type AnyEvent, type DaySnapshot } from '../model/events'
import type { DayFile, LectureSeries, Template } from '../model/plan'
import type { SeriesPlan } from '../model/series'
import type { SettingsChange } from '../model/settings'
import { addDays } from '../time/zone'
import { createDay, dayPlan, dayWakeMin, nextWakeForBedtime, snapshotEntries, type HolidayLookup } from './createDay'
import type { DayContext } from './day'
import type { DayFacts } from './facts'
import { withSeriesOccurrences } from './series'

export interface PlanInputs {
  changes: readonly SettingsChange[]
  templates: readonly Template[]
  lectures: readonly LectureSeries[]
  /** The series with their last days (D381, `seriesPlans`). */
  series: readonly SeriesPlan[]
}

export interface DaySource {
  date: string
  events: readonly AnyEvent[]
  dayFile: DayFile | null
  /** The next day's file (its wake sets this day's bedtime). */
  nextFile: DayFile | null
}

/**
 * The snapshot of a day: the log's, else computed now (`fromLog` tells which). A snapshot a version without series wrote
 * gets the day's occurrences laid over it (`withSeriesOccurrences`).
 */
export function snapshotOf(inp: PlanInputs, src: DaySource, holidays: HolidayLookup, at: number | null): { snapshot: DaySnapshot; fromLog: boolean } {
  const logged = daySnapshotOf(src.events)
  if (logged) return { snapshot: withSeriesOccurrences(logged, inp.series, src.date, holidays), fromLog: true }
  return { snapshot: createDay({ date: src.date, ...inp, dayFile: src.dayFile, holidays, at }), fromLog: false }
}

export function dayContextOf(inp: PlanInputs, src: DaySource, holidays: HolidayLookup, at: number): DayContext {
  const { snapshot } = snapshotOf(inp, src, holidays, at)
  const nextDate = addDays(src.date, 1)
  return {
    date: src.date,
    snapshot,
    plan: dayPlan(snapshot, src.dayFile),
    wakeMin: dayWakeMin(snapshot, src.dayFile),
    nextWakeMin: nextWakeForBedtime(null, src.nextFile, inp.changes, nextDate),
    events: src.events,
    now: at
  }
}

/** What names the day's blocks (`nameById`): its plan, its snapshot's entries, what each start wrote. */
export function namingOf(ctx: Pick<DayContext, 'date' | 'plan' | 'snapshot'>, facts: Pick<DayFacts, 'blocks'>): NamingDay {
  return { plan: ctx.plan, snapshotBlock: snapshotEntries(ctx.snapshot, ctx.date), planned: (id) => facts.blocks.get(id)?.planned }
}
