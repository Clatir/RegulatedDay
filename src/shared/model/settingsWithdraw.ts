/**
 * „Wycofaj” of a planned change of the shared settings (UX14, E2): the change taken out of rd.json „settings”, so from its date the
 * settings are what they would be without it – what was in force before it, every later change as it was. Only a change that waits
 * for its date (from a day after today, not „od dziś”): a day whose date came – counted, frozen – keeps what it counted by. A change of
 * the layer of sessions (the move to the templates, D511 – its own changes and the ones it emptied) is not taken back here: the
 * templates hold those sessions, and the settings without it would bring them back beside them. Nor is one whose value would stay
 * anyway (T2347: a later change wrote the same list whole – the week's types, a subcategory's variants – made after it, so the list
 * holds its value), nor one that adds a subcategory (T2348: its name and place are rd.json's at once – they would stay without rules).
 */
import { isMoveChange, setsLayer } from './sessionMigration'
import { changeFrom, changeOrder, isPlain, settingsOn, type SettingsChange } from './settings'

/** A change that waits for its date: from a day after `today`, from the start of that day (an „od dziś” change is in force). */
export const isPlannedChange = (c: Pick<SettingsChange, 'from' | 'at'>, today: string): boolean => c.from > today && c.at == null

/**
 * Why a change is not withdrawn: no longer there (withdrawn elsewhere, unreadable), its date came, a change of the sessions' layer, a
 * later change holds its value (`later` – withdraw that one first), it adds the subcategory `category` (`name` – from rd.json, if any).
 */
export type WithdrawRefused =
  | { refused: 'gone' }
  | { refused: 'inForce' | 'sessions'; change: SettingsChange }
  | { refused: 'later'; change: SettingsChange; later: SettingsChange }
  | { refused: 'newCategory'; change: SettingsChange; category: string; name: string | null }
export type WithdrawRefusal = WithdrawRefused['refused']

/** Why `c` cannot be withdrawn on `today` whatever the other changes are (the list's button); null – it can. */
export function withdrawRefusal(c: SettingsChange, today: string): 'inForce' | 'sessions' | null {
  if (!isPlannedChange(c, today)) return 'inForce'
  return isMoveChange(c) || setsLayer(c) ? 'sessions' : null
}

/** The paths of the lists a patch writes (a list is written whole – `deepMerge`). */
function listPaths(node: Record<string, unknown>, at: readonly string[] = []): string[][] {
  return Object.entries(node).flatMap(([k, v]) => (Array.isArray(v) ? [[...at, k]] : isPlain(v) ? listPaths(v, [...at, k]) : []))
}
const valueIn = (patch: Record<string, unknown>, path: readonly string[]): unknown => path.reduce<unknown>((v, k) => (isPlain(v) ? v[k] : undefined), patch)

/**
 * What else stands in the way of withdrawing `c` among `all` (rd.json's changes): the first change laid after it, and not made before it,
 * that writes one of its lists – made from the settings with `c` in force, it holds its value; or a subcategory `c` adds (not in the
 * settings with every change laid before it).
 */
function withdrawBlock(c: SettingsChange, all: readonly SettingsChange[], raw: Record<string, unknown>): WithdrawRefused | null {
  const lists = listPaths(c.patch)
  if (lists.length) {
    const after = all.filter((x) => x.id !== c.id && changeOrder(c, x) < 0 && !(c.made != null && x.made != null && x.made < c.made)).sort(changeOrder)
    const later = after.find((x) => lists.some((p) => Array.isArray(valueIn(x.patch, p))))
    if (later) return { refused: 'later', change: c, later }
  }
  const cats = isPlain(c.patch.categories) ? c.patch.categories : {}
  const added = Object.keys(cats).filter((id) => isPlain(cats[id]))
  if (added.length) {
    const before = settingsOn(
      all.filter((x) => x.id !== c.id && changeOrder(x, c) < 0),
      c.from,
      Number.MAX_SAFE_INTEGER
    )
    const category = added.find((id) => !before.categories[id])
    if (category) {
      const metas = isPlain(raw.categories) ? raw.categories : {}
      const meta = metas[category]
      const name = isPlain(meta) && typeof meta.name === 'string' && meta.name.trim() ? meta.name : null
      return { refused: 'newCategory', change: c, category, name }
    }
  }
  return null
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
  const refused = withdrawRefusal(change, today)
  if (refused) return { refused, change }
  const blocked = withdrawBlock(change, list.map(changeFrom).filter((c): c is SettingsChange => c != null), raw)
  if (blocked) return blocked
  return { raw: { ...raw, settings: list.filter((x) => x !== item) }, change }
}
