/**
 * The states of a day and its freeze (spec „Ocena dnia”): open → graded for now („wstępnie oceniony”, the day is over or
 * closed) → frozen. The window of corrections lasts 24 h from the opening of the day after its end (the first presence
 * on any computer that next day – a use or the main window), at most 72 h from the day's end. Only the leader freezes,
 * settled, with rules not older than the newest without a crash it sees, and only when every computer that wrote to the
 * folder in the last 7 days has a presence newer than the day's end (or a clean close), names the last event it wrote for
 * the day and that event is visible in its log, and the day's files are quiet; a computer last seen before the day began
 * is waited for at most 24 h after the day's end. After 72 h it freezes without waiting and says whose records were
 * missing. The grade counts the events the freeze names (`know`); later ones stay „poza oceną”. A day without presence
 * nobody answered freezes as free (not a stationary „zjazd”).
 */
import { compareEvents, isKnown, type AnyEvent, type CloseHow } from '../model/events'
import type { Presence } from '../sync/presence'
import { dayEnd, dayStart } from '../time/day'
import { computeDay, type DayContext } from './day'
import type { DayFacts } from './facts'
import { dayOutcome, type BoundaryOutcome } from './outcome'

const HOUR = 3_600_000
/** The window of corrections after the opening of the day after it. */
export const CORRECTION_H = 24
/** The latest a day waits for its freeze after its end. */
export const FREEZE_MAX_H = 72
/** A computer last seen before the day began is waited for at most this long after the day's end. */
export const STALE_WAIT_H = 24
/** The computers that wrote to the folder in this many days are waited for. */
export const WRITERS_DAYS = 7

export type DayStage = 'open' | 'graded' | 'frozen'

/** The stage of a day now (spec „Dzień przechodzi przez stany: otwarty, wstępnie oceniony, zamrożony”). */
export function dayStage(date: string, facts: Pick<DayFacts, 'closed' | 'frozen'>, now: number): DayStage {
  if (facts.frozen) return 'frozen'
  return facts.closed || now >= dayEnd(date) ? 'graded' : 'open'
}

/** The end of the window of corrections (ms): 24 h from the day's opening after its end, at most 72 h after its end. */
export function correctionEnd(date: string, openedAt: number | null): number {
  const latest = dayEnd(date) + FREEZE_MAX_H * HOUR
  return openedAt == null ? latest : Math.min(Math.max(openedAt, dayEnd(date)) + CORRECTION_H * HOUR, latest)
}

/** The opening of the day after `date` (its first presence on any computer, ms), from that day's events; null: not yet. */
export function openedAtOf(nextDayEvents: readonly AnyEvent[]): number | null {
  let first: number | null = null
  for (const e of nextDayEvents) if (isKnown(e) && e.k === 'presence.first') first = first == null ? e.at : Math.min(first, e.at)
  return first
}

export interface FreezeComputer {
  id: string
  /** This computer (its own records are always in). */
  self: boolean
  /** Its presence as this computer sees it (null: none seen). */
  presence: Presence | null
  /** The last event of the day visible in its log (−1: none). */
  visibleLast: number
}

export interface FreezeInput {
  date: string
  /** ms. */
  now: number
  /** This computer leads, is settled, and its rules are not older than the newest without a crash it sees. */
  mayFreeze: boolean
  /** The opening of the day after it (`openedAtOf`), ms or null. */
  openedAt: number | null
  /** The computers that wrote to the folder in the last 7 days. */
  computers: readonly FreezeComputer[]
  /** The day's files have no conflict copies and have not changed for a minute since they were scanned. */
  filesQuiet: boolean
}

export type FreezeDecision = { freeze: false; why: string } | { freeze: true; how: 'ready' | 'timeout'; missing: string[] }

/** Whose records the day still waits for (spec conditions), as this computer sees them. */
function waitingFor(inp: FreezeInput): string[] {
  const end = dayEnd(inp.date)
  const start = dayStart(inp.date)
  const out: string[] = []
  for (const c of inp.computers) {
    if (c.self) continue
    const p = c.presence
    if (!p) {
      out.push(c.id)
      continue
    }
    // Last seen before the day began: waited for at most 24 h after its end.
    const stale = (p.lastPresence ?? 0) < start && (p.lastUse ?? 0) < start
    if (stale && inp.now >= end + STALE_WAIT_H * HOUR) continue
    const after = p.writtenAt > end || p.state === 'closed'
    const named = p.lastEvents[inp.date] ?? -1
    if (!after || c.visibleLast < named) out.push(c.id)
  }
  return out
}

/** Whether the leader freezes the day now. */
export function freezeDecision(inp: FreezeInput): FreezeDecision {
  if (!inp.mayFreeze) return { freeze: false, why: 'zamraża tylko prowadzący, ustalony, z najnowszymi regułami' }
  if (inp.now < correctionEnd(inp.date, inp.openedAt)) return { freeze: false, why: 'trwa okno korekty' }
  const waiting = waitingFor(inp)
  if (inp.now >= dayEnd(inp.date) + FREEZE_MAX_H * HOUR) return { freeze: true, how: 'timeout', missing: waiting }
  if (waiting.length) return { freeze: false, why: `czeka na zapisy: ${waiting.join(', ')}` }
  if (!inp.filesQuiet) return { freeze: false, why: 'pliki dnia jeszcze się zmieniają albo mają kopie konfliktowe' }
  return { freeze: true, how: 'ready', missing: [] }
}

/** What the freeze stores of a day (spec: the grade with the rules version – the game counts from it, E7). */
export interface DayGrade {
  boundary: BoundaryOutcome
  extensionMin: number
  endConfirmed: boolean
  explainAfterBoundaryMin: number
  regen: { towardMin: number; requiredMin: number; reached: boolean; counts: boolean }
  projects: { min: number; limitMin: number }
  dayType: string
  closed: CloseHow | null
  /** A free day: of the type „wolne”, closed „Wolne”, or without presence and not answered (not a stationary „zjazd”). */
  free: boolean
}

/** The last event of every computer in the events (−1 when none): what a freeze counts. */
export function lastEventsOf(events: readonly AnyEvent[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of events) out[e.c] = Math.max(out[e.c] ?? -1, e.n)
  return out
}

/** The events a freeze counts: of each computer up to its last counted one. */
export function countedEvents(events: readonly AnyEvent[], know: Readonly<Record<string, number>>): AnyEvent[] {
  return events.filter((e) => e.n <= (know[e.c] ?? -1))
}

/** Events that came after the freeze („poza oceną”, spec): kept, never changing the grade. */
export function outsideGrade(events: readonly AnyEvent[], know: Readonly<Record<string, number>>): AnyEvent[] {
  return events.filter((e) => e.n > (know[e.c] ?? -1)).sort(compareEvents)
}

/** The grade of a day as it would freeze (as written, D265), counting the events `know` names. */
export function gradeOf(ctx: DayContext, know: Readonly<Record<string, number>>): DayGrade {
  const events = countedEvents(ctx.events, know)
  const state = computeDay({ ...ctx, events, now: Math.max(ctx.now, dayEnd(ctx.date)), asWritten: true })
  const o = dayOutcome(state)
  const closed = state.facts.closed?.how ?? null
  const presence = events.some((e) => isKnown(e) && e.k === 'presence.first')
  const free = state.dayType === 'wolne' || closed === 'free' || (!presence && closed == null && state.dayType !== 'zjazd-stacjonarny')
  return { boundary: o.boundary, extensionMin: o.extensionMin, endConfirmed: o.endConfirmed, explainAfterBoundaryMin: o.explainAfterBoundaryMin, regen: o.regen, projects: o.projects, dayType: state.dayType, closed, free }
}
