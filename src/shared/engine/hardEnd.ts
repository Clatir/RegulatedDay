/**
 * Is the hard end of projects current now (spec „Cisza”, „Powiadomienia i dźwięki”, D228, D352): it passed, something of
 * the minimum is still missing, and either a project runs in the foreground or the time to explain after a project goes
 * on, unanswered. The bar's line (`engineView`) lasts while it is current. The notification (`main/widget.ts`) takes the
 * same, and besides the message of the minute it passed in (`hardEnd.message`: a project ended in that minute – spec
 * „Twardy koniec projektów”) within an hour of it, plus its own limits (never hours late) and the quiet modes.
 */
import type { DayState } from './day'
import { OPEN } from './facts'
import type { TimerNow } from './timer'

export interface HardEndNow {
  /** The index of the minute it passed in (the line's and the notification's id). */
  passed: number
  /** A project runs in the foreground (else the time to explain after a project goes on). */
  projectRuns: boolean
}

/**
 * The block in the foreground is a project: the category „Projekty” or a block counted as one (D195, D209). A passive one
 * after its planned end too: the spec leaves it out only of the minute the hard end passes in (it does not pass there,
 * `day.ts`), not of the state after it passed.
 */
function projectInFront(state: DayState, t: TimerNow): boolean {
  const fg = t.fg
  return !!fg && (fg.info.isProject || state.asProject.includes(fg.info.id))
}

/** The minute the hard end passed in while something of the minimum is still missing (else nothing to say), or null. */
export function hardEndPassed(state: DayState): number | null {
  const h = state.hardEnd
  return h.passed == null || h.nothingMissing || state.regen.missingMin <= 0 ? null : h.passed
}

/**
 * The pass of the minute the hard end passed in, for the notification only, when it is not current: a project ended in
 * that minute with no time to explain after it (spec „Twardy koniec projektów”: „biegnie albo kończy się blok projektu”).
 * An open or answered time to explain after a project since the pass, or any block in the foreground, takes it away.
 */
export function hardEndMessage(state: DayState, t: TimerNow): number | null {
  const passed = hardEndPassed(state)
  if (passed == null || !state.hardEnd.message || t.fg) return null
  if (state.explains.some((x) => x.kind === 'project' && x.to > passed && (x.to === OPEN || x.answer != null))) return null
  return passed
}

export function hardEndCurrent(state: DayState, t: TimerNow): HardEndNow | null {
  const passed = hardEndPassed(state)
  if (passed == null) return null
  if (t.fg) return projectInFront(state, t) ? { passed, projectRuns: true } : null
  // The time to explain after a project, still waiting for your answer. The message of the minute it passed in (`message`)
  // is not asked: a project that began after it and ended by itself leaves the time to explain just the same.
  if (state.explains.some((x) => x.kind === 'project' && x.to === OPEN && !x.answer)) return { passed, projectRuns: false }
  return null
}
