/**
 * What the engine counts a day from (spec principle 10: one definition of every rule): the snapshot from the log, or –
 * before the leader wrote it (and for days to come) – the one this computer computes from the same files; the plan is
 * the snapshot with your edits. The main process (the leader's tasks) and the main window (the plan and its previews)
 * build it with this one function.
 */
import { daySnapshotOf, type AnyEvent, type DaySnapshot } from '../model/events'
import type { DayFile, LectureSeries, Template } from '../model/plan'
import type { SettingsChange } from '../model/settings'
import { addDays } from '../time/zone'
import { createDay, dayPlan, dayWakeMin, nextWakeForBedtime, type HolidayLookup } from './createDay'
import type { DayContext } from './day'

export interface PlanInputs {
  changes: readonly SettingsChange[]
  templates: readonly Template[]
  lectures: readonly LectureSeries[]
}

export interface DaySource {
  date: string
  events: readonly AnyEvent[]
  dayFile: DayFile | null
  /** The next day's file (its wake sets this day's bedtime). */
  nextFile: DayFile | null
}

/** The snapshot of a day: the log's, else computed now (`fromLog` tells which). */
export function snapshotOf(inp: PlanInputs, src: DaySource, holidays: HolidayLookup, at: number | null): { snapshot: DaySnapshot; fromLog: boolean } {
  const logged = daySnapshotOf(src.events)
  if (logged) return { snapshot: logged, fromLog: true }
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
