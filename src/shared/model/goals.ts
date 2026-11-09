/**
 * The goals of a month (D356, spec „Etap 2” – „Horyzont”): a number for each of three areas – study (hours of the blocks
 * „Nauka” and „Oglądanie wykładu”), regeneration (days with the minimum reached), trading discipline (sessions without an
 * extension, outside no plan) – and whether the morning's step „Cele na <miesiąc>” was skipped. No goal is no number
 * (never a zero), and a goal never blocks anything (D72).
 *
 * They live in rd.json as `goals: { "RRRR-MM": { study, regen, trading, skipped } }` (T552): every number its own field,
 * so two computers setting different months or areas merge without a question, the history of rd.json keeps them, and an
 * older version – which reads only the fields it knows – keeps the field as it is. Read tolerantly: a value out of its
 * range or of another kind is no goal.
 */
import { valueAt } from '../data/merge'
import { addDays, isIsoDate } from '../time/zone'

export const GOAL_AREAS = ['study', 'regen', 'trading'] as const
export type GoalArea = (typeof GOAL_AREAS)[number]

export interface MonthGoals {
  /** Hours of study in the month. */
  study: number | null
  /** Days with the minimum of regeneration reached. */
  regen: number | null
  /** Trading sessions from the plan without an extension. */
  trading: number | null
  /** The morning's step „Cele na <miesiąc>” was skipped for this month (on any computer). */
  skipped: boolean
}

export const NO_GOALS: MonthGoals = Object.freeze({ study: null, regen: null, trading: null, skipped: false }) as MonthGoals

/** Whole numbers only; the regeneration's top is the month's number of days. */
const LIMITS: Record<Exclude<GoalArea, 'regen'>, readonly [number, number]> = { study: [1, 300], trading: [1, 200] }

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 'RRRR-MM' of a real month. */
export const isMonth = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && isIsoDate(`${v}-01`)

/** The month of a date ('RRRR-MM'). */
export const monthOfDate = (date: string): string => date.slice(0, 7)

/** The number of days of a month (28–31). */
export function daysInMonth(month: string): number {
  let n = 28
  while (n < 31 && addDays(`${month}-01`, n).startsWith(month)) n++
  return n
}

/** The month before ('RRRR-MM'). */
export const previousMonth = (month: string): string => addDays(`${month}-01`, -1).slice(0, 7)

/** The range a goal of an area may take in a month (whole numbers). */
export function goalRange(area: GoalArea, month: string): readonly [number, number] {
  return area === 'regen' ? [1, daysInMonth(month)] : LIMITS[area]
}

/** A goal's value as a field holds it: a whole number in its range, else no goal. */
function goalFrom(v: unknown, area: GoalArea, month: string): number | null {
  const [min, max] = goalRange(area, month)
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
}

/** One month's goals as read from rd.json's `goals[month]`. */
export function monthGoalsFrom(v: unknown, month: string): MonthGoals {
  if (!isPlain(v)) return NO_GOALS
  return { study: goalFrom(v.study, 'study', month), regen: goalFrom(v.regen, 'regen', month), trading: goalFrom(v.trading, 'trading', month), skipped: v.skipped === true }
}

/** rd.json's `goals`: the months it names, each read tolerantly (a key that is no month is left out). */
export function goalsFrom(v: unknown): Record<string, MonthGoals> {
  const out: Record<string, MonthGoals> = {}
  if (!isPlain(v)) return out
  for (const [month, g] of Object.entries(v)) if (isMonth(month)) out[month] = monthGoalsFrom(g, month)
  return out
}

/** At least one goal set for the month. */
export const hasGoals = (g: MonthGoals | null | undefined): boolean => !!g && (g.study != null || g.regen != null || g.trading != null)

/** What the window changes of a month's goals: a number (null – no goal) per area, the morning's step skipped or not. */
export type GoalsPatch = Partial<Record<GoalArea, number | null>> & { skipped?: boolean }

/**
 * A change of a month's goals as it comes from a window: every area a whole number in its range or null, `skipped` a
 * boolean; anything else is refused with what is wrong (the field of the window says it before, D347).
 */
export function goalsPatchFrom(month: unknown, v: unknown): { ok: true; month: string; patch: GoalsPatch } | { ok: false; why: string } {
  if (!isMonth(month)) return { ok: false, why: 'miesiąc celów' }
  if (!isPlain(v)) return { ok: false, why: 'cele miesiąca' }
  const patch: GoalsPatch = {}
  for (const [k, x] of Object.entries(v)) {
    if (k === 'skipped') {
      if (typeof x !== 'boolean') return { ok: false, why: 'pominięcie kroku celów' }
      patch.skipped = x
      continue
    }
    if (!(GOAL_AREAS as readonly string[]).includes(k)) return { ok: false, why: `nieznany cel ${k}` }
    const area = k as GoalArea
    if (x === null) {
      patch[area] = null
      continue
    }
    const [min, max] = goalRange(area, month)
    if (typeof x !== 'number' || !Number.isInteger(x) || x < min || x > max) return { ok: false, why: `cel musi być liczbą całkowitą od ${min} do ${max}` }
    patch[area] = x
  }
  return { ok: true, month, patch }
}

/**
 * The field edits of rd.json that make a month's goals `patch` (`raw` – rd.json as this computer sees it): each value its
 * own field `goals.<month>.<area>` with the value it has now as its base – nothing for a value it has already.
 */
export function goalsEdits(raw: Record<string, unknown>, month: string, patch: GoalsPatch): Array<{ path: string[]; base: unknown; value: unknown }> {
  const out: Array<{ path: string[]; base: unknown; value: unknown }> = []
  for (const [k, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const path = ['goals', month, k]
    const base = valueAt(raw, path)
    if (base !== value) out.push({ path, base, value })
  }
  return out
}
