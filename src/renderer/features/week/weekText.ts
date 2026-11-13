/**
 * The words of „Tydzień” (D356, D360): the week's title, a column's heading (the day, its boundary, its regeneration
 * against the minimum), the progress „x z y” of the month's goals. Pure; every number says what it counts, never a verdict
 * (D72: a goal is no grade and blocks nothing).
 */
import type { GoalsProgress } from '@shared/engine/goals'
import type { StayHow } from '@shared/engine/planEdit'
import { pushedText } from '@shared/engine/pushApart'
import type { HorizonBlockState, HorizonDay } from '@shared/engine/week'
import { countLabel, durationLabel, formatNumber, ofLabel, WEEKDAY_NAMES } from '@shared/format'
import type { GoalArea } from '@shared/model/goals'
import { addDays, weekday } from '@shared/time/zone'
import { MONTH_NAMES } from '../calendar/MonthGrid'
import type { WeekPush } from '../../store/weekPush'

export const WEEKDAY_SHORT = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'] as const
export const WEEKDAY_FULL = WEEKDAY_NAMES

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

/** What a column says to a screen reader: the weekday and how many blocks it holds („wtorek: 2 bloki”). */
export const columnLabel = (index: number, blocks: number): string => `${WEEKDAY_FULL[index]}: ${countLabel(blocks, 'blok', 'bloki', 'bloków')}`

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
  const text: Record<HorizonBlockState, string> = { ran: 'zrobiony', running: 'trwa', paused: 'zapauzowany', planned: 'w planie', missed: 'nie zaczęty', parked: 'zaparkowany', cancelled: 'odwołany' }
  return outsidePlan ? `${text[state]} · poza planem` : text[state]
}

/** A block taken off or waiting (parked, paused) has a dashed edge, as on the day's axis; only a running one has the ring. */
export const blockDashed = (state: HorizonBlockState): boolean => state === 'parked' || state === 'paused'
export const blockRinged = (state: HorizonBlockState): boolean => state === 'running'

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

const dayIndex = (date: string): number => weekday(date) - 1
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The days of a new block in the small window's heading (D371): „wtorek”, „wt–czw” for days in a row, else „wt, czw”. */
export function daysLabel(dates: readonly string[]): string {
  if (dates.length === 1) return WEEKDAY_FULL[dayIndex(dates[0]!)]!
  const short = dates.map((d) => WEEKDAY_SHORT[dayIndex(d)]!)
  const inRow = dates.every((d, i) => i === 0 || addDays(dates[i - 1]!, 1) === d)
  return inRow ? `${short[0]}–${short.at(-1)}` : short.join(', ')
}

/**
 * The warning of the small window of a new block for the days gone by among `dates` (D371, D72: only a warning, „Dodaj”
 * still saves): „Ten dzień już minął.” for one day, else the days by name – „Wtorek już minął.”, „Poniedziałek i wtorek
 * już minęły.”; null when none has passed.
 */
export function pastWarning(dates: readonly string[], today: string): string | null {
  const past = dates.filter((d) => d < today)
  if (!past.length) return null
  if (dates.length === 1) return 'Ten dzień już minął.'
  const names = past.map((d) => WEEKDAY_FULL[dayIndex(d)]!)
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} i ${names.at(-1)}`
  // One day: „wtorek minął”, „środa minęła” (the names ending with „a” are feminine); several – „minęły”.
  const verb = names.length > 1 ? 'minęły' : names[0]!.endsWith('a') ? 'minęła' : 'minął'
  return `${capital(list)} już ${verb}.`
}

/** The line after „Dodaj” pushed blocks apart in the days of a range (D400): „Przesunięto 5 bloków w 3 dniach”. */
export const weekPushedText = (blocks: number, days: number): string => `${pushedText(blocks)} w ${countLabel(days, 'dniu', 'dniach', 'dniach')}`

/** Why each kind of block stayed, one and several (D424, T965). */
const STAYED: Record<StayHow, [string, string]> = {
  running: ['został – już trwa', 'zostały – już trwają'],
  done: ['został – już zrobiony', 'zostały – już zrobione'],
  parked: ['został – zaparkowany', 'zostały – zaparkowane'],
  cancelled: ['został – odwołany', 'zostały – odwołane'],
  kept: ['został w swoim dniu', 'zostały w swoim dniu']
}

/**
 * The blocks anchored to the moved one that stayed on its day (D424, T965), by why – „ · Analiza został – już trwa ·
 * Spacer, Obiad zostały – zaparkowane”; none – nothing.
 */
export function stayedText(stayed: ReadonlyArray<{ name: string; how: StayHow }>): string {
  const order: StayHow[] = ['running', 'done', 'parked', 'cancelled', 'kept']
  return order
    .map((how) => stayed.filter((s) => s.how === how).map((s) => s.name))
    .flatMap((names, i) => (names.length ? [` · ${names.join(', ')} ${STAYED[order[i]!][names.length === 1 ? 0 : 1]}`] : []))
    .join('')
}

/**
 * The line's words from the days it still holds: the blocks they pushed and the days that pushed them; when none of them
 * pushed (what is left to take back is only a new block – a day that could not be read then), „Nowy blok w K dniach”.
 */
export function weekPushLineText(push: WeekPush): string {
  const blocks = push.days.reduce((n, d) => n + d.moved, 0)
  // D422: a block moved to another day – its name and the day as its column's heading says it („wt 6.01”, T915); D424: the
  // blocks anchored to it that had begun and stayed; then what it pushed apart there.
  if (push.move) {
    const { name, to, stayed = [] } = push.move
    return `Przeniesiono: ${name} na ${dayHeading(to, dayIndex(to))}${stayedText(stayed)}${blocks > 0 ? ` · ${pushedText(blocks).toLowerCase()}` : ''}`
  }
  if (blocks > 0) return weekPushedText(blocks, push.days.filter((d) => d.moved > 0).length)
  return `Nowy blok w ${countLabel(push.days.length, 'dniu', 'dniach', 'dniach')}`
}
