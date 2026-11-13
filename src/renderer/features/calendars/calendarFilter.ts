/**
 * Which calendars the window's views hide (D419): a habit of this computer, kept in the window's own storage (nothing in
 * the data folder – the same way as `plan/lastCategory.ts`). Storage that cannot be read or written is no memory, never an
 * error. A calendar id the folder no longer has hides nothing (`filterBlocks` knows only the calendars that exist).
 * The views of the window call `useCalendarFilter(blocks)` and show `shown` with `hiddenCount` in `CalendarChips`.
 */
import { useMemo } from 'react'
import { create } from 'zustand'
import { filterBlocks } from '@shared/model/calendars'
import { useData } from '../../store/data'

const KEY = 'rd.hiddenCalendars'

/** The calendar ids remembered as unchecked (none when nothing is stored or the storage is not there). */
export function loadHiddenCalendars(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x !== ''))] : []
  } catch {
    return []
  }
}

function saveHiddenCalendars(ids: readonly string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // No storage: the calendars are all shown again at the next start.
  }
}

interface CalendarFilter {
  /** The unchecked calendars (ids). */
  hidden: string[]
  /** A calendar checked ↔ unchecked. */
  toggle: (id: string) => void
  /** Reads the memory again (the storage changed under the store). */
  reload: () => void
}

export const useCalendarFilter = create<CalendarFilter>((set, get) => ({
  hidden: loadHiddenCalendars(),
  toggle: (id) => {
    const cur = get().hidden
    const hidden = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    saveHiddenCalendars(hidden)
    set({ hidden })
  },
  reload: () => set({ hidden: loadHiddenCalendars() })
}))

/**
 * What a view shows of its blocks (anything with a `categoryId`): the blocks outside the unchecked calendars, and how many it
 * hides („ukryte: N”). Only for the views of the window – the engine, the bar and the notifications never ask.
 */
export function useVisibleBlocks<T extends { categoryId: string }>(blocks: readonly T[]): { shown: T[]; hiddenCount: number } {
  const rd = useData((x) => x.rd)
  const hidden = useCalendarFilter((x) => x.hidden)
  return useMemo(() => filterBlocks(blocks, hidden, rd), [blocks, hidden, rd])
}
