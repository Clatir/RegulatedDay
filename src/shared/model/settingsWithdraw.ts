/**
 * „Wycofaj” of a planned change of the shared settings (UX14, E2): the change taken out of rd.json „settings”, so from its date the
 * settings are what they would be without it – what was in force before it, every later change as it was. Only a change that waits
 * for its date (from a day after today, not „od dziś”): a day whose date came – counted, frozen – keeps what it counted by. A change of
 * the layer of sessions (the move to the templates, D511 – its own changes and the ones it emptied) is not taken back here: the
 * templates hold those sessions, and the settings without it would bring them back beside them. Nor is one that adds a subcategory
 * (T2348, T2350: its name and place are rd.json's at once – they would stay without rules; its row says so), nor one whose value a later
 * change holds (T2349: it wrote the same list whole – the week's types, a subcategory's variants – with the value of the change at a place
 * the change changed; withdrawing that one first lets this one go).
 */
import { deepEqual } from '../data/merge'
import { isMoveChange, setsLayer } from './sessionMigration'
import { changeFrom, changeOrder, deepMerge, isPlain, settingsFrom, settingsOn, type RulesSettings, type SettingsChange } from './settings'

/** A change that waits for its date: from a day after `today`, from the start of that day (an „od dziś” change is in force). */
export const isPlannedChange = (c: Pick<SettingsChange, 'from' | 'at'>, today: string): boolean => c.from > today && c.at == null

/**
 * Why a change is not withdrawn: no longer there (withdrawn elsewhere, unreadable), its date came, a change of the sessions' layer, it
 * adds the subcategory `category` (`name` – from rd.json, if any), a later change holds its value (`later` – withdraw that one first).
 */
export type WithdrawRefused =
  | { refused: 'gone' }
  | { refused: 'inForce' | 'sessions'; change: SettingsChange }
  | { refused: 'newCategory'; change: SettingsChange; category: string; name: string | null }
  | { refused: 'later'; change: SettingsChange; later: SettingsChange }
export type WithdrawRefusal = WithdrawRefused['refused']

/** What the row of a change knows without a click: in force, the layer of sessions, a subcategory it adds (the row has no „Wycofaj”). */
export type WithdrawFixed = 'inForce' | 'sessions' | 'newCategory'

/** The settings with every change of `all` laid before `c` (on its date, every „od dziś” of that day before it too). */
function settingsBefore(c: SettingsChange, all: readonly SettingsChange[]): RulesSettings {
  return settingsOn(
    all.filter((x) => x.id !== c.id && changeOrder(x, c) < 0),
    c.from,
    Number.MAX_SAFE_INTEGER
  )
}

/** The subcategory `c` adds: one of its patch the settings just before it do not have; null – none. */
function addedCategory(c: SettingsChange, all: readonly SettingsChange[]): string | null {
  const cats = isPlain(c.patch.categories) ? c.patch.categories : {}
  const ids = Object.keys(cats).filter((id) => isPlain(cats[id]))
  if (!ids.length) return null
  const before = settingsBefore(c, all)
  return ids.find((id) => !before.categories[id]) ?? null
}

/** Why `c` (one of `all`, rd.json's changes) cannot be withdrawn on `today` – what its row says instead of „Wycofaj”; null – it can. */
export function withdrawRefusal(c: SettingsChange, all: readonly SettingsChange[], today: string): WithdrawFixed | null {
  if (!isPlannedChange(c, today)) return 'inForce'
  if (isMoveChange(c) || setsLayer(c)) return 'sessions'
  return addedCategory(c, all) ? 'newCategory' : null
}

/** The paths of the lists a patch writes (a list is written whole – `deepMerge`). */
function listPaths(node: Record<string, unknown>, at: readonly string[] = []): string[][] {
  return Object.entries(node).flatMap(([k, v]) => (Array.isArray(v) ? [[...at, k]] : isPlain(v) ? listPaths(v, [...at, k]) : []))
}
const valueIn = (node: unknown, path: readonly string[]): unknown => path.reduce<unknown>((v, k) => (isPlain(v) ? v[k] : undefined), node)

/** A list's places: its items by id when every item has one (variants), else by position (the week's types). */
function places(list: unknown): Map<string, unknown> {
  const items = Array.isArray(list) ? list : []
  const byId = items.length > 0 && items.every((x) => isPlain(x) && typeof x.id === 'string')
  return new Map(items.map((x, i) => [byId ? `#${(x as { id: string }).id}` : String(i), x]))
}

/**
 * The first change laid after `c` that holds its value (T2349): it writes one of the lists of `c` whole, and at a place `c` changed (against
 * the settings just before it – a position, a variant by id, one taken away) its list has what `c` made. Compared as the settings read them
 * (`settingsFrom`), not as written; who made either and when is not asked – `made` of two computers is no order of making.
 */
function laterHolder(c: SettingsChange, all: readonly SettingsChange[]): SettingsChange | null {
  const lists = listPaths(c.patch)
  if (!lists.length) return null
  const ordered = [...all].sort(changeOrder)
  const after = ordered.filter((x) => x.id !== c.id && changeOrder(c, x) < 0 && lists.some((p) => Array.isArray(valueIn(x.patch, p))))
  if (!after.length) return null
  const before = settingsBefore(c, all)
  const withC = settingsFrom(deepMerge<unknown>(before, c.patch), before)
  const changed = lists.map((p) => {
    const was = places(valueIn(before, p))
    const made = places(valueIn(withC, p))
    return { p, made, keys: [...new Set([...was.keys(), ...made.keys()])].filter((k) => !deepEqual(was.get(k), made.get(k))) }
  })
  return (
    after.find((x) => {
      // The settings as `x` leaves them: its lists as they are read.
      const upTo = ordered.filter((y) => changeOrder(y, x) <= 0)
      const s = settingsOn(upTo, x.from, Number.MAX_SAFE_INTEGER)
      return changed.some(({ p, made, keys }) => {
        if (!Array.isArray(valueIn(x.patch, p))) return false
        const its = places(valueIn(s, p))
        return keys.some((k) => deepEqual(its.get(k), made.get(k)))
      })
    }) ?? null
  )
}

/**
 * rd.json without the change `id` (the record is not changed in place), with the change as it was (for „Cofnij” and its words);
 * a refusal – nothing to write. The edit of the two is one field of the list (`settings.#id`, its base the change): changed
 * elsewhere meanwhile it is a question, withdrawn elsewhere it is nothing.
 */
export function withdrawnRd(raw: Record<string, unknown>, id: string, today: string): { raw: Record<string, unknown>; change: SettingsChange } | WithdrawRefused {
  const list: unknown[] = Array.isArray(raw.settings) ? raw.settings : []
  const item = list.find((x) => isPlain(x) && x.id === id)
  const change = item ? changeFrom(item) : null
  if (!change) return { refused: 'gone' }
  const all = list.map(changeFrom).filter((c): c is SettingsChange => c != null)
  const fixed = withdrawRefusal(change, all, today)
  if (fixed === 'newCategory') {
    const category = addedCategory(change, all)!
    const metas = isPlain(raw.categories) ? raw.categories : {}
    const meta = metas[category]
    const name = isPlain(meta) && typeof meta.name === 'string' && meta.name.trim() ? meta.name : null
    return { refused: 'newCategory', change, category, name }
  }
  if (fixed) return { refused: fixed, change }
  const later = laterHolder(change, all)
  if (later) return { refused: 'later', change, later }
  return { raw: { ...raw, settings: list.filter((x) => x !== item) }, change }
}
