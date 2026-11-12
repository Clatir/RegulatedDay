/**
 * The palette's rows and moves without a DOM (Ctrl K): the groups of results as rows (a heading, five results, „jeszcze
 * N” for the rest), the arrow keys' wrap, what Enter does with a record, and the last chosen results of this computer.
 */
import { logicalDayOf } from '@shared/time/day'
import { addDays, isIsoDate } from '@shared/time/zone'
import { GROUP_SIZE, parseRecents, recordKey, rememberRecent, type GroupId, type SearchGroup, type SearchRecord } from '@shared/search'
import { navigate, openDay, openPick, openRitual, type Page } from '../../store/ui'

export type Row =
  | { type: 'head'; label: string }
  | { type: 'hit'; record: SearchRecord }
  | { type: 'more'; group: GroupId; rest: number }

/** The rows of the groups: a group opened (`open`) shows all its results, else five and the count of the rest. */
export function rowsOf(groups: readonly SearchGroup[], open: ReadonlySet<GroupId>): Row[] {
  const rows: Row[] = []
  for (const g of groups) {
    rows.push({ type: 'head', label: g.label })
    const shown = open.has(g.id) ? g.hits : g.hits.slice(0, GROUP_SIZE)
    for (const h of shown) rows.push({ type: 'hit', record: h.record })
    if (shown.length < g.hits.length) rows.push({ type: 'more', group: g.id, rest: g.hits.length - shown.length })
  }
  return rows
}

/** Rows the keys can stop at (not the headings), as indexes into `rows`. */
export const selectable = (rows: readonly Row[]): number[] => rows.flatMap((r, i) => (r.type === 'head' ? [] : [i]))

/** The next place of the selection among `count` rows, wrapping round both ends; nothing to select: −1. */
export function stepIndex(at: number, count: number, delta: 1 | -1): number {
  if (count <= 0) return -1
  if (at < 0 || at >= count) return delta === 1 ? 0 : count - 1
  return (at + delta + count) % count
}

/** Today for the palette: the data view's logical day, else (no view yet) the one of this computer's clock – never an empty date. */
export const todayOf = (viewToday: string | null | undefined, now = Date.now()): string => (viewToday && isIsoDate(viewToday) ? viewToday : logicalDayOf(now))

/** What Enter (or a click) does with a record: opens its screen with the record picked there (T653) or runs the command. */
export function choose(r: SearchRecord, today: string): void {
  switch (r.kind) {
    case 'command':
      if (r.id === 'newBlock') openPick({ page: 'today', day: null }, { kind: 'command', id: 'newBlock' })
      else if (r.id === 'newRequest') openPick({ page: 'requests' }, { kind: 'command', id: 'newRequest' })
      // The days count from a real today; without one these two do nothing (the palette gives it from the clock at least).
      else if (r.id === 'tomorrow' && isIsoDate(today)) openDay(addDays(today, 1))
      else if (r.id === 'yesterday' && isIsoDate(today)) openDay(addDays(today, -1))
      else if (r.id === 'ritual') openRitual()
      return
    case 'screen':
      navigate(r.id as Page)
      return
    case 'setting':
      openPick({ page: 'settings' }, { kind: 'setting', id: r.id })
      return
    case 'category':
      openPick({ page: 'settings' }, { kind: 'category', id: r.id })
      return
    case 'block':
      openPick({ page: 'today', day: r.date === today ? null : r.date! }, { kind: 'block', id: r.id, date: r.date! })
      return
    case 'template':
      openPick({ page: 'templates' }, { kind: 'template', id: r.id })
      return
    case 'templateBlock':
      openPick({ page: 'templates' }, { kind: 'templateBlock', id: r.id, parent: r.parent! })
      return
    case 'series':
      // The list of series is in „Szablony” (D381).
      openPick({ page: 'templates' }, { kind: 'series', id: r.id })
      return
    case 'request':
      openPick({ page: 'requests' }, { kind: 'request', id: r.id })
      return
    case 'routine':
      openPick({ page: 'routines' }, { kind: 'routine', id: r.id })
  }
}

const RECENT_KEY = 'rd.searchRecent'

/** The keys of the last chosen results of this computer (the window's own storage, T652); unreadable storage – none. */
export function loadRecents(): string[] {
  try {
    return parseRecents(localStorage.getItem(RECENT_KEY))
  } catch {
    return []
  }
}

/** Remembers a chosen result (a storage that cannot be written is no memory, never an error). */
export function saveRecent(r: SearchRecord): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(rememberRecent(loadRecents(), recordKey(r))))
  } catch {
    // No storage: nothing is remembered.
  }
}

/** The records of the last chosen keys that still exist (a record gone is left out, the order is kept). */
export function recentRecords(keys: readonly string[], records: readonly SearchRecord[]): SearchRecord[] {
  const by = new Map(records.map((r) => [recordKey(r), r]))
  return keys.flatMap((k) => {
    const r = by.get(k)
    return r ? [r] : []
  })
}
