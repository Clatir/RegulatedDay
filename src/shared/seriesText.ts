/**
 * The words of series (D381, D401): the rule as the panel of a block says it („co 2 tygodnie w czwartek, do 30.04”, „w
 * ostatni piątek miesiąca”, „codziennie, 10 razy”), the field „W dni szczególne” (D382), the scopes of a change and the
 * morning's question. Pure – the window, the search and the tests share them.
 */
import type { SeriesScope } from './api'
import type { Series, SeriesRule, SpecialDays } from './model/series'
import { seriesVersionOn } from './model/series'

/** Weekdays as „w …” takes them (the accusative), 1 = Monday. */
const ON_DAY = ['poniedziałek', 'wtorek', 'środę', 'czwartek', 'piątek', 'sobotę', 'niedzielę']
/** Feminine weekdays (środa, sobota, niedziela): the ordinal before them is feminine too. */
const FEMININE = new Set([3, 6, 7])
const NTH_M = ['pierwszy', 'drugi', 'trzeci', 'czwarty']
const NTH_F = ['pierwszą', 'drugą', 'trzecią', 'czwartą']

/** „w czwartek”, „we wtorek i czwartek”, „w poniedziałek, środę i piątek” – the preposition once, „we” only before „wtorek”. */
export function onDaysText(days: readonly number[]): string {
  const names = [...days].sort((a, b) => a - b).map((d) => ON_DAY[d - 1]!)
  if (!names.length) return ''
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} i ${names.at(-1)!}`
  return `${names[0] === 'wtorek' ? 'we' : 'w'} ${list}`
}

/** „tygodnie” / „tygodni” after a number (2–4 except 12–14: „tygodnie”). */
const weeksWord = (n: number): string => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'tygodnie' : 'tygodni')

/** The rule alone: „codziennie”, „w dni robocze”, „co 2 tygodnie w czwartek”, „10. dnia każdego miesiąca”, „w trzecią środę miesiąca”. */
export function ruleText(rule: SeriesRule): string {
  switch (rule.kind) {
    case 'daily':
      return 'codziennie'
    case 'workdays':
      return 'w dni robocze'
    case 'weekly':
      return `${rule.every === 1 ? 'co tydzień' : `co ${rule.every} ${weeksWord(rule.every)}`} ${onDaysText(rule.days)}`
    case 'monthDay':
      // D401: a month without that day – its last one.
      return `${rule.day}. dnia każdego miesiąca${rule.day >= 29 ? ' (w krótszym – ostatniego)' : ''}`
    case 'monthWeekday': {
      const fem = FEMININE.has(rule.weekday)
      const nth = rule.nth === -1 ? (fem ? 'ostatnią' : 'ostatni') : (fem ? NTH_F : NTH_M)[rule.nth - 1]!
      return `w ${nth} ${ON_DAY[rule.weekday - 1]!} miesiąca`
    }
  }
}

/** „30.04” – the year only when it is not the year of `today`. */
const dayMonth = (date: string, today: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}${date.slice(0, 4) === today.slice(0, 4) ? '' : `.${date.slice(0, 4)}`}`

/** The end: „, 10 razy”, „, do 30.04”, both – „, 10 razy, do 30.04”; none – nothing. */
export function endText(end: { until: string | null; count: number | null }, today: string): string {
  const parts: string[] = []
  if (end.count != null) parts.push(`${end.count} ${end.count === 1 ? 'raz' : 'razy'}`)
  if (end.until != null) parts.push(`do ${dayMonth(end.until, today)}`)
  return parts.map((p) => `, ${p}`).join('')
}

/** The rule with its end as the panel says it (D401): „co 2 tygodnie w czwartek, do 30.04”, „codziennie, 10 razy”. */
export function seriesRuleText(rule: SeriesRule, end: { until: string | null; count: number | null }, today: string): string {
  return `${ruleText(rule)}${endText(end, today)}`
}

/** A series' rule in force today (its first one when it starts later), with its end. */
export function seriesText(s: Series, today: string): string {
  const v = seriesVersionOn(s, today) ?? s.versions[0]!
  return seriesRuleText(v.rule, s, today)
}

/** The field „W dni szczególne” (D382). */
export const SPECIAL_DAYS_TEXT: Record<SpecialDays, string> = { held: 'odbywa się', skip: 'pomiń', ask: 'pytaj' }

/** The dialog of a change or a removal of an occurrence (D381). */
export const SERIES_SCOPE_TEXT: Record<SeriesScope, string> = { only: 'Tylko to', following: 'To i następne', all: 'Cała seria' }

/** The morning's question about an occurrence on a special day (D382): „Fizjoterapeuta z serii” – „zostaw · odwołaj”. */
export const seriesAskText = (name: string): string => `${name} z serii`

/** The mark at an occurrence's name (D401: on the axis of „Dziś”, in „Tydzień” and „Kalendarz”). */
export const SERIES_MARK = '↻'
