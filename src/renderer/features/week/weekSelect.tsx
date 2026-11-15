/**
 * The selection of many blocks in the columns of „Tydzień” and „3 dni” (D527, D528): Ctrl+click selects a block without opening its day (a plain
 * click opens it, as before), Shift+click the range in the order of time through the days – the day, then the start –, Shift+arrows move the end of
 * the range, Ctrl+A selects the whole view, Esc clears; every selected block is ringed, the line „Zaznaczone: 4 · …” stands over the columns, the
 * right button or Shift+F10 opens „Zmień 4 bloki”. The ids of the selection are `blockKey(date, id)` (an id may repeat from day to day); the grid is
 * keyed by its first day, so another week, another three days or another view starts with nothing selected.
 */
import { useMemo, useState, type ReactNode } from 'react'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import { removeBlocksTarget, blockKey, blockSummary, menuCtxOf, parseBlockKey, runGroupAction, weekOrder, type MenuBlock, type MenuState } from '../plan/groupMenu'
import { BlockGroupMenu } from '../plan/BlockGroupMenu'
import type { DeleteTarget } from '../../lib/deleteKey'
import { useSelection, type SelectionApi } from '../../lib/useSelection'
import type { Names } from '../plan/blockView'

/** Where a block of the columns is in its day for the menu: begun, past without a start, taken off the plan, or still to come. */
export function stateOfWeek(state: HorizonBlock['state']): MenuState {
  return state === 'ran' || state === 'running' || state === 'paused' ? 'begun' : state === 'missed' ? 'past' : state === 'parked' || state === 'cancelled' ? 'off' : 'open'
}

/** The focus is on the columns, or on no element at all: the keys of the selection are heard there. */
export function inWeek(e: KeyboardEvent): boolean {
  const t = e.target
  return t === document.body || t === document.documentElement || (t instanceof Element && t.closest('[data-testid="week-grid"]') != null)
}

export interface WeekGroup {
  sel: SelectionApi
  summary: string | null
  isMarked: (date: string, id: string) => boolean
  /** Ctrl or Shift on a block (D527): selects it. */
  mark: (date: string, id: string, e: { ctrlKey: boolean; shiftKey: boolean }) => void
  context: (date: string, id: string, at: { x: number; y: number }) => void
  removeTarget: DeleteTarget | null
  overlay: ReactNode
}

export function useWeekGroup(o: { days: readonly HorizonDay[]; scope: string; today: string; energy: boolean; namesOf: (date: string) => Names }): WeekGroup {
  const order = useMemo(() => weekOrder(o.days), [o.days])
  const sel = useSelection({ order, scope: o.scope, when: inWeek })
  const byKey = useMemo(() => new Map(o.days.flatMap((d) => d.blocks.map((b): [string, HorizonBlock] => [blockKey(d.date, b.id), b]))), [o.days])
  const chosen = useMemo(() => sel.selected.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : [])), [sel.selected, byKey])
  const summary = useMemo(() => blockSummary(chosen, o.energy), [chosen, o.energy])
  const [menu, setMenu] = useState<{ ids: readonly string[]; at: { x: number; y: number } } | null>(null)
  const removeTarget = sel.count >= 2 ? removeBlocksTarget(sel.count, () => runGroupAction('week', [...sel.selected], { kind: 'remove' })) : null
  // The subcategories, variants and routines to choose from are those of the first selected day (the settings of a date).
  const first = (menu?.ids[0] ? parseBlockKey(menu.ids[0]).date : o.today) || o.today
  const ctx = useMemo(() => menuCtxOf(o.namesOf(first)), [first, o.namesOf])
  const blocksOf = (ids: readonly string[]): MenuBlock[] =>
    ids.flatMap((k) => {
      const b = byKey.get(k)
      if (!b) return []
      return [{ id: k, categoryId: b.categoryId, variantId: b.named.variantId ?? null, routine: b.named.routine ?? null, costs: b.cost?.costs ?? null, state: stateOfWeek(b.state), movable: b.movable === true }]
    })
  return {
    sel,
    summary,
    isMarked: (date, id) => sel.isSelected(blockKey(date, id)),
    mark: (date, id, e) => void sel.onItemClick(blockKey(date, id), { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }),
    context: (date, id, at) => setMenu({ ids: [...sel.onItemContext(blockKey(date, id))], at }),
    removeTarget,
    overlay: <BlockGroupMenu view="week" menu={menu} onClose={() => setMenu(null)} blocksOf={blocksOf} ctx={ctx} today={o.today} />
  }
}
