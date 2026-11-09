/**
 * The progress of a month's goals (D356): „x z y” in each area – never a judgement nor a block (D72) – from the same count
 * of the days as the week (`horizonDay`): the days from the first of the month to today (the whole month once it is over).
 * A day gone by counts as its grade counts it – frozen, or preliminary until it freezes (from the ritual's first day: an
 * earlier one never freezes, it stays as written, D320) – and today live (T553, T554).
 *
 * - study: minutes of the blocks „Nauka” and „Oglądanie wykładu” run (the goal in hours);
 * - regeneration: days with the minimum reached (today – once it is reached);
 * - trading discipline: sessions from the plan, over, without an extension; the sessions with one and the sessions
 *   outside the plan are counted beside it (they never take anything away from „x”).
 *
 * The morning's step „Cele na <miesiąc>” (D356, D360): at every morning plan of the month, while its goals are not set and
 * the step was not skipped (on any computer).
 */
import { daysInMonth, hasGoals, type MonthGoals } from '../model/goals'
import type { HorizonDay } from './week'

export interface GoalsProgress {
  month: string
  /** Counted days whose numbers may still change: today (counted live), days from the ritual's first day not frozen yet. */
  preliminary: number
  /** Days whose log cannot be read now (left out), and days read without some computer's log (the numbers may be short). */
  unknown: string[]
  partial: string[]
  study: { min: number; goalMin: number | null }
  regen: { days: number; goal: number | null }
  trading: { clean: number; goal: number | null; extended: number; outsidePlan: number }
}

/** A month's goals for the window: as rd.json holds them, the month before's (to take over), the progress so far. */
export interface GoalsView {
  month: string
  goals: MonthGoals
  /** The month before's goals; null – none. */
  previous: MonthGoals | null
  progress: GoalsProgress
}

/**
 * The progress of `month`'s goals from its days (any order; days of other months and days to come are left out);
 * `ritualFrom` – the ritual's first day (null: none yet – no day gone by will ever freeze; today is preliminary always).
 */
export function goalsProgress(month: string, goals: MonthGoals, days: readonly HorizonDay[], ritualFrom: string | null): GoalsProgress {
  const mine = days.filter((d) => d.date.startsWith(`${month}-`) && d.when !== 'future')
  const read = mine.filter((d) => d.read !== 'unknown')
  const sum = (pick: (d: HorizonDay) => number) => read.reduce((s, d) => s + pick(d), 0)
  return {
    month,
    preliminary: read.filter((d) => d.when === 'today' || (!d.frozen && ritualFrom != null && d.date >= ritualFrom)).length,
    unknown: mine.filter((d) => d.read === 'unknown').map((d) => d.date),
    partial: read.filter((d) => d.read === 'partial').map((d) => d.date),
    study: { min: sum((d) => d.studyMin), goalMin: goals.study == null ? null : goals.study * 60 },
    regen: { days: read.filter((d) => d.regen?.reached === true).length, goal: goals.regen },
    trading: { clean: sum((d) => d.sessions.clean), goal: goals.trading, extended: sum((d) => d.sessions.extended), outsidePlan: sum((d) => d.sessions.outsidePlan) }
  }
}

/**
 * The morning plan shows „Cele na <miesiąc>” (D360) at every morning plan of the month (`goals` – the month of the day's
 * date), while none of its goals is set and the step was not skipped. Its place: after „Strona B tygodnia”, before the
 * questions about symptoms (T555).
 */
export function goalsStepShown(goals: MonthGoals | null | undefined): boolean {
  return !hasGoals(goals) && goals?.skipped !== true
}

/** The dates of `month` the progress counts on `today`: from its first day to today, the whole month once it is over. */
export function goalsDates(month: string, today: string): string[] {
  const out: string[] = []
  const n = daysInMonth(month)
  for (let i = 1; i <= n; i++) {
    const date = `${month}-${String(i).padStart(2, '0')}`
    if (date > today) break
    out.push(date)
  }
  return out
}
