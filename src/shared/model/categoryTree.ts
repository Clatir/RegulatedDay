/**
 * The tree of categories (D510, spec „Kategorie”): three levels – a category (a group: only a name, no cost, no properties) → a
 * subcategory (what the code has always called a category: `Category`, its id, its cost and rules) → a variant (optional, its own
 * cost and place or „jak podkategoria”). Blocks, templates, the history, the statistics and the calendars keep the subcategory's id –
 * nothing of theirs moves.
 *
 * In rd.json, as the calendars (T1310): `categoryGroups` – a list of items with an id (`ITEM_LISTS` in merge.ts: two computers adding
 * different groups meet in no question), each `{ id, name?, order?, archived? }` – and `categories.<id>.group`. The tree works at once
 * (not a dated setting): the engine never reads it. Old data has neither: it reads as the tree of D510 (`DEFAULT_GROUPS`, the starting
 * categories by `DEFAULT_GROUP_OF`, every other one in „Inne”) and nothing is written until you change something – the same tree on every
 * computer, read again and again. A default group gets its entry at its first change, with only the field changed. „Inne” always exists,
 * stands last and cannot be removed (T1312); a subcategory whose group the file does not know or has archived is in „Inne”. Removing a
 * group archives it (`removeGroupRaw`: its subcategories go to another group, or are archived with it); the window's „Cofnij” turns the
 * edit over. Fields of an item this version does not know stay.
 *
 * The variants stay in the dated settings (`CategoryRules.variants`, a list written whole in a change): `addVariant`, `changeVariant`,
 * `archiveVariant` give the list a change writes – a cost or a place given up („jak podkategoria”) is written as null (T1314).
 */
import { deepEqual } from '../data/merge'
import { SETTINGS_FILE } from '../data/paths'
import { POOLS, type CategoryRules, type Costs, type Place, type Variant } from './categories'
import { newId } from './ids'
import { RANGES } from './settings'

export const WORK_GROUP = 'g-praca'
export const LEARNING_GROUP = 'g-nauka'
export const HOME_GROUP = 'g-dom'
export const FREE_GROUP = 'g-wolne'
/** The group that always exists: a subcategory without a group it can be in is here; it can be renamed, never removed (T1312). */
export const OTHER_GROUP = 'g-inne'
export const GROUP_NAME_MAX = 60
export const VARIANT_NAME_MAX = 80

export interface CategoryGroup {
  id: string
  name: string
  /** Where it stands among the groups („Inne” always last whatever its number). */
  order: number
  archived: boolean
}

/** The order „Inne” is told with (it stands last; never written). */
const OTHER_ORDER = Number.MAX_SAFE_INTEGER

/** The groups of D510, with fixed ids – the same tree on every computer and in every version. */
export const DEFAULT_GROUPS: readonly CategoryGroup[] = [
  { id: WORK_GROUP, name: 'Praca', order: 1, archived: false },
  { id: LEARNING_GROUP, name: 'Nauka', order: 2, archived: false },
  { id: HOME_GROUP, name: 'Dom i opieka', order: 3, archived: false },
  { id: FREE_GROUP, name: 'Wolne', order: 4, archived: false },
  { id: OTHER_GROUP, name: 'Inne', order: OTHER_ORDER, archived: false }
]

/**
 * The group of each starting category (D510) while the file names none. „Nauka — słuchanie” is a variant of „Nauka” (`sluchanie`) and stays
 * one; „Dojazd i zajęcia stacjonarne” is the category `dojazd`. Your own categories: „Inne”.
 */
export const DEFAULT_GROUP_OF: Readonly<Record<string, string>> = {
  sesja: WORK_GROUP,
  analiza: WORK_GROUP,
  journaling: WORK_GROUP,
  inne: WORK_GROUP,
  nauka: LEARNING_GROUP,
  wyklad: LEARNING_GROUP,
  ogladanie: LEARNING_GROUP,
  'zajecia-zdalne': LEARNING_GROUP,
  dojazd: LEARNING_GROUP,
  posilek: HOME_GROUP,
  rutyny: HOME_GROUP,
  prosby: HOME_GROUP,
  sprawy: HOME_GROUP,
  regeneracja: FREE_GROUP,
  projekty: FREE_GROUP
}

type Raw = Record<string, unknown>
const isPlain = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)
const cleanName = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * The groups as read: the default ones (their name, order and archive from the file when it changed them – „Inne” is never archived), then
 * the file's own; by `order` (a tie by the id, the same on every computer; a missing one after those that have it, in the array's order),
 * „Inne” last. An entry without an id, and an own one without a name, is no group.
 */
export function categoryGroupsFrom(v: unknown): CategoryGroup[] {
  const defaults = new Map(DEFAULT_GROUPS.map((g) => [g.id, { ...g }]))
  const own: Array<CategoryGroup & { index: number }> = []
  const seen = new Set<string>()
  const items = Array.isArray(v) ? v : []
  items.forEach((x, index) => {
    if (!isPlain(x) || typeof x.id !== 'string' || !x.id || seen.has(x.id)) return
    const name = cleanName(x.name, GROUP_NAME_MAX)
    const order = typeof x.order === 'number' && Number.isFinite(x.order) ? x.order : null
    const def = defaults.get(x.id)
    if (def) {
      seen.add(x.id)
      if (name) def.name = name
      if (def.id !== OTHER_GROUP) {
        if (order != null) def.order = order
        def.archived = x.archived === true
      }
      return
    }
    if (!name) return
    seen.add(x.id)
    own.push({ id: x.id, name, order: order ?? Number.POSITIVE_INFINITY, archived: x.archived === true, index })
  })
  const listed = [...[...defaults.values()].filter((g) => g.id !== OTHER_GROUP).map((g) => ({ ...g, index: -1 })), ...own]
  listed.sort((a, b) => {
    const fa = Number.isFinite(a.order)
    const fb = Number.isFinite(b.order)
    if (fa && fb) return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    return fa === fb ? a.index - b.index : fa ? -1 : 1
  })
  let last = Math.max(0, ...listed.map((g) => (Number.isFinite(g.order) ? g.order : 0)))
  const out = listed.map(({ index: _i, ...g }) => ({ ...g, order: Number.isFinite(g.order) ? g.order : ++last }))
  return [...out, defaults.get(OTHER_GROUP)!]
}

/** What the tree is read from: the groups and the meta of the subcategories (`RdFile`, or rd.json read for a change). */
export interface TreeSource {
  categoryGroups: readonly CategoryGroup[]
  categories: Readonly<Record<string, { name?: string; group?: string; archived?: boolean } | undefined>>
}

/**
 * The group of each subcategory: the one it names, if the file knows it and it is not archived (with `archived` – also an archived one);
 * a name the file does not know, or an archived group – „Inne”; no name – its group of D510 (if not archived), else „Inne”.
 */
function groupResolver(src: TreeSource, archived = false): (categoryId: string) => string {
  const groups = new Map(src.categoryGroups.map((g) => [g.id, g]))
  const live = (id: string | undefined): string | null => {
    const g = id ? groups.get(id) : undefined
    return g && (archived || !g.archived) ? g.id : null
  }
  return (categoryId) => {
    const named = src.categories[categoryId]?.group
    if (named !== undefined) return live(named) ?? OTHER_GROUP
    return live(DEFAULT_GROUP_OF[categoryId]) ?? OTHER_GROUP
  }
}

/** The group a subcategory is in (`archived` – as the archive shows it: an archived group too). */
export function groupOfCategory(src: TreeSource, categoryId: string, opts: { archived?: boolean } = {}): string {
  return groupResolver(src, opts.archived)(categoryId)
}

/** A group of the tree with its subcategories (ids), in the order they are shown. */
export interface TreeGroup {
  group: CategoryGroup
  categories: string[]
}

const CLASS_ORDER = { work: 0, life: 1, free: 2 } as const

/**
 * The tree for the settings: every group not archived – also an empty one – with its subcategories not archived (`rules` – the subcategories
 * there are, the dated settings'); with `archived` the archived groups and subcategories too (each in the group it names). In a group: by
 * class, then by name (as the list of a block always was).
 */
export function categoryTree(src: TreeSource, rules: Readonly<Record<string, CategoryRules>>, opts: { archived?: boolean; keep?: string } = {}): TreeGroup[] {
  const archived = opts.archived === true
  const groupOf = groupResolver(src, archived)
  const groups = src.categoryGroups.filter((g) => archived || !g.archived)
  const byGroup = new Map<string, string[]>(groups.map((g) => [g.id, []]))
  for (const id of Object.keys(rules)) {
    if (!archived && src.categories[id]?.archived && id !== opts.keep) continue
    byGroup.get(groupOf(id))?.push(id)
  }
  const name = (id: string) => src.categories[id]?.name ?? ''
  const order = (a: string, b: string) => CLASS_ORDER[rules[a]!.cls] - CLASS_ORDER[rules[b]!.cls] || name(a).localeCompare(name(b), 'pl')
  return groups.map((group) => ({ group, categories: byGroup.get(group.id)!.sort(order) }))
}

/**
 * The list of a block's panel (D510): the subcategories grouped by their category, in the groups' order – archived groups and subcategories
 * left out (but `keep`, the block's own, stays), and so are groups left empty. One list with a header for each group.
 */
export function pickTree(src: TreeSource, rules: Readonly<Record<string, CategoryRules>>, keep?: string): TreeGroup[] {
  return categoryTree(src, rules, keep !== undefined ? { keep } : {}).filter((g) => g.categories.length > 0)
}

// rd.json as a record: the edits of the tree (each makes a whole new record, the window's save diffs it – `saveTree`).

/** The items of the list a write keeps: those with an id (what is no item would end the merge by items – T970). */
const groupItems = (raw: Raw): Raw[] => (Array.isArray(raw.categoryGroups) ? (raw.categoryGroups as unknown[]).filter((x): x is Raw => isPlain(x) && typeof x.id === 'string' && x.id !== '') : [])
const metas = (raw: Raw): Record<string, Raw> => (isPlain(raw.categories) ? (raw.categories as Record<string, Raw>) : {})

/** The tree's source of a raw rd.json (only what the tree reads). */
export function treeOfRaw(raw: Raw): TreeSource {
  const categories: Record<string, { group?: string; archived?: boolean }> = {}
  for (const [id, m] of Object.entries(metas(raw))) {
    if (!isPlain(m)) continue
    categories[id] = { ...(typeof m.group === 'string' && m.group ? { group: m.group } : {}), archived: m.archived === true }
  }
  return { categoryGroups: categoryGroupsFrom(raw.categoryGroups), categories }
}

/**
 * A new group: before „Inne”, after every other; null – no name. Made from the groups as the record has them in the turn of the save
 * (T517): a place taken from a list read before would repeat the one another computer's group took meanwhile.
 */
export function newGroup(existing: readonly CategoryGroup[], name: string): CategoryGroup | null {
  const n = cleanName(name, GROUP_NAME_MAX)
  if (!n) return null
  const order = Math.max(0, ...existing.filter((g) => g.id !== OTHER_GROUP && Number.isFinite(g.order)).map((g) => g.order)) + 1
  return { id: newId(10), name: n, order, archived: false }
}

/** The list with a group added at its end. */
export function addGroupRaw(raw: Raw, group: CategoryGroup): Raw {
  return { ...raw, categoryGroups: [...groupItems(raw), { id: group.id, name: group.name, order: group.order, ...(group.archived ? { archived: true } : {}) }] }
}

/**
 * A group renamed, archived or brought back. A default group gets its entry at its first change – with only the field changed (two first
 * changes of different fields on two computers both stay); a change to what it already is writes nothing. „Inne” is never archived.
 */
export function updateGroupRaw(raw: Raw, id: string, patch: { name?: string; archived?: boolean }): Raw {
  const items = groupItems(raw)
  const name = patch.name === undefined ? '' : cleanName(patch.name, GROUP_NAME_MAX)
  const archived = id === OTHER_GROUP ? undefined : patch.archived
  const item = items.find((x) => x.id === id)
  if (item) {
    const next: Raw = { ...item }
    if (name) next.name = name
    if (archived === true) next.archived = true
    else if (archived === false) delete next.archived
    if (JSON.stringify(next) === JSON.stringify(item)) return raw
    return { ...raw, categoryGroups: items.map((x) => (x === item ? next : x)) }
  }
  const def = DEFAULT_GROUPS.find((g) => g.id === id)
  if (!def) return raw
  const clean: Raw = {}
  if (name && name !== def.name) clean.name = name
  if (archived === true) clean.archived = true
  if (Object.keys(clean).length === 0) return raw
  return { ...raw, categoryGroups: [...items, { id, ...clean }] }
}

/**
 * A subcategory put in a group – only that field (a colour changed meanwhile on another computer is no conflict). Where it already is,
 * nothing is written: a starting one without a field in its group of D510 gets none.
 */
export function setCategoryGroupRaw(raw: Raw, categoryId: string, groupId: string): Raw {
  const cats = metas(raw)
  const meta = isPlain(cats[categoryId]) ? cats[categoryId] : undefined
  const named = typeof meta?.group === 'string' && meta.group ? meta.group : undefined
  if (named !== undefined ? named === groupId : groupId === (DEFAULT_GROUP_OF[categoryId] ?? OTHER_GROUP)) return raw
  return { ...raw, categories: { ...cats, [categoryId]: { ...(meta ?? {}), group: groupId } } }
}

/** The subcategories in a group (archived ones too): of `categoryIds` (the settings'), of the record's meta and the starting ones. */
export function categoriesOfGroupRaw(raw: Raw, groupId: string, categoryIds: readonly string[]): string[] {
  const groupOf = groupResolver(treeOfRaw(raw), true)
  const ids = new Set([...categoryIds, ...Object.keys(metas(raw)), ...Object.keys(DEFAULT_GROUP_OF)])
  return [...ids].filter((id) => groupOf(id) === groupId)
}

/**
 * The subcategories a removal of the group takes with it that are not archived – of the same set `removeGroupRaw` moves or archives (T1392):
 * the window asks about them and says how many went (an archived one moves too, without a word).
 */
export function activeOfGroupRaw(raw: Raw, groupId: string, categoryIds: readonly string[]): string[] {
  const cats = metas(raw)
  return categoriesOfGroupRaw(raw, groupId, categoryIds).filter((id) => !(isPlain(cats[id]) && cats[id].archived === true))
}

/** How a group with subcategories goes (D510): they move to another group (by default „Inne”), or they are archived with it. */
export type GroupRemoval = { to: string } | { archive: true }

/**
 * A group removed (archived) and what becomes of its subcategories: moved to `to` (all of them, the archived too – one brought back later is
 * there; `to` the group itself – „Inne”), or archived (those not archived yet). „Inne” and a group the file does not have stay.
 */
export function removeGroupRaw(raw: Raw, groupId: string, how: GroupRemoval, categoryIds: readonly string[]): Raw {
  if (groupId === OTHER_GROUP || !categoryGroupsFrom(raw.categoryGroups).some((g) => g.id === groupId)) return raw
  const members = categoriesOfGroupRaw(raw, groupId, categoryIds)
  let out = raw
  if ('to' in how) {
    const to = how.to === groupId || !how.to ? OTHER_GROUP : how.to
    for (const id of members) out = setCategoryGroupRaw(out, id, to)
  } else {
    for (const id of members) {
      const cats = metas(out)
      const meta = isPlain(cats[id]) ? cats[id] : {}
      if (meta.archived !== true) out = { ...out, categories: { ...cats, [id]: { ...meta, archived: true } } }
    }
  }
  return updateGroupRaw(out, groupId, { archived: true })
}

// The variants of a subcategory (dated settings: the list is whole in a change).

/** A variant as a change writes it: `place` / `costs` null – „jak podkategoria”, a value it had given up (T1314). */
export interface VariantEntry {
  id: string
  name: string
  place?: Place | null
  costs?: Costs | null
  archived?: boolean
}

const PLACES: readonly Place[] = ['computer', 'passive', 'away']
const [COST_LOW, COST_HIGH] = RANGES.cost
const validCosts = (c: Costs): boolean => POOLS.every((p) => Number.isInteger(c[p]) && c[p] >= COST_LOW && c[p] <= COST_HIGH)

/** A variant (as read, or as a change before wrote it) as it is written again: an explicit null stays (it is what gives a value up). */
function entryOf(v: Variant | VariantEntry): VariantEntry {
  const e = v as VariantEntry
  return {
    id: v.id,
    name: v.name,
    ...(e.place === null ? { place: null } : e.place ? { place: e.place } : {}),
    ...(e.costs === null ? { costs: null } : e.costs ? { costs: { ...e.costs } } : {}),
    ...(v.archived ? { archived: true } : {})
  }
}

const sameEntry = (a: VariantEntry, b: VariantEntry): boolean => JSON.stringify(entryOf(a)) === JSON.stringify(entryOf(b))

/** The list with a new variant at its end; null – no name, its id taken, a cost out of −5…5. */
export function addVariant(variants: ReadonlyArray<Variant | VariantEntry>, v: { id: string; name: string; place?: Place | null; costs?: Costs | null }): VariantEntry[] | null {
  const name = cleanName(v.name, VARIANT_NAME_MAX)
  if (!name || !v.id || variants.some((x) => x.id === v.id)) return null
  if (v.costs && !validCosts(v.costs)) return null
  if (v.place && !PLACES.includes(v.place)) return null
  return [...variants.map(entryOf), { id: v.id, name, ...(v.place ? { place: v.place } : {}), ...(v.costs ? { costs: { ...v.costs } } : {}) }]
}

/**
 * The list with a variant changed: its name, its place and its cost (null – „jak podkategoria”: given up when it had one). null – no such
 * variant, an empty name, a value out of its range, or nothing changed.
 */
export function changeVariant(variants: ReadonlyArray<Variant | VariantEntry>, id: string, patch: { name?: string; place?: Place | null; costs?: Costs | null }): VariantEntry[] | null {
  const found = variants.find((x) => x.id === id)
  if (!found) return null
  const before = entryOf(found)
  const next: VariantEntry = { ...before }
  if (patch.name !== undefined) {
    const name = cleanName(patch.name, VARIANT_NAME_MAX)
    if (!name) return null
    next.name = name
  }
  if (patch.place !== undefined) {
    if (patch.place === null) {
      if (before.place) next.place = null
      else delete next.place
    } else if (PLACES.includes(patch.place)) next.place = patch.place
    else return null
  }
  if (patch.costs !== undefined) {
    if (patch.costs === null) {
      if (before.costs) next.costs = null
      else delete next.costs
    } else if (validCosts(patch.costs)) next.costs = { ...patch.costs }
    else return null
  }
  if (sameEntry(before, next)) return null
  return variants.map((x) => (x.id === id ? next : entryOf(x)))
}

/** The list with a variant archived (removed: out of the choice, kept in the history) or brought back; null – no such one, or it already is so. */
export function archiveVariant(variants: ReadonlyArray<Variant | VariantEntry>, id: string, archived = true): VariantEntry[] | null {
  const found = variants.find((x) => x.id === id)
  if (!found || (found.archived === true) === archived) return null
  return variants.map((x) => {
    const e = entryOf(x)
    if (x.id !== id) return e
    if (archived) return { ...e, archived: true }
    const { archived: _a, ...rest } = e
    return rest
  })
}

/** The patch of the dated settings that writes a subcategory's variants. */
export function variantsPatch(categoryId: string, list: readonly VariantEntry[]): Record<string, unknown> {
  return { categories: { [categoryId]: { variants: list } } }
}

// What an older version cannot show (T1313, T1391).

const groupIn = (v: unknown): boolean => isPlain(v) && v.group !== undefined
/** A change of the dated settings that writes variants (`variantsPatch`). */
const variantsIn = (v: unknown): boolean => isPlain(v) && isPlain(v.patch) && isPlain(v.patch.categories) && Object.values(v.patch.categories).some((c) => isPlain(c) && c.variants !== undefined)
/**
 * The items of `list` that `other` has not as they are (an array written whole: only what it changed). An item is looked for first under its
 * id (the changes of the settings have one), then anywhere in `other`.
 */
const changedIn = (list: unknown, other: unknown): unknown[] => {
  const theirs = Array.isArray(other) ? other : []
  const byId = new Map<string, unknown>()
  for (const y of theirs) if (isPlain(y) && typeof y.id === 'string' && !byId.has(y.id)) byId.set(y.id, y)
  const kept = (x: unknown): boolean => {
    const same = isPlain(x) && typeof x.id === 'string' ? byId.get(x.id) : undefined
    return (same !== undefined && deepEqual(x, same)) || theirs.some((y) => deepEqual(x, y))
  }
  return Array.isArray(list) ? list.filter((x) => !kept(x)) : []
}

/**
 * Whether an edit changes the tree as a version without it cannot show it (T1391): rd.json's categories of the tree (`categoryGroups`), the
 * category of a subcategory (`categories.<id>.group`) or a subcategory's variants (a change of the dated settings with `variants` – a cost
 * „jak podkategoria” reads there as the one before, T1315). The name, colour, calendar and archive of a subcategory are not: an older version
 * shows them as they are. Each edit as the window sends it (`recordEdit`: a new entry by its fields, a first list whole).
 */
export function treeEdit(e: { rel: string; edits: ReadonlyArray<{ path: readonly string[]; base: unknown; value: unknown }> }): boolean {
  if (e.rel !== SETTINGS_FILE) return false
  return e.edits.some(({ path, base, value }) => {
    const [a, b, c] = path
    if (a === 'categoryGroups') return true
    if (a === 'categories') {
      if (c !== undefined) return c === 'group'
      const entries = (v: unknown) => (b !== undefined ? [v] : isPlain(v) ? Object.values(v) : [])
      return [...entries(base), ...entries(value)].some(groupIn)
    }
    if (a === 'settings') {
      if (path.includes('variants')) return true
      // The whole list of changes in one field (the first one, or its order changed): only the changes that differ – an older change of the
      // variants on both sides is none (T1424).
      if (b === undefined) return [...changedIn(base, value), ...changedIn(value, base)].some(variantsIn)
      return variantsIn(base) || variantsIn(value)
    }
    return false
  })
}
