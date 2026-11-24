/**
 * A day in the main window, counted by the engine's own functions (spec principle 10): its file and log from the main
 * process, the plan, the day's state (boundary, budget, hard end, pool) and its energy – recounted every minute and
 * whenever the data change. Days to come are counted the same way, from the snapshot this computer computes now.
 */
import { useEffect, useMemo, useState } from 'react'
import type { DayData, RawRecord } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { dayContextOf, snapshotOf, type PlanInputs } from '@shared/engine/context'
import { computeDay, type DayContext, type DayState } from '@shared/engine/day'
import { computeEnergy, type EnergyState } from '@shared/engine/energy'
import { foldFacts, type DayFacts } from '@shared/engine/facts'
import { gridOf } from '@shared/engine/grid'
import type { AnyEvent, DaySnapshot } from '@shared/model/events'
import { dayFileFrom, type DayFile } from '@shared/model/plan'
import type { DayTypeId } from '@shared/model/settings'
import { addDays } from '@shared/time/zone'
import { useNow } from '../lib/clock'
import { useData } from './data'

const cache = new Map<string, DayData>()

/**
 * Days other than today's three are not in the signature of the data (the main process does not watch every day): they
 * are read again this often too, so a change made on another computer reaches an open day by itself.
 */
const REREAD_MS = 30_000

/**
 * A day a change may be judged on: read whole now, or as last read with the data folder away (E8b.1 – the change waits
 * for the folder); never a day whose file is unknown.
 */
export const dayUsable = (d: Pick<DayData, 'complete' | 'unknown' | 'away'>): boolean => !d.unknown && (d.complete || d.away)

/**
 * The day's data, read again when the data change (the last one read is shown meanwhile – no flash of an empty day). `on` false –
 * nothing is read (what was read before is still given). `fresh` – only what this very hook read while `on` (null till then and
 * while `on` is false): never the window's memory of an earlier read, which may be hours old (the short night, T2526).
 */
export function useDayData(date: string, on = true, fresh = false): DayData | null {
  const stamp = useData((s) => s.stamp)
  const open = useData((s) => s.view?.status === 'open')
  const reread = useNow(REREAD_MS)
  const [data, setData] = useState<DayData | null>(() => (fresh ? null : (cache.get(date) ?? null)))
  useEffect(() => {
    setData(fresh ? null : (cache.get(date) ?? null))
  }, [date, fresh])
  useEffect(() => {
    if (fresh && !on) setData(null)
    if (!open || !on) return
    let alive = true
    window.rd
      .dayData(date)
      .then((d) => {
        cache.set(date, d)
        if (alive) setData(d)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [date, stamp, open, reread, on])
  return data
}

/**
 * The raw files of several days (the morning plan looks at yesterday and the week ahead); null until read. Only the
 * files – one read, no logs (A6-22); a day whose file cannot be read now is left out (unknown, never „no changes”).
 * `fresh`: the files of these very dates only – while the dates changed and the new read has not come, null (not the old
 * read of other dates).
 */
export function useDayFiles(dates: readonly string[], fresh = false): Record<string, RawRecord | null> | null {
  const stamp = useData((s) => s.stamp)
  const reread = useNow(REREAD_MS)
  const key = dates.join(',')
  const [read, setRead] = useState<{ key: string; files: Record<string, RawRecord | null> } | null>(null)
  useEffect(() => {
    let alive = true
    void window.rd.dayFiles([...dates]).then(
      (f) => alive && setRead({ key, files: f }),
      () => undefined
    )
    return () => {
      alive = false
    }
    // The dates by their key: a new array of the same dates reads nothing again.
  }, [key, stamp, reread])
  return filesFor(read, key, fresh)
}

/** The files read for `key` – with `fresh` only the read of that key (a read of other dates is not it); null – none yet. */
export function filesFor(read: { key: string; files: Record<string, RawRecord | null> } | null, key: string, fresh: boolean): Record<string, RawRecord | null> | null {
  return read && (!fresh || read.key === key) ? read.files : null
}

export interface DayModel {
  date: string
  data: DayData
  dayFile: DayFile | null
  snapshot: DaySnapshot
  /** The snapshot is the day's own (the leader made the day); otherwise computed now from the files. */
  fromLog: boolean
  ctx: DayContext
  state: DayState
  energy: EnergyState
  events: AnyEvent[]
}

/** The day's type now: its last snapshot's (a change of type during the day), or the day's own; a change „od dziś” keeps it. */
export function dayTypeNow(model: DayModel | null): DayTypeId {
  return (model?.state.facts.snapshots.at(-1)?.dayType ?? model?.snapshot.dayType ?? 'zwykly') as DayTypeId
}

/** The day counted now (null until its data are read). */
export function useDay(date: string): DayModel | null {
  const data = useDayData(date)
  const rd = useData((s) => s.rd)
  const templates = useData((s) => s.templates)
  const lectures = useData((s) => s.lectures)
  const series = useData((s) => s.seriesPlans)
  const routines = useData((s) => s.routines)
  const calibration = useData((s) => s.view?.calibration === true)
  const tick = useNow(30_000)
  return useMemo(() => {
    if (!data || data.date !== date) return null
    // The day at this very instant (read when the data change or the clock ticks): an action written a moment ago – an
    // approval at 12:34:45 counts from the minute it rounds to – is in the day at once.
    void tick
    return countDay(date, data, { changes: rd.settings, templates, lectures, series, routines }, Date.now(), rd.general.modules.energy, calibration)
  }, [data, date, rd, templates, lectures, series, routines, tick, calibration])
}

/**
 * A day read (its files and logs) and counted now, as `useDay` has it – for what is not on the screen as a day (the energy on trial of a column of
 * „Tydzień” – N19): one read and one count, only when asked. Null – its data cannot be read now.
 */
export async function readDay(date: string, at = Date.now()): Promise<DayModel | null> {
  try {
    const data = await window.rd.dayData(date)
    if (!dayUsable(data)) return null
    const { rd, templates, lectures, seriesPlans, routines, view } = useData.getState()
    return countDay(date, data, { changes: rd.settings, templates, lectures, series: seriesPlans, routines }, at, rd.general.modules.energy, view?.calibration === true)
  } catch {
    return null
  }
}

/**
 * The day from its data and the plan's inputs at `at` (also for previews: the wizard counts a day it has not written);
 * `calibration` – the calibration period (reactions of energy only inform).
 */
export function countDay(date: string, data: DayData, inputs: PlanInputs, at: number, energyOn = true, calibration = false): DayModel {
  const events = data.events as AnyEvent[]
  const dayFile = data.dayFile ? dayFileFrom(data.dayFile, date) : null
  const nextFile = data.nextFile ? dayFileFrom(data.nextFile, addDays(date, 1)) : null
  const src = { date, events, dayFile, nextFile }
  const { snapshot, fromLog } = snapshotOf(inputs, src, marketDay, at)
  const ctx = dayContextOf(inputs, src, marketDay, at)
  const state = computeDay(ctx)
  const energy = computeEnergy(ctx, state, { moduleOn: energyOn, calibration })
  return { date, data, dayFile, snapshot, fromLog, ctx, state, energy, events }
}

/** A day read for an edit made in its turn without counting it (`plannedDay`): its plan, the facts of its log and its file. */
export interface PlannedDay {
  ctx: DayContext
  facts: DayFacts
  /** The day's file as the edit is made on it (with your queued edits, as `dayFiles` gives it). */
  file: RawRecord | null
}

/**
 * A day's plan and the facts of its log now – one read (`dayData`: its logs and its file), one snapshot – without counting the day (D501:
 * an action that has to know in its turn whether a block is in the plan, has begun or ended). `'file'` – its file cannot be read now,
 * `'log'` – its logs are not read whole (or the bridge failed).
 */
export async function plannedDay(date: string, at = Date.now()): Promise<PlannedDay | 'file' | 'log'> {
  try {
    const data = await window.rd.dayData(date)
    if (data.unknown) return 'file'
    if (!dayUsable(data)) return 'log'
    const { rd, templates, lectures, seriesPlans, routines } = useData.getState()
    const events = data.events as AnyEvent[]
    const src = { date, events, dayFile: data.dayFile ? dayFileFrom(data.dayFile, date) : null, nextFile: data.nextFile ? dayFileFrom(data.nextFile, addDays(date, 1)) : null }
    const ctx = dayContextOf({ changes: rd.settings, templates, lectures, series: seriesPlans, routines }, src, marketDay, at)
    return { ctx, facts: foldFacts(gridOf(date), events), file: data.dayFile }
  } catch {
    return 'log'
  }
}

/**
 * A day as the engine has it now, counted on `base` – its file as the edit is made on it (its logs from `dayData`; the energy
 * not counted) – for an edit made in its turn („Dodaj” and a drag of „Tydzień”, „Przenieś na…”). Null: the day cannot be
 * counted now (its logs not read whole, the bridge fails).
 */
export async function countedDay(date: string, base: RawRecord | null, at = Date.now()): Promise<DayModel | null> {
  try {
    const data = await window.rd.dayData(date)
    if (!dayUsable(data)) return null
    const { rd, templates, lectures, seriesPlans, routines } = useData.getState()
    return countDay(date, { ...data, dayFile: base }, { changes: rd.settings, templates, lectures, series: seriesPlans, routines }, at, false)
  } catch {
    return null
  }
}
