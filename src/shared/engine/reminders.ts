/**
 * The reminders of the morning plan and of the ritual (UX13, D565 P21; spec „Plan poranny”, „Macierz ustawień” –
 * „Przypomnienia”, „Cisza”, „Powiadomienia i dźwięki”). Each is a quiet line of the bar (no dot, D240) and – on the leader,
 * outside „mniej pytań” – one silent Windows notification (`main/widget.ts`). Pure: the day's settings (dated, as in force
 * now), its plan and its log give the same on every computer.
 *
 * - The morning plan: `morningAfterWakeMin` after the wake (the day's own wake too), at the latest `morningBeforeFixedMin`
 *   before the first fixed block of work, never before the wake (then at the wake). 0 after the wake – no reminder; 0 before
 *   the fixed block – no such bound. It holds for `REMINDER_LINE_MIN` while the plan is not done: the boundary not approved
 *   (also by the first work block) and no check-in that day.
 * - The ritual: `ritualBeforeBedMin` before the effective bedtime (0 – none), up to the bedtime (the night's quiet), while
 *   the ritual is due (`ritualDue` – the bar's „Rytuał”: no work runs) and the day is not closed.
 *
 * Both only today, never in a session, the class mode, the night or „Odcinam się” (they wait for their end – the line
 * comes after it while it holds); in „mniej pytań” only the line (`quiet`, spec „Cisza”: the ritual's reminder a quiet icon).
 * „nie dziś” (`question.answer` on the line) closes it for the day.
 */
import { isKnown } from '../model/events'
import { logicalDayOf } from '../time/day'
import { plannedSpan } from './blocks'
import { answered } from './care'
import type { DayContext, DayState } from './day'
import { atOf } from './grid'
import type { Modes } from './modes'
import { ritualDue } from './ritual'

export type ReminderKind = 'morning' | 'ritual'

export interface Reminder {
  kind: ReminderKind
  /** The bar's line (and the line its notification's click opens the panel on). */
  line: string
  /** Its moment (ms). */
  at: number
  /** „mniej pytań”: the line only, no notification. */
  quiet: boolean
}

/** The morning plan's line lasts this long after its moment (as the lines of routines and tasks – 3 h). */
export const REMINDER_LINE_MIN = 180
/** A reminder's notification comes within this long after its moment – never hours late (the app started later, a mode held it). */
export const REMINDER_NOTICE_MIN = 60

const MIN = 60_000

export const reminderLineId = (date: string, kind: ReminderKind): string => `remind:${date}:${kind}`

/** The moment of the morning plan's reminder (an index of the day), null – off. */
export function morningReminderAt(state: DayState): number | null {
  const { morningAfterWakeMin: after, morningBeforeFixedMin: before } = state.settings.reminders
  if (after <= 0) return null
  let at = state.wake + after
  if (before > 0) {
    const byId = new Map(state.blocks.map((b) => [b.id, b]))
    for (const b of state.blocks) {
      if (!b.inPlan || !b.fixed || !b.isWork || state.facts.blocks.get(b.id)?.cancelledAt != null) continue
      const span = plannedSpan(b, byId)
      if (span) at = Math.min(at, span.start - before)
    }
  }
  return Math.max(at, state.wake)
}

/** The moment of the ritual's reminder (an index of the day), null – off. */
export function ritualReminderAt(state: DayState): number | null {
  const before = state.settings.reminders.ritualBeforeBedMin
  return before > 0 ? state.bedtime.effective - before : null
}

/** The morning plan is done: its boundary approved (by you, or by the first work block) or the check-in given. */
export function morningPlanDone(ctx: DayContext, state: DayState): boolean {
  return state.boundary.approved != null || ctx.events.some((e) => isKnown(e) && e.k === 'energy.checkin' && !state.facts.undone.has(e.id))
}

export interface RemindersInput {
  ctx: DayContext
  state: DayState
  now: number
  modes: Modes
  /** The first day of the ritual (D320): none before it. */
  ritualFrom: string | null
}

/** The reminders holding now, the morning plan's first. */
export function remindersDue(i: RemindersInput): Reminder[] {
  const { ctx, state, now, modes } = i
  const date = state.grid.date
  if (date !== logicalDayOf(now) || modes.night || modes.disconnect != null || modes.session || modes.classMode) return []
  const out: Reminder[] = []
  const add = (kind: ReminderKind, idx: number) => {
    const line = reminderLineId(date, kind)
    if (!answered(ctx.events, line)) out.push({ kind, line, at: atOf(state.grid, idx), quiet: modes.fewer })
  }
  const morning = morningReminderAt(state)
  if (morning != null && now >= atOf(state.grid, morning) && now < atOf(state.grid, morning) + REMINDER_LINE_MIN * MIN && !morningPlanDone(ctx, state)) add('morning', morning)
  const ritual = ritualReminderAt(state)
  if (ritual != null && now >= atOf(state.grid, ritual) && now < atOf(state.grid, state.bedtime.effective) && !state.facts.closed && ritualDue(state, date, i.ritualFrom)) add('ritual', ritual)
  return out
}

const clockOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)

/** The words of a reminder: its bar's line, the label of its „open” and its notification. */
export function reminderWords(kind: ReminderKind, state: DayState): { text: string; open: string; title: string; body: string } {
  if (kind === 'morning') return { text: 'Plan poranny czeka', open: 'Otwórz', title: 'Plan poranny', body: 'Pytania o objawy i plan dnia czekają w oknie głównym.' }
  const bed = clockOf(atOf(state.grid, state.bedtime.effective))
  return { text: `Pora snu o ${bed} – rytuał zamknięcia`, open: 'Rytuał', title: 'Rytuał zamknięcia', body: `Pora snu o ${bed} – czas zamknąć dzień.` }
}
