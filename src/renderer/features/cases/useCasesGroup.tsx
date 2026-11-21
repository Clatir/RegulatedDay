/**
 * Selecting many sprawy and changing them together (D527–D530) for the two places that list them – the page „Sprawy” and the panel beside
 * the axis of „Dziś”. The selection is `useSelection` (`lib/useSelection.ts`) over the lists: Shift+click, Shift+arrows and Ctrl+A go within
 * the list the anchor is in (the order handed to the hook is that list's), Ctrl+click joins sprawy of different lists (T1542) – what is
 * selected in another list stays after the ones of the anchor's list. A plain click selects only the row (and gives it the focus, as before – the
 * target of Del), the right button or Shift+F10 opens „Zmień N spraw” (`casesMenu`) for the whole selection, „Zaplanuj…” opens „Od której?”.
 * Every change says itself in the line of the screen (`GroupLine`, `view`). The hook hands the screen what each row needs (`rowProps`), the line
 * over the lists („Zaplanowano…” aside – that is the line of the window) and the overlay (menu, window).
 */
import { useCallback, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { CaseItem } from '@shared/engine/cases'
import { caseSummaryItem } from '@shared/engine/casesGroup'
import { groupSummary } from '@shared/groupSummary'
import type { CaseList } from '@shared/model/requests'
import { settingsOn } from '@shared/model/settings'
import { ContextMenu, menuBind } from '../../components/ContextMenu'
import { isEditable, type DeleteTarget } from '../../lib/deleteKey'
import { useSelection, type SelectionApi } from '../../lib/useSelection'
import { categoryCases, doneCases, estimateCases, moveCases, restoreCases, type GroupResult } from '../../store/casesGroup'
import { useData } from '../../store/data'
import type { GroupView } from '../../store/groupLine'
import { groupedCategoryOptions } from '../plan/blockView'
import { CASE_VERB, casesMenu, casesMenuTitle, removeCasesTarget, removeGroup, showCasesLine } from './groupActions'
import { PlanGroupDialog } from './PlanGroupDialog'
import { ownControl } from './usePointerDrag'

/** A press that moved this far is a drag, not a click (`dragStarted`'s 4 px). */
const CLICK_SLOP = 4

export interface CasesGroupOptions {
  /** Where its line stands (`GroupLine view`). */
  view: GroupView
  /** Every sprawa the screen shows. */
  items: readonly CaseItem[]
  /** The ids of each list as the screen shows them, top to bottom – Shift and Ctrl+A go within one. */
  lists: ReadonlyArray<readonly string[]>
  /** Another value drops the selection (the view, the page). */
  scope?: string | null
  /** Whether the keys of the selection are heard (the screen is shown). */
  enabled: boolean
  /** The focus is in this screen: the page and the panel never both take a key. */
  when: (e: KeyboardEvent) => boolean
  /** The panel's drag (`usePointerDrag.started`): a click that follows a gesture that started is no click on the row. */
  dragStarted?: () => boolean
  today: string
}

export interface CasesGroup {
  sel: SelectionApi
  /** The selected sprawy in the order the screen shows them (the order „Zaplanuj…” puts them in). */
  selected: CaseItem[]
  /** „Zaznaczone: 4 · 3 h 20 min · energia −18 G · …” for two and more; null otherwise. */
  summary: string | null
  /** What Del removes when the selection has two or more: „Usunąć 3 sprawy?”; null – the screen's single removal. */
  removeTarget: DeleteTarget | null
  /** Props of the element of a row: the click, the right button and the menu key; `data-selected`. */
  rowProps: (x: CaseItem) => {
    onClick: (e: ReactMouseEvent<HTMLElement>) => void
    onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
    onPointerDownCapture: (e: ReactPointerEvent<HTMLElement>) => void
    'data-selected': 'true' | undefined
  }
  /**
   * A row that must be asked before its sprawa moves (a rule of „Powtarzaj” not saved yet would be lost with its form, D563 P5) registers its guard: it gets the list the
   * sprawa is going to (`'done'` for „Zrobione”) and answers true when it took the move over (asked – it moves the sprawa itself after the answer). The menu of the right
   * button asks it for a menu of one sprawa; null – the row goes (unmounts).
   */
  guardMove: (id: string, guard: ((list: CaseList) => boolean) | null) => void
  /** The menu and the window „Od której?” – rendered once by the screen. */
  overlay: ReactNode
}

export function useCasesGroup(o: CasesGroupOptions): CasesGroup {
  const rd = useData((s) => s.rd)
  // The list the anchor is in (the last click): the order of the hook is its ids; a click on another list moves it there. It goes with the
  // selection: another scope (the matrix and back) has none.
  const scope = o.scope ?? null
  const [held, setHeld] = useState<{ scope: string | null; at: number }>({ scope, at: -1 })
  // Another scope forgets it for good (the matrix and back is not the same selection).
  if (held.scope !== scope) setHeld({ scope, at: -1 })
  const at = held.scope === scope ? held.at : -1
  const setAt = (index: number) => setHeld({ scope, at: index })
  const lists = o.lists
  const flat = useMemo(() => lists.flat(), [lists])
  const order = lists[at] ?? []
  const sel = useSelection({ order, present: flat, scope, enabled: o.enabled, when: o.when })
  const byId = useMemo(() => new Map(o.items.map((x) => [x.record.id, x])), [o.items])
  const place = useMemo(() => new Map(flat.map((id, i) => [id, i])), [flat])
  const itemsOf = (ids: readonly string[]): CaseItem[] =>
    ids
      .flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
      .sort((a, b) => (place.get(a.record.id) ?? 0) - (place.get(b.record.id) ?? 0))
  // One array while the selection and the lists are the same (the panel is drawn on every move of a drag).
  const selected = useMemo(() => itemsOf(sel.selected), [sel.selected, byId, place])
  const listOf = (id: string) => lists.findIndex((l) => l.includes(id))

  const guards = useRef(new Map<string, (list: CaseList) => boolean>())
  const guardMove = useCallback((id: string, guard: ((list: CaseList) => boolean) | null) => void (guard ? guards.current.set(id, guard) : guards.current.delete(id)), [])
  /** The move of one sprawa taken over by its row (see `guardMove`). */
  const guarded = (ids: readonly string[], list: CaseList): boolean => ids.length === 1 && guards.current.get(ids[0]!)?.(list) === true
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; ids: string[] } | null>(null)
  const [planning, setPlanning] = useState<string[] | null>(null)
  const down = useRef<{ x: number; y: number } | null>(null)
  const names = useMemo(() => ({ rd, settings: settingsOn(rd.settings, o.today) }), [rd, o.today])
  const groups = useMemo(() => groupedCategoryOptions(names), [names])

  const openMenu = (id: string, point: { x: number; y: number }) => {
    const ids = sel.onItemContext(id)
    // The element outside the selection is now the only one selected: the anchor is in its list.
    if (ids.length === 1 && ids[0] === id) setAt(listOf(id))
    setMenu({ at: point, ids: [...ids] })
  }

  const rowProps: CasesGroup['rowProps'] = (x) => {
    const id = x.record.id
    return {
      onPointerDownCapture: (e) => {
        down.current = { x: e.clientX, y: e.clientY }
      },
      onClick: (e) => {
        // The row's own fields and buttons are theirs, and so is an opened form of the row (`data-row-form`: dates, repeat, steps, „Zaplanuj”);
        // a press that moved is a drag of the panel's row.
        if (ownControl(e.target) || isEditable(e.target) || (e.target instanceof Element && e.target.closest('[data-row-form]'))) return
        if (o.dragStarted?.()) {
          down.current = null
          return
        }
        const from = down.current
        if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > CLICK_SLOP) return
        sel.onItemClick(id, e)
        setAt(listOf(id))
        // A click on the row gives it the focus (the row is where Del and the keys of the selection look for it).
        if (document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true })
      },
      ...menuBind((at) => openMenu(id, at)),
      'data-selected': sel.isSelected(id) ? 'true' : undefined
    }
  }

  const energy = rd.general.modules.energy
  const summary = useMemo(() => {
    const rules = names.settings.categories
    return groupSummary(selected.map((x) => caseSummaryItem(x.record, rules)), { energy })
  }, [selected, names, energy])
  const removeTarget = selected.length >= 2 ? removeCasesTarget(selected.length, () => removeGroup(o.view, selected.map((x) => x.record.id))) : null

  const act = async (verb: string, run: () => Promise<GroupResult>) => showCasesLine(o.view, verb, await run())
  const overlay = (
    <>
      {menu && (
        <ContextMenu
          title={casesMenuTitle(menu.ids.length)}
          at={menu.at}
          onClose={() => setMenu(null)}
          items={casesMenu(itemsOf(menu.ids), groups, {
            list: (l) => void (guarded(menu.ids, l) || act(CASE_VERB.moved, () => moveCases(menu.ids, l))),
            category: (c) => void act(CASE_VERB.changed, () => categoryCases(menu.ids, c)),
            estimate: (m) => void act(CASE_VERB.changed, () => estimateCases(menu.ids, m)),
            done: () => void (guarded(menu.ids, 'done') || act(CASE_VERB.done, () => doneCases(menu.ids))),
            restore: () => void act(CASE_VERB.restored, () => restoreCases(menu.ids)),
            plan: () => setPlanning(menu.ids),
            remove: () => void removeGroup(o.view, menu.ids)
          })}
        />
      )}
      {planning && <PlanGroupDialog items={itemsOf(planning)} today={o.today} view={o.view} onClose={() => setPlanning(null)} />}
    </>
  )
  return { sel, selected, summary, removeTarget, rowProps, guardMove, overlay }
}
