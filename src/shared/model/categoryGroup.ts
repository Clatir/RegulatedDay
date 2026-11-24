/**
 * A change of many subcategories and variants of the tree at once (D608, D609 – „Zmień 6 podkategorii” in „Kategorie”). Pure: the window
 * gives rd.json as it is in the turn of the save (T517) and writes what this gives in ONE edit of it.
 *
 * What a change is: „Koszt…” (the pools touched in its window – only they are written and taken back, the rest of each one stays), „Miejsce” and „Usuń” of a variant are dated
 * settings – one patch from the date of the bar „od jutra / od dziś / od daty” (as one change of a field there; a subcategory's variants
 * are its list written whole, made from the settings of that date); „Przenieś do kategorii” and „Usuń” of a subcategory are rd.json's
 * and work at once (the same functions as one change: `setCategoryGroupRaw`, the archive, a subcategory whose addition still waits for
 * its date going whole – `withoutPlannedCategory`, T2353). What does not concern a part of the selection acts on the rest and says how
 * many it left (D72): a variant stays with its subcategory, one already in the archive. A variant without its own cost or place gets its
 * own (D609) – the pools not touched from the cost it has (its subcategory's).
 *
 * „Cofnij” (as D567 p.4): each change back while it still stands as the change left it – the dated ones by a new dated change from the
 * same date and instant, those of rd.json field by field; what changed since stays (`kept`, said by the line).
 */
import { deepEqual, diffRecords, setAt, valueAt, type FieldChange } from '../data/merge'
import { countLabel, plural } from '../format'
import { sameCosts } from './blockCosts'
import { isStartingCategory, isStartingVariant, POOLS, type CategoryRules, type Costs, type Place, type Pool, type Variant } from './categories'
import { archiveVariant, changeVariant, setCategoryGroupRaw, type TreeGroup, type TreeSource, type VariantEntry } from './categoryTree'
import { rdFrom } from './rd'
import { isPlain, settingsOn, type RulesSettings } from './settings'
import { isPlannedChange, withoutPlannedCategory } from './settingsWithdraw'

type Raw = Record<string, unknown>

/** An element of the tree a selection holds: a subcategory, or a variant of one. */
export type TreeItem = { kind: 'category'; category: string } | { kind: 'variant'; category: string; variant: string }

/** Ids never hold it: the key of a variant names its subcategory and itself. */
const SEP = '\u0001'
export const categoryKey = (id: string): string => `c${SEP}${id}`
export const variantKey = (category: string, variant: string): string => `v${SEP}${category}${SEP}${variant}`

/** The element of a key (null – no key of the tree). */
export function treeItemOf(key: string): TreeItem | null {
  const [k, a, b, ...rest] = key.split(SEP)
  if (rest.length || !a) return null
  if (k === 'c' && b === undefined) return { kind: 'category', category: a }
  if (k === 'v' && b) return { kind: 'variant', category: a, variant: b }
  return null
}

/**
 * The elements of the tree in the order the screen shows them (D608 – Shift+click and Ctrl+A go by it): each group's subcategories, and under
 * the one open its variants (those shown – the archived only with the archive). `open` `'all'` – every subcategory's variants: what a selection
 * keeps when a subcategory is folded („mniej”) – a variant selected stays selected, out of sight.
 */
export function treeOrder(tree: readonly TreeGroup[], rules: Readonly<Record<string, CategoryRules>>, open: string | null | 'all', showArchived: boolean): string[] {
  const out: string[] = []
  for (const g of tree)
    for (const id of g.categories) {
      const c = rules[id]
      if (!c) continue
      out.push(categoryKey(id))
      if (open === 'all' || id === open) for (const v of c.variants) if (showArchived || !v.archived) out.push(variantKey(id, v.id))
    }
  return out
}

/** What an element has in the settings `s`: its cost an hour (a variant without its own – its subcategory's) and its place (likewise); null – not there. */
export function treeValues(s: RulesSettings, item: TreeItem): { costs: Costs; place: Place } | null {
  const rules = s.categories[item.category]
  if (!rules) return null
  if (item.kind === 'category') return { costs: rules.costs, place: rules.place }
  const v = rules.variants.find((x) => x.id === item.variant)
  return v ? { costs: v.costs ?? rules.costs, place: v.place ?? rules.place } : null
}

/** An element of the list „Uzupełnij ciało”: its key and item, its name for the window (a variant: „Podkategoria › Wariant”) and its cost now. */
export interface BodyGap {
  key: string
  item: TreeItem
  name: string
  costs: Costs
}

/**
 * What „Uzupełnij ciało” offers (D623, N14), in the order of the tree: the subcategories of yours (not archived – the tree has none of those) whose body cost
 * is 0 in the settings `s` (of the bar's date) and the variants of yours with a cost of their own and the body 0 in it. A variant „jak podkategoria”
 * follows its subcategory; an archived one is out of the tree; the starting subcategories and variants are left out – D523 gave each its body
 * cost, a 0 there is a value (the ones you added start with 0 – those are the gaps).
 */
export function bodyMissing(tree: readonly TreeGroup[], s: RulesSettings, src: Pick<TreeSource, 'categories'>): BodyGap[] {
  const out: BodyGap[] = []
  for (const key of treeOrder(tree, s.categories, 'all', false)) {
    const item = treeItemOf(key)
    const rules = item ? s.categories[item.category] : undefined
    if (!item || !rules) continue
    const name = src.categories[item.category]?.name ?? ''
    if (item.kind === 'category') {
      if (!isStartingCategory(item.category) && rules.costs.body === 0) out.push({ key, item, name, costs: rules.costs })
      continue
    }
    const v = rules.variants.find((x) => x.id === item.variant)
    if (v?.costs && v.costs.body === 0 && !isStartingVariant(item.category, item.variant)) out.push({ key, item, name: `${name} › ${v.name}`, costs: v.costs })
  }
  return out
}

/** The value of each pool all of `list` share – a ✓ of the window „Koszt…”; a pool where they differ (or none) is null – „—” (D609). */
export function commonPools(list: readonly Costs[]): Record<Pool, number | null> {
  const out = {} as Record<Pool, number | null>
  for (const p of POOLS) out[p] = list.length && list.every((c) => c[p] === list[0]![p]) ? list[0]![p] : null
  return out
}

/**
 * What a menu of the selection does (D609). `costs` – only the pools touched in the window, the same for every element. `costsEach` – „Uzupełnij
 * ciało” (D623): the pools to set each element's own (by its key; an element with none is left), written in the same one change.
 */
export type TreeAction =
  | { kind: 'costs'; costs: Partial<Costs> }
  | { kind: 'costsEach'; values: Readonly<Record<string, Partial<Costs>>> }
  | { kind: 'place'; place: Place }
  | { kind: 'move'; group: string }
  | { kind: 'remove' }

/** The pools a partial cost sets. */
const poolsIn = (costs: Partial<Costs>): Pool[] => POOLS.filter((p) => costs[p] !== undefined)

/**
 * One change made: of what (`key`, `item`), which field, before and after. `dated` – a field of the dated settings (a cost, a place, a
 * variant's archive: `before` / `after` its value then – a variant's own cost or place, null „jak podkategoria”); otherwise rd.json's (a
 * subcategory's category or archive, one removed whole): `edits` – the fields of rd.json it changed (`before` → `after` each), `added` –
 * the date of the addition of a subcategory removed whole (its „Cofnij” only while that is still to come).
 */
export interface TreeChange {
  key: string
  item: TreeItem
  field: 'costs' | 'place' | 'archived' | 'group' | 'whole'
  dated: boolean
  before?: Costs | Place | boolean | null
  after?: Costs | Place | boolean
  /** A cost: the pools the change set (only they are written, checked and taken back – a pool changed elsewhere since is not this change's). */
  pools?: Pool[]
  edits?: FieldChange[]
  /** The objects of rd.json the change made (a subcategory's entry, `categories`): „Cofnij” takes them off again when left empty. */
  made?: string[][]
  added?: { from: string; at: number | null }
}

/** The words of a part left out (D609, D72). */
export const TREE_SKIP = {
  variantStays: 'warianty zostają przy swojej podkategorii',
  archived: 'już w archiwum',
  gone: 'nie ma od tej daty',
  bodyFilled: 'ciało już ustawione'
} as const

/** What a change comes to: rd.json without the dated change, the patch of it (null – none), what changed, what was left (a reason each), how many were already so. */
export interface TreeStep {
  raw: Raw
  patch: Record<string, unknown> | null
  changes: TreeChange[]
  skipped: string[]
  same: number
}

/**
 * The fields of rd.json from `a` to `b`, leaf by leaf: an object made new (a subcategory's first entry) goes as its fields and is named in
 * `made` – its „Cofnij” then looks only at the fields it wrote (a colour set since on another field is no change of them).
 */
function leafEdits(a: Raw, b: Raw): { edits: FieldChange[]; made: string[][] } {
  const edits: FieldChange[] = []
  const made: string[][] = []
  const open = (path: string[], v: unknown) => {
    if (!isPlain(v) || path.some((p) => p.startsWith('#'))) return edits.push({ path, before: undefined, after: v })
    made.push(path)
    for (const [k, x] of Object.entries(v)) open([...path, k], x)
  }
  for (const e of diffRecords(a, b)) {
    if (e.before === undefined) open(e.path, e.after)
    else edits.push(e)
  }
  return { edits, made }
}

const metas = (raw: Raw): Record<string, unknown> => (isPlain(raw.categories) ? raw.categories : {})
const metaOf = (raw: Raw, id: string): Raw | null => {
  const m = metas(raw)[id]
  return isPlain(m) ? m : null
}

/** The lists of variants a change writes – each made from the settings given (T517) and changed in turn. */
class Lists {
  private readonly lists = new Map<string, VariantEntry[]>()
  constructor(private readonly s: RulesSettings) {}
  now(category: string): ReadonlyArray<Variant | VariantEntry> {
    return this.lists.get(category) ?? this.s.categories[category]?.variants ?? []
  }
  set(category: string, list: VariantEntry[] | null): boolean {
    if (!list) return false
    this.lists.set(category, list)
    return true
  }
  /** The patch of the dated settings: the subcategories' fields and their lists of variants whole. */
  patch(fields: ReadonlyMap<string, Record<string, unknown>>): Record<string, unknown> | null {
    const cats: Record<string, Record<string, unknown>> = {}
    for (const [id, f] of fields) cats[id] = { ...f }
    for (const [id, list] of this.lists) cats[id] = { ...cats[id], variants: list }
    return Object.keys(cats).length ? { categories: cats } : null
  }
}

/** A variant's own value of a field as the list has it (an entry written with null – given up – is none). */
const own = <K extends 'costs' | 'place'>(list: ReadonlyArray<Variant | VariantEntry>, id: string, k: K): NonNullable<Variant[K]> | null => (list.find((x) => x.id === id)?.[k] ?? null) as NonNullable<Variant[K]> | null

/**
 * The change `a` of the elements `keys` made on rd.json `raw` (as it is in the turn of the save) from `f` (the bar's date and instant; the
 * dated settings of it are read from `raw`); `today` – the day for a subcategory whose addition is still to come.
 */
export function treeGroupStep(raw: Raw, keys: readonly string[], a: TreeAction, f: { from: string; at: number | null }, today: string): TreeStep {
  const items = keys.map((key) => ({ key, item: treeItemOf(key) })).filter((x): x is { key: string; item: TreeItem } => x.item != null)
  const changes: TreeChange[] = []
  const skipped: string[] = []
  let same = 0
  let out = raw
  // rd.json's changes first (one each, its own fields): a subcategory gone whole takes its variants with it – none of them is written again.
  const goneWhole = new Set<string>()
  const atOnce = (key: string, item: TreeItem, field: TreeChange['field'], next: Raw, added?: TreeChange['added']) => {
    const { edits, made } = leafEdits(out, next)
    if (!edits.length) {
      same++
      return
    }
    changes.push({ key, item, field, dated: false, edits, ...(made.length ? { made } : {}), ...(added ? { added } : {}) })
    out = next
  }
  if (a.kind === 'move' || a.kind === 'remove')
    for (const { key, item } of items) {
      if (item.kind === 'variant') {
        if (a.kind === 'move') skipped.push(TREE_SKIP.variantStays)
        continue
      }
      const id = item.category
      if (a.kind === 'move') {
        atOnce(key, item, 'group', setCategoryGroupRaw(out, id, a.group))
        continue
      }
      if (metaOf(out, id)?.archived === true) {
        skipped.push(TREE_SKIP.archived)
        continue
      }
      const whole = withoutPlannedCategory(out, id, today)
      if (whole) {
        goneWhole.add(id)
        atOnce(key, item, 'whole', whole.raw, { from: whole.added.from, at: whole.added.at })
        continue
      }
      const meta = metaOf(out, id) ?? {}
      atOnce(key, item, 'archived', { ...out, categories: { ...metas(out), [id]: { ...meta, archived: true } } })
    }
  if (a.kind === 'move') return { raw: out, patch: null, changes, skipped, same }

  // The dated settings, from the settings in force from the change's date and instant (rd.json as it is now – after the removals above).
  const s = settingsOn(rdFrom(out).settings, f.from, f.at)
  const lists = new Lists(s)
  const fields = new Map<string, Record<string, unknown>>()
  const field = (id: string) => fields.get(id) ?? (fields.set(id, {}), fields.get(id)!)
  // The pools a cost action sets for an element: the one list of `costs`, the element's own of `costsEach` (null – it has none: left as it is).
  const costsFor = (key: string): Partial<Costs> | null => (a.kind === 'costs' ? a.costs : a.kind === 'costsEach' ? (a.values[key] ?? null) : null)
  const costing = a.kind === 'costs' || a.kind === 'costsEach'
  for (const { key, item } of items) {
    if (goneWhole.has(item.category)) continue
    const rules = s.categories[item.category]
    if (item.kind === 'category') {
      if (a.kind === 'remove') continue
      if (!rules) {
        skipped.push(TREE_SKIP.gone)
        continue
      }
      if (costing) {
        const cs = costsFor(key)
        const next = { ...rules.costs, ...cs }
        // „Uzupełnij ciało” fills gaps only: a body set meanwhile (the window was open, another computer) is never written over (D623).
        if (a.kind === 'costsEach' && rules.costs.body !== 0) skipped.push(TREE_SKIP.bodyFilled)
        else if (!cs || sameCosts(next, rules.costs)) same++
        else {
          // Only the pools touched (as a field of the row writes one): a pool changed meanwhile from another date stays (T2704).
          field(item.category).costs = { ...cs }
          changes.push({ key, item, field: 'costs', dated: true, before: { ...rules.costs }, after: next, pools: poolsIn(cs) })
        }
      } else if (a.kind === 'place' && rules.place === a.place) same++
      else if (a.kind === 'place') {
        field(item.category).place = a.place
        changes.push({ key, item, field: 'place', dated: true, before: rules.place, after: a.place })
      }
      continue
    }
    const list = lists.now(item.category)
    const v = rules ? list.find((x) => x.id === item.variant) : undefined
    if (!rules || !v) {
      skipped.push(TREE_SKIP.gone)
      continue
    }
    if (a.kind === 'remove') {
      if (v.archived) skipped.push(TREE_SKIP.archived)
      else if (lists.set(item.category, archiveVariant(list, item.variant))) changes.push({ key, item, field: 'archived', dated: true, before: false, after: true })
      else same++
      continue
    }
    if (costing) {
      const cs = costsFor(key)
      const mine = own(list, item.variant, 'costs')
      const next = { ...(mine ?? rules.costs), ...cs }
      // Without its own cost it gets one (D609) – even with the numbers of its subcategory: it no longer follows it. „Uzupełnij ciało” only fills the
      // own cost with the body 0 (one that follows its subcategory now, or has a body, is left – D623).
      if (a.kind === 'costsEach' && (!mine || mine.body !== 0)) skipped.push(TREE_SKIP.bodyFilled)
      else if (!cs || (mine && sameCosts(mine, next))) same++
      else if (lists.set(item.category, changeVariant(list, item.variant, { costs: next }))) changes.push({ key, item, field: 'costs', dated: true, before: mine ? { ...mine } : null, after: next, pools: poolsIn(cs) })
      else same++
      continue
    }
    if (a.kind !== 'place') continue
    const mine = own(list, item.variant, 'place')
    if (mine === a.place) same++
    else if (lists.set(item.category, changeVariant(list, item.variant, { place: a.place }))) changes.push({ key, item, field: 'place', dated: true, before: mine, after: a.place })
    else same++
  }
  return { raw: out, patch: lists.patch(fields), changes, skipped, same }
}

/** The pools a cost change set (an older change without the list – all four). */
const poolsSet = (c: TreeChange): readonly Pool[] => c.pools ?? POOLS
/** A cost still stands as the change left it: each pool it set holds what it set. */
const stands = (now: Costs, c: TreeChange): boolean => poolsSet(c).every((p) => now[p] === (c.after as Costs)[p])
/** The pools a change set, of `costs`. */
const poolsOf = (costs: Costs, c: TreeChange): Partial<Costs> => Object.fromEntries(poolsSet(c).map((p) => [p, costs[p]])) as Partial<Costs>

/** What „Cofnij” writes: rd.json with its fields back, the dated patch back (null – none), what went back and what stayed (changed since). */
export interface TreeUndo {
  raw: Raw
  patch: Record<string, unknown> | null
  restored: TreeChange[]
  kept: TreeChange[]
}

/**
 * „Cofnij” of `changes` on rd.json `raw` as it is now: a field of rd.json back while every field the change wrote still holds what it wrote
 * (a subcategory removed whole – also only while its addition is still to come on `today`); a dated one back while the settings from the same
 * date and instant still have the value the change gave (the rest of a variant's list as it is now). The rest stays (`kept`).
 */
export function treeGroupUndo(raw: Raw, changes: readonly TreeChange[], f: { from: string; at: number | null }, today: string): TreeUndo {
  const restored: TreeChange[] = []
  const kept: TreeChange[] = []
  let out = raw
  // Last made first (as they were laid): an object made by an earlier one (`categories`) is empty only once the later ones are back (T2705).
  for (const c of [...changes].reverse()) {
    if (c.dated) continue
    const edits = c.edits ?? []
    const held = edits.every((e) => deepEqual(valueAt(out, e.path), e.after)) && (!c.added || isPlannedChange(c.added, today))
    if (!held) {
      kept.push(c)
      continue
    }
    for (const e of [...edits].reverse()) out = setAt(out, e.path, e.before) as Raw
    // What it made and nothing else filled since goes too (deepest first).
    for (const path of [...(c.made ?? [])].reverse()) {
      const v = valueAt(out, path)
      if (isPlain(v) && Object.keys(v).length === 0) out = setAt(out, path, undefined) as Raw
    }
    restored.push(c)
  }
  const s = settingsOn(rdFrom(out).settings, f.from, f.at)
  const lists = new Lists(s)
  const fields = new Map<string, Record<string, unknown>>()
  const field = (id: string) => fields.get(id) ?? (fields.set(id, {}), fields.get(id)!)
  for (const c of changes) {
    if (!c.dated) continue
    const rules = s.categories[c.item.category]
    let back = false
    if (c.item.kind === 'category') {
      if (c.field === 'costs' && rules && stands(rules.costs, c)) {
        field(c.item.category).costs = poolsOf(c.before as Costs, c)
        back = true
      } else if (c.field === 'place' && rules?.place === c.after) {
        field(c.item.category).place = c.before
        back = true
      }
    } else {
      const id = c.item.variant
      const list = lists.now(c.item.category)
      const v = rules ? list.find((x) => x.id === id) : undefined
      if (v && c.field === 'costs') {
        const mine = own(list, id, 'costs')
        const was = c.before as Costs | null
        // Its own cost before: the pools set go back, the rest as it is now; none before („jak podkategoria”) – back to none only while the whole
        // cost is still the one the change gave it (a pool changed since is a cost of its own you made).
        back = mine != null && (was ? stands(mine, c) : sameCosts(mine, c.after as Costs)) && lists.set(c.item.category, changeVariant(list, id, { costs: was ? { ...mine, ...poolsOf(was, c) } : null }))
      } else if (v && c.field === 'place') back = own(list, id, 'place') === c.after && lists.set(c.item.category, changeVariant(list, id, { place: (c.before as Place | null) ?? null }))
      else if (v && c.field === 'archived') back = v.archived === true && lists.set(c.item.category, archiveVariant(list, id, false))
    }
    ;(back ? restored : kept).push(c)
  }
  return { raw: out, patch: lists.patch(fields), restored, kept }
}

/** How many of each the change took: „6 podkategorii”, „2 warianty”, „4 podkategorie i 2 warianty”. */
export function treeCount(items: ReadonlyArray<{ item: TreeItem }>): string {
  const cats = items.filter((x) => x.item.kind === 'category').length
  const vars = items.length - cats
  const c = countLabel(cats, 'podkategorię', 'podkategorie', 'podkategorii')
  const v = countLabel(vars, 'wariant', 'warianty', 'wariantów')
  return cats && vars ? `${c} i ${v}` : vars ? v : c
}

/** The title of the window „Koszt…” of the selection: „6 podkategorii”, „1 podkategoria”, „2 warianty” (the nominative; the menu – `treeCount`). */
export function treeTitleCount(items: ReadonlyArray<{ item: TreeItem }>): string {
  const cats = items.filter((x) => x.item.kind === 'category').length
  const vars = items.length - cats
  const c = countLabel(cats, 'podkategoria', 'podkategorie', 'podkategorii')
  const v = countLabel(vars, 'wariant', 'warianty', 'wariantów')
  return cats && vars ? `${c} i ${v}` : vars ? v : c
}

/** The verb of the line of an action. */
export const TREE_VERB: Record<TreeAction['kind'], string> = { costs: 'Zmieniono', costsEach: 'Uzupełniono ciało:', place: 'Zmieniono', move: 'Przeniesiono', remove: 'Usunięto' }

/** „pominięto 2: już w archiwum” – each reason once, in order (as the lines of the other selections). */
const skippedPart = (reasons: readonly string[]): string | null => (reasons.length ? `pominięto ${reasons.length}: ${[...new Set(reasons)].join(', ')}` : null)

/** The line after a change: „Zmieniono 6 podkategorii”, „Przeniesiono 4 podkategorie · pominięto 2: warianty zostają przy swojej podkategorii”. */
export function treeLineText(a: TreeAction['kind'], changes: readonly TreeChange[], skipped: readonly string[]): string {
  // „Uzupełniono ciało: 3 podkategorie” – after the colon the nominative (`treeTitleCount`).
  return [`${TREE_VERB[a]} ${a === 'costsEach' ? treeTitleCount(changes) : treeCount(changes)}`, skippedPart(skipped)].filter((x): x is string => x != null).join(' · ')
}

/** A change that changed nothing: „Nic się nie zmienia” (and what it left out, D72). */
export function treeNothingText(skipped: readonly string[], kind?: TreeAction['kind']): string {
  const part = skippedPart(skipped)
  // „Uzupełnij ciało” has no selection: its words never say „zaznaczone”.
  return part ? `Nic się nie zmienia – ${part}.` : kind === 'costsEach' ? 'Nic się nie zmienia – te pozycje mają już ciało.' : 'Nic się nie zmienia – zaznaczone już tak mają.'
}

/**
 * The line above the tree (D623): „6 podkategorii ma ciało 0”, „2 podkategorie mają ciało 0”, „1 podkategoria i 1 wariant mają ciało 0” (the nominative of
 * `treeTitleCount`; the verb by the count when only one kind, the plural when both).
 */
export function bodyMissingText(items: ReadonlyArray<{ item: TreeItem }>): string {
  const cats = items.filter((x) => x.item.kind === 'category').length
  const mixed = cats > 0 && cats < items.length
  const verb = mixed ? 'mają' : plural(items.length, 'ma', 'mają', 'ma')
  return `${treeTitleCount(items)} ${verb} ciało 0`
}

/** What „Cofnij” says of those that stayed (changed since, D567 p.4): „Cofnięto · 2 zostały, bo się zmieniły”; none went back – „Nic nie cofnięto – …”. */
export function treeKeptText(kept: ReadonlyArray<{ item: TreeItem }>, restored = 1): string {
  const n = kept.length
  // A variant is masculine, a subcategory feminine; more than one – the plural of both.
  const masc = kept.every((x) => x.item.kind === 'variant')
  const stayed = masc ? plural(n, 'został', 'zostały', 'zostało') : plural(n, 'została', 'zostały', 'zostało')
  const changed = masc ? plural(n, 'zmienił', 'zmieniły', 'zmieniło') : plural(n, 'zmieniła', 'zmieniły', 'zmieniło')
  return `${restored > 0 ? 'Cofnięto ·' : 'Nic nie cofnięto –'} ${n} ${stayed}, bo się ${changed}`
}
