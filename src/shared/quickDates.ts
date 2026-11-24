/**
 * The words of the quick capture (HKU2: D409, T856; N10: D600–D602) and how a day is said in the lines of „Sprawy” – pure and
 * light (the window „Do skrzynki” shows the line under its field without the engine): at the end of a title „!jutro”,
 * „!pt”, „!20.11” set the due date, „@…” – the date of doing (with an hour right after it – „@jutro 15:00”, or alone –
 * „@15:00” – the place on that day's axis), „1h30” – the estimate, „#anal” – the subcategory; the words recognised leave the title.
 */
import { durationLabel, logicalClock, parseDate, plDayMonth, WEEKDAY_SHORT } from './format'
import { ESTIMATE_RANGE } from './model/requests'
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
 * tomorrow on (on a Friday „pt” is the next Friday), a date „20.11” – the nearest such day from today on, „20.11.2027” and
 * „2027-11-20” – that one (a real day only). Null: not a day.
 */
function dayOfWord(word: string, today: string): string | null {
  const w = word.toLowerCase()
  if (w === 'dziś' || w === 'dzis') return today
  if (w === 'jutro') return addDays(today, 1)
  const wd = WEEKDAY_WORDS.get(w)
  if (wd != null) return addDays(today, (wd - weekday(today) + 7) % 7 || 7)
  // A date only with its dots or as „RRRR-MM-DD” (D454, D455): „20.11”, „20.11.2027”, „2027-11-20” – „20/11”, „1/2”, „3”,
  // „12-03” and the like stay in the title (fractions, instalments).
  if (!/^(\d{1,2}\.\d{1,2}(\.\d{4})?|\d{4}-\d{1,2}-\d{1,2})$/.test(w)) return null
  const p = parseDate(w, today)
  return p.ok ? p.value : null
}

/** A subcategory a „#word” may name: its id and its name, in the order of the tree of „Ustawienia → Kategorie” (the parser stays pure – the caller gives them). */
export interface QuickCategory {
  id: string
  name: string
}

/** A text as the words compare it: lower case, without the Polish letters („Źródła” → „zrodla”). */
function plain(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * The subcategory a „#word” names (D600): the exact name first, then the first of the tree whose name begins with the word – both
 * without the case and the Polish letters („#anal” → „Analiza”, „#zrodla” → „Źródła”). Null: none.
 */
export function categoryOfWord(word: string, categories: readonly QuickCategory[]): QuickCategory | null {
  const w = plain(word)
  if (!w) return null
  return categories.find((c) => plain(c.name) === w) ?? categories.find((c) => plain(c.name).startsWith(w)) ?? null
}

/** A length as the quick capture takes it (D602): „30m”, „45min”, „90m”, „1h”, „1h30”, „1h30m” – within the estimate's range; null: not one. */
function durationOfWord(word: string): number | null {
  const m = /^(?:(\d{1,2})h(?:(\d{2})(?:m|min)?)?|(\d{1,3})(?:m|min))$/i.exec(word)
  if (!m) return null
  if (m[2] != null && Number(m[2]) > 59) return null
  const minutes = m[3] != null ? Number(m[3]) : Number(m[1]) * 60 + (m[2] != null ? Number(m[2]) : 0)
  return minutes >= ESTIMATE_RANGE[0] && minutes <= ESTIMATE_RANGE[1] ? minutes : null
}

/** An hour „H:MM” / „HH:MM”, 00:00–23:59, as a minute of the logical day (D601: 00:00–03:59 are the night after the date, +1440); null: not one. */
function timeOfWord(word: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(word)
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  const minutes = h * 60 + mi
  return minutes < 240 ? minutes + 1440 : minutes
}

/** What the dates at the end of a title set (D409): the title without them, the days, the line under the field. */
export interface QuickDates {
  title: string
  dueDate: string | null
  doDate: string | null
  /** „Termin: pt 20.11 · Wykonać: jutro” – shown under the field before Enter; null – no word recognised. */
  preview: string | null
}

/** What all the words at the end of a title set (D600–D602): the dates and – beyond them – the place on the axis, the estimate, the subcategory. */
export interface QuickWords extends QuickDates {
  /** The logical minute of the hour after „@dzień” (900 = 15:00); with `doDate` – the sprawa is put on that day's axis. */
  startMin: number | null
  /** The estimate of „1h30”, „45m”; null – none said. */
  estimateMin: number | null
  /** The subcategory of „#anal” (its id) and its name for the line under the field; null – none said. */
  categoryId: string | null
  categoryName: string | null
}

/** The line under the field before Enter (D409) counted from `today` – the main process's logical day (D454); null: that day is not known yet. */
export const quickPreview = (text: string, today: string | null, categories: readonly QuickCategory[] = [], nowMin: number | null = null): string | null => (today == null ? null : parseQuickWords(text, today, categories, nowMin).preview)

/** The scan from the end of the title: each kind of word at most once, in any order; a word not recognised, or a second of its kind, ends it. */
function scan(text: string, today: string, categories: readonly QuickCategory[], extra: boolean, nowMin: number | null): QuickWords {
  let rest = text.trimEnd()
  let dueDate: string | null = null
  let doDate: string | null = null
  let startMin: number | null = null
  let estimateMin: number | null = null
  let category: QuickCategory | null = null
  for (;;) {
    const m = /(^|\s)(\S+)$/.exec(rest)
    if (!m) break
    const word = m[2]!
    const sign = word[0]
    let cut = m.index
    if (sign === '!') {
      const day: string | null = dueDate == null ? dayOfWord(word.slice(1), today) : null
      if (!day) break
      dueDate = day
    } else if (sign === '@') {
      if (doDate != null) break
      const at = extra ? timeOfWord(word.slice(1)) : null
      // D604: a bare hour of the day (04:00 on) typed in the night after the date (00:00–03:59) is the next logical day's – the one that begins at 04:00.
      const day: string | null = at != null ? (nowMin != null && nowMin >= 1440 && at < 1440 ? addDays(today, 1) : today) : dayOfWord(word.slice(1), today)
      if (!day) break
      doDate = day
      startMin = at
    } else if (!extra) break
    else if (sign === '#') {
      const c: QuickCategory | null = category == null ? categoryOfWord(word.slice(1), categories) : null
      if (!c) break
      category = c
    } else if (timeOfWord(word) != null) {
      // „@jutro 15:00”: the hour belongs to the word of the day right before it – alone it stays in the title.
      const before = rest.slice(0, m.index).trimEnd()
      const day: RegExpExecArray | null = doDate == null ? /(^|\s)@(\S+)$/.exec(before) : null
      const date: string | null = day ? dayOfWord(day[2]!, today) : null
      if (!day || !date) break
      doDate = date
      startMin = timeOfWord(word)
      cut = day.index
    } else {
      const minutes: number | null = estimateMin == null ? durationOfWord(word) : null
      if (minutes == null) break
      estimateMin = minutes
    }
    rest = rest.slice(0, cut).trimEnd()
  }
  const parts = [
    dueDate ? `Termin: ${dayWord(dueDate, today)}` : null,
    doDate ? `Wykonać: ${dayWord(doDate, today)}${startMin != null ? ` ${logicalClock(startMin)}` : ''}` : null,
    estimateMin != null ? durationLabel(estimateMin) : null,
    category ? category.name : null
  ].filter((x): x is string => !!x)
  return { title: rest.trim(), dueDate, doDate, startMin, estimateMin, categoryId: category?.id ?? null, categoryName: category?.name ?? null, preview: parts.length ? parts.join(' · ') : null }
}

/**
 * The words at the end of a title (D409, T856; N10): „!…” – the due date, „@…” – the date of doing (an hour right after it, or alone –
 * today at that hour: the place on the axis), a length – the estimate, „#…” – the subcategory (`categoryOfWord`), each kind at most once,
 * in any order, only at the end; a word recognised leaves the title, one not recognised (`!coś`, `#xyz`) stays in it and ends the search
 * (so does a second word of the same kind). `today` – the logical day; `categories` – the subcategories in the order of the tree; `nowMin` – the
 * logical minute now (D604: in the night after the date a bare „@15:00” is the next logical day's; null – not known, no night).
 */
export const parseQuickWords = (text: string, today: string, categories: readonly QuickCategory[] = [], nowMin: number | null = null): QuickWords => scan(text, today, categories, true, nowMin)

/** The dates alone (D409, T856): „!…” and „@…” – what the words of dates set; nothing else is taken from the title. */
export function parseQuickDates(text: string, today: string): QuickDates {
  const { title, dueDate, doDate, preview } = scan(text, today, [], false, null)
  return { title, dueDate, doDate, preview }
}
