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
import { isSaved, logEvents, saveRd, trySaveRd, useData } from '../../store/data'
import { countDay, dayTypeNow } from '../../store/day'
import { toast } from '../../store/ui'

export type FromMode = 'tomorrow' | 'today' | 'date'

export const useSettingsFrom = create<{ mode: FromMode; date: string | null }>(() => ({ mode: 'tomorrow', date: null }))

/** Back to „od jutra” – when you leave the settings and when the logical day changes (T513, A7-13). */
export function resetSettingsFrom(): void {
  useSettingsFrom.setState({ mode: 'tomorrow', date: null })
}

/** „Od daty” takes only a day after today; false: refused (said by the caller), the date stays as it was (A7-13). */
export function setFromDate(d: string, today: string): boolean {
  if (!(d > today)) return false
  useSettingsFrom.setState({ date: d })
  return true
}

/** The date (and instant for „od dziś”) a change made now applies from. */
export function changeFrom(today: string): { from: string; at: number | null } {
  const { mode, date } = useSettingsFrom.getState()
  if (mode === 'today') return { from: today, at: Date.now() }
  if (mode === 'date' && date && date > today) return { from: date, at: null }
  return { from: addDays(today, 1), at: null }
}

/**
 * A change of the dated shared settings: `patch` nested like RulesSettings (lists whole); true once saved. „Od dziś”
 * keeps today's type (its last snapshot's) in the day's new snapshot – read at the change itself, so the screen never
 * counts the day only to know it (A7-08); a day that cannot be read now saves nothing „od dziś” (never a guessed type,
 * A7-09).
 */
export async function saveSettings(patch: Record<string, unknown>): Promise<boolean> {
  const today = useData.getState().view?.today
  if (!today) return false
  return saveSettingsFrom(patch, changeFrom(today))
}

/** As `saveSettings`, from a date (and instant) chosen before – e.g. the „Cofnij” of a change made from that date. */
export async function saveSettingsFrom(patch: Record<string, unknown>, f: { from: string; at: number | null }): Promise<boolean> {
  const today = useData.getState().view?.today
  if (!today) return false
  const { from, at } = f
  let todayType: DayTypeId = 'zwykly'
  if (at != null) {
    const type = await todayTypeNow(today)
    if (!type) {
      toast('Nie da się teraz odczytać dzisiejszego dnia – zmiana „od dziś” nie została zapisana. Spróbuj za chwilę albo wybierz „od jutra”.', 'error', 8000)
      return false
    }
    todayType = type
  }
  return saveSettingsChange(patch, todayType, today, from, at)
}

/** Today's type now (its last snapshot's, or the day's own); null when the day cannot be read now. */
async function todayTypeNow(today: string): Promise<DayTypeId | null> {
  try {
    const data = await window.rd.dayData(today)
    if (data.unknown || !data.complete) return null
    const { rd, templates, lectures, view } = useData.getState()
    return dayTypeNow(countDay(today, data, { changes: rd.settings, templates, lectures }, Date.now(), rd.general.modules.energy, view?.calibration === true))
  } catch {
    return null
  }
}

/**
 * A change of the dated shared settings from `from` (with `at` – „od dziś”, from that instant): true once saved. „Od
 * dziś” also writes today's snapshot – only after the change itself was saved.
 */
export async function saveSettingsChange(patch: Record<string, unknown>, todayType: DayTypeId, today: string, from: string, at: number | null): Promise<boolean> {
  const made = Date.now()
  const out = await trySaveRd((raw) => {
    const list = Array.isArray(raw.settings) ? raw.settings : []
    return { ...raw, settings: [...list, { id: newId(), from, at, made, patch }] }
  })
  if (!isSaved(out)) return false
  // „Od dziś”: the rest of today counts by the new settings (the main process fills them in at the instant).
  return at == null || (await logEvents([{ k: 'day.snapshot', day: today, at, dayType: todayType, reason: 'today' }]))
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
  const out = await trySaveRd((raw) => {
    const g = raw.general && typeof raw.general === 'object' ? (raw.general as Record<string, unknown>) : {}
    const modules = g.modules && typeof g.modules === 'object' ? (g.modules as Record<string, unknown>) : {}
    return { ...raw, general: { ...g, modules: { ...modules, [m]: on } } }
  })
  // The day's log notes only a change that was saved (A7-12).
  if (today && isSaved(out)) await logEvents([m === 'energy' ? { k: 'energy.module', day: today, on, was } : { k: 'module.set', day: today, module: m, on, was }])
}
