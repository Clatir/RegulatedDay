/**
 * The short night as the check-in sees it (D571, N2): yesterday's logs and files read the way the window reads every day
 * (`useDayData` – IPC `dayData`, no channel of its own), yesterday counted by the engine's own functions for its bedtime
 * (`DayState.bedtime.effective`), and `shortNightOf` on its events – every computer's log of that day.
 */
import { useEffect, useMemo, useState } from 'react'
import type { DayData, RawRecord } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { dayContextOf, type PlanInputs } from '@shared/engine/context'
import { computeDay } from '@shared/engine/day'
import { shortNightOf, type ShortNight } from '@shared/engine/shortNight'
import type { AnyEvent } from '@shared/model/events'
import { dayFileFrom } from '@shared/model/plan'
import { addDays } from '@shared/time/zone'
import { useData } from '../../store/data'
import { dayUsable, useDayData } from '../../store/day'

/**
 * The short night of the day `date` (yesterday) from its data at `at`; null – no hint: the day not read yet or not usable (its
 * file unknown, its logs not read whole), nothing observed, no input long enough past its bedtime. Never an error (D571: a hint).
 */
export function nightOf(date: string, data: DayData | null, inputs: PlanInputs, at: number): ShortNight | null {
  if (!data || data.date !== date || !dayUsable(data)) return null
  try {
    const events = data.events as AnyEvent[]
    const src = { date, events, dayFile: data.dayFile ? dayFileFrom(data.dayFile, date) : null, nextFile: data.nextFile ? dayFileFrom(data.nextFile, addDays(date, 1)) : null }
    return shortNightOf(computeDay(dayContextOf(inputs, src, marketDay, at)), events)
  } catch {
    return null
  }
}

/** The last hint of a day from data that could be used (T2525): a read that cannot be used now (a log syncing) keeps it. */
const kept = new Map<string, ShortNight>()

/**
 * `nightOf`, kept over a read of the day that is not usable now; data that are usable decide (also „no hint”). Not read yet (null, a
 * return to the screen) – null: the hint of an earlier showing never comes back before a read says so.
 */
export function nightKept(date: string, data: DayData | null, inputs: PlanInputs, at: number): ShortNight | null {
  for (const d of kept.keys()) if (d !== date) kept.delete(d)
  if (!data || data.date !== date) return null
  if (!dayUsable(data)) return kept.get(date) ?? null
  const n = nightOf(date, data, inputs, at)
  if (n) kept.set(date, n)
  else kept.delete(date)
  return n
}

/**
 * What of a day's data the short night depends on (T2527): the same key – the same answer, so the day is not counted again at
 * each read every 30 s (`useDayData` gives a new object each time). An event's id stands for its content (a log line never
 * changes); the files whole. Made once per read.
 */
export function nightDataKey(data: DayData | null): string {
  if (!data) return ''
  const ids = data.events.map((e) => String((e as { id?: unknown }).id ?? '')).join(',')
  const file = (r: RawRecord | null) => (r ? JSON.stringify(r) : '')
  return [data.date, data.complete, data.unknown, data.away, ids, file(data.dayFile), file(data.nextFile)].join('|')
}

/**
 * The short night before the day `date` (`on` – while the check-in is still to come: yesterday is read only then, also during
 * „Strona B” and „Cele” before it, so the check-in shows with its hint at once).
 */
export function useShortNight(date: string, on = true): ShortNight | null {
  const yesterday = addDays(date, -1)
  // Only reads made for the check-in (`fresh`): the window may keep a read of yesterday from before the night (T2526).
  const data = useDayData(yesterday, on, true)
  const rd = useData((s) => s.rd)
  const templates = useData((s) => s.templates)
  const lectures = useData((s) => s.lectures)
  const series = useData((s) => s.seriesPlans)
  const routines = useData((s) => s.routines)
  const key = useMemo(() => nightDataKey(data), [data])
  // `data` by its key: a read with the same content counts nothing again.
  return useMemo(() => (on ? nightKept(yesterday, data, { changes: rd.settings, templates, lectures, series, routines }, Date.now()) : null), [on, yesterday, key, rd, templates, lectures, series, routines])
}

const sameNight = (a: ShortNight, b: ShortNight) => a.lastInput === b.lastInput && a.bedtime === b.bedtime

/**
 * The hint the check-in of `date` shows (T2526), kept by the morning plan – so folding its card and opening it again is no return to
 * the screen. Mounted with the question answered (`answered`) – none; while it is not answered a newer night replaces it (its hour
 * and bedtime follow the data), null never takes it away; once answered it changes no more.
 */
export function useCheckinHint(date: string, night: ShortNight | null, answered: boolean): ShortNight | null {
  const [hint, setHint] = useState<{ date: string; night: ShortNight } | null>(() => (!answered && night ? { date, night } : null))
  useEffect(() => {
    if (answered || !night || (hint?.date === date && sameNight(hint.night, night))) return
    setHint({ date, night })
  }, [date, night, answered, hint])
  return hint?.date === date ? hint.night : null
}
