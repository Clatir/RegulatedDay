/**
 * The menu „Zmień 6 podkategorii” of a selection in „Kategorie” (D608, D609) – pure: the entries for the selected elements of the tree and
 * the settings of the bar's date. „Koszt…” (the window with ✓ / „—”), „Miejsce ▸” (the three places, ✓ / „—” by what each has now – a variant
 * without its own, its subcategory's), „Przenieś do kategorii ▸” (the categories shown; only subcategories – a selection of variants only
 * has it disabled with the reason), „Usuń” (disabled when all are in the archive already). Every pick goes to `on`.
 */
import { treeCount, treeItemOf, treeValues, type TreeItem } from '@shared/model/categoryGroup'
import { groupOfCategory, type CategoryGroup, type TreeSource } from '@shared/model/categoryTree'
import type { Place } from '@shared/model/categories'
import type { RulesSettings } from '@shared/model/settings'
import { triState } from '@shared/selection'
import type { MenuEntry } from '../../components/ContextMenu'
import { PLACE_OPTIONS } from './categoryFields'

export interface TreeMenuOn {
  cost: () => void
  place: (place: Place) => void
  move: (group: string) => void
  remove: () => void
}

/** Why „Przenieś do kategorii” has nothing to act on (D609): only variants are selected. */
export const VARIANTS_STAY = 'Warianty zostają przy swojej podkategorii'
/** Why „Usuń” has nothing to act on: every selected one is in the archive. */
export const ALL_ARCHIVED = 'Wszystkie zaznaczone są już w archiwum'

const checked = (values: boolean[]): { check?: 'all' | 'some' } => {
  const s = triState(values)
  return s === 'none' ? {} : { check: s }
}

/** The elements of the keys (those the tree knows). */
export const treeItems = (keys: readonly string[]): Array<{ key: string; item: TreeItem }> =>
  keys.flatMap((key) => {
    const item = treeItemOf(key)
    return item ? [{ key, item }] : []
  })

/** The title of the menu: „Zmień 6 podkategorii”, „Zmień 1 podkategorię”, „Zmień 4 podkategorie i 2 warianty” (the accusative). */
export const treeMenuTitle = (keys: readonly string[]): string => `Zmień ${treeCount(treeItems(keys))}`

/** Whether an element is in the archive now: a subcategory – rd.json's, a variant – the settings'. */
function archived(item: TreeItem, src: TreeSource, s: RulesSettings): boolean {
  if (item.kind === 'category') return src.categories[item.category]?.archived === true
  return s.categories[item.category]?.variants.find((v) => v.id === item.variant)?.archived === true
}

export function treeMenu(keys: readonly string[], ctx: { s: RulesSettings; src: TreeSource; groups: readonly CategoryGroup[] }, on: TreeMenuOn): MenuEntry[] {
  const items = treeItems(keys)
  const values = items.map(({ item }) => treeValues(ctx.s, item))
  const cats = items.filter(({ item }) => item.kind === 'category')
  return [
    { label: 'Koszt…', onPick: on.cost, testId: 'tree-menu-cost' },
    {
      label: 'Miejsce',
      testId: 'tree-menu-place',
      submenu: PLACE_OPTIONS.map((o): MenuEntry => ({ label: o.label, ...checked(values.map((v) => v?.place === o.value)), onPick: () => on.place(o.value), testId: `tree-menu-place-${o.value}` }))
    },
    cats.length
      ? {
          label: 'Przenieś do kategorii',
          testId: 'tree-menu-move',
          // ✓ by the category rd.json names, also an archived one (as the row's list „Kategoria”, T1423): a subcategory standing in „Inne” only because
          // its category is archived has no ✓ at „Inne” – picking it writes the move.
          submenu: ctx.groups.map((g): MenuEntry => ({ label: g.name, ...checked(cats.map(({ item }) => groupOfCategory(ctx.src, item.category, { archived: true }) === g.id)), onPick: () => on.move(g.id), testId: `tree-menu-move-${g.id}` }))
        }
      : { label: 'Przenieś do kategorii', disabled: VARIANTS_STAY, testId: 'tree-menu-move' },
    { kind: 'separator' },
    items.every(({ item }) => archived(item, ctx.src, ctx.s)) ? { label: 'Usuń', disabled: ALL_ARCHIVED, testId: 'tree-menu-remove' } : { label: 'Usuń', onPick: on.remove, testId: 'tree-menu-remove' }
  ]
}
