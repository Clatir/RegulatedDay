/**
 * The menu of the right button on the days of the calendar (D528): „Typ dnia” (a submenu with a ✓ for the type all the selected days have,
 * „—” for some, and „Typ z tygodnia”), „Pobudka” (a field with its Enter) and „Pobudka z typu”. An item no selected day fits is disabled with
 * the reason in its tooltip; while a save runs every one is („Zapisuję…” – an action asked then would be lost). Pure: the page gives what each
 * day is (`DayState`) and the actions.
 */
import { RANGES, DAY_TYPES, DAY_TYPE_NAMES, type DayTypeId } from '@shared/model/settings'
import { parseField } from '@shared/model/fields'
import { triState } from '@shared/selection'
import type { Template } from '@shared/model/plan'
import type { MenuEntry } from '../../components/ContextMenu'
import { applyTemplateEntry } from '../templates/applyMenu'

/** What the menu needs of a day: the type it has (its own, else its weekday's), whether it is its own, its own wake (null – the type's). */
export interface MenuDay {
  type: DayTypeId
  own: boolean
  wake: number | null
}

export interface DayMenuActions {
  setType: (type: DayTypeId | null, dates: readonly string[]) => void
  setWake: (wakeMin: number | null, dates: readonly string[]) => void
  /** UX19 (P28): the template applied to the days (the screen runs the flow of „Zastosuj do…”). */
  applyTemplate: (template: Template, dates: readonly string[]) => void
}

export const BUSY_WHY = 'Zapisuję…'
export const TYPE_WHY = 'Typ zmienisz tylko dniom od jutra – dzisiejszy zmieniasz w „Dziś”, minione mają typ z planu z rana'
export const WAKE_WHY = 'Pobudkę zmienisz tylko dniom od dziś'

const check = (values: boolean[]): 'all' | 'some' | undefined => {
  const s = triState(values)
  return s === 'none' ? undefined : s
}

export function dayMenu(ids: readonly string[], days: ReadonlyMap<string, MenuDay>, today: string, busy: boolean, act: DayMenuActions, templates: readonly Template[] = []): MenuEntry[] {
  const of = (d: string): MenuDay => days.get(d) ?? { type: 'zwykly', own: false, wake: null }
  const typeWhy = busy ? BUSY_WHY : ids.some((d) => d > today) ? undefined : TYPE_WHY
  const wakeWhy = busy ? BUSY_WHY : ids.some((d) => d >= today) ? undefined : WAKE_WHY
  return [
    {
      label: 'Typ dnia',
      disabled: typeWhy,
      testId: 'calendar-menu-type',
      submenu: [
        ...DAY_TYPES.map((t): MenuEntry => ({ label: DAY_TYPE_NAMES[t], check: check(ids.map((d) => of(d).type === t)), onPick: () => act.setType(t, ids), testId: `calendar-menu-type-${t}` })),
        { kind: 'separator' },
        { label: 'Typ z tygodnia', check: check(ids.map((d) => !of(d).own)), onPick: () => act.setType(null, ids), testId: 'calendar-menu-type-default' }
      ]
    },
    { kind: 'separator' },
    {
      kind: 'field',
      label: 'Pobudka',
      placeholder: 'np. 7:30',
      disabled: wakeWhy,
      testId: 'calendar-menu-wake',
      onSubmit: (text) => {
        const r = parseField({ kind: 'time', range: RANGES.wakeMin, offAllowed: false }, text)
        if (!r.ok) return r.message
        act.setWake(r.value, ids)
      }
    },
    { label: 'Pobudka z typu', check: check(ids.map((d) => of(d).wake == null)), disabled: wakeWhy, onPick: () => act.setWake(null, ids), testId: 'calendar-menu-wake-default' },
    { kind: 'separator' },
    applyTemplateEntry(templates, busy, (t) => act.applyTemplate(t, ids), 'calendar-menu-apply')
  ]
}
