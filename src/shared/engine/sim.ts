/**
 * Drafts of the timer as log events laid after every event of a day, never written: what the ritual's answers would
 * change (`ritual.ts`), the ends of blocks the app's close interrupted as the bar shows them before the leader writes them
 * (D345, `folder.ts`). The logical clock after every event of the day; the computer and its numbers given (a simulation
 * – `~sim`); a draft's own id (a derived one) stays.
 */
import { RULES_VERSION, type AnyEvent } from '../model/events'
import type { DayContext } from './day'
import type { TimerDraft } from './timer'

export function simEvents(ctx: Pick<DayContext, 'date' | 'events'>, drafts: readonly TimerDraft[], at: number, by: { c: string; n: number } = { c: '~sim', n: 0 }): AnyEvent[] {
  let l = at
  for (const e of ctx.events) l = Math.max(l, e.l)
  return drafts.map((d, i) => ({ id: `sim-ritual-${i}`, c: by.c, n: by.n + i, t: at, l: l + 1 + i, v: RULES_VERSION, day: ctx.date, dom: 'timer', ...d }) as unknown as AnyEvent)
}
