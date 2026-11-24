/**
 * The subcategories a „#word” of the quick capture may name (D600): the ones of the tree of „Ustawienia → Kategorie” in its order (the groups
 * in theirs, in a group by class and name – `pickTree`, the list of a block), not archived. The names are those of `rd.categories` (a name has
 * no date); the settings of the day only say which subcategories exist then (their rules – `settingsOn`); one with no entry in `rd.categories` has no name to type – left out („kategoria usunięta” is no word).
 * One list for the main process (`hub.quickAdd`, the window's and the bar's preview over IPC) and for the window's own field.
 */
import { pickTree } from './model/categoryTree'
import { categoryName, type RdFile } from './model/rd'
import { settingsOn } from './model/settings'
import type { QuickCategory } from './quickDates'

export function quickCategories(rd: RdFile, date: string): QuickCategory[] {
  return pickTree(rd, settingsOn(rd.settings, date).categories).flatMap(({ categories }) => categories.filter((id) => id in rd.categories).map((id) => ({ id, name: categoryName(rd, id) })))
}
