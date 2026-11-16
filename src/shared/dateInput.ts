/**
 * Dates typed as DD-MM-RRRR (D544): „19-11-2026”, also with dots, slashes or spaces and one-digit day or month („3.1.2027”), and eight
 * digits without separators („19112026”) – recognised and shown as „19-11-2026”. Only real dates of the calendar (no 31-11).
 */
import { isoDay } from './format'

/** „2026-11-19” → „19-11-2026”. */
export const dmy = (iso: string): string => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`

/** The ISO date of a typed DD-MM-RRRR (or DDMMRRRR), null – not a date. */
export function parseDmy(text: string): string | null {
  const t = text.trim()
  const m = /^(\d{2})(\d{2})(\d{4})$/.exec(t) ?? /^(\d{1,2})[-./ ](\d{1,2})[-./ ](\d{4})$/.exec(t)
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return y < 1900 || y > 2999 ? null : isoDay(y, mo, d)
}

/** What the field shows while typing: eight digits that make a date become DD-MM-RRRR at once, anything else stays as typed. */
export function typedDmy(text: string): string {
  if (!/^\d{8}$/.test(text.trim())) return text
  const iso = parseDmy(text)
  return iso ? dmy(iso) : text
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
