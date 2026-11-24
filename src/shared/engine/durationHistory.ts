/**
 * „Długość z historii” (N6, D569, D625; part of E9 – time only, the costs wait for K): how long the blocks of a subcategory really
 * ran on the days gone by. A sample is a block you finished (`BlockFact.finished`, the ✓ of D484, by an end of yours – „Skończyłem”,
 * „Dalej”, „Koniec pracy”, its last step, an answer; T2919): never one still running, parked or cancelled (before or after its start), ended
 * by an absence, the close of the app or idleness, ended by the app at its planned end without your reaction (an end with `autoRule`: a
 * fixed block, a session, a commute „według planu”, a block of a chain away from the computer, one behind in a group – its length is the
 * plan's), nor one the ritual said „odbył się” (a start `how: 'plan'`), nor a buffer of decompression (its length is the settings', T2913).
 * Its minutes = the minutes it ran (`ranMinutes`: from the start to the end without the pauses, a request inside it counted as the pause
 * it is), by the subcategory its start wrote. Only the log of the day (`foldFacts`) – no plan, no settings, no engine of the day:
 * cheap enough for the main process. Pure.
 */
import { compareEvents, isKnown, type AnyEvent, type LogEvent } from '../model/events'
import { MINUTE } from '../time/zone'
import { REQUEST_CATEGORY } from '../model/categories'
import { foldFacts, ranMinutes } from './facts'
import { gridOf } from './grid'

/** How many days back from today (today not in it) the history looks. */
export const DURATION_HISTORY_DAYS = 90

/** One block finished on a day gone by. Plain data (it travels to the window). */
export interface DurationSample {
  category: string
  minutes: number
  /** A block of requests whose start named exactly one request: the measure of one request's „Szacunek”. */
  oneRequest?: true
}

/**
 * The samples of the window, as the window asks for them: the minutes by subcategory (in the order of the days) and the blocks of
 * one request apart. `from`–`to` – the first and the last day looked at (`to` – the day before the logical day it was counted on);
 * `days` – how many of them were read now, `unreadable` – how many could not be read now (never read as empty), `missing` – how many of
 * those had no blocks counted before either (the others come from the memory of the main process, T2930, T2936).
 */
export interface DurationHistory {
  /** The data folder it was counted for (the main process says it, T2931): the window keeps no other folder's. */
  folder?: string
  from: string
  to: string
  days: number
  unreadable: number
  missing: number
  byCategory: Record<string, number[]>
  oneRequest: number[]
}

/** The blocks finished on one day (its whole log: a correction made after the freeze is the better measure – T2905). */
export function blockDurations(date: string, events: readonly AnyEvent[]): DurationSample[] {
  const facts = foldFacts(gridOf(date), events)
  // The start each block's facts stand on: the first one not undone (as `blockEvidence` reads it).
  const starts = new Map<string, Extract<LogEvent, { k: 'block.start' }>>()
  for (const e of events) {
    if (!isKnown(e) || e.k !== 'block.start' || facts.undone.has(e.id)) continue
    const was = starts.get(e.block)
    if (!was || compareEvents(e, was) < 0) starts.set(e.block, e)
  }
  const ends = new Map<string, Extract<LogEvent, { k: 'block.end' }>>()
  // An end you gave afterwards (`block.fix` with the end – „Skończył się o …”): a measure, whatever wrote the end it corrects (T2936).
  const endFixed = new Set<string>()
  for (const e of events) {
    if (!isKnown(e) || facts.undone.has(e.id)) continue
    if (e.k === 'block.end') ends.set(e.id, e)
    else if (e.k === 'block.fix' && e.end != null) endFixed.add(e.block)
  }
  const out: DurationSample[] = []
  for (const f of facts.blocks.values()) {
    if (!f.finished || f.startedAt == null || f.endedAt == null || !f.planned) continue
    const end = f.endId ? ends.get(f.endId) : undefined
    if (end && !endFixed.has(f.id)) {
      // The app ended it itself (an automatic action – `autoRule`): at the planned end, no measure of the time (T2919).
      if (end.autoRule != null) continue
      // A fixed block clicked after its planned end: the click is cut to that end (`endInstant` – an end written a minute or more
      // after its instant), the plan's length (T2935).
      if (f.planned.fixed && typeof end.fin === 'boolean' && end.t - end.at >= MINUTE) continue
    }
    // „odbył się” of the ritual – the plan's times; a buffer of decompression (D386, T2913) – a length the plan set: no measure.
    if (starts.get(f.id)?.how === 'plan' || f.planned.decompress) continue
    const minutes = ranMinutes(f, f.endedAt)
    if (minutes <= 0) continue
    const sample: DurationSample = { category: f.planned.categoryId, minutes }
    if (f.planned.categoryId === REQUEST_CATEGORY && f.planned.requests?.length === 1) sample.oneRequest = true
    out.push(sample)
  }
  return out
}

/** The samples of the days put together (the days in their order) – the days read now and those remembered. */
export function durationHistoryOf(from: string, to: string, days: ReadonlyArray<readonly DurationSample[]>, counts: { read: number; unreadable: number; missing: number }): DurationHistory {
  const byCategory: Record<string, number[]> = {}
  const oneRequest: number[] = []
  for (const day of days)
    for (const s of day) {
      ;(byCategory[s.category] ??= []).push(s.minutes)
      if (s.oneRequest) oneRequest.push(s.minutes)
    }
  return { from, to, days: counts.read, unreadable: counts.unreadable, missing: counts.missing, byCategory, oneRequest }
}
