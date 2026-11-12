/**
 * The words of dates of the quick capture (HKU2: D409, T856) and how a day is said in the lines of „Sprawy” – pure and
 * light (the window „Do skrzynki” shows the line under its field without the engine): at the end of a title „!jutro”,
 * „!pt”, „!20.11” set the due date, „@…” – the date of doing; the words recognised leave the title.
 */
import { parseDate, plDayMonth, WEEKDAY_SHORT } from './format'
import { addDays, weekday } from './time/zone'

/** „pt 20.11” – a day by its weekday and date; a day of another year than `today`'s with its year („wt 05.01.2027”). */
export function shortDay(date: string, today: string): string {
  const year = date.slice(0, 4) !== today.slice(0, 4) ? `.${date.slice(0, 4)}` : ''
  return `${WEEKDAY_SHORT[weekday(date) - 1]} ${plDayMonth(date)}${year}`
}

/** A day as the lines say it: „dziś”, „jutro”, else „pt 20.11” (`shortDay`). */
export function dayWord(date: string, today: string): string {
  if (date === today) return 'dziś'
  if (date === addDays(today, 1)) return 'jutro'
  return shortDay(date, today)
}

/** The weekdays as the quick capture takes them (`!pt`, `!pon`, `!piątek`; without the Polish letters too), 1 = Monday. */
const WEEKDAY_WORDS = new Map<string, number>([
  ...['pn', 'pon', 'poniedziałek', 'poniedzialek'].map((w) => [w, 1] as const),
  ...['wt', 'wto', 'wtorek'].map((w) => [w, 2] as const),
  ...['śr', 'sr', 'śro', 'sro', 'środa', 'sroda'].map((w) => [w, 3] as const),
  ...['cz', 'czw', 'czwartek'].map((w) => [w, 4] as const),
  ...['pt', 'pią', 'pia', 'piątek', 'piatek'].map((w) => [w, 5] as const),
  ...['sb', 'sob', 'sobota'].map((w) => [w, 6] as const),
  ...['nd', 'ndz', 'niedz', 'niedziela'].map((w) => [w, 7] as const)
])

/**
 * The day a word of the quick capture names (T856): „dziś” / „dzis”, „jutro”, a weekday – the nearest such day from
 * tomorrow on (on a Friday „pt” is the next Friday), a date „20.11” – the nearest such day from today on, „20.11.2027” –
 * that one. Null: not a day.
 */
function dayOfWord(word: string, today: string): string | null {
  const w = word.toLowerCase()
  if (w === 'dziś' || w === 'dzis') return today
  if (w === 'jutro') return addDays(today, 1)
  const wd = WEEKDAY_WORDS.get(w)
  if (wd != null) return addDays(today, (wd - weekday(today) + 7) % 7 || 7)
  if (!/^\d/.test(w)) return null
  const p = parseDate(w, today)
  return p.ok ? p.value : null
}

/** What the words at the end of a title set (D409): the title without them, the days, the line under the field. */
export interface QuickDates {
  title: string
  dueDate: string | null
  doDate: string | null
  /** „Termin: pt 20.11 · Wykonać: jutro” – shown under the field before Enter; null – no word recognised. */
  preview: string | null
}

/**
 * The words of dates at the end of a title (D409, T856): „!…” – the due date, „@…” – the date of doing, each at most once,
 * in any order, only at the end; a word recognised leaves the title, one not recognised (`!coś`) stays in it and ends the
 * search (so does a second word of the same sign). `today` – the logical day.
 */
export function parseQuickDates(text: string, today: string): QuickDates {
  let rest = text.trimEnd()
  let dueDate: string | null = null
  let doDate: string | null = null
  for (;;) {
    const m = /(^|\s)([!@])(\S+)$/.exec(rest)
    if (!m) break
    const due = m[2] === '!'
    if ((due ? dueDate : doDate) != null) break
    const day = dayOfWord(m[3]!, today)
    if (!day) break
    if (due) dueDate = day
    else doDate = day
    rest = rest.slice(0, m.index).trimEnd()
  }
  const parts = [dueDate ? `Termin: ${dayWord(dueDate, today)}` : null, doDate ? `Wykonać: ${dayWord(doDate, today)}` : null].filter((x): x is string => !!x)
  return { title: rest.trim(), dueDate, doDate, preview: parts.length ? parts.join(' · ') : null }
}
