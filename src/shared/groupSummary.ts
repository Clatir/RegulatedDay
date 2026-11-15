/**
 * The line over a selection of two or more (D527, D524): „Zaznaczone: 4 · 3 h 20 min · energia −18 G · −6 E · −4 B · −2 C” – how many,
 * their time together (in „Sprawy” the estimates) and their cost in the points of the pools, always the four, G · E · B · C: the cost
 * per hour times the minutes, summed, rounded to a whole number; a use with a minus, a regeneration with a plus, none as „0”.
 * „Zaznaczone dni: 7” for the days of the calendar. Pure – the screens give the minutes and the costs.
 */
import { durationLabel, formatNumber } from './format'
import { POOL_LETTER, POOLS, type Costs, type Pool } from './model/categories'

/** One selected element: its minutes and its cost per hour (null – none known: it adds nothing to the energy). */
export interface SummaryItem {
  minutes: number
  costs: Costs | null
}

/** The fewest selected elements the line is shown for. */
export const SUMMARY_MIN = 2

/** Rounds half away from zero (a regeneration of −2.5 is „+3” as a use of 2.5 is „−3”). */
const roundAway = (x: number): number => Math.sign(x) * Math.round(Math.abs(x))

/** The points each pool uses (positive) or regains (negative) in all the elements together, whole numbers. */
export function poolPoints(items: readonly SummaryItem[]): Record<Pool, number> {
  const out = { head: 0, emotions: 0, senses: 0, body: 0 }
  for (const p of POOLS) out[p] = roundAway(items.reduce((sum, i) => sum + (i.costs ? i.costs[p] * Math.max(0, i.minutes) : 0), 0) / 60) + 0
  return out
}

/** A pool's points as the line says them: a use „−18”, a regeneration „+3”, none „0” (the minus is U+2212). */
export const pointsText = (points: number): string => (points > 0 ? `−${formatNumber(points)}` : points < 0 ? `+${formatNumber(-points)}` : '0')

/**
 * „Zaznaczone: 4 · 3 h 20 min · energia −18 G · −6 E · −4 B · −2 C”; null for fewer than two. `energy: false` (the energy module is
 * off) leaves the energy part out.
 */
export function groupSummary(items: readonly SummaryItem[], opts: { energy?: boolean } = {}): string | null {
  if (items.length < SUMMARY_MIN) return null
  const minutes = items.reduce((sum, i) => sum + Math.max(0, i.minutes), 0)
  const parts = [`Zaznaczone: ${formatNumber(items.length)}`, durationLabel(minutes)]
  if (opts.energy !== false) {
    const points = poolPoints(items)
    parts.push(`energia ${POOLS.map((p) => `${pointsText(points[p])} ${POOL_LETTER[p]}`).join(' · ')}`)
  }
  return parts.join(' · ')
}

/** „Zaznaczone dni: 7” (the calendar); null for fewer than two. */
export const daysSummary = (count: number): string | null => (count < SUMMARY_MIN ? null : `Zaznaczone dni: ${formatNumber(count)}`)
