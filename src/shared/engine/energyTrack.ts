/**
 * The energy's curve beside a day's axis (E2; „Dziś” – D293, the columns of „Tydzień” and „3 dni” – D417): the three pools
 * sampled every `ENERGY_SAMPLE_MIN` minutes of the day's series (the past from the log, from now on the forecast), and the
 * reserve. One sampling for every place that draws it.
 *
 * A day to come has no check-in (spec: without one the energy is „nieznana”), so its column's forecast starts from the
 * assumed check-in `ASSUMED_CHECKIN` at the day's first minute (T903) – marked `assumed`; today and a day gone by only
 * with their own check-in, as „Dziś” shows them.
 */
import type { AnyEvent, Answer } from '../model/events'
import type { Pool } from '../model/categories'
import type { DayContext, DayState } from './day'
import { computeEnergy, type EnergyState } from './energy'
import { atOf, type Grid } from './grid'
import type { HorizonWhen } from './week'
import { logicalMinuteOf } from '../time/day'

/** The step of the samples (minutes of the day). */
export const ENERGY_SAMPLE_MIN = 10

export interface EnergyTrack {
  /** Samples of the three pools (0–100) at logical minutes. */
  samples: Array<{ at: number; head: number; emotions: number; senses: number }>
  reserve: number
  /** Counted from the assumed check-in of a day to come (T903), not from one you gave. */
  assumed?: true
}

/** The curve of a counted day's energy: only when it is known (a check-in) and the module is on – as „Dziś” draws it. */
export function energyTrack(date: string, grid: Grid, e: EnergyState): EnergyTrack | null {
  if (!e.known || !e.enabled) return null
  const samples: EnergyTrack['samples'] = []
  for (let k = 0; k < Math.min(grid.length, e.series.head.length); k += ENERGY_SAMPLE_MIN) {
    const v = { head: e.series.head[k]!, emotions: e.series.emotions[k]!, senses: e.series.senses[k]! }
    if (Number.isFinite(v.head)) samples.push({ at: logicalMinuteOf(date, atOf(grid, k)), ...v })
  }
  return { samples, reserve: e.reserve }
}

/** The answers of the assumed check-in of a day to come (T903): „nie” to every question – each pool at 100. */
export const ASSUMED_CHECKIN: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0] }

/** The assumed check-in as an event of the day, at its first minute (energy only – the day's engine never reads it). */
function assumedCheckin(ctx: DayContext, grid: Grid): AnyEvent {
  const at = grid.start
  return { id: `assumed:${ctx.date}`, c: '', n: 0, t: at, l: at, v: 0, day: ctx.date, dom: 'energy', k: 'energy.checkin', at, answers: ASSUMED_CHECKIN } as AnyEvent
}

/**
 * The curve of a column (D417), counted by the same engine as „Dziś” (`computeEnergy` of the day as counted): a day gone by
 * from its log as its history, today live, a day to come from its plan with the assumed check-in. `moduleOn` – the module
 * as the settings have it (a day's own switches in its log win, as in `computeEnergy`). Null: unknown, or the module off.
 */
export function columnEnergy(ctx: DayContext, state: DayState, when: HorizonWhen, moduleOn: boolean): EnergyTrack | null {
  if (when !== 'future') return energyTrack(ctx.date, state.grid, computeEnergy(ctx, state, { moduleOn }))
  const track = energyTrack(ctx.date, state.grid, computeEnergy({ ...ctx, events: [...ctx.events, assumedCheckin(ctx, state.grid)] }, state, { moduleOn }))
  return track && { ...track, assumed: true }
}
