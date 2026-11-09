/**
 * The words of „Tydzień” (D356, D360): the week's title, a column's heading (the day, its boundary, its regeneration
 * against the minimum), the progress „x z y” of the month's goals. Pure; every number says what it counts, never a verdict
 * (D72: a goal is no grade and blocks nothing).
 */
import type { GoalsProgress } from '@shared/engine/goals'
import type { HorizonBlockState, HorizonDay } from '@shared/engine/week'
import { durationLabel, formatNumber, ofLabel } from '@shared/format'
import type { GoalArea } from '@shared/model/goals'
import { addDays } from '@shared/time/zone'
import { MONTH_NAMES } from '../calendar/MonthGrid'

export const WEEKDAY_SHORT = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'] as const
export const WEEKDAY_FULL = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'] as const

const day = (d: string) => String(Number(d.slice(8, 10)))
const month = (d: string) => d.slice(5, 7)

/** The week from Monday `week`: „3–9.11.2026”, „30.11–6.12.2026”, „28.12.2026–3.01.2027”. */
export function weekTitle(week: string): string {
  const end = addDays(week, 6)
  if (week.slice(0, 4) !== end.slice(0, 4)) return `${day(week)}.${month(week)}.${week.slice(0, 4)}–${day(end)}.${month(end)}.${end.slice(0, 4)}`
  if (month(week) !== month(end)) return `${day(week)}.${month(week)}–${day(end)}.${month(end)}.${end.slice(0, 4)}`
  return `${day(week)}–${day(end)}.${month(end)}.${end.slice(0, 4)}`
}

/** A column's first line: „pn 3.11” (`index` 0 = Monday). */
export const dayHeading = (date: string, index: number): string => `${WEEKDAY_SHORT[index]} ${day(date)}.${month(date)}`

/** A month's name for a heading: „listopad 2026”. */
export const monthLabel = (m: string): string => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

/** The month's name alone („Cele na listopad”; the names are the same in the nominative and the accusative). */
export const monthName = (m: string): string => MONTH_NAMES[Number(m.slice(5, 7)) - 1]!

/** How a line of a column is toned: `ok` / `bad` – the accent colours, `muted` – no data or nothing yet, `plain`. */
export type Tone = 'ok' | 'bad' | 'muted' | 'plain'

export interface ColumnLine {
  /** What the column shows. */
  text: string
  /** The whole sentence for the hint and for a screen reader. */
  title: string
  tone: Tone
}

/**
 * The boundary of a day: kept ✓ / not kept ✗ (with the extension), „w toku” today (with the extension so far), „wolne”,
 * „brak danych”; nothing for a day to come; a day that cannot be read now says so.
 */
export function boundaryLine(d: HorizonDay): ColumnLine | null {
  if (d.read === 'unknown') return { text: 'nie da się teraz odczytać', title: 'Tego dnia nie da się teraz odczytać', tone: 'muted' }
  const ext = d.extensionMin > 0 ? durationLabel(d.extensionMin) : null
  switch (d.boundary) {
    case 'kept':
      return { text: '✓ granica', title: 'Granica dotrzymana', tone: 'ok' }
    case 'broken':
      return { text: ext ? `✗ granica +${ext}` : '✗ granica', title: ext ? `Granica nie dotrzymana – przedłużenie ${ext}` : 'Granica nie dotrzymana', tone: 'bad' }
    case 'noData':
      return { text: 'granica: brak danych', title: 'Granica: brak danych (koniec pracy niepotwierdzony)', tone: 'muted' }
    case 'free':
      return { text: 'wolne', title: 'Dzień wolny – nie liczy się do granicy', tone: 'muted' }
    case 'open':
      return { text: ext ? `granica w toku (+${ext})` : 'granica w toku', title: ext ? `Granica w toku – przedłużenie ${ext} do tej pory` : 'Granica w toku – dzień się nie skończył', tone: 'plain' }
    default:
      return null
  }
}

/**
 * The regeneration of a day against its minimum: „95 z 90 min” (✓ once reached); a day to come – the minimum only, no
 * forecast; a day gone by without your presence – „brak danych”; a day that cannot be read – nothing (the boundary line says so).
 */
export function regenLine(d: HorizonDay): ColumnLine | null {
  if (d.read === 'unknown') return null
  if (d.regen == null) return { text: 'regeneracja: brak danych', title: 'Regeneracja: brak danych – nie było Cię w aplikacji tego dnia', tone: 'muted' }
  const r = d.regen
  if (d.when === 'future') return { text: `minimum ${durationLabel(r.requiredMin)}`, title: `Minimum regeneracji tego dnia: ${durationLabel(r.requiredMin)}`, tone: 'muted' }
  const toward = Math.round(r.towardMin)
  const text = `${r.reached ? '✓ ' : ''}${ofLabel(toward, Math.round(r.requiredMin))} min`
  return { text: `regeneracja ${text}`, title: `Regeneracja ${toward} min z minimum ${Math.round(r.requiredMin)} min${r.reached ? ' – minimum osiągnięte' : ''}`, tone: r.reached ? 'ok' : 'plain' }
}

/** What a block's state says in its hint. */
export function blockStateText(state: HorizonBlockState, outsidePlan: boolean): string {
  const text: Record<HorizonBlockState, string> = { ran: 'zrobiony', running: 'trwa', planned: 'w planie', missed: 'nie zaczęty', parked: 'zaparkowany', cancelled: 'odwołany' }
  return outsidePlan ? `${text[state]} · poza planem` : text[state]
}

export const GOAL_LABELS: Record<GoalArea, string> = { study: 'Studia', regen: 'Regeneracja', trading: 'Dyscyplina tradingowa' }
export const GOAL_UNITS: Record<GoalArea, string> = { study: 'godzin', regen: 'dni', trading: 'sesji' }
/** What the field of a goal counts, for its hint. */
export const GOAL_HINTS: Record<GoalArea, string> = {
  study: 'godziny bloków „Nauka” i „Oglądanie wykładu”',
  regen: 'dni z osiągniętym minimum regeneracji',
  trading: 'sesje z planu, które skończyły się bez przedłużenia'
}

/** Hours with a tenth where there is one: 12,5 – 40. */
const hours = (min: number): string => {
  const h = Math.round(min / 6) / 10
  return formatNumber(h, Number.isInteger(h) ? 0 : 1)
}

export interface GoalRow {
  area: GoalArea
  /** „12,5 z 40 h”; null – no goal for this area. */
  text: string | null
  /** Beside it, never taken away from it (D360): „przedłużone: 2”, „poza planem: 1”. */
  counters: string[]
}

/** The three areas of the month's goals as „x z y” – the numbers of the progress and nothing more. */
export function goalRows(p: GoalsProgress): GoalRow[] {
  const regenGoal = p.regen.goal
  return [
    { area: 'study', text: p.study.goalMin == null ? null : `${hours(p.study.min)} z ${hours(p.study.goalMin)} h`, counters: [] },
    { area: 'regen', text: regenGoal == null ? null : `${ofLabel(p.regen.days, regenGoal)} ${regenGoal === 1 ? 'dnia' : 'dni'}`, counters: [] },
    {
      area: 'trading',
      text: p.trading.goal == null ? null : `${ofLabel(p.trading.clean, p.trading.goal)} sesji`,
      counters: [`przedłużone: ${p.trading.extended}`, `poza planem: ${p.trading.outsidePlan}`]
    }
  ]
}

/** What the numbers are not yet: „wstępne” while a day counted is not frozen, the days without a log to read. */
export function progressNotes(p: GoalsProgress): Array<{ text: string; title: string }> {
  const out: Array<{ text: string; title: string }> = []
  if (p.preliminary > 0) out.push({ text: 'wstępne', title: 'Liczby wstępne – dzisiejszy dzień (albo dzień jeszcze niezamrożony) może je jeszcze zmienić' })
  const short = p.unknown.length + p.partial.length
  if (short > 0) out.push({ text: `niepełne dane: ${short}`, title: 'Nie wszystkie logi miesiąca dało się teraz odczytać – liczby mogą być niepełne' })
  return out
}
