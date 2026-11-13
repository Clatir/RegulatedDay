/**
 * „Powtarzaj” of a task of „Sprawy” (D465, T1036–T1042): the rules of a series (codziennie, w dni robocze, co N tygodni w
 * wybrane dni, dzień miesiąca, n-ty dzień tygodnia miesiąca – `SeriesRule`; no „W dni szczególne”: a task is no block of a
 * day) with its end (nigdy, po N razach, do daty) and the number of this occurrence (`n`, 1 – the first). In the file the
 * field `repeat` of the task's record; a version before it reads the task as it always did and keeps the field in every
 * change it writes (it writes over the file as it is) – only its own „Zrobione” makes no next task.
 */
import { isIsoDate } from '../time/zone'
import { SERIES_COUNT_MAX, seriesRuleFrom, type SeriesRule } from './series'

export interface TaskRepeat {
  rule: SeriesRule
  /** The last day a next task may have (inclusive), null – no date. */
  until: string | null
  /** How many tasks the repeat makes in all („po N razach”), null – no number. */
  count: number | null
  /** Which of them this task is (1 – the one the repeat was set on). */
  n: number
}

/** What the field „Powtarzaj” sets (the window's patch): the rule and its end; the number of the occurrence is the task's. */
export type TaskRepeatInput = Pick<TaskRepeat, 'rule' | 'until' | 'count'>

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const countFrom = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= SERIES_COUNT_MAX ? v : null)

/**
 * The repeat of a task from its file; null – none, or a rule this version cannot read (then no next task is made – never one
 * by a guess). `anchor` – the week a weekly rule without its own counts from (a file always has it; a broken one – this day).
 */
export function taskRepeatFrom(v: unknown, anchor: string): TaskRepeat | null {
  if (!isPlain(v)) return null
  const rule = seriesRuleFrom(v.rule, anchor)
  if (!rule) return null
  return { rule, until: isIsoDate(v.until) ? v.until : null, count: countFrom(v.count), n: typeof v.n === 'number' && Number.isInteger(v.n) && v.n >= 1 ? v.n : 1 }
}

/** The field as written – over the file's own (`before`): what this version does not know stays (of the field and of its rule). */
export function taskRepeatJson(rep: TaskRepeat, before?: unknown): Record<string, unknown> {
  const was = isPlain(before) ? before : {}
  const wasRule = isPlain(was.rule) && was.rule.kind === rep.rule.kind ? was.rule : {}
  return { ...was, rule: { ...wasRule, ...rep.rule }, until: rep.until, count: rep.count, n: rep.n }
}

/** Why a repeat from the window is refused (said by the toast of the save). */
export const REPEAT_ONLY_TASK = 'Powtarza się tylko zadanie.'
export const REPEAT_RULE_BAD = 'Powtarzaj: reguła jest niepełna.'
export const REPEAT_COUNT_BAD = `Powtarzaj: liczba razy od 1 do ${SERIES_COUNT_MAX}.`
export const REPEAT_UNTIL_BAD = 'Powtarzaj: nie ma takiego dnia końca.'

/**
 * The repeat a patch sets over the task's own (`was`), checked: a weekly rule without its weeks (`anchor` empty – the window
 * never counts them) keeps the weeks of the rule before it while it repeats every as many weeks, else counts them from `base`
 * (the task's date – „Wykonać”, else „Termin”, else the day of the change); the number of the occurrence stays.
 */
export function repeatPatched(input: unknown, was: TaskRepeat | null, base: string): { repeat: TaskRepeat } | { error: string } {
  if (!isPlain(input)) return { error: REPEAT_RULE_BAD }
  const r = isPlain(input.rule) ? input.rule : null
  const keep = was?.rule.kind === 'weekly' && r?.kind === 'weekly' && r.every === was.rule.every && !isIsoDate(r.anchor)
  const rule = seriesRuleFrom(keep && was?.rule.kind === 'weekly' ? { ...r, anchor: was.rule.anchor } : r, base)
  if (!rule) return { error: REPEAT_RULE_BAD }
  if (input.count != null && countFrom(input.count) == null) return { error: REPEAT_COUNT_BAD }
  if (input.until != null && !isIsoDate(input.until)) return { error: REPEAT_UNTIL_BAD }
  return { repeat: { rule, until: (input.until as string | null | undefined) ?? null, count: countFrom(input.count), n: was?.n ?? 1 } }
}
