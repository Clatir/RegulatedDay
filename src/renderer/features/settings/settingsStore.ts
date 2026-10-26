/**
 * Saving the shared settings (spec „Każda zmiana ustawienia czytanego przez silnik albo grę działa domyślnie od jutra.
 * „Od dziś” dopisuje do dnia nową migawkę z chwilą zmiany”): a change of rd.json „settings” from the date chosen on the
 * settings screen; „od dziś” also writes the day's snapshot (the engine counts the rest of today by it). The modules and
 * the other shared settings without a date work at once; a module's change is noted in today's log (its rewards of that
 * day count neither way).
 */
import { create } from 'zustand'
import { newId } from '@shared/model/ids'
import { DEFAULT_GENERAL, type ModuleId } from '@shared/model/rd'
import type { DayTypeId } from '@shared/model/settings'
import { addDays } from '@shared/time/zone'
import { logEvents, saveRd, useData } from '../../store/data'

export type FromMode = 'tomorrow' | 'today' | 'date'

export const useSettingsFrom = create<{ mode: FromMode; date: string | null }>(() => ({ mode: 'tomorrow', date: null }))

/** The date (and instant for „od dziś”) a change made now applies from. */
export function changeFrom(today: string): { from: string; at: number | null } {
  const { mode, date } = useSettingsFrom.getState()
  if (mode === 'today') return { from: today, at: Date.now() }
  if (mode === 'date' && date && date > today) return { from: date, at: null }
  return { from: addDays(today, 1), at: null }
}

/**
 * A change of the dated shared settings: `patch` nested like RulesSettings (lists whole). `todayType` – today's type as
 * its last snapshot says: a change „od dziś” keeps it in the day's new snapshot.
 */
export async function saveSettings(patch: Record<string, unknown>, todayType: DayTypeId): Promise<void> {
  const today = useData.getState().view?.today
  if (!today) return
  const { from, at } = changeFrom(today)
  const made = Date.now()
  await saveRd((raw) => {
    const list = Array.isArray(raw.settings) ? raw.settings : []
    return { ...raw, settings: [...list, { id: newId(), from, at, made, patch }] }
  })
  // „Od dziś”: the rest of today counts by the new settings (the main process fills them in at the instant).
  if (at != null) await logEvents([{ k: 'day.snapshot', day: today, at, dayType: todayType, reason: 'today' }])
}

/** A shared setting without a date (it works at once). */
export async function saveGeneral(patch: Record<string, unknown>): Promise<void> {
  await saveRd((raw) => {
    const g = raw.general && typeof raw.general === 'object' ? (raw.general as Record<string, unknown>) : {}
    return { ...raw, general: { ...g, ...patch } }
  })
}

/** A module on or off: at once, noted in today's log (energy by its own event, which the energy engine reads). */
export async function setModule(m: ModuleId, on: boolean): Promise<void> {
  const state = useData.getState()
  const today = state.view?.today
  const was = state.rd.general.modules[m] ?? DEFAULT_GENERAL.modules[m]
  if (was === on) return
  await saveRd((raw) => {
    const g = raw.general && typeof raw.general === 'object' ? (raw.general as Record<string, unknown>) : {}
    const modules = g.modules && typeof g.modules === 'object' ? (g.modules as Record<string, unknown>) : {}
    return { ...raw, general: { ...g, modules: { ...modules, [m]: on } } }
  })
  if (today) await logEvents([m === 'energy' ? { k: 'energy.module', day: today, on, was } : { k: 'module.set', day: today, module: m, on, was }])
}
