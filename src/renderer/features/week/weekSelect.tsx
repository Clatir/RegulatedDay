/**
 * The selection of many blocks in the columns of „Tydzień” and „3 dni” (D527, D528): Ctrl+click selects a block without opening its day (a plain
 * click opens it, as before), Shift+click the range in the order of time through the days – the day, then the start –, Shift+arrows move the end of
 * the range, Ctrl+A selects the whole view, Esc clears; every selected block is ringed, the line „Zaznaczone: 4 · …” stands over the columns, the
 * right button or Shift+F10 opens „Zmień 4 bloki”. The ids of the selection are `blockKey(date, id)` (an id may repeat from day to day); the grid is
 * keyed by its first day, so another week, another three days or another view starts with nothing selected.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import { removeBlocksTarget, blockKey, blockSummary, menuCtxOf, parseBlockKey, weekOrder, type MenuBlock, type MenuState } from '../plan/groupMenu'
import { runBlockGroup } from '../plan/groupRun'
import { BlockGroupMenu } from '../plan/BlockGroupMenu'
import { removeTarget, type DeleteTarget } from '../../lib/deleteKey'
import { useSelection, type SelectionApi } from '../../lib/useSelection'
import { blockName, type Names } from '../plan/blockView'

/** Where a block of the columns is in its day for the menu: begun, past without a start, taken off the plan, or still to come. */
export function stateOfWeek(state: HorizonBlock['state']): MenuState {
  return state === 'ran' || state === 'running' || state === 'paused' ? 'begun' : state === 'missed' ? 'past' : state === 'parked' || state === 'cancelled' ? 'off' : 'open'
}

/**
 * Whether „Przesuń resztę dnia o…” has a block to move on a day of the columns (N17, T2494 – their menu has no engine's verdict): from the earliest
 * of the selected blocks `ids` on (where the column draws it: a begun one where it began), a block the push apart moves (`HorizonBlock.pushable` –
 * the engine's rule, D367).
 */
export function restLeftIn(day: Pick<HorizonDay, 'blocks'>, ids: readonly string[]): boolean {
  const from = Math.min(...day.blocks.filter((b) => ids.includes(b.id)).map((b) => b.startMin))
  return day.blocks.some((b) => b.startMin >= from && b.pushable === true)
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
  // Del: two or more – one question for all; one block selected (Ctrl+click – no panel holds it) – asked by its name (UX17, F8), the same removal.
  const only = sel.count === 1 ? sel.selected[0] : undefined
  const onlyBlock = only !== undefined ? byKey.get(only) : undefined
  const removeKeys = () => runBlockGroup('week', [...sel.selected], { kind: 'remove' })
  const removeTargetOf: DeleteTarget | null =
    sel.count >= 2 ? removeBlocksTarget(sel.count, removeKeys) : only !== undefined && onlyBlock ? removeTarget(blockName(onlyBlock.named, o.namesOf(parseBlockKey(only).date)), removeKeys) : null
  // The subcategories, variants and routines to choose from are those of the first selected day (the settings of a date).
  const first = (menu?.ids[0] ? parseBlockKey(menu.ids[0]).date : o.today) || o.today
  const ctx = useMemo(() => menuCtxOf(o.namesOf(first)), [first, o.namesOf])
  // Stable while the days are (the menu counts its entries again only when they change).
  const today = o.today
  const { days } = o
  const blocksOf = useCallback(
    (ids: readonly string[]): MenuBlock[] => {
      // The rest of each day (N17): from its earliest selected block – none left there, the entry says so (T2494).
      const byDate = new Map<string, string[]>()
      for (const k of ids) {
        const { date, id } = parseBlockKey(k)
        byDate.set(date, [...(byDate.get(date) ?? []), id])
      }
      const left = new Map(
        [...byDate].map(([date, dayIds]) => {
          const day = days.find((d) => d.date === date)
          return [date, day ? restLeftIn(day, dayIds) : true] as const
        })
      )
      return ids.flatMap((k) => {
        const b = byKey.get(k)
        if (!b) return []
        const date = parseBlockKey(k).date
        return [{ id: k, categoryId: b.categoryId, variantId: b.named.variantId ?? null, routine: b.named.routine ?? null, costs: b.cost?.costs ?? null, state: stateOfWeek(b.state), movable: b.movable === true, notToday: date !== today, pastDay: date < today, restNone: left.get(date) === false }]
      })
    },
    [byKey, today, days]
  )
  return {
    sel,
    summary,
    isMarked: (date, id) => sel.isSelected(blockKey(date, id)),
    mark: (date, id, e) => void sel.onItemClick(blockKey(date, id), { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }),
    context: (date, id, at) => setMenu({ ids: [...sel.onItemContext(blockKey(date, id))], at }),
    removeTarget: removeTargetOf,
    overlay: <BlockGroupMenu view="week" menu={menu} onClose={() => setMenu(null)} blocksOf={blocksOf} ctx={ctx} today={o.today} />
  }
}
