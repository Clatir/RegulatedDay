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

/** The day's data, read again when the data change (the last one read is shown meanwhile – no flash of an empty day). */
export function useDayData(date: string): DayData | null {
  const stamp = useData((s) => s.stamp)
  const open = useData((s) => s.view?.status === 'open')
  const reread = useNow(REREAD_MS)
  const [data, setData] = useState<DayData | null>(() => cache.get(date) ?? null)
  useEffect(() => {
    setData(cache.get(date) ?? null)
  }, [date])
  useEffect(() => {
    if (!open) return
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
  }, [date, stamp, open, reread])
  return data
}

/**
 * The raw files of several days (the morning plan looks at yesterday and the week ahead); null until read. Only the
 * files – one read, no logs (A6-22); a day whose file cannot be read now is left out (unknown, never „no changes”).
 */
export function useDayFiles(dates: readonly string[]): Record<string, RawRecord | null> | null {
  const stamp = useData((s) => s.stamp)
  const reread = useNow(REREAD_MS)
  const key = dates.join(',')
  const [files, setFiles] = useState<Record<string, RawRecord | null> | null>(null)
  useEffect(() => {
    let alive = true
    void window.rd.dayFiles([...dates]).then(
      (f) => alive && setFiles(f),
      () => undefined
    )
    return () => {
      alive = false
    }
    // The dates by their key: a new array of the same dates reads nothing again.
  }, [key, stamp, reread])
  return files
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
  const calibration = useData((s) => s.view?.calibration === true)
  const tick = useNow(30_000)
  return useMemo(() => {
    if (!data || data.date !== date) return null
    // The day at this very instant (read when the data change or the clock ticks): an action written a moment ago – an
    // approval at 12:34:45 counts from the minute it rounds to – is in the day at once.
    void tick
    return countDay(date, data, { changes: rd.settings, templates, lectures }, Date.now(), rd.general.modules.energy, calibration)
  }, [data, date, rd, templates, lectures, tick, calibration])
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
