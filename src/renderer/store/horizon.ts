/**
 * „Tydzień” and the month's goals in the main window (D356): the week of a date and a month's goals with their progress,
 * counted by the main process (its helper process) – read again when the data change and every 30 s (today's column
 * and the progress go on with the time); the last one read is shown meanwhile (no flash of an empty week).
 */
import { useEffect, useState } from 'react'
import type { GoalsView } from '@shared/engine/goals'
import type { WeekView } from '@shared/engine/week'
import { weekStart } from '@shared/time/day'
import { useNow } from '../lib/clock'
import { useData } from './data'

const REREAD_MS = 30_000

/** A view read from the main process for `key`, again on every change of the data and every 30 s; `failed` – the last read failed. */
function useCounted<T>(key: string, read: (key: string) => Promise<T>, cache: Map<string, T>): { view: T | null; failed: boolean } {
  const stamp = useData((s) => s.stamp)
  const open = useData((s) => s.view?.status === 'open')
  const reread = useNow(REREAD_MS)
  const [state, setState] = useState<{ key: string; view: T | null; failed: boolean }>(() => ({ key, view: cache.get(key) ?? null, failed: false }))
  useEffect(() => {
    if (!open) return
    let alive = true
    read(key).then(
      (v) => {
        cache.set(key, v)
        if (alive) setState({ key, view: v, failed: false })
      },
      () => alive && setState((s) => ({ key, view: s.key === key ? s.view : (cache.get(key) ?? null), failed: true }))
    )
    return () => {
      alive = false
    }
    // `read` is a stable function of the module.
  }, [key, stamp, open, reread])
  const view = state.key === key ? state.view : (cache.get(key) ?? null)
  return { view, failed: state.key === key && state.failed }
}

const weeks = new Map<string, WeekView>()
const months = new Map<string, GoalsView>()
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
