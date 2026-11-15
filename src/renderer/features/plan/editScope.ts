/**
 * How many blocks a quick edit from a block's panel changes (D514, T1325, T1333–T1336): the window says „Zmieni N bloków od dziś”. The edit
 * is dated settings from now on (a subcategory's class, costs, place, properties; a variant's list) or a record without a date (a routine,
 * a subcategory's name, colour, category and calendar), so the blocks it reaches are counted where they stand from today on, each once:
 *  - the templates' blocks – of each template not archived, the version in force today and every later one (a block of several versions
 *    once) – and the series' blocks – of each series not ended, the same versions (the series once) –, though they come back on many days;
 *  - the days' own files of today and the 61 days after it (`SCOPE_DAYS`, what the main process reads at once) – the blocks a day's file
 *    holds (new ones and the template's changed for that day, not cancelled, not moved away), without the blocks of the day's layers
 *    (`layerKept`: a session, a lecture, a class of a „zjazd” – none of them is the user's to change) and without a block of a template or
 *    a series changed for that day whose block is counted under the template or the series already;
 *  - a change of the cost only: not today's blocks already ended (their minutes stay counted by the old cost, D501) – a begun one counts
 *    (it changes from now on);
 *  - a later entry of the settings that writes the same key from a later date (`overriddenFrom`): nothing from that date on – no day, no
 *    version, no series starting then (the line of its composition says until when);
 *  - not counted: a day beyond `SCOPE_DAYS` and a day whose file cannot be read now (`unread` – said in the window).
 * A change of cost reaches only the blocks that have none of their own (and – a subcategory's cost – no variant with a cost of its own);
 * any other change reaches every block of the thing.
 */
import type { CategoryRules } from '@shared/model/categories'
import { variantHasCosts } from '@shared/model/categories'
import { countLabel, plDate } from '@shared/format'
import { dayFileFrom, layerKept, templateVersionOn, type DayFile, type PlanBlock, type Template } from '@shared/model/plan'
import { seriesVersionOn, type SeriesPlan } from '@shared/model/series'
import type { SettingsChange } from '@shared/model/settings'
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
  /** The date a later entry of the settings writes over the change from (nothing counted from it on); null – none. */
  until: string | null
}

/** The dates the count looks at. */
export const scopeDates = (today: string): string[] => Array.from({ length: SCOPE_DAYS }, (_, i) => addDays(today, i))

/** The versions the edit reaches: the one in force today and every later one – before `until`. */
const versionsInScope = <T extends { from: string }>(versions: readonly T[], inForce: T | null, today: string, until: string | null): T[] =>
  versions.filter((v) => (v === inForce || v.from > today) && (until == null || v.from < until))

/** The blocks of the days' files, the templates and the series the edit reaches; `files` – as `window.rd.dayFiles` answers (a date missing – unreadable). */
export function countScope(o: {
  today: string
  files: Readonly<Record<string, Record<string, unknown> | null>>
  templates: readonly Template[]
  series: readonly SeriesPlan[]
  target: EditTarget
  what: EditWhat
  categories: Readonly<Record<string, CategoryRules | undefined>>
  /** Today's blocks that have ended (from today's log) – a change of the cost only does not reach them (D501). */
  ended?: ReadonlySet<string>
  /** `overriddenFrom` – nothing is counted from this date on; left out – none. */
  until?: string | null
}): ScopeCount {
  const until = o.until ?? null
  const hit = (b: Counted) => reaches(b, o.target, o.what, o.categories)
  // The templates and the series first: a block of theirs changed for a day is counted with them, once.
  const ofTemplates = new Set<string>()
  let templates = 0
  for (const t of o.templates) {
    if (t.archived) continue
    const ids = new Set<string>()
    for (const v of versionsInScope(t.versions, templateVersionOn(t, o.today), o.today, until)) for (const b of v.blocks) if (hit(b)) ids.add(b.id)
    templates += ids.size
    for (const id of ids) ofTemplates.add(id)
  }
  const ofSeries = new Set<string>()
  for (const p of o.series) {
    const s = p.series
    if (s.archived || (p.last != null && p.last < o.today) || (until != null && s.start >= until)) continue
    if (versionsInScope(s.versions, seriesVersionOn(s, o.today), o.today, until).some((v) => hit(v.block))) ofSeries.add(s.root)
  }
  const countedElsewhere = (b: PlanBlock) => b.sourceId != null && ((b.origin === 'template' && ofTemplates.has(b.sourceId)) || (b.origin === 'series' && ofSeries.has(b.sourceId)))
  const gone = (b: PlanBlock, date: string) => o.what === 'costs' && date === o.today && o.ended?.has(b.id) === true
  let days = 0
  let unread = 0
  for (const date of scopeDates(o.today)) {
    if (until != null && date >= until) break
    const raw = o.files[date]
    if (raw === undefined) {
      unread++
      continue
    }
    if (!raw) continue
    const f: DayFile = dayFileFrom(raw, date)
    days += f.blocks.filter((b) => !f.cancelled.includes(b.id) && !(b.id in f.movedTo) && !layerKept(b) && !countedElsewhere(b) && !gone(b, date) && hit(b)).length
  }
  return { days, templates, series: ofSeries.size, total: days + templates + ofSeries.size, unread, until }
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** The paths of what a patch of the settings writes: an object goes on (laid over object by object), anything else – a value, a list (replaced whole) – is a leaf. */
function leaves(patch: Record<string, unknown>, at: readonly string[] = []): string[][] {
  return Object.entries(patch).flatMap(([k, v]) => (isPlain(v) ? leaves(v, [...at, k]) : [[...at, k]]))
}

/** A later patch writes over the leaf at `path`: it has a value there, or one on the way to it that is not an object. */
function writesOver(patch: unknown, path: readonly string[]): boolean {
  let node = patch
  for (const k of path) {
    if (!isPlain(node) || !(k in node)) return false
    node = node[k]
    if (!isPlain(node)) return node !== undefined
  }
  return true
}

/**
 * The date from which a change written from today on (`written` – its patch) no longer applies at all (T1336): every key it writes is
 * written over by an entry of a later date (an „od jutra” or a date chosen in the settings before) – the latest of the first such dates of
 * its keys. Null – some key of it is never written over (also: nothing dated written).
 */
export function overriddenFrom(changes: readonly SettingsChange[], today: string, written: Record<string, unknown>): string | null {
  const paths = leaves(written)
  if (!paths.length) return null
  let end: string | null = null
  for (const path of paths) {
    let first: string | null = null
    for (const ch of changes) if (ch.from > today && (first == null || ch.from < first) && writesOver(ch.patch, path)) first = ch.from
    if (first == null) return null
    if (end == null || first > end) end = first
  }
  return end
}

/** „Zmieni 3 bloki od dziś” – the line of the window. */
export function scopeText(c: ScopeCount): string {
  return `Zmieni ${countLabel(c.total, 'blok', 'bloki', 'bloków')} od dziś`
}

/** What the number is made of – said small under the line, so that it is never taken for more than it is. */
export function scopeDetail(c: ScopeCount): string {
  const parts = [`w dniach: ${c.days}`, `w szablonach: ${c.templates}`, `w seriach: ${c.series}`]
  const until = c.until ? ` (do ${plDate(addDays(c.until, -1))}: od ${plDate(c.until)} tę zmianę zastępuje wpis z Ustawień)` : ''
  return `${parts.join(' · ')}. Blok szablonu albo serii liczy się raz, choć wraca w wielu dniach; dni z planem – najbliższe ${SCOPE_DAYS}${until}; bloków sesji, wykładów i zjazdów nie liczę.${c.unread ? ` Nie policzono ${c.unread} nieczytelnych dni.` : ''}`
}
