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
 *    (it changes from now on) as the engine counts it now (`begunToday`: its start's category, variant and routine, its own cost and its
 *    routine's from its start and their changes – T1434), not as its file says; any other change (a name, a colour, the steps) follows the
 *    plan – today's begun blocks as their file says (T1443);
 *  - a later entry of the settings that writes the same key from a later date (`overriddenFrom`): nothing from that date on – no day, no
 *    version, no series starting then (the line of its composition says until when);
 *  - not counted: a day beyond `SCOPE_DAYS` and a day whose file cannot be read now (`unread` – said in the window).
 * A change of cost reaches only the blocks whose cost it is – the order of a block's cost is its own → its routine's → its variant's → its
 * subcategory's (D512, T1398): a subcategory's – none of their own, no routine with a cost of its own (a block of the kind „rutyna”, T1371)
 * and no variant with one; a variant's – none of their own and no such routine; a routine's – its blocks of the kind „rutyna” without a
 * cost of their own. Any other change reaches every block of the thing.
 */
import { blockInfos } from '@shared/engine/blocks'
import { begunBasis, costChangesOf, routineOfStart, startRoutine } from '@shared/engine/costChange'
import { routineCostsIn, type DayContext } from '@shared/engine/day'
import type { DayFacts } from '@shared/engine/facts'
import { idxOf } from '@shared/engine/grid'
import type { CategoryRules, Costs } from '@shared/model/categories'
import { variantHasCosts } from '@shared/model/categories'
import { countLabel, plDate } from '@shared/format'
import { dayFileFrom, layerKept, templateVersionOn, type DayFile, type PlanBlock, type Template } from '@shared/model/plan'
import { NO_ROUTINE_COSTS, routineCostApplies, routineCostOf, type RoutineCosts } from '@shared/model/routines'
import { seriesVersionOn, type SeriesPlan } from '@shared/model/series'
import type { SettingsChange } from '@shared/model/settings'
import { addDays } from '@shared/time/zone'

/** The days read for the count: today and the 61 after it. */
export const SCOPE_DAYS = 62

export type EditTarget = { kind: 'category'; id: string } | { kind: 'variant'; categoryId: string; id: string } | { kind: 'routine'; id: string }

/** What the edit changes: `costs` only the cost (blocks without their own), `all` anything else (every block of the thing). */
export type EditWhat = 'costs' | 'all'

/**
 * A block as the count looks at it: as planned, or – one begun today, for a change of the cost only (T1443) – as the engine counts it now
 * (`begunToday`): `routineCosts` its routine's cost then (null – none), `routineApplies` whether a change of its routine's cost reaches it
 * (its start's category of the kind „rutyna” in the day's snapshot).
 */
export type Counted = Pick<PlanBlock, 'categoryId' | 'variantId' | 'routine' | 'costs'> & { routineCosts?: Costs | null; routineApplies?: boolean }

/**
 * Whether the edit reaches the block. `routines` – the routines' costs now (`routineCostsOf`): a block of the kind „rutyna” whose routine
 * has a cost of its own costs that before its variant's and subcategory's (D512) – a change of theirs does not reach it. A block begun
 * today (`routineCosts` given) – by its routine's cost as the engine counts it, not by the routine's now (T1434).
 */
export function reaches(b: Counted, t: EditTarget, what: EditWhat, categories: Readonly<Record<string, CategoryRules | undefined>>, routines: RoutineCosts = NO_ROUTINE_COSTS): boolean {
  const ofRoutines = b.routineApplies ?? routineCostApplies(categories, b.categoryId)
  if (t.kind === 'routine') return b.routine === t.id && (what === 'all' || (b.costs == null && ofRoutines))
  // The routine's cost before the variant's and the subcategory's (a routine not known now costs as none, T1372).
  const routineFirst = (b.routineCosts !== undefined ? b.routineCosts : ofRoutines ? routineCostOf(routines, b.routine ?? null) : null) != null
  if (t.kind === 'variant') return b.categoryId === t.categoryId && b.variantId === t.id && (what === 'all' || (b.costs == null && !routineFirst))
  if (b.categoryId !== t.id) return false
  if (what === 'all') return true
  const rules = categories[t.id]
  return b.costs == null && !routineFirst && !(rules && variantHasCosts(rules, b.variantId))
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
  /** The routines' costs now (`reaches`); left out – none. */
  routineCosts?: RoutineCosts
  /** Today's blocks that have ended (from today's log) – a change of the cost only does not reach them (D501). */
  ended?: ReadonlySet<string>
  /**
   * Today's blocks begun and not ended, as the engine counts them now (`begunToday`) – for a change of the cost only counted so, not as
   * today's file says (T1434); any other change follows the file (T1443).
   */
  begun?: ReadonlyMap<string, Counted>
  /** `overriddenFrom` – nothing is counted from this date on; left out – none. */
  until?: string | null
}): ScopeCount {
  const until = o.until ?? null
  const hit = (b: Counted) => reaches(b, o.target, o.what, o.categories, o.routineCosts)
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
    const counted = (b: PlanBlock): Counted => (o.what === 'costs' && date === o.today ? (o.begun?.get(b.id) ?? b) : b)
    days += f.blocks.filter((b) => !f.cancelled.includes(b.id) && !(b.id in f.movedTo) && !layerKept(b) && !countedElsewhere(b) && !gone(b, date) && hit(counted(b))).length
  }
  return { days, templates, series: ofSeries.size, total: days + templates + ofSeries.size, unread, until }
}

/**
 * Today's blocks begun and not ended as the engine counts them at `at` (T1434): their start's category, variant and routine, their own cost
 * and their routine's (`begunBasis` – the same as the tile and the energy: from the start and the changes of the day's log, `routine.cost`
 * too). `ctx`, `facts` – today as read now (`plannedDay`).
 */
export function begunToday(ctx: DayContext, facts: DayFacts, at: number): Map<string, Counted> {
  const out = new Map<string, Counted>()
  const changes = costChangesOf(ctx, facts)
  const k = idxOf(facts.grid, at)
  const categories = ctx.snapshot.settings.categories
  const plan = new Map(ctx.plan.map((b) => [b.id, b]))
  for (const info of blockInfos(facts.grid, ctx.plan, facts, ctx.snapshot.settings, routineCostsIn(ctx))) {
    const f = facts.blocks.get(info.id)
    if (f?.startedAt == null || f.endedAt != null) continue
    const p = plan.get(info.id)
    const x = begunBasis(info, f.planned, changes.get(info.id), k)
    out.set(info.id, { categoryId: x.cat, variantId: x.variant, routine: startRoutine(f, p), costs: x.own, routineCosts: x.routine, routineApplies: routineOfStart(f, p, categories) != null })
  }
  return out
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
