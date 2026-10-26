/**
 * The block of sleep (spec „Kategorie” – „nie usypiaj komputera”, D184, D211, T290, T303): while a block of a category
 * with the option runs, the computer does not sleep – at a lecture the recording computer you chose (its screen stays on
 * for the whole lecture, D184, D297, also in „Odcinam się”), at a session and the second shift the computer leading at
 * its start, every one with presence in the 30 min before it and every one that leads or has presence during it. The
 * screen is held only by the computer with input in the last 10 min that leads (the newest presence, D211); elsewhere it
 * goes dark by Windows' settings while the system stays awake. „Odcinam się” releases it all but the recording.
 */
import type { DayContext, DayState } from './day'
import { atOf } from './grid'
import { timerNow } from './timer'

const MIN = 60_000
/** Presence this long before a session's start keeps the computer awake (T303). */
export const PRESENCE_BEFORE_MIN = 30
/** The screen only on a computer with input this recent (D211). */
export const SCREEN_INPUT_MIN = 10

export interface PowerNeed {
  system: boolean
  display: boolean
  /** Why, for the log and the helper's request („Regulated Day: sesja NY”). */
  reason: string | null
}

export const NO_POWER: PowerNeed = { system: false, display: false, reason: null }

export interface PowerFacts {
  computer: string
  /** This computer leads now. */
  leads: boolean
  /** This computer's last presence and last input (ms), null: none. */
  lastPresence: number | null
  lastInput: number | null
  now: number
}

/** What this computer must hold now. */
export function powerNeedOf(ctx: DayContext, state: DayState, p: PowerFacts): PowerNeed {
  const t = timerNow(state)
  const disconnected = state.facts.disconnect.some((d) => d.to === Number.POSITIVE_INFINITY)
  let system = false
  let display = false
  const reasons: string[] = []
  for (const tb of [...(t.fg ? [t.fg] : []), ...t.bg]) {
    const b = tb.info
    if (!b.rules.noSleep && !b.secondShift) continue
    const plan = ctx.plan.find((x) => x.id === b.id)
    if (b.rules.kind === 'lecture') {
      // The recording computer only (none chosen: the one leading), the screen on for the whole lecture.
      const recorder = plan?.recorder ?? null
      if (recorder ? recorder === p.computer : p.leads) {
        system = true
        display = true
        reasons.push('nagrywanie wykładu')
      }
      continue
    }
    if (disconnected) continue
    const start = atOf(state.grid, tb.startedAt)
    const present = p.lastPresence != null && p.lastPresence >= start - PRESENCE_BEFORE_MIN * MIN
    if (p.leads || present) {
      system = true
      reasons.push(b.rules.kind === 'session' ? 'sesja' : 'druga zmiana')
      if (p.leads && p.lastInput != null && p.now - p.lastInput <= SCREEN_INPUT_MIN * MIN) display = true
    }
  }
  return { system, display, reason: reasons.length ? `Regulated Day: ${reasons.join(', ')}` : null }
}
