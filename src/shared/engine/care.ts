/**
 * The small care of the day (spec „Woda”, „Timer” – the break after 90 min and the solitude after contact): the water
 * icon 45 min after the last „wypite” (from the wake to the bedtime; also at a transition between blocks once 30 min
 * have passed – 2/3 of the interval), never in „Odcinam się” or the night's quiet; the break proposed once after 90 min
 * of continuous work in the foreground (work and project blocks one after another, no gap without work over 10 min); the
 * solitude suggested once after more than 30 min of contact with people. Pure: the bar shows them, nothing happens when
 * you ignore them.
 */
import { compareEvents, isKnown, type AnyEvent } from '../model/events'
import type { DayState } from './day'
import { OPEN } from './facts'
import { atOf } from './grid'
import type { TimerNow } from './timer'

const MIN = 60_000
/** A gap without work longer than this breaks the run of work (spec). */
export const WORK_GAP_MIN = 10

export interface CareSettings {
  waterOn: boolean
  waterEveryMin: number
  breakAfterMin: number
  solitudeAfterMin: number
}

/** The last „wypite” of the day (ms), or the wake when none. */
export function lastDrink(events: readonly AnyEvent[], state: DayState): number {
  let last = atOf(state.grid, state.wake)
  for (const e of events) if (isKnown(e) && e.k === 'water.drink') last = Math.max(last, e.at)
  return last
}

/** The water icon is due now (and since when). */
export function waterDue(events: readonly AnyEvent[], state: DayState, t: TimerNow, now: number, s: CareSettings, quiet: { night: boolean; disconnect: boolean }): { due: boolean; since: number | null } {
  if (!s.waterOn || quiet.night || quiet.disconnect) return { due: false, since: null }
  const wake = atOf(state.grid, state.wake)
  const bedtime = atOf(state.grid, state.bedtime.effective)
  if (now < wake || now >= bedtime) return { due: false, since: null }
  const last = lastDrink(events, state)
  const every = s.waterEveryMin * MIN
  if (now - last >= every) return { due: true, since: last + every }
  // At a transition between blocks (nothing in the foreground now) after 2/3 of the interval.
  if (!t.fg && now - last >= (every * 2) / 3) return { due: true, since: now }
  return { due: false, since: null }
}

/**
 * The run of continuous work in the foreground up to now (ms): its start, or null when no work runs now. Work and
 * projects one after another; a gap without work longer than 10 min starts a new run.
 */
export function workRunStart(state: DayState, now: number): number | null {
  const spans: Array<{ from: number; to: number }> = []
  for (const b of state.blocks) {
    if (!(b.isWork || b.isProject) || b.rules.keepsRegen) continue
    const f = state.facts.blocks.get(b.id)
    if (!f) continue
    for (const r of f.runs) if (!r.bg) spans.push({ from: atOf(state.grid, r.from), to: r.to === OPEN ? now : atOf(state.grid, r.to) })
  }
  spans.sort((a, b) => a.from - b.from)
  const last = spans.at(-1)
  if (!last || last.to < now) return null
  let start = last.from
  for (let i = spans.length - 2; i >= 0; i--) {
    if (start - spans[i]!.to > WORK_GAP_MIN * MIN) break
    start = Math.min(start, spans[i]!.from)
  }
  return start
}

/** The suggestion of solitude shows for this long after the contact ended. */
export const SOLITUDE_SHOW_MIN = 15

/**
 * Contact with people that just ended (spec „Po kontakcie z ludźmi dłuższym niż 30 min … widget raz sugeruje chwilę
 * samotności”): the latest block of a category with contact in the foreground, ended within the last 15 min after more
 * than `afterMin` in the foreground – its end (ms), or null.
 */
export function contactEnded(state: DayState, t: TimerNow, now: number, afterMin: number): number | null {
  if (t.fg?.info.rules.contact) return null
  let best: number | null = null
  for (const b of state.blocks) {
    if (!b.rules.contact) continue
    const f = state.facts.blocks.get(b.id)
    if (!f || f.endedAt == null) continue
    const fgMin = f.runs.filter((r) => !r.bg).reduce((s, r) => s + Math.max(0, (r.to === OPEN ? f.endedAt! : r.to) - r.from), 0)
    const end = atOf(state.grid, f.endedAt)
    if (fgMin > afterMin && now - end < SOLITUDE_SHOW_MIN * MIN && now >= end) best = Math.max(best ?? 0, end)
  }
  return best
}

/** An answer or a start recorded for a proposal (it is shown once). */
export function answered(events: readonly AnyEvent[], id: string): boolean {
  return [...events].sort(compareEvents).some((e) => isKnown(e) && e.k === 'question.answer' && e.question === id)
}
