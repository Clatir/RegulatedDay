// adapted from FI src/shared/format.ts @ de81f2b and src/renderer/lib/format.ts @ de81f2b
/**
 * The Polish formats of the interface (spec „Wygląd i nazwy”, „Konwencje interfejsu”): dates „21.10.2026”, the 24-hour
 * clock, thousands split by a space, a decimal comma, Polish plurals; and the parsing of what is typed into the fields
 * (durations „90”, „1:30”, „1h30”, a date without its year, whole numbers). Pure – the main process, the windows and the
 * tests share it.
 */

/** No-break space: a number never breaks between its thousands. */
export const NBSP = ' '
const MINUS = '−'

/**
 * Polish plural form of the noun after a number: 1 → `one`, 2–4 (except 12–14) → `few`, otherwise `many`;
 * a fractional number takes `fraction` (genitive singular: „2,5 godziny”), by default the `few` form.
 */
export function plural(n: number, one: string, few: string, many: string, fraction = few): string {
  if (!Number.isFinite(n)) return many
  const abs = Math.abs(n)
  if (!Number.isInteger(abs)) return fraction
  if (abs === 1) return one
  const last = abs % 10
  const lastTwo = abs % 100
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many
}

/** „3 bloki”, „5 bloków”, „1 blok”. */
export function countLabel(n: number, one: string, few: string, many: string, fraction?: string): string {
  return `${formatNumber(n)} ${plural(n, one, few, many, fraction)}`
}

/** 12345.5 → „12 345,5” (the places as given, at most `places`); the minus is U+2212. */
export function formatNumber(n: number, places = 0): string {
  const fixed = Math.abs(n).toFixed(places)
  const [int, frac] = fixed.split('.') as [string, string | undefined]
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  const negative = n < 0 && Number(fixed) !== 0
  return `${negative ? MINUS : ''}${grouped}${frac ? `,${frac}` : ''}`
}

/** The one format of counters (spec „Liczniki”): „3 z 12”. */
export const ofLabel = (x: number, y: number): string => `${formatNumber(x)} z ${formatNumber(y)}`

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 'RRRR-MM-DD' → „21.10.2026”. */
export const plDate = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`

/** 'RRRR-MM-DD' → „21.10” (a short date). */
export const plDayMonth = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}`

/** Minutes since midnight → „07:05” (24-hour clock, the day wraps). */
export function clock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}

/** The logical day starts at 04:00 (spec „Model dnia”): a time before it belongs to the night after the date. */
export const LOGICAL_DAY_START_MIN = 4 * 60

/**
 * A time of the logical day (minutes since 00:00 of its date, 0 – 28:00) as the interface shows it (spec „Czas
 * i długość”): 00:00–03:59 of the night after gets „+1”.
 */
export function logicalClock(minutes: number): string {
  return minutes >= 1440 ? `${clock(minutes - 1440)} +1` : clock(minutes)
}

/** Minutes → „45 min”, „1 h”, „1 h 30 min”, „12 h 05 min” (a duration, never negative here). */
export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h} h ${pad2(rest)} min` : `${h} h`
}

/** Why a typed value was refused – the message the field shows (spec „Błędna wartość jest odrzucana z komunikatem”). */
export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value })
const refuse = (message: string): Parsed<never> => ({ ok: false, message })

/** The longest duration a field takes: a day. */
export const MAX_DURATION_MIN = 24 * 60

/**
 * A duration typed (spec „Czas i długość”): „90” (minutes), „1:30”, „1h30”, also „1h”, „1 h 30 min”, „45 min”, „45m”.
 * Whole minutes only – „1,5” is refused, as every field of whole numbers refuses a fraction.
 */
export function parseDuration(text: string, max = MAX_DURATION_MIN): Parsed<number> {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return refuse('Wpisz długość, np. 90, 1:30 albo 1h30.')
  // „1,5” or „1,30” – hours with a fraction or a typo of 1:30: never guessed.
  if (/[.,]/.test(t)) return refuse('Długość podaje się w pełnych minutach albo jako 1:30.')
  let minutes: number | null = null
  let m: RegExpExecArray | null
  if ((m = /^(\d{1,4}) ?(?:m|min)?$/.exec(t))) minutes = Number(m[1])
  else if ((m = /^(\d{1,2}):(\d{2})$/.exec(t))) minutes = Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null
  else if ((m = /^(\d{1,2}) ?h(?: ?(\d{1,2}) ?(?:m|min)?)?$/.exec(t))) minutes = m[2] == null || Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2] ?? 0) : null
  if (minutes == null) return refuse('Nie rozumiem tej długości – wpisz np. 90, 1:30 albo 1h30.')
  if (minutes <= 0) return refuse('Długość musi być dłuższa niż 0 min.')
  if (minutes > max) return refuse(`Najdłużej ${durationLabel(max)}.`)
  return ok(minutes)
}

/** A whole number typed into a field (spec: the fields of whole numbers refuse fractions). */
export function parseInteger(text: string, min: number, max: number): Parsed<number> {
  const t = text.trim().replace(/[\s ]/g, '').replace(MINUS, '-')
  if (!t) return refuse('Wpisz liczbę.')
  if (/^[-+]?\d+[.,]\d*$/.test(t)) return refuse('Tu wpisuje się liczbę całkowitą, bez części ułamkowej.')
  if (!/^[-+]?\d+$/.test(t)) return refuse('To nie jest liczba.')
  const n = Number(t)
  if (n < min || n > max) return refuse(`Wpisz liczbę od ${formatNumber(min)} do ${formatNumber(max)}.`)
  return ok(n)
}

/** 'RRRR-MM-DD' of a real day; null = no such day (31.02, 29.02 of a common year). */
export function isoDay(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${pad2(mo)}-${pad2(d)}`
}

/**
 * A date typed (spec „Czas i długość”): „21.10.2026”, „2026-10-21”, or without its year – „3.01” is the nearest such
 * date from `today` on (today included: a plan for today is typed as today), 29.02 the nearest leap year's (T392);
 * with `past` the nearest one up to today (a range of past days, e.g. the CSV export).
 */
export function parseDate(text: string, today: string, o: { past?: boolean } = {}): Parsed<string> {
  const t = text.trim()
  if (!t) return refuse('Wpisz datę, np. 21.10.2026 albo 3.01.')
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m) return isoDay(Number(m[1]), Number(m[2]), Number(m[3])) ? ok(isoDay(Number(m[1]), Number(m[2]), Number(m[3]))!) : refuse('Nie ma takiego dnia.')
  m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?\.?$/.exec(t)
  if (!m) return refuse('Nie rozumiem tej daty – wpisz np. 21.10.2026 albo 3.01.')
  const d = Number(m[1])
  const mo = Number(m[2])
  if (m[3]) {
    const day = isoDay(Number(m[3]), mo, d)
    return day ? ok(day) : refuse('Nie ma takiego dnia.')
  }
  // Without the year: the nearest such day from today on – or, for a date of the past (an export), back from today.
  const year = Number(today.slice(0, 4))
  for (let i = 0; i <= 8; i++) {
    const day = isoDay(o.past ? year - i : year + i, mo, d)
    if (day && (o.past ? day <= today : day >= today)) return ok(day)
  }
  return refuse('Nie ma takiego dnia.')
}

/**
 * A time of the logical day typed (spec „Czas i długość”): „7:05”, „705”, „07.05”, „7”; 00:00–03:59 is the night after
 * the date („+1”, minutes 1440–1679). Answers minutes since 00:00 of the logical day's date.
 */
export function parseLogicalTime(text: string): Parsed<number> {
  const t = text.trim().replace(/\s*\+1$/, '').replace(/[.,;h ]/g, ':')
  let h: number
  let mi: number
  let m: RegExpExecArray | null
  if ((m = /^(\d{1,2}):(\d{2})$/.exec(t))) {
    h = Number(m[1])
    mi = Number(m[2])
  } else if (/^\d{3,4}$/.test(t)) {
    h = Number(t.slice(0, -2))
    mi = Number(t.slice(-2))
  } else if (/^\d{1,2}$/.test(t)) {
    h = Number(t)
    mi = 0
  } else return refuse('Nie rozumiem tej godziny – wpisz np. 7:05.')
  if (h > 23 || mi > 59) return refuse('Nie ma takiej godziny.')
  const minutes = h * 60 + mi
  return ok(minutes < LOGICAL_DAY_START_MIN ? minutes + 1440 : minutes)
}
