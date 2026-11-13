/**
 * „Tydzień” and the month's goals in the main window (D356): the week of a date and a month's goals with their progress,
 * counted by the main process (its helper process) – read again when the data change and every 30 s (today's column
 * and the progress go on with the time); the last one read is shown meanwhile (no flash of an empty week).
 */
import { useEffect, useState } from 'react'
import type { GoalsView } from '@shared/engine/goals'
import type { MonthView } from '@shared/engine/calendarViews'
import type { DaysView, WeekView } from '@shared/engine/week'
import { weekStart } from '@shared/time/day'
import { useNow } from '../lib/clock'
import { useData } from './data'
import { cacheKey, ViewCache } from './viewCache'

const REREAD_MS = 30_000

/**
 * A view read from the main process for `key`, again on every change of the data and every 30 s; `failed` – the last read
 * failed. What was read last is kept in `cache` per data folder (`cacheKey`), the latest few only; a read that comes late
 * never overwrites a newer one (`ViewCache.keep`).
 */
function useCounted<T>(key: string, read: (key: string) => Promise<T>, cache: ViewCache<T>): { view: T | null; failed: boolean } {
  const stamp = useData((s) => s.stamp)
  const open = useData((s) => s.view?.status === 'open')
  const folder = useData((s) => s.view?.folder ?? null)
  const reread = useNow(REREAD_MS)
  const ck = cacheKey(folder, key)
  const [state, setState] = useState<{ key: string; view: T | null; failed: boolean }>(() => ({ key: ck, view: cache.get(ck), failed: false }))
  useEffect(() => {
    if (!open) return
    let alive = true
    const ticket = cache.begin()
    read(key).then(
      (v) => {
        cache.keep(ck, ticket, v)
        if (alive) setState({ key: ck, view: v, failed: false })
      },
      () => alive && setState((s) => ({ key: ck, view: s.key === ck ? s.view : cache.get(ck), failed: true }))
    )
    return () => {
      alive = false
    }
    // `read` is a stable function of the module.
  }, [ck, stamp, open, reread])
  const view = state.key === ck ? state.view : cache.get(ck)
  return { view, failed: state.key === ck && state.failed }
}

const weeks = new ViewCache<WeekView>()
const months = new ViewCache<GoalsView>()
const readWeek = (date: string) => window.rd.weekView(date)
const readGoals = (month: string) => window.rd.goals(month)

/** The week of `date` (any day of it – one read per week; null until read). */
export function useWeekView(date: string): { view: WeekView | null; failed: boolean } {
  return useCounted(weekStart(date), readWeek, weeks)
}

/** A month's goals ('RRRR-MM') with the month before's and the progress so far (null until read). */
export function useGoalsView(month: string): { view: GoalsView | null; failed: boolean } {
  return useCounted(month, readGoals, months)
}

const dayLists = new ViewCache<DaysView>()
const calendarMonths = new ViewCache<MonthView>()
/** The key of a list of days: its dates, and `-` for a list without the curves of energy. */
const readDays = (key: string) => {
  const [list, plain] = key.split('|')
  return window.rd.daysView(list!.split(','), { energy: plain !== '-' })
}
const readMonth = (month: string) => window.rd.monthView(month)

/**
 * Days on one axis (D417 „3 dni” – `threeDays`, D418 „Agenda” – `agendaDates`; null until read), as `useWeekView`; `energy`
 * false – without the curves of energy (the list of „Agenda” draws none, T954).
 */
export function useDaysView(dates: readonly string[], opts: { energy?: boolean } = {}): { view: DaysView | null; failed: boolean } {
  return useCounted(`${dates.join(',')}|${opts.energy === false ? '-' : '+'}`, readDays, dayLists)
}

/** The month of „Kalendarz” ('RRRR-MM', D418): its days' blocks (all of them, D429) and load (null until read), as `useWeekView`. */
export function useMonthView(month: string): { view: MonthView | null; failed: boolean } {
  return useCounted(month, readMonth, calendarMonths)
}
