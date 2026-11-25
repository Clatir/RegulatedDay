/**
 * Selecting many in „Kategorie” (D608): the subcategories and the variants shown (those of the subcategory open) as one list in the order of the
 * tree (`treeOrder`) – `useSelection` over it: a click on a row selects only it, Ctrl+click adds it or takes it off, Shift+click – the range in
 * the order shown, Ctrl+A – all shown, Esc and a press beside the rows – nothing selected. The categories themselves are never selected; a click
 * in a field, a list, a switch or a button of a row is theirs (the selection stays). The right button or Shift+F10 on a row opens „Zmień N”
 * (`treeMenu`) – for the whole selection when the row is in it, else only for the row; over the tree „Zaznaczone: 6” with „Zmień 6 ▾” (the
 * same menu). Every pick goes through `changeTreeGroup` (one save, the line of the settings with „Cofnij”); „Koszt…” opens `TreeCostDialog`.
 */
import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { treeOrder, treeTitleCount, treeValues, type TreeAction } from '@shared/model/categoryGroup'
import type { CategoryGroup, TreeGroup, TreeSource } from '@shared/model/categoryTree'
import type { Costs } from '@shared/model/categories'
import type { RulesSettings } from '@shared/model/settings'
import { ContextMenu, menuBind, menuPoint } from '../../components/ContextMenu'
import { isEditable } from '../../lib/deleteKey'
import { useOutsidePointer } from '../../lib/outside'
import { useSelection, type SelectionApi } from '../../lib/useSelection'
import { changeTreeGroup } from './categoryGroupEdits'
import { treeItems, treeMenu, treeMenuTitle } from './categoryMenu'
import { TreeCostDialog } from './TreeCostDialog'

/** What the rows of the tree carry (`data-tree-item` – the key of the element; the categories have none). */
export const TREE_ITEM = 'data-tree-item'
/**
 * What is never a press „beside” the rows: a row, the menu, the bar of the selection, the line of the change and its „Cofnij” (T2717), the bar
 * „od jutra” (its date is chosen with the selection on).
 */
const INSIDE = `[${TREE_ITEM}], [data-context-menu], [data-tree-bar], [data-testid="group-line-settings"], [data-testid="settings-from"]`
/** The button „Zmień N ▾”: a press on it is no „outside” of the menu – its click opens or closes it. */
const OPENER = '[data-tree-menu-opener]'
/** A part of a row that is its own: a field, a list, a button, a switch, a label of a field. */
const OWN_CONTROL = 'button, a, input, select, textarea, label, [role="switch"], [role="radio"], [contenteditable="true"]'

/** The props of a row of the tree (a subcategory's or a variant's root element). */
export interface TreeRowProps {
  onClick: (e: ReactMouseEvent<HTMLElement>) => void
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
  tabIndex: number
  'data-tree-item': string
  'data-selected': 'true' | undefined
  'aria-selected': boolean
}

/** What a row asks for its props (`CategoryRow`, `VariantRows`); none – a tree without selecting. */
export type TreeRowsOf = (key: string) => TreeRowProps

export interface TreeSelection {
  sel: SelectionApi
  rowProps: TreeRowsOf
  /** „Zaznaczone: 6” and „Zmień 6 ▾” – for two and more; null otherwise. */
  bar: ReactNode
  /** The menu and the window „Koszt…” – rendered once by the section. */
  overlay: ReactNode
}

/** The row of the event's target is the row itself (a variant's row inside its subcategory's is its own). */
const rowOf = (e: { target: EventTarget; currentTarget: Element }): boolean => e.target instanceof Element && e.target.closest(`[${TREE_ITEM}]`) === e.currentTarget

export function useTreeSelection(o: { tree: readonly TreeGroup[]; s: RulesSettings; src: TreeSource; groups: readonly CategoryGroup[]; open: string | null; showArchived: boolean }): TreeSelection {
  const order = useMemo(() => treeOrder(o.tree, o.s.categories, o.open, o.showArchived), [o.tree, o.s.categories, o.open, o.showArchived])
  // What may stay selected: the variants of a folded subcategory too (only what is gone from the tree drops out – the archive hidden, removed).
  const present = useMemo(() => treeOrder(o.tree, o.s.categories, 'all', o.showArchived), [o.tree, o.s.categories, o.showArchived])
  // The keys only with the focus in „Kategorie” (the settings page has other fields and lists): a click on a row gives it the focus. Also in the
  // bar „od jutra” (the date chosen with the selection on) and – while something is selected – on the body (the focus fell there when a row
  // moved away under it, T2719).
  const count = useRef(0)
  const section = useRef<(e: KeyboardEvent) => boolean>((e) => {
    const t = e.target
    if (t instanceof Element && t.closest('[data-testid="settings-categories"], [data-testid="settings-from"]')) return true
    return t === document.body && count.current > 0
  })
  const sel = useSelection({ order, present, when: section.current })
  count.current = sel.count
  // `from` – the bar's button or a row (T2716): only the bar's menu is the button's („rozwinięty”, a second click closes it); `seq` – a menu opened
  // anew is another one (a row's menu replaced by the bar's starts again at its own place).
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; keys: string[]; from: 'bar' | 'row'; seq: number } | null>(null)
  const seq = useRef(0)
  const [costing, setCosting] = useState<string[] | null>(null)
  useOutsidePointer(sel.count > 0 && !menu && !costing, INSIDE, () => sel.clear())

  const openMenu = (key: string | null, at: { x: number; y: number }) => {
    const keys = key ? sel.onItemContext(key) : sel.selected
    if (keys.length) setMenu({ at, keys: [...keys], from: key ? 'row' : 'bar', seq: ++seq.current })
  }
  const act = (keys: readonly string[], a: TreeAction) => void changeTreeGroup(keys, a)

  const rowProps: TreeRowsOf = (key) => {
    const bind = menuBind((at) => openMenu(key, at))
    return {
      onClick: (e) => {
        if (!rowOf(e) || isEditable(e.target) || (e.target instanceof Element && e.target.closest(OWN_CONTROL))) return
        sel.onItemClick(key, e)
        // The row is where the keys of the selection look for it (Ctrl+A, Esc, Shift+F10).
        if (document.activeElement !== e.currentTarget) e.currentTarget.focus()
      },
      onContextMenu: (e) => rowOf(e) && bind.onContextMenu(e),
      onKeyDown: (e) => bind.onKeyDown(e),
      tabIndex: -1,
      'data-tree-item': key,
      'data-selected': sel.isSelected(key) ? 'true' : undefined,
      'aria-selected': sel.isSelected(key)
    }
  }

  const n = sel.count
  const bar =
    n >= 2 ? (
      <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-panel px-3 py-1.5 text-[12.5px] text-muted" data-tree-bar="" data-testid="tree-selection">
        <span>Zaznaczone: {n}</span>
        <button
          type="button"
          className="btn py-0.5"
          aria-haspopup="menu"
          aria-expanded={menu?.from === 'bar'}
          data-tree-menu-opener=""
          onClick={(e) => {
            // A second click closes it (the button is no press „beside” the menu – `keep`, T2709), as „⋯” of the day; a row's menu open – the bar's
            // replaces it (T2716).
            if (menu?.from === 'bar') return setMenu(null)
            // The focus on the button first: the menu gives it back there (a click does not always focus a button). Without a scroll:
            // the menu closes on any scroll (`ContextMenu`), and focusing a button at the edge of the page scrolls it (T2884).
            e.currentTarget.focus({ preventScroll: true })
            openMenu(null, menuPoint(e.nativeEvent, e.currentTarget))
          }}
          data-testid="tree-selection-menu"
        >
          Zmień {n} ▾
        </button>
      </div>
    ) : null

  const items = costing ? treeItems(costing) : []
  const costs = items.flatMap(({ item }) => {
    const v = treeValues(o.s, item)
    return v ? [v.costs] : []
  }) as Costs[]
  const overlay = (
    <>
      {menu && (
        <ContextMenu
          key={menu.seq}
          title={treeMenuTitle(menu.keys)}
          at={menu.at}
          onClose={() => setMenu(null)}
          testId="tree-menu"
          keep={OPENER}
          items={treeMenu(menu.keys, { s: o.s, src: o.src, groups: o.groups }, {
            cost: () => setCosting(menu.keys),
            place: (place) => act(menu.keys, { kind: 'place', place }),
            move: (group) => act(menu.keys, { kind: 'move', group }),
            remove: () => act(menu.keys, { kind: 'remove' })
          })}
        />
      )}
      {costing && (
        <TreeCostDialog
          title={`Koszt na godzinę – ${treeTitleCount(items)}`}
          costs={costs}
          onClose={() => setCosting(null)}
          onApply={(c) => {
            const keys = costing
            setCosting(null)
            act(keys, { kind: 'costs', costs: c })
          }}
        />
      )}
    </>
  )
  return { sel, rowProps, bar, overlay }
}
