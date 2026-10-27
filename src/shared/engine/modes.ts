/**
 * The quiet modes and the states of the day the widget follows (spec „Cisza”, „Odcinam się”): the session mode (a
 * session block or a second shift of the session category runs, in the foreground or the background, or its planned
 * start came and it waits for its first „Zacznij · Odwołaj”), the class mode (a block of a category with the class mode
 * runs), „mniej pytań” (a state of the day on every computer: from „Mniej pytań” to „Jest lepiej” or 04:00), the
 * night's quiet (from the effective bedtime to the wake) and „Odcinam się” (until „Wracam”, at the latest 04:00).
 * Switching the session or the class mode off on this computer makes the widget behave as usual then.
 */
import { compareEvents, isKnown, type AnyEvent } from '../model/events'
import type { DayState } from './day'
import { OPEN } from './facts'
import { atOf, idxOf, type Grid } from './grid'
import type { TimerNow } from './timer'

export interface Modes {
  session: boolean
  classMode: boolean
  fewer: boolean
  /** „Odcinam się” since this instant (ms), null: not now. */
  disconnect: number | null
  /** The night's quiet now. */
  night: boolean
  /** Any of the quiet modes of the bar (session, class, „mniej pytań”): the bar compact and dimmed. */
  quiet: boolean
}

export interface ModePrefs {
  /** The session mode on this computer (off: the widget behaves as usual in a session). */
  sessionMode: boolean
  classMode: boolean
}

/** „Mniej pytań” from the day's log: on from its start until „Jest lepiej” (the day ends it at 04:00 by itself). */
export function fewerOn(events: readonly AnyEvent[]): boolean {
  let on = false
  for (const e of [...events].sort(compareEvents)) {
    if (!isKnown(e)) continue
    if (e.k === 'fewer.start') on = true
    else if (e.k === 'fewer.end') on = false
  }
  return on
}

/** The stretches of „mniej pytań” in the day (indices, [from, to)); one still on lasts to the day's end. */
export function fewerSpans(events: readonly AnyEvent[], grid: Grid): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = []
  let from: number | null = null
  for (const e of [...events].sort(compareEvents)) {
    if (!isKnown(e)) continue
    if (e.k === 'fewer.start' && from == null) from = idxOf(grid, e.at)
    else if (e.k === 'fewer.end' && from != null) {
      out.push({ from, to: Math.max(from, idxOf(grid, e.at)) })
      from = null
    }
  }
  if (from != null) out.push({ from, to: OPEN })
  return out
}

export function modesOf(state: DayState, t: TimerNow, events: readonly AnyEvent[], now: number, prefs: ModePrefs = { sessionMode: true, classMode: true }): Modes {
  const running = [...(t.fg ? [t.fg] : []), ...t.bg]
  const sessionRuns = running.some((x) => x.info.rules.kind === 'session')
  const sessionWaits = t.waiting.some((b) => b.rules.kind === 'session')
  const session = prefs.sessionMode && (sessionRuns || sessionWaits)
  const classMode = prefs.classMode && running.some((x) => x.info.rules.classMode)
  const fewer = fewerOn(events)
  const open = state.facts.disconnect.find((d) => d.to === OPEN)
  const disconnect = open ? atOf(state.grid, open.from) : null
  const night = now >= atOf(state.grid, state.bedtime.effective) || now < atOf(state.grid, state.wake)
  return { session, classMode, fewer, disconnect, night, quiet: session || classMode || fewer }
}
