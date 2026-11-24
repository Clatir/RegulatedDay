/**
 * The layout of the settings page without a DOM (UX14, E1, E2, D565 P22): the groups of the table of contents on the left and
 * the sections in each, in the order the page draws them; which sections work at once („od razu”), which from a date, and where
 * the „od jutra / od dziś / od daty” bar stands (over the run of sections from the first dated one to the last, nowhere else).
 * The search of the settings and Ctrl K take the titles and the ids from here.
 */
import { FIELD_GROUP_NAMES, NUMBER_FIELDS, TOGGLE_FIELDS, type FieldGroup } from '@shared/model/fields'

/**
 * How a section's changes apply: `dated` – from the chosen date (the bar), `now` – at once, without a date, `mixed` – some from
 * the date and some at once (said in the section), `review` – from the day of its own review (the calibration), `none` – the
 * section changes no setting (the data, the information).
 */
export type SettingsWhen = 'dated' | 'now' | 'mixed' | 'review' | 'none'

export interface SettingsSectionInfo {
  /** The test id of the section's box – the same as in Ctrl K and in the table of contents. */
  id: string
  title: string
  when: SettingsWhen
  /** Only with the data folder open (the rest is there without it – this computer's own, the data folder, the updates). */
  needsData?: boolean
}

export interface SettingsGroupInfo {
  id: string
  title: string
  sections: SettingsSectionInfo[]
}

/** A group of number and switch fields: with a date, at once, or both (the fields of a group are all of one kind now). */
export function fieldGroupWhen(group: FieldGroup): 'dated' | 'now' | 'mixed' {
  const dated = [...NUMBER_FIELDS.filter((f) => f.group === group).map((f) => f.scope === 'dated'), ...TOGGLE_FIELDS.filter((f) => f.group === group).map((f) => f.scope !== 'general')]
  if (dated.every(Boolean)) return 'dated'
  return dated.some(Boolean) ? 'mixed' : 'now'
}

const fieldSection = (group: FieldGroup): SettingsSectionInfo => ({ id: `settings-${group}`, title: FIELD_GROUP_NAMES[group], when: fieldGroupWhen(group), needsData: true })

export const SETTINGS_GROUPS: readonly SettingsGroupInfo[] = [
  {
    id: 'day',
    title: 'Dzień i energia',
    sections: [
      { id: 'settings-modules', title: 'Moduły', when: 'now', needsData: true },
      { id: 'settings-daytypes', title: 'Typy dni', when: 'dated', needsData: true },
      fieldSection('sleep'),
      fieldSection('boundary'),
      fieldSection('plan'),
      fieldSection('energy'),
      fieldSection('accuracy'),
      fieldSection('timer'),
      fieldSection('reminders'),
      fieldSection('care'),
      { id: 'settings-calibration', title: 'Kalibracja', when: 'review', needsData: true }
    ]
  },
  {
    id: 'categories',
    title: 'Kategorie i kalendarze',
    sections: [
      { id: 'settings-categories', title: 'Kategorie', when: 'mixed', needsData: true },
      { id: 'settings-calendars', title: 'Kalendarze', when: 'now', needsData: true },
      { id: 'settings-lectures', title: 'Plan wykładów', when: 'none', needsData: true }
    ]
  },
  { id: 'cases', title: 'Sprawy i szablony', sections: [fieldSection('cases')] },
  {
    id: 'bar',
    title: 'Pasek i powiadomienia',
    sections: [
      { id: 'settings-bar', title: 'Pasek pulpitu', when: 'now' },
      { id: 'settings-notices', title: 'Powiadomienia i dźwięk', when: 'now' },
      { id: 'settings-machine', title: 'Ten komputer', when: 'now' }
    ]
  },
  {
    id: 'data',
    title: 'Dane i kopie',
    sections: [
      { id: 'settings-data', title: 'Dane', when: 'none' },
      { id: 'settings-computers', title: 'Komputery', when: 'none', needsData: true }
    ]
  },
  {
    id: 'about',
    title: 'O aplikacji',
    sections: [
      { id: 'settings-updates', title: 'Aktualizacje', when: 'none' },
      { id: 'settings-info', title: 'Informacje', when: 'none' }
    ]
  }
]

export const SETTINGS_SECTIONS: readonly SettingsSectionInfo[] = SETTINGS_GROUPS.flatMap((g) => g.sections)

export const sectionOf = (id: string): SettingsSectionInfo | undefined => SETTINGS_SECTIONS.find((s) => s.id === id)

/** What the page draws, in order: the heading of a group, then its sections (a group with none shown has no heading). */
export type SettingsItem = { type: 'group'; group: SettingsGroupInfo } | { type: 'section'; section: SettingsSectionInfo; group: SettingsGroupInfo }

export function settingsItems(dataOpen: boolean): SettingsItem[] {
  return SETTINGS_GROUPS.flatMap((group): SettingsItem[] => {
    const shown = group.sections.filter((s) => dataOpen || !s.needsData)
    return shown.length ? [{ type: 'group', group }, ...shown.map((section): SettingsItem => ({ type: 'section', section, group }))] : []
  })
}

const isDated = (i: SettingsItem): boolean => i.type === 'section' && (i.section.when === 'dated' || i.section.when === 'mixed')

/** The first and the last index of the items whose changes have a date – the run the „od jutra” bar covers; null: no such section. */
export function datedRange(items: readonly SettingsItem[]): [number, number] | null {
  const first = items.findIndex(isDated)
  if (first < 0) return null
  let last = first
  items.forEach((i, at) => {
    if (isDated(i)) last = at
  })
  return [first, last]
}
