/**
 * Wall time in a time zone (spec „Dzień i czas”): instants are ms UTC, a wall time is a date and minutes since its
 * 00:00 in a zone. The one place that knows offsets – the day, the sessions in their own zones (New York, London) and
 * the holiday calendar's closing hours all go through it. Pure: Intl only, the machine's own zone never matters.
 *
 * Offsets are cached per UTC hour: every zone the app uses (Warsaw, New York, Chicago, London) changes its offset on a
 * whole UTC hour, so one hour has one offset, and a per-minute engine over 3 years stays fast.
 */

export type Instant = number

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY_MS = 24 * HOUR

/** The zone of the app's own time: every logical day, plan and display is in Polish time. */
export const PL_ZONE = 'Europe/Warsaw'

const formatters = new Map<string, Intl.DateTimeFormat>()
const offsets = new Map<string, Map<number, number>>()

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    formatters.set(zone, f)
  }
  return f
}

/** The zone's offset from UTC at `at`, in minutes (Warsaw in winter: 60). */
export function offsetMin(zone: string, at: Instant): number {
  const hour = Math.floor(at / HOUR)
  let byHour = offsets.get(zone)
  if (!byHour) {
    byHour = new Map()
    offsets.set(zone, byHour)
  }
  const cached = byHour.get(hour)
  if (cached !== undefined) return cached
  const probe = hour * HOUR
  const p: Record<string, number> = {}
  for (const part of formatter(zone).formatToParts(new Date(probe))) if (part.type !== 'literal') p[part.type] = Number(part.value)
  const local = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!)
  const off = Math.round((local - probe) / MINUTE)
  if (byHour.size > 200_000) byHour.clear()
  byHour.set(hour, off)
  return off
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 'RRRR-MM-DD' of a UTC day number's date parts. */
export function isoOf(y: number, mo: number, d: number): string {
  return `${y}-${pad2(mo)}-${pad2(d)}`
}

/** The date `n` days after 'RRRR-MM-DD' (calendar days, no zone). */
export function addDays(date: string, n: number): string {
  const t = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) + n * DAY_MS
  const dt = new Date(t)
  return isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/** Whole days from `a` to `b` (calendar days). */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
  return Math.round((t(b) - t(a)) / DAY_MS)
}

/** 1 = Monday … 7 = Sunday (the week starts on Monday, spec „Dzień i czas”). */
export function weekday(date: string): number {
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))).getUTCDay()
  return d === 0 ? 7 : d
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  return addDays(v, 0) === v
}

export interface Wall {
  date: string
  /** Minutes since 00:00 of `date`, with the fraction of a minute (0 ≤ minutes < 1440). */
  minutes: number
}

/** The wall time of `at` in `zone`. */
export function wallOf(zone: string, at: Instant): Wall {
  const local = at + offsetMin(zone, at) * MINUTE
  const dt = new Date(local)
  const date = isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
  const midnight = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())
  return { date, minutes: (local - midnight) / MINUTE }
}

/**
 * Every instant at which the zone's clock shows `minutes` on `date`: one, two (the doubled hour when the clock goes
 * back) or none (the hour skipped when it goes forward). `minutes` may run past 1440 – the next dates.
 */
export function instantsOfWall(zone: string, date: string, minutes: number): Instant[] {
  const local = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) + minutes * MINUTE
  const found = new Set<number>()
  // An offset that holds at the candidate it gives is right; the offsets around the wall time are the only candidates.
  for (const probe of [local - 18 * HOUR, local - 6 * HOUR, local, local + 6 * HOUR, local + 18 * HOUR]) {
    const off = offsetMin(zone, probe)
    const at = local - off * MINUTE
    if (offsetMin(zone, at) === off) found.add(at)
  }
  return [...found].sort((a, b) => a - b)
}

export type WallPick = 'first' | 'second'

export type Resolved =
  | { ok: true; at: Instant; ambiguous: boolean; other: Instant | null }
  | { ok: false; reason: 'nonexistent'; next: Instant }

/**
 * A typed wall time as an instant (spec „Dzień i czas”): the doubled hour means its first occurrence unless the second is
 * chosen, a skipped hour is refused – `next` is the first instant after the gap, for rules that must place it anyway.
 */
export function resolveWall(zone: string, date: string, minutes: number, pick: WallPick = 'first'): Resolved {
  const all = instantsOfWall(zone, date, minutes)
  if (all.length === 0) return { ok: false, reason: 'nonexistent', next: gapEnd(zone, date, minutes) }
  if (all.length === 1) return { ok: true, at: all[0]!, ambiguous: false, other: null }
  const [first, second] = [all[0]!, all[all.length - 1]!]
  return pick === 'second' ? { ok: true, at: second, ambiguous: true, other: first } : { ok: true, at: first, ambiguous: true, other: second }
}

/** The instant the clock jumps forward over a skipped wall time (the change falls on a whole UTC hour). */
function gapEnd(zone: string, date: string, minutes: number): Instant {
  const local = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) + minutes * MINUTE
  const before = offsetMin(zone, local - 12 * HOUR)
  const after = offsetMin(zone, local + 12 * HOUR)
  // Between the instant the new offset would give and the one the old would give lies the change.
  for (let h = Math.floor((local - after * MINUTE) / HOUR) * HOUR; h <= local - before * MINUTE + HOUR; h += HOUR) {
    if (offsetMin(zone, h) === after) return h
  }
  return local - before * MINUTE
}

/** A wall time placed anyway (a template, a session): a skipped time goes to the first instant after the gap. */
export function placeWall(zone: string, date: string, minutes: number): Instant {
  const r = resolveWall(zone, date, minutes)
  return r.ok ? r.at : r.next
}
