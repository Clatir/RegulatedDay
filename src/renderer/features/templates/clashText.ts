/**
 * The words about two templates of one type on one weekday (D563 P3, D72 – a warning, nothing is blocked): per rival the days they share,
 * for the editor of the template. `templateClashes` (`shared/model/plan`) says who wins; the smaller id wins, quietly, as before.
 */
import { WEEKDAY_SHORT } from '@shared/format'
import type { TemplateClash } from '@shared/model/plan'

/** The days of a clash as the list of templates says them: „pn, wt”, the type's default – „domyślny dla typu”. */
const daysText = (days: ReadonlyArray<number | null>): string => days.map((d) => (d == null ? 'domyślny dla typu' : WEEKDAY_SHORT[d - 1])).join(', ')

/** The clashes grouped by the rival (in the order they come), each with the days they share. */
function perRival(clashes: readonly TemplateClash[]): Array<{ name: string; days: string }> {
  const groups = new Map<string, { name: string; days: Array<number | null> }>()
  for (const c of clashes) {
    const g = groups.get(c.other.id) ?? { name: c.other.name, days: [] }
    g.days.push(c.weekday)
    groups.set(c.other.id, g)
  }
  return [...groups.values()].map((g) => ({ name: g.name, days: daysText(g.days) }))
}

/** „pn, wt: wygrywa „X”” – the days this template does not make for the one that wins there. */
export function losesText(loses: readonly TemplateClash[]): string[] {
  return perRival(loses).map((g) => `${g.days}: szablon „${g.name}” wygrywa – tych dni ten szablon nie tworzy`)
}

/** „pn: ten wygrywa z „Y”” – the days this template makes though another one has them too. */
export function winsText(wins: readonly TemplateClash[]): string[] {
  return perRival(wins).map((g) => `${g.days}: ten szablon wygrywa z „${g.name}”`)
}
