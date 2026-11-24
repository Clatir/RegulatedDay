/**
 * What the engine counts a day from (spec principle 10: one definition of every rule): the snapshot from the log, or –
 * before the leader wrote it (and for days to come) – the one this computer computes from the same files; the plan is
 * the snapshot with your edits. The main process (the leader's tasks) and the main window (the plan and its previews)
 * build it with this one function.
 */
import type { NamingDay } from '../blockName'
import { daySnapshotOf, isKnown, type AnyEvent, type DaySnapshot } from '../model/events'
import type { DayFile, LectureSeries, PlanBlock, Template } from '../model/plan'
import { routineCostsOf, type Routine } from '../model/routines'
import { seriesOfBlock, seriesVersionOn, type SeriesPlan } from '../model/series'
import { settingsLackBody, settingsOn, type SettingsChange } from '../model/settings'
import { freshSteps } from '../model/steps'
import { addDays } from '../time/zone'
import { createDay, dayPlan, dayWakeMin, nextWakeForBedtime, snapshotEntries, type HolidayLookup } from './createDay'
import type { DayContext } from './day'
import { planWithBuffers } from './decompress'
import type { DayFacts } from './facts'
import { withSeriesOccurrences } from './series'

export interface PlanInputs {
  changes: readonly SettingsChange[]
  templates: readonly Template[]
  lectures: readonly LectureSeries[]
  /** The series with their last days (D381, `seriesPlans`). */
  series: readonly SeriesPlan[]
  /** The routines (D512: the cost of a routine counts for its blocks – `DayContext.routineCosts`); the snapshot does not read them. */
  routines: readonly Routine[]
  /** The ids of routines whose file cannot be read now and was not read before (T1372: not known – their blocks' starts write no cost). */
  routinesUnknown?: readonly string[]
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
  // A snapshot of an older version without the body (T1532): the body from your dated settings of the day at the instant it was made.
  const logged = daySnapshotOf(src.events, (t) => settingsOn(inp.changes, src.date, t))
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

/** A change of the day's settings (`day.snapshot`) an older version wrote without the body (≤ 1.26, T1532). */
const lacksBody = (e: AnyEvent): boolean => isKnown(e) && e.k === 'day.snapshot' && settingsLackBody(e.settings)

export function dayContextOf(inp: PlanInputs, src: DaySource, holidays: HolidayLookup, at: number): DayContext {
  const { snapshot } = snapshotOf(inp, src, holidays, at)
  const nextDate = addDays(src.date, 1)
  const base = dayPlan(snapshot, src.dayFile)
  const nextWakeMin = nextWakeForBedtime(null, src.nextFile, inp.changes, nextDate)
  const routineCosts = routineCostsOf(inp.routines, inp.routinesUnknown)
  // The buffers of decompression (T2450): off – the very plan of the file.
  const plan = planWithBuffers({ date: src.date, snapshot, plan: base, nextWakeMin, events: src.events, routineCosts, changes: inp.changes, gone: goneOf(src.dayFile), now: at })
  return {
    date: src.date,
    snapshot,
    plan,
    ...(plan !== base ? { basePlan: base } : {}),
    wakeMin: dayWakeMin(snapshot, src.dayFile),
    nextWakeMin,
    events: src.events,
    now: at,
    routineCosts,
    // Only for a change of the day's settings an older version wrote without the body (T1532): the context goes to the helper process
    // as a copy, and the list of changes is no part of a day otherwise.
    ...(src.events.some(lacksBody) ? { changes: inp.changes } : {})
  }
}

/** The ids a day's file cancels or moves to another day. */
const goneOf = (file: DayFile | null): ReadonlySet<string> => new Set([...(file?.cancelled ?? []), ...Object.keys(file?.movedTo ?? {})])

/**
 * The plan of a day after a change of its file's plan (`base` – the plan without the buffers, T2457): the buffers of decompression laid
 * again, by the same rule as `dayContextOf` – the day's context gives the rest (its settings' changes are those its buffers were counted
 * with: `changes` given, else the rd.json of the caller).
 */
export function replanned(ctx: DayContext, base: readonly PlanBlock[], changes: readonly SettingsChange[], file: DayFile | null = null): readonly PlanBlock[] {
  return planWithBuffers({ date: ctx.date, snapshot: ctx.snapshot, plan: base, nextWakeMin: ctx.nextWakeMin, events: ctx.events, routineCosts: ctx.routineCosts, changes, gone: goneOf(file), now: ctx.now })
}

/** What names the day's blocks (`nameById`): its plan, its snapshot's entries, what each start wrote. */
export function namingOf(ctx: Pick<DayContext, 'date' | 'plan' | 'snapshot'>, facts: Pick<DayFacts, 'blocks'>): NamingDay {
  return { plan: ctx.plan, snapshotBlock: snapshotEntries(ctx.snapshot, ctx.date), planned: (id) => facts.blocks.get(id)?.planned }
}
