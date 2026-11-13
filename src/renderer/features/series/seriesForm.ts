/**
 * The form of a series (D381, D382, D401) without the screen: the field „Powtarzaj” of a block's panel and the edit of a
 * series in the list of „Szablony” share one draft – the rule, its end and the field „W dni szczególne”. Pure: the
 * conversions to what the API takes (`SeriesCreate`, `SeriesPatch`) and the words of the panel.
 */
import type { SeriesCreate, SeriesScope } from '@shared/api'
import { occurrenceBlock, type SeriesPatch } from '@shared/engine/series'
import type { PlanBlock } from '@shared/model/plan'
import { DEFAULT_SPECIAL, SERIES_BLOCK_FIELDS, SERIES_COUNT_MAX, seriesVersionOn, type Series, type SeriesBlock, type SeriesRule, type SpecialDays } from '@shared/model/series'
import type { TaskRepeat, TaskRepeatInput } from '@shared/model/taskRepeat'
import { seriesRuleText } from '@shared/seriesText'
import { addDays, weekday } from '@shared/time/zone'

/** The kinds of the rule the field offers; `none` – „Nie powtarzaj”. */
export type RuleChoice = 'none' | SeriesRule['kind']
export type EndChoice = 'never' | 'count' | 'until'

export interface SeriesDraft {
  kind: RuleChoice
  /** „co N tygodni” of the weekly rule. */
  every: number
  /** The weekdays of the weekly rule, 1 = Monday. */
  days: number[]
  /** The day of the month of „N-tego dnia miesiąca”. */
  day: number
  /** „N-ty … miesiąca”: 1–4, −1 – the last one. */
  nth: number
  weekday: number
  end: EndChoice
  count: number
  until: string
  special: SpecialDays
}

/** The options of the field „Powtarzaj”, in the order of the list. */
export const RULE_CHOICES: ReadonlyArray<{ value: RuleChoice; label: string }> = [
  { value: 'none', label: 'Nie powtarzaj' },
  { value: 'daily', label: 'codziennie' },
  { value: 'workdays', label: 'w dni robocze' },
  { value: 'weekly', label: 'co tydzień lub co kilka tygodni' },
  { value: 'monthDay', label: 'wybranego dnia miesiąca' },
  { value: 'monthWeekday', label: 'wybranego dnia tygodnia miesiąca' }
]

export const END_CHOICES: ReadonlyArray<{ value: EndChoice; label: string }> = [
  { value: 'never', label: 'nigdy' },
  { value: 'count', label: 'po N razach' },
  { value: 'until', label: 'w dniu' }
]

/** „pierwszy … czwarty, ostatni” of the rule „N-ty dzień tygodnia miesiąca”. */
export const NTH_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '1', label: 'pierwszy' },
  { value: '2', label: 'drugi' },
  { value: '3', label: 'trzeci' },
  { value: '4', label: 'czwarty' },
  { value: '-1', label: 'ostatni' }
]

export const WEEKDAY_NAMES = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'] as const

/** What a new series starts as, from the day of its block: the rules' fields fall on that day, no end, asks on special days. */
export function newDraft(date: string): SeriesDraft {
  const day = Number(date.slice(8, 10))
  const nth = Math.ceil(day / 7)
  return {
    kind: 'none',
    every: 1,
    days: [weekday(date)],
    day,
    // The 5th such weekday of a month is „ostatni” (a month has no 5th in every year).
    nth: nth > 4 ? -1 : nth,
    weekday: weekday(date),
    end: 'never',
    count: 10,
    until: addDays(date, 28),
    special: DEFAULT_SPECIAL
  }
}

/** The draft of a rule with its end, the other fields from `date` (`newDraft`). */
function ruleDraft(r: SeriesRule, end: { until: string | null; count: number | null }, date: string): SeriesDraft {
  const d = newDraft(date)
  return {
    ...d,
    kind: r.kind,
    ...(r.kind === 'weekly' ? { every: r.every, days: [...r.days] } : {}),
    ...(r.kind === 'monthDay' ? { day: r.day } : {}),
    ...(r.kind === 'monthWeekday' ? { nth: r.nth, weekday: r.weekday } : {}),
    end: end.count != null ? 'count' : end.until != null ? 'until' : 'never',
    count: end.count ?? d.count,
    until: end.until ?? d.until
  }
}

/** The draft of a series as it is on `date` (the version in force there, its first one before it): what the form edits. */
export function draftOf(s: Series, date: string): SeriesDraft {
  const v = seriesVersionOn(s, date) ?? s.versions[0]!
  return { ...ruleDraft(v.rule, s, date), special: v.special }
}

/**
 * „Powtarzaj” of a task (D465): the draft of its repeat (none – „Nie powtarzaj”, the fields from `date`: the task's date, else
 * today), and what a draft sets (`repeatInputOf`: null – „Nie powtarzaj”; undefined – the rule incomplete, nothing to save).
 */
export function repeatDraft(rep: TaskRepeat | null, date: string): SeriesDraft {
  return rep ? ruleDraft(rep.rule, rep, date) : newDraft(date)
}
export function repeatInputOf(d: SeriesDraft): TaskRepeatInput | null | undefined {
  if (d.kind === 'none') return null
  const rule = ruleOf(d)
  return rule ? { rule, ...endOf(d) } : undefined
}
/** Whether the draft sets another repeat than the task's (`rep`) – „Zapisz powtarzanie” only then. */
export function repeatChanged(rep: TaskRepeat | null, d: SeriesDraft): boolean {
  const input = repeatInputOf(d)
  if (input === undefined) return false
  if (input === null || rep === null) return (input === null) !== (rep === null)
  const { anchor: _a, ...was } = rep.rule as SeriesRule & { anchor?: string }
  const { anchor: _b, ...now } = input.rule as SeriesRule & { anchor?: string }
  return JSON.stringify(was) !== JSON.stringify(now) || input.until !== rep.until || input.count !== rep.count
}

/** The rule the draft makes (a weekly one's weeks are counted by the main process: `anchor` is left empty); null – none, or incomplete. */
export function ruleOf(d: SeriesDraft): SeriesRule | null {
  switch (d.kind) {
    case 'none':
      return null
    case 'daily':
    case 'workdays':
      return { kind: d.kind }
    case 'weekly':
      return d.days.length && d.every >= 1 && d.every <= 52 ? { kind: 'weekly', every: d.every, days: [...d.days].sort((a, b) => a - b), anchor: '' } : null
    case 'monthDay':
      return d.day >= 1 && d.day <= 31 ? { kind: 'monthDay', day: d.day } : null
    case 'monthWeekday':
      return { kind: 'monthWeekday', nth: d.nth, weekday: d.weekday }
  }
}

/** The end the draft makes (one of the two, as the field offers one); the other is cleared. */
export function endOf(d: SeriesDraft): { until: string | null; count: number | null } {
  return d.end === 'count' ? { until: null, count: Math.max(1, Math.min(SERIES_COUNT_MAX, d.count)) } : d.end === 'until' ? { until: d.until, count: null } : { until: null, count: null }
}

/** Why the draft cannot be saved (said under the field), null when it can. */
export function draftProblem(d: SeriesDraft): string | null {
  if (d.kind === 'weekly' && !d.days.length) return 'Wybierz przynajmniej jeden dzień tygodnia.'
  if (d.kind !== 'none' && ruleOf(d) == null) return 'Reguła powtarzania jest niepełna.'
  return null
}

/** „Powtarzaj” of a block: the series it makes (rule none or incomplete – null). */
export function createInput(date: string, blockId: string, d: SeriesDraft): SeriesCreate | null {
  const rule = ruleOf(d)
  if (!rule) return null
  return { date, blockId, rule, special: d.special, ...endOf(d) }
}

const sameRule = (a: SeriesRule | null, b: SeriesRule | null): boolean => JSON.stringify(a) === JSON.stringify(b)

/** What the draft changes against the series as it was (`base`): only the rule, the special days and the end that differ – empty when nothing. */
export function draftPatch(base: SeriesDraft, d: SeriesDraft): SeriesPatch {
  const out: SeriesPatch = {}
  const rule = ruleOf(d)
  if (rule && !sameRule(rule, ruleOf(base))) out.rule = rule
  if (d.special !== base.special) out.special = d.special
  const e = endOf(d)
  const was = endOf(base)
  // Another kind of end: the one the field shows, the other cleared. The same kind: only its value – an end the app set
  // beside it (a count the days gone by reached ends the series yesterday) stays (T719).
  if (d.end !== base.end) {
    out.until = e.until
    out.count = e.count
  } else if (d.end === 'count' && e.count !== was.count) out.count = e.count
  else if (d.end === 'until' && e.until !== was.until) out.until = e.until
  return out
}

export const isEmptyPatch = (p: SeriesPatch): boolean => p.block === undefined && p.rule === undefined && p.special === undefined && p.until === undefined && p.count === undefined

/** Whether a change of a block's fields in the panel touches what a series keeps (a change of the block alone asks the scope). */
export function touchesSeries(patch: Partial<PlanBlock>): boolean {
  return (SERIES_BLOCK_FIELDS as readonly string[]).some((k) => k in patch)
}

/** The fields of a panel's change a series keeps (the others – the anchor, a mark – belong to the day's block only). */
export function seriesBlockPatch(patch: Partial<PlanBlock>): Partial<SeriesBlock> {
  const out: Record<string, unknown> = {}
  for (const k of SERIES_BLOCK_FIELDS) if (k in patch) out[k] = patch[k]
  return out as Partial<SeriesBlock>
}

/** The rule of the series in words as the panel of an occurrence of `date` says it: „co 2 tygodnie w czwartek, do 30.04”. */
export function occurrenceRuleText(s: Series, date: string, today: string): string {
  const v = seriesVersionOn(s, date) ?? s.versions[0]!
  return seriesRuleText(v.rule, s, today)
}

/** The block a series shows in the list and the history: its version of `today` (its first one when it starts later) as a block of that day. */
export function seriesBlockOf(s: Series, today: string): PlanBlock {
  const v = seriesVersionOn(s, today) ?? s.versions[0]!
  return occurrenceBlock(s, v.block, today)
}

/** What each scope does, said under its button when a block of a series changes. */
export const SCOPE_CHANGE_HINT: Record<SeriesScope, string> = {
  only: 'Zmienia tylko ten dzień; reszta serii zostaje.',
  following: 'Ten dzień i kolejne; wcześniejsze dni zostają.',
  all: 'Całą serię od dziś; dni minione i wystąpienia zmienione osobno zostają.'
}

/** What each scope does when a block of a series is removed. */
export const SCOPE_REMOVE_HINT: Record<SeriesScope, string> = {
  only: 'Odwołuje tylko to wystąpienie.',
  following: 'Kończy serię przed tym dniem (najwcześniej od dziś).',
  all: 'Kończy serię od dziś i usuwa ją z listy; dni minione zostają.'
}
