/**
 * The selection of many blocks in the columns of „Tydzień” and „3 dni” (D527, D528): Ctrl+click selects a block without opening its day (a plain
 * click opens it, as before), Shift+click the range in the order of time through the days – the day, then the start –, Shift+arrows move the end of
 * the range, Ctrl+A selects the whole view, Esc clears; every selected block is ringed, the line „Zaznaczone: 4 · …” stands over the columns, the
 * right button or Shift+F10 opens „Zmień 4 bloki”. The ids of the selection are `blockKey(date, id)` (an id may repeat from day to day); the grid is
 * keyed by its first day, so another week, another three days or another view starts with nothing selected.
 * N18 (D596, D597): the same model serves „Agenda” (the blocks of its list) and the bars of the blocks in the cells of the month – the screen gives the
 * tiles in the order it draws them (`days`), the key presses it hears (`when`) and the line its changes are said in (`view`: „week” or „calendar”).
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { MonthNamed } from '@shared/engine/calendarViews'
import type { HorizonBlock } from '@shared/engine/week'
import { groupCount } from '@shared/groupText'
import type { Costs } from '@shared/model/categories'
import type { GroupView } from '../../store/groupLine'
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
export function restLeftIn(day: { blocks: readonly GroupTile[] }, ids: readonly string[]): boolean {
  const from = Math.min(...day.blocks.filter((b) => ids.includes(b.id)).map((b) => b.startMin))
  return day.blocks.some((b) => b.startMin >= from && b.pushable === true)
}

/** The focus is on the columns, or on no element at all: the keys of the selection are heard there. */
export function inWeek(e: KeyboardEvent): boolean {
  const t = e.target
  return t === document.body || t === document.documentElement || (t instanceof Element && t.closest('[data-testid="week-grid"]') != null)
}

/** The focus is in „Agenda”'s list, or on no element at all: the keys of its selection are heard there (N18). */
export function inAgenda(e: KeyboardEvent): boolean {
  const t = e.target
  return t === document.body || t === document.documentElement || (t instanceof Element && t.closest('[data-testid="agenda"]') != null)
}

/** The focus is in the month's grid, or on no element at all: the keys of the selection of the bars are heard there (a checkbox of the filter or a button of the actions keeps its own, N18). */
export function inMonthGrid(e: KeyboardEvent): boolean {
  const t = e.target
  return t === document.body || t === document.documentElement || (t instanceof Element && t.closest('[data-testid="month-grid"]') != null)
}

/**
 * What a selectable block needs to be: its place in the day, what names it and what the menu asks of it. A block of the horizon (`HorizonBlock`)
 * is one, and so is the block of a bar of the month (`MonthBlock`, which has no cost – the month counts none, T2608).
 */
export interface GroupTile {
  id: string
  categoryId: string
  startMin: number
  endMin: number
  state: HorizonBlock['state']
  movable?: boolean | undefined
  /** The push apart moves it (`HorizonBlock.pushable`, N17); a bar of the month has none. */
  pushable?: true | undefined
  named: MonthNamed
  cost?: { costs: Costs } | null | undefined
}

/** „Zaznaczone: 3 bloki · 2 h” – the line of the month's bars in the calendar's actions: the count with its noun, then the time of the summary (one block – the count only). */
export function blocksLine(count: number, summary: string | null): string {
  const head = `Zaznaczone: ${groupCount(count, 'block')}`
  const rest = summary?.split(' · ').slice(1) ?? []
  return [head, ...rest].join(' · ')
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

export function useWeekGroup(o: {
  days: ReadonlyArray<{ date: string; blocks: readonly GroupTile[] }>
  scope: string
  today: string
  energy: boolean
  namesOf: (date: string) => Names
  /** The line the changes are said in (default „week”: „Tydzień”, „3 dni” and „Agenda”). */
  view?: Extract<GroupView, 'week' | 'calendar'>
  /** Which key presses the selection hears (default: the focus in the columns of „Tydzień”). */
  when?: (e: KeyboardEvent) => boolean
  /** The arrows of Shift+arrow (default: vertical; the month has no arrows for its bars). */
  arrows?: 'vertical' | false
  enabled?: boolean
  /** What Ctrl+A selects (default: every tile of `days`) – the month's grid shows the bars of the neighbouring months too, Ctrl+A takes the month's own. */
  all?: readonly string[]
  /** The view counted no costs of its blocks („Agenda”, the month): the menu's „Koszt…” is off (default: counted). */
  costsKnown?: boolean
  /** „Zapisz jako szablon / rutynę…” in the menu (N15 – „Tydzień” and „3 dni”). */
  saveAs?: boolean
}): WeekGroup {
  const view = o.view ?? 'week'
  const order = useMemo(() => weekOrder(o.days), [o.days])
  const sel = useSelection({ order, scope: o.scope, when: o.when ?? inWeek, arrows: o.arrows ?? 'vertical', enabled: o.enabled ?? true, ...(o.all ? { all: o.all } : {}) })
  const byKey = useMemo(() => new Map(o.days.flatMap((d) => d.blocks.map((b): [string, GroupTile] => [blockKey(d.date, b.id), b]))), [o.days])
  const chosen = useMemo(() => sel.selected.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : [])), [sel.selected, byKey])
  const summary = useMemo(() => blockSummary(chosen, o.energy), [chosen, o.energy])
  const [menu, setMenu] = useState<{ ids: readonly string[]; at: { x: number; y: number } } | null>(null)
  // Del: two or more – one question for all; one block selected (Ctrl+click – no panel holds it) – asked by its name (UX17, F8), the same removal.
  const only = sel.count === 1 ? sel.selected[0] : undefined
  const onlyBlock = only !== undefined ? byKey.get(only) : undefined
  const removeKeys = () => runBlockGroup(view, [...sel.selected], { kind: 'remove' })
  const removeTargetOf: DeleteTarget | null =
    sel.count >= 2 ? removeBlocksTarget(sel.count, removeKeys) : only !== undefined && onlyBlock ? removeTarget(blockName({ ...onlyBlock.named, note: '' }, o.namesOf(parseBlockKey(only).date)), removeKeys) : null
  // The subcategories, variants and routines to choose from are those of the first selected day (the settings of a date).
  const first = (menu?.ids[0] ? parseBlockKey(menu.ids[0]).date : o.today) || o.today
  const costsKnown = o.costsKnown ?? true
  const ctx = useMemo(() => ({ ...menuCtxOf(o.namesOf(first)), costsKnown }), [first, o.namesOf, costsKnown])
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
    overlay: <BlockGroupMenu view={view} menu={menu} onClose={() => setMenu(null)} blocksOf={blocksOf} ctx={ctx} today={o.today} saveAs={o.saveAs === true} />
  }
}
