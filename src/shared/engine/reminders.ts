/**
 * The reminders of the morning plan and of the ritual (UX13, D565 P21; spec „Plan poranny”, „Macierz ustawień” –
 * „Przypomnienia”, „Cisza”, „Powiadomienia i dźwięki”). Each is a quiet line of the bar (no dot, D240) and – on the leader,
 * outside „mniej pytań” – one silent Windows notification (`main/widget.ts`). Pure: the day's settings (dated, as in force
 * now), its plan and its log give the same on every computer.
 *
 * - The morning plan: `morningAfterWakeMin` after the wake (the day's own wake too), at the latest `morningBeforeFixedMin`
 *   before the first fixed block of work, never before the wake (then at the wake). 0 after the wake – no reminder; 0 before
 *   the fixed block – no such bound. It holds for `REMINDER_LINE_MIN` while the plan is still to do (`morningToDo`): a boundary
 *   proposed and not approved (an approval – also by the first work block – closes it); in a day with no boundary to approve,
 *   the check-in – the energy module on, no check-in that day and no „Pomiń” (`checkinSkipId`, written by the window).
 * - The ritual: `ritualBeforeBedMin` before the effective bedtime (0 – none), up to the bedtime (the night's quiet), while
 *   the ritual is due (`ritualDue` – the bar's „Rytuał”: no work runs) and the day is not closed.
 *
 * Both only today, never in the night, „Odcinam się”, a session or classes – the last two by the day's facts (a session block
 * runs or waits for „Zacznij”, a block of the class mode or the commute runs), whatever this computer's modes: the reminder
 * is the day's, the same on every computer. They wait for the end – the line comes after it while it holds. In „mniej pytań”
 * only the line (`quiet`, spec „Cisza”: the ritual's reminder a quiet icon). „nie dziś” (`question.answer` on the line) closes
 * it for the day.
 */
import { isKnown } from '../model/events'
import { logicalDayOf } from '../time/day'
import { plannedSpan } from './blocks'
import { answered } from './care'
import type { DayContext, DayState } from './day'
import { atOf } from './grid'
import type { Modes } from './modes'
import { ritualDue } from './ritual'
import { timerNow, type TimerNow } from './timer'

export type ReminderKind = 'morning' | 'ritual'

export interface Reminder {
  kind: ReminderKind
  /** The bar's line (and the line its notification's click opens the panel on). */
  line: string
  /** Its moment (ms). */
  at: number
  /** „mniej pytań”: the line only, no notification. */
  quiet: boolean
  /** The morning plan's reminder is of the check-in alone (a day with no boundary to approve – its words name the questions about symptoms); false for the ritual. */
  checkin: boolean
}

/** The morning plan's line lasts this long after its moment (as the lines of routines and tasks – 3 h). */
export const REMINDER_LINE_MIN = 180
/** A reminder's notification comes within this long after its moment – never hours late (the app started later, a mode held it). */
export const REMINDER_NOTICE_MIN = 60

const MIN = 60_000

export const reminderLineId = (date: string, kind: ReminderKind): string => `remind:${date}:${kind}`

/**
 * „Pomiń” of the morning's check-in (the window writes it as `question.answer` through the timer's `mark`): the step counts as
 * done for the reminder on every computer. The check-in card itself keeps its own skip in the window's state (D563 B5).
 */
export const checkinSkipId = (date: string): string => `checkinSkip:${date}`

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

/**
 * What of the morning plan is still to do – one thing, as the card's „do zrobienia / zatwierdzony” says it: the boundary proposed
 * and not approved (an approval – yours or the first work block's – closes the plan); only a day with no boundary to approve has
 * its check-in to do (the energy module on, no check-in, no „Pomiń”). Null – nothing.
 */
export function morningToDo(ctx: DayContext, state: DayState, energyOn: boolean): 'approve' | 'checkin' | null {
  if (state.boundary.approved != null) return null
  if (state.boundary.proposal != null) return 'approve'
  const checkedIn = ctx.events.some((e) => isKnown(e) && e.k === 'energy.checkin' && !state.facts.undone.has(e.id))
  return energyOn && !checkedIn && !answered(ctx.events, checkinSkipId(state.grid.date)) ? 'checkin' : null
}

/** A session or classes now by the day's facts (spec „Cisza”; as the notifications' `inClass`), not this computer's modes. */
function sessionOrClass(t: TimerNow): boolean {
  const running = [...(t.fg ? [t.fg] : []), ...t.bg]
  return running.some((x) => x.info.rules.kind === 'session' || x.info.rules.classMode || x.info.rules.kind === 'commute') || t.waiting.some((b) => b.rules.kind === 'session')
}

export interface RemindersInput {
  ctx: DayContext
  state: DayState
  now: number
  /** The night, „Odcinam się” and „mniej pytań” of the day (`modesOf`). */
  modes: Modes
  /** The first day of the ritual (D320): none before it. */
  ritualFrom: string | null
  /** The energy module: off – no check-in to do. */
  energyOn: boolean
  /** `timerNow` of this state, when the caller has it. */
  timer?: TimerNow
}

/** The reminders holding now, the morning plan's first. */
export function remindersDue(i: RemindersInput): Reminder[] {
  const { ctx, state, now, modes } = i
  const date = state.grid.date
  if (date !== logicalDayOf(now) || modes.night || modes.disconnect != null || sessionOrClass(i.timer ?? timerNow(state))) return []
  const out: Reminder[] = []
  const add = (kind: ReminderKind, idx: number, checkin: boolean) => {
    const line = reminderLineId(date, kind)
    if (!answered(ctx.events, line)) out.push({ kind, line, at: atOf(state.grid, idx), quiet: modes.fewer, checkin })
  }
  const morning = morningReminderAt(state)
  if (morning != null && now >= atOf(state.grid, morning) && now < atOf(state.grid, morning) + REMINDER_LINE_MIN * MIN) {
    const todo = morningToDo(ctx, state, i.energyOn)
    if (todo) add('morning', morning, todo === 'checkin')
  }
  const ritual = ritualReminderAt(state)
  if (ritual != null && now >= atOf(state.grid, ritual) && now < atOf(state.grid, state.bedtime.effective) && !state.facts.closed && ritualDue(state, date, i.ritualFrom)) add('ritual', ritual, false)
  return out
}

const clockOf = (ms: number) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms)

/** The words of a reminder: its bar's line, the label of its „open” and its notification. */
export function reminderWords(r: Pick<Reminder, 'kind' | 'checkin'>, state: DayState): { text: string; open: string; title: string; body: string } {
  if (r.kind === 'morning') return { text: 'Plan poranny czeka', open: 'Otwórz', title: 'Plan poranny', body: r.checkin ? 'Pytania o objawy czekają w oknie głównym.' : 'Plan dnia czeka w oknie głównym.' }
  const bed = clockOf(atOf(state.grid, state.bedtime.effective))
  return { text: `Pora snu o ${bed} – rytuał zamknięcia`, open: 'Rytuał', title: 'Rytuał zamknięcia', body: `Pora snu o ${bed} – czas zamknąć dzień.` }
}
