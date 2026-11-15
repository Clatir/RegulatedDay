/**
 * How many blocks a quick edit from a block's panel changes (D514, T1325): the window says „Zmieni N bloków od dziś”. The edit is
 * dated settings from now on (a subcategory's class, costs, place, properties; a variant's list) or a record without a date (a routine,
 * a subcategory's name, colour, category and calendar), so the blocks it reaches are counted where they stand from today on:
 *  - the days' own files of today and the 61 days after it (`SCOPE_DAYS`, what the main process reads at once) – the blocks a day's file
 *    holds (new ones and the template's changed for that day, not cancelled, not moved away);
 *  - the templates' blocks (the last version of each template that is not archived) and the series' blocks (the last version of each
 *    series that has not ended) – each block once, though it comes back on many days;
 *  - not counted: the sessions of the layer and the plan of lectures (no block of theirs is the user's to change), a day beyond
 *    `SCOPE_DAYS` and a day whose file cannot be read now (`unread` – said in the window).
 * A change of cost reaches only the blocks that have none of their own (and – a subcategory's cost – no variant with a cost of its own);
 * any other change reaches every block of the thing.
 */
import type { CategoryRules } from '@shared/model/categories'
import { variantHasCosts } from '@shared/model/categories'
import { countLabel } from '@shared/format'
import { dayFileFrom, type DayFile, type PlanBlock, type Template } from '@shared/model/plan'
import type { SeriesPlan } from '@shared/model/series'
import { addDays } from '@shared/time/zone'

/** The days read for the count: today and the 61 after it. */
export const SCOPE_DAYS = 62

export type EditTarget = { kind: 'category'; id: string } | { kind: 'variant'; categoryId: string; id: string } | { kind: 'routine'; id: string }

/** What the edit changes: `costs` only the cost (blocks without their own), `all` anything else (every block of the thing). */
export type EditWhat = 'costs' | 'all'

type Counted = Pick<PlanBlock, 'categoryId' | 'variantId' | 'routine' | 'costs'>

/** Whether the edit reaches the block. */
export function reaches(b: Counted, t: EditTarget, what: EditWhat, categories: Readonly<Record<string, CategoryRules | undefined>>): boolean {
  if (t.kind === 'routine') return b.routine === t.id
  if (t.kind === 'variant') return b.categoryId === t.categoryId && b.variantId === t.id && (what === 'all' || b.costs == null)
  if (b.categoryId !== t.id) return false
  if (what === 'all') return true
  const rules = categories[t.id]
  return b.costs == null && !(rules && variantHasCosts(rules, b.variantId))
}

export interface ScopeCount {
  days: number
  templates: number
  series: number
  total: number
  /** Days whose file could not be read now (not counted). */
  unread: number
}

/** The dates the count looks at. */
export const scopeDates = (today: string): string[] => Array.from({ length: SCOPE_DAYS }, (_, i) => addDays(today, i))

const last = <T extends { from: string }>(list: readonly T[]): T | undefined => list.reduce<T | undefined>((a, v) => (!a || v.from >= a.from ? v : a), undefined)

/** The blocks of the days' files, the templates and the series the edit reaches; `files` – as `window.rd.dayFiles` answers (a date missing – unreadable). */
export function countScope(o: {
  today: string
  files: Readonly<Record<string, Record<string, unknown> | null>>
  templates: readonly Template[]
  series: readonly SeriesPlan[]
  target: EditTarget
  what: EditWhat
  categories: Readonly<Record<string, CategoryRules | undefined>>
}): ScopeCount {
  const hit = (b: Counted) => reaches(b, o.target, o.what, o.categories)
  let days = 0
  let unread = 0
  for (const date of scopeDates(o.today)) {
    const raw = o.files[date]
    if (raw === undefined) {
      unread++
      continue
    }
    if (!raw) continue
    const f: DayFile = dayFileFrom(raw, date)
    days += f.blocks.filter((b) => !f.cancelled.includes(b.id) && !(b.id in f.movedTo) && hit(b)).length
  }
  const templates = o.templates.filter((t) => !t.archived).reduce((n, t) => n + (last(t.versions)?.blocks.filter(hit).length ?? 0), 0)
  const series = o.series.filter((p) => !p.series.archived && (p.last == null || p.last >= o.today)).reduce((n, p) => n + (hitSeries(last(p.series.versions)?.block, hit) ? 1 : 0), 0)
  return { days, templates, series, total: days + templates + series, unread }
}

const hitSeries = (b: Counted | undefined, hit: (b: Counted) => boolean): boolean => (b ? hit({ categoryId: b.categoryId, variantId: b.variantId, routine: b.routine, costs: b.costs }) : false)

/** „Zmieni 3 bloki od dziś” – the line of the window. */
export function scopeText(c: ScopeCount): string {
  return `Zmieni ${countLabel(c.total, 'blok', 'bloki', 'bloków')} od dziś`
}

/** What the number is made of – said small under the line, so that it is never taken for more than it is. */
export function scopeDetail(c: ScopeCount): string {
  const parts = [`w dniach: ${c.days}`, `w szablonach: ${c.templates}`, `w seriach: ${c.series}`]
  return `${parts.join(' · ')}. Blok szablonu albo serii liczy się raz, choć wraca w wielu dniach; dni z planem – najbliższe ${SCOPE_DAYS}; sesji i wykładów nie liczę.${c.unread ? ` Nie policzono ${c.unread} nieczytelnych dni.` : ''}`
}
