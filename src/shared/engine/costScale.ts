/**
 * „Przelicz koszty ×N” (D566, D567): every stored cost per hour of the chosen pools and kinds multiplied by N (0,5–3 by 0,25, or your own
 * – `parseScaleFactor`, T2431), each pool
 * rounded half away from zero (1,5 → 2, −1,5 → −2) and clipped to −5…5 – the stored values change, the engine knows no factor. What it
 * touches: the subcategories' and the variants' own costs of the settings in force from the change's date (one dated change of rd.json); the
 * routines' costs (a routine has one cost without dates – changed at once); the own costs of blocks of the days' files from the change's date
 * (never a day gone by, never a block begun, taken off or passed – `ScaleDay.keep`), of the templates and of the series – a version from that
 * date (a later version too where its block still has the cost of the version in force then; a block new in it – its own). A plan lists every
 * change („przed → po”), the clipped pools marked; nothing that stays the same. „Cofnij” (`costScaleUndo`) takes back only what still stands
 * as the change left it. Pure – the window reads the records and the days and writes what the plan says (`features/settings/costScale.ts`).
 */
import { blockName, type Names } from '../blockName'
import { COST_MAX, COST_MIN, sameCosts } from '../model/blockCosts'
import { POOLS, type Costs, type Pool, type Variant } from '../model/categories'
import { categoryName } from '../model/rd'
import { templateVersionOn, type PlanBlock, type Template, type TemplateVersion } from '../model/plan'
import type { Routine } from '../model/routines'
import { seriesVersionOn, type Series, type SeriesPlan, type SeriesVersion } from '../model/series'
import type { RulesSettings } from '../model/settings'

/** The factors offered (D567 p.3): 0,5–3 by 0,25. */
export const COST_SCALE_FACTORS: readonly number[] = Array.from({ length: 11 }, (_, i) => 0.5 + i * 0.25)
/** The factor by default (D566). */
export const DEFAULT_SCALE = 2

/**
 * A factor of your own as typed (T2431): a positive number with a decimal comma or point („1,3” = 1.3); spaces around it and a leading
 * „×” / „x” are fine. Anything else (empty, 0, negative, a letter, two commas, an exponent, too long to be finite) – null.
 */
export function parseScaleFactor(text: string): number | null {
  const t = text.trim().replace(/^[×xX]\s*/, '').replace(',', '.')
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** „×1,5” – a Polish decimal comma; never an exponent (×0,0000001, not ×1e-7 – T2431). */
export const scaleLabel = (n: number): string => `×${n.toLocaleString('pl-PL', { maximumSignificantDigits: 15, useGrouping: false })}`

/** What the change may touch (D566): subcategories, variants, routines, the own costs of blocks (days and series), templates. */
export type ScaleScope = 'categories' | 'variants' | 'routines' | 'blocks' | 'templates'
export const SCALE_SCOPES: readonly ScaleScope[] = ['categories', 'variants', 'routines', 'blocks', 'templates']

/** Rounded half away from zero (never −0). */
export const roundHalfAway = (v: number): number => {
  const r = Math.sign(v) * Math.round(Math.abs(v))
  return r === 0 ? 0 : r
}

/**
 * One pool's cost × n: rounded half away from zero, clipped to −5…5 (`clipped` – it would have gone past). With a cost −5…5 and a factor
 * of up to four decimals the floating product rounds as the exact one (T2431 – checked in the tests for every such pair up to ×5); a factor
 * of more decimals rounds on the floating product (a half may differ in the last digit).
 */
export function scaleCost(v: number, n: number): { value: number; clipped: boolean } {
  const r = roundHalfAway(v * n)
  const value = Math.max(COST_MIN, Math.min(COST_MAX, r))
  return { value, clipped: value !== r }
}

/** The costs with the chosen pools × n (the others as they are); `clipped` – the pools that went past ±5. */
export function scaleCosts(c: Costs, n: number, pools: readonly Pool[]): { costs: Costs; clipped: Pool[] } {
  const out = { ...c }
  const clipped: Pool[] = []
  for (const p of POOLS) {
    if (!pools.includes(p)) continue
    const s = scaleCost(c[p], n)
    out[p] = s.value
    if (s.clipped) clipped.push(p)
  }
  return { costs: out, clipped }
}

export interface ScaleOptions {
  n: number
  pools: readonly Pool[]
  scope: readonly ScaleScope[]
}

/** A day as the change sees it: its blocks with their own costs (a file's; today – its plan) and those it never touches (begun, taken off, passed). */
export interface ScaleDay {
  date: string
  blocks: readonly PlanBlock[]
  keep?: ReadonlySet<string>
}

export interface ScaleInput {
  /** The settings in force from the change's date (and instant, „od dziś”). */
  settings: RulesSettings
  names: Names
  routines: readonly Routine[]
  templates: readonly Template[]
  series: readonly SeriesPlan[]
  days: readonly ScaleDay[]
  from: string
  today: string
}

export type ScaleKind = 'category' | 'variant' | 'routine' | 'day' | 'template' | 'series'

/**
 * One change of the plan: what (`kind`; `id` – the category, routine, template, series or the day's block; `sub` – the variant, the
 * template's block; `date` – the day, the version's date), its name, the costs before and after, the pools that changed and those clipped.
 */
export interface ScaleItem {
  kind: ScaleKind
  key: string
  id: string
  sub?: string
  date?: string
  name: string
  before: Costs
  after: Costs
  pools: Pool[]
  clipped: Pool[]
}

/** What to write: the patch of the dated settings (null – none), the routines' costs, the templates and series whole, the days' blocks. */
export interface ScaleWrite {
  settingsPatch: Record<string, unknown> | null
  routines: Array<{ id: string; costs: Costs }>
  templates: Template[]
  series: Series[]
  days: Array<{ date: string; block: PlanBlock; costs: Costs }>
}

export interface ScalePlan {
  items: ScaleItem[]
  write: ScaleWrite
}

const emptyWrite = (): ScaleWrite => ({ settingsPatch: null, routines: [], templates: [], series: [], days: [] })

/** An item for `before` scaled; null – nothing changes. */
function itemOf(o: Omit<ScaleItem, 'before' | 'after' | 'pools' | 'clipped'>, before: Costs, opts: ScaleOptions): ScaleItem | null {
  const { costs, clipped } = scaleCosts(before, opts.n, opts.pools)
  if (sameCosts(before, costs)) return null
  return { ...o, before, after: costs, pools: POOLS.filter((p) => before[p] !== costs[p]), clipped }
}

type Nameable = Pick<PlanBlock, 'categoryId' | 'variantId' | 'routine' | 'name'> & Partial<Pick<PlanBlock, 'origin' | 'sourceId' | 'requests' | 'note' | 'task'>>
/** The name of a block (its own name, task, routine, variant or category – never an id). */
const nameOf = (b: Nameable, names: Names): string => blockName({ requests: [], note: '', ...b }, names)

/** A variant as the list of a change writes it (as `variantsPatch`): only the fields it has. */
const variantEntry = (v: Variant): Variant => ({ id: v.id, name: v.name, ...(v.place ? { place: v.place } : {}), ...(v.costs ? { costs: { ...v.costs } } : {}), ...(v.archived ? { archived: true } : {}) })

/** The patch of the dated settings: a category's costs; its variants – the list whole, from the settings given (T517: those of the save's turn). */
function settingsPatchOf(s: RulesSettings, costs: ReadonlyMap<string, Costs>, variants: ReadonlyMap<string, ReadonlyMap<string, Costs>>): Record<string, unknown> | null {
  const cats: Record<string, Record<string, unknown>> = {}
  for (const [id, c] of costs) cats[id] = { costs: c }
  for (const [id, by] of variants) {
    const list = s.categories[id]?.variants ?? []
    cats[id] = { ...cats[id], variants: list.map((v) => variantEntry(by.has(v.id) ? { ...v, costs: by.get(v.id)! } : v)) }
  }
  return Object.keys(cats).length ? { categories: cats } : null
}

/** The subcategories' and variants' items and the patch of the dated settings. */
function settingsItems(i: ScaleInput, opts: ScaleOptions, items: ScaleItem[]): Record<string, unknown> | null {
  const costs = new Map<string, Costs>()
  const variants = new Map<string, Map<string, Costs>>()
  for (const [id, rules] of Object.entries(i.settings.categories)) {
    const cat = categoryName(i.names.rd, id)
    if (opts.scope.includes('categories')) {
      const it = itemOf({ kind: 'category', key: `category:${id}`, id, name: cat }, rules.costs, opts)
      if (it) {
        items.push(it)
        costs.set(id, it.after)
      }
    }
    if (!opts.scope.includes('variants')) continue
    for (const v of rules.variants) {
      if (!v.costs) continue
      const it = itemOf({ kind: 'variant', key: `variant:${id}:${v.id}`, id, sub: v.id, name: `${cat} · ${v.name}` }, v.costs, opts)
      if (!it) continue
      items.push(it)
      variants.set(id, (variants.get(id) ?? new Map<string, Costs>()).set(v.id, it.after))
    }
  }
  return settingsPatchOf(i.settings, costs, variants)
}


/** How a record of versions (a template, a series) is read and changed: its blocks with their own costs, the version with some changed, an item. */
interface Versioned<V> {
  blocks: (v: V) => ReadonlyArray<{ id: string; costs: Costs | null }>
  withCosts: (v: V, by: ReadonlyMap<string, Costs>) => V
  item: (v: V, id: string, before: Costs) => ScaleItem | null
}

/**
 * The versions with the own costs scaled from `from` (as `templateWithTimes` of the calibration): the version in force then – every block, as
 * a new version of that date (its own of that date replaced); a later one – a block that still has the cost it had in force at `from`, or one
 * new in it (one changed by hand keeps its cost). Null – nothing changes (no new version is made).
 */
function versionsFrom<V extends { from: string }>(versions: readonly V[], base: V | null, from: string, how: Versioned<V>, items: ScaleItem[]): V[] | null {
  let changed = false
  const scaled = (v: V, takes: (id: string, c: Costs) => boolean): V => {
    const by = new Map<string, Costs>()
    for (const b of how.blocks(v)) {
      if (!b.costs || !takes(b.id, b.costs)) continue
      const it = how.item(v, b.id, b.costs)
      if (!it) continue
      items.push(it)
      by.set(b.id, it.after)
    }
    if (!by.size) return v
    changed = true
    return how.withCosts(v, by)
  }
  const old = new Map(base ? how.blocks(base).map((b) => [b.id, b.costs]) : [])
  const first = base ? scaled({ ...base, from }, () => true) : null
  const later = versions.filter((v) => v.from > from).map((v) => scaled(v, (id, c) => !old.has(id) || (old.get(id) != null && sameCosts(old.get(id)!, c))))
  if (!changed) return null
  return [...versions.filter((v) => v.from < from), ...(first ? [first] : []), ...later]
}

function templateOf(t: Template, i: ScaleInput, opts: ScaleOptions, items: ScaleItem[]): Template | null {
  const versions = versionsFrom<TemplateVersion>(
    t.versions,
    templateVersionOn(t, i.from),
    i.from,
    {
      blocks: (v) => v.blocks,
      withCosts: (v, by) => ({ ...v, blocks: v.blocks.map((b) => (by.has(b.id) ? { ...b, costs: by.get(b.id)! } : b)) }),
      item: (v, id, before) => {
        const b = v.blocks.find((x) => x.id === id)!
        return itemOf({ kind: 'template', key: `template:${t.id}:${v.from}:${id}`, id: t.id, sub: id, date: v.from, name: `${t.name} · ${nameOf(b, i.names)}` }, before, opts)
      }
    },
    items
  )
  return versions ? { ...t, versions } : null
}

/** A series not ended before the change's date: a version from that date (from its start when it starts later). */
function seriesOf(p: SeriesPlan, i: ScaleInput, opts: ScaleOptions, items: ScaleItem[]): Series | null {
  const s = p.series
  if (p.last != null && p.last < i.from) return null
  const at = i.from < s.start ? s.start : i.from
  const versions = versionsFrom<SeriesVersion>(
    s.versions,
    seriesVersionOn(s, at),
    at,
    {
      blocks: (v) => [{ id: 'block', costs: v.block.costs }],
      withCosts: (v, by) => ({ ...v, block: { ...v.block, costs: by.get('block') ?? v.block.costs } }),
      item: (v, _id, before) => itemOf({ kind: 'series', key: `series:${s.id}:${v.from}`, id: s.id, date: v.from, name: nameOf({ ...v.block, origin: 'series', sourceId: s.root }, i.names) }, before, opts)
    },
    items
  )
  return versions ? { ...s, versions } : null
}

/** What the change does (D566, D567): every item that changes, and what to write. */
export function costScalePlan(i: ScaleInput, opts: ScaleOptions): ScalePlan {
  const items: ScaleItem[] = []
  const write = emptyWrite()
  write.settingsPatch = settingsItems(i, opts, items)
  if (opts.scope.includes('routines'))
    for (const r of i.routines) {
      const it = r.costs ? itemOf({ kind: 'routine', key: `routine:${r.id}`, id: r.id, name: r.name }, r.costs, opts) : null
      if (!it) continue
      items.push(it)
      write.routines.push({ id: r.id, costs: it.after })
    }
  if (opts.scope.includes('blocks')) {
    for (const d of i.days) {
      // Never a day gone by (a frozen one among them), never one before the change's date.
      if (d.date < i.from || d.date < i.today) continue
      for (const b of d.blocks) {
        if (!b.costs || d.keep?.has(b.id)) continue
        const it = itemOf({ kind: 'day', key: `day:${d.date}:${b.id}`, id: b.id, date: d.date, name: nameOf(b, i.names) }, b.costs, opts)
        if (!it) continue
        items.push(it)
        write.days.push({ date: d.date, block: b, costs: it.after })
      }
    }
    for (const p of i.series) {
      const s = seriesOf(p, i, opts, items)
      if (s) write.series.push(s)
    }
  }
  if (opts.scope.includes('templates'))
    for (const t of i.templates) {
      const next = t.archived ? null : templateOf(t, i, opts, items)
      if (next) write.templates.push(next)
    }
  return { items, write }
}


/** The records as they are when „Cofnij” comes (the settings in force from the change's date and instant; the series' records). */
export type UndoInput = Pick<ScaleInput, 'settings' | 'routines' | 'templates' | 'days'> & { series: readonly Series[] }

/** What „Cofnij” writes, what it takes back and what it leaves (changed since – D567 p.4). */
export interface ScaleUndo {
  write: ScaleWrite
  restored: ScaleItem[]
  kept: ScaleItem[]
}

/** „Cofnij”: each item back to `before` while it still stands at `after`; the rest stays (`kept`, said by the line). */
export function costScaleUndo(now: UndoInput, items: readonly ScaleItem[]): ScaleUndo {
  const restored: ScaleItem[] = []
  const kept: ScaleItem[] = []
  const write = emptyWrite()
  const take = (it: ScaleItem, current: Costs | null | undefined): boolean => {
    const ok = current != null && sameCosts(current, it.after)
    ;(ok ? restored : kept).push(it)
    return ok
  }
  const costs = new Map<string, Costs>()
  const variants = new Map<string, Map<string, Costs>>()
  const templates = new Map(now.templates.map((t) => [t.id, t]))
  const series = new Map(now.series.map((s) => [s.id, s]))
  const touchedT = new Set<string>()
  const touchedS = new Set<string>()
  for (const it of items) {
    switch (it.kind) {
      case 'category':
        if (take(it, now.settings.categories[it.id]?.costs)) costs.set(it.id, it.before)
        break
      case 'variant':
        if (take(it, now.settings.categories[it.id]?.variants.find((v) => v.id === it.sub)?.costs)) variants.set(it.id, (variants.get(it.id) ?? new Map<string, Costs>()).set(it.sub!, it.before))
        break
      case 'routine':
        if (take(it, now.routines.find((r) => r.id === it.id)?.costs)) write.routines.push({ id: it.id, costs: it.before })
        break
      case 'day': {
        const d = now.days.find((x) => x.date === it.date)
        const b = d && !d.keep?.has(it.id) ? d.blocks.find((x) => x.id === it.id) : undefined
        if (take(it, b?.costs) && b) write.days.push({ date: it.date!, block: b, costs: it.before })
        break
      }
      case 'template': {
        const t = templates.get(it.id)
        const v = t?.versions.find((x) => x.from === it.date)
        if (!take(it, v?.blocks.find((b) => b.id === it.sub)?.costs) || !t || !v) break
        templates.set(t.id, { ...t, versions: t.versions.map((x) => (x === v ? { ...v, blocks: v.blocks.map((b) => (b.id === it.sub ? { ...b, costs: it.before } : b)) } : x)) })
        touchedT.add(t.id)
        break
      }
      case 'series': {
        const s = series.get(it.id)
        const v = s?.versions.find((x) => x.from === it.date)
        if (!take(it, v?.block.costs) || !s || !v) break
        series.set(s.id, { ...s, versions: s.versions.map((x) => (x === v ? { ...v, block: { ...v.block, costs: it.before } } : x)) })
        touchedS.add(s.id)
        break
      }
    }
  }
  write.settingsPatch = settingsPatchOf(now.settings, costs, variants)
  write.templates = [...touchedT].map((id) => templates.get(id)!)
  write.series = [...touchedS].map((id) => series.get(id)!)
  return { write, restored, kept }
}

