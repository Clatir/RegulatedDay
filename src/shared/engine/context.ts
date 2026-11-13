/**
 * What the engine counts a day from (spec principle 10: one definition of every rule): the snapshot from the log, or –
 * before the leader wrote it (and for days to come) – the one this computer computes from the same files; the plan is
 * the snapshot with your edits. The main process (the leader's tasks) and the main window (the plan and its previews)
 * build it with this one function.
 */
import type { NamingDay } from '../blockName'
import { daySnapshotOf, type AnyEvent, type DaySnapshot } from '../model/events'
import type { DayFile, LectureSeries, Template } from '../model/plan'
import { seriesOfBlock, seriesVersionOn, type SeriesPlan } from '../model/series'
import type { SettingsChange } from '../model/settings'
import { freshSteps } from '../model/steps'
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
  if (logged) return { snapshot: withSourceSteps(withSeriesOccurrences(logged, inp.series, src.date, holidays), inp, src.date), fromLog: true }
  return { snapshot: createDay({ date: src.date, ...inp, dayFile: src.dayFile, holidays, at }), fromLog: false }
}

/**
 * A snapshot of the log written by a version without steps (D440, T791 – a computer not updated yet led at 04:00): its
 * blocks of the template and of the series have no field `steps`, so they take the list of their source – the template's
 * version the day was made from, the series' version of the occurrence's day – none ticked. A snapshot with the field
 * (also an empty list) is as written.
 */
function withSourceSteps(snapshot: DaySnapshot, inp: PlanInputs, date: string): DaySnapshot {
  const lacks = (b: DaySnapshot['blocks'][number]) => (b.origin === 'template' || b.origin === 'series') && b.sourceId != null && !Array.isArray((b as { steps?: unknown }).steps)
  if (!snapshot.blocks.some(lacks)) return snapshot
  const version = inp.templates.find((t) => t.id === snapshot.templateId)?.versions.find((v) => v.from === snapshot.templateFrom)
  const series = inp.series.map((p) => p.series)
  const blocks = snapshot.blocks.map((b) => {
    if (!lacks(b)) return b
    if (b.origin === 'template') return { ...b, steps: freshSteps(version?.blocks.find((x) => x.id === b.sourceId)?.steps) }
    const s = seriesOfBlock(series, b, date)
    return { ...b, steps: freshSteps(s ? seriesVersionOn(s, b.movedFrom ?? date)?.block.steps : []) }
  })
  return { ...snapshot, blocks }
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
