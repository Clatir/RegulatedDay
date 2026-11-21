/**
 * Dates typed into the fields „Od” and „Do” of the window of days (D544, D565 P24): the same as in every field of a date (`parseDate`) –
 * „19.11.2026”, also with dashes, slashes or spaces, one-digit day or month („3.1.2027”), eight digits without separators („19112026”)
 * and „3.01” (the nearest such date from today on) – and shown as „19.11.2026” (`plDate`). Only real dates of the calendar (no 31.11).
 */
import { parseDate, plDate } from './format'

/** „2026-11-19” → „19.11.2026” (the one format of dates, `plDate`). */
export const dmy = plDate

/** The ISO date of a typed date (`parseDate` from `today`; the year 1900–2999), null – not a date. */
export function parseDmy(text: string, today: string): string | null {
  const r = parseDate(text, today)
  if (!r.ok) return null
  const year = Number(r.value.slice(0, 4))
  return year < 1900 || year > 2999 ? null : r.value
}

/** What the field shows while typing: eight digits that make a date become DD.MM.RRRR at once, anything else stays as typed. */
export function typedDmy(text: string): string {
  if (!/^\d{8}$/.test(text.trim())) return text
  const r = parseDate(text, '2000-01-01')
  return r.ok ? plDate(r.value) : text
}

/** The days from `a` to `b` (either order), both included. */
export function daysFromTo(a: string, b: string): string[] {
  const [x, y] = a <= b ? [a, b] : [b, a]
  const out: string[] = []
  for (let d = new Date(`${x}T12:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10)
    if (iso > y) break
    out.push(iso)
  }
  return out
}
