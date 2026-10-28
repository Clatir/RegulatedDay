/**
 * The wizard's draft (spec „Szkice”: an unsaved form survives going to another screen): every answer kept here until
 * „Zakończ”, which writes it all at once – the shared data only on the first computer (spec „Dane wspólne zapisują się
 * dopiero przy „Zakończ”), this computer's settings on every one.
 */
import { create } from 'zustand'
import type { FolderProbe } from '@shared/api'
import { defaultTemplates, firstComputerRecords, settingsPatch, SETUP_CHANGE_ID, SETUP_FROM } from '@shared/model/defaults'
import { newId } from '@shared/model/ids'
import type { LectureSeries } from '@shared/model/plan'
import { DEFAULT_GENERAL, rdFrom, type GeneralSettings, type Person } from '@shared/model/rd'
import { DEFAULT_SETTINGS, deepMerge, settingsFrom, type DayTypeId, type RulesSettings } from '@shared/model/settings'

export type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'

export interface WizardDraft {
  open: boolean
  /** You opened it yourself (a folder that did not open shows the wizard only then). */
  asked: boolean
  step: number
  folder: string
  probe: FolderProbe | null
  /** „To pierwszy komputer” confirmed for an empty folder (or one without this app's data). */
  firstConfirmed: boolean
  settings: RulesSettings
  general: GeneralSettings
  people: Person[]
  secondShift: { on: boolean; startMin: number; durationMin: number }
  lectures: LectureSeries[]
  days: Record<string, DayTypeId>
  machine: { desktopBar: boolean; corner: Corner; stationaryClasses: boolean; autostart: boolean; pin: boolean }
  busy: boolean
  error: string | null
}

const initial = (): Omit<WizardDraft, 'open'> => ({
  asked: false,
  step: 0,
  folder: '',
  probe: null,
  firstConfirmed: false,
  settings: DEFAULT_SETTINGS,
  general: DEFAULT_GENERAL,
  people: [],
  secondShift: { on: true, startMin: 20 * 60, durationMin: 60 },
  lectures: [],
  days: {},
  machine: { desktopBar: true, corner: 'bottom-left', stationaryClasses: false, autostart: true, pin: true },
  busy: false,
  error: null
})

export const useWizard = create<WizardDraft>(() => ({ open: true, ...initial() }))

export function patchWizard(p: Partial<WizardDraft>): void {
  useWizard.setState(p)
}

/**
 * After „Zakończ” failed (A7-11): the button free again with the reason, and the folder looked at again – data there now
 * (written by this very try before the folder failed to open, or meanwhile by another computer) turn the wizard into the
 * next computer's, on its summary (`joinStep`), saying so: one more „Zakończ” joins them.
 */
export function failedFinish(w: Pick<WizardDraft, 'probe'>, error: string, probe: FolderProbe | null, joinStep: number): Partial<WizardDraft> {
  const joinNow = !w.probe?.hasData && !!probe?.hasData
  // Only towards joining: a joining computer's folder without rd.json for a moment (OneDrive) never makes it the first –
  // a second data set would be written into the folder.
  return {
    busy: false,
    probe: joinNow ? probe : w.probe,
    error: joinNow ? `${error} W folderze są już dane – ten komputer do nich dołączy: kliknij „Zakończ” jeszcze raz.` : error,
    ...(joinNow ? { step: joinStep } : {})
  }
}

/** A folder's probe – taken only while that folder is still the one chosen (a late answer for another never wins). */
export function takeProbe(dir: string, probe: FolderProbe): void {
  if (useWizard.getState().folder === dir) patchWizard({ probe, error: null })
}

/** A change of the draft's settings (checked like the schema: a wrong value keeps the one before). */
export function patchSettings(patch: Record<string, unknown>): void {
  const s = useWizard.getState().settings
  useWizard.setState({ settings: settingsFrom(deepMerge<unknown>(s, patch), s) })
}

export function resetWizard(): void {
  useWizard.setState({ open: true, ...initial() })
}

/** The draft's setting change as rd.json will hold it (for the preview of a day). */
export function draftChanges(d: Pick<WizardDraft, 'settings'>) {
  return [{ id: SETUP_CHANGE_ID, from: SETUP_FROM, at: null, made: 0, patch: settingsPatch(DEFAULT_SETTINGS, d.settings) }]
}

export function draftTemplates(d: Pick<WizardDraft, 'secondShift'>) {
  return defaultTemplates(d.secondShift)
}

export function newLecture(today: string): LectureSeries {
  return { id: newId(), name: '', categoryId: 'wyklad', variantId: null, weekday: 1, startMin: 18 * 60, durationMin: 90, from: today, to: today, exceptions: [], recorder: null, background: null, archived: false }
}

/** A lecture still as „+ Wykład” made it: no name, and the day, time, length and dates of a new one. */
export function untouchedLecture(l: LectureSeries): boolean {
  const fresh = newLecture(l.from)
  return !l.name.trim() && l.weekday === fresh.weekday && l.startMin === fresh.startMin && l.durationMin === fresh.durationMin && l.to === l.from && l.categoryId === fresh.categoryId
}

/** The records the first computer writes at „Zakończ”. */
export function finishRecords(d: WizardDraft, at: number, computer: string) {
  return firstComputerRecords(
    {
      settings: d.settings,
      general: d.general,
      categories: rdFrom(undefined).categories,
      people: d.people.filter((p) => p.name.trim()),
      templates: draftTemplates(d),
      // A lecture added and left as it came (no name, nothing set) is not written – its category is always set (A7-19);
      // one without a name but with its day, time or dates set is kept (the name is optional).
      lectures: d.lectures.filter((l) => !untouchedLecture(l)),
      days: d.days
    },
    at,
    computer
  )
}
