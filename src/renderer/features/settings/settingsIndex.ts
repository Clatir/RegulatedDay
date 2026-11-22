/**
 * The fields of the settings by their labels (UX14): what the box „Szukaj w ustawieniach” and Ctrl K find, and where Enter
 * leads – to the field itself (its row's test id, `field-…`), scrolled to the middle and marked for a moment. The fields drawn
 * from `NUMBER_FIELDS` and `TOGGLE_FIELDS` come from there (one label, one place); the rest of the page is listed here. The
 * test of the page (`tests/web/settings-page.test.ts`) checks that every id here is on the page.
 */
import { DAY_TYPE_FIELDS, NUMBER_FIELDS, TOGGLE_FIELDS } from '@shared/model/fields'
import { MODULES, MODULE_NAMES } from '@shared/model/rd'
import type { SearchRecord } from '@shared/search'
import { SETTINGS_SECTIONS, sectionOf } from './settingsLayout'

export interface SettingField {
  /** The test id of the field's row. */
  id: string
  title: string
  /** The section it lies in (the test id of its box). */
  section: string
  /** Words only searched. */
  keys?: string
  /** Only with the data folder open, though its section is there without it (the CSV export, the list of backups). */
  needsData?: boolean
}

/** Words only searched, of the sections (their titles are searched anyway). */
export const SECTION_KEYS: Readonly<Record<string, string>> = {
  'settings-plan': 'równolegle bloki naraz',
  'settings-calendars': 'kalendarz wydarzenia ukryj pokaż',
  'settings-cases': 'termin terminy plan poranny ostrzegaj',
  'settings-data': 'folder kopie zapasowe',
  'settings-bar': 'widget pulpit',
  'settings-notices': 'dźwięk',
  'settings-machine': 'autostart skala jasność animacje nagrania',
  'settings-info': 'wersja'
}

/** What the page has besides the generated fields: the day types' table, the modules, this computer's, the data, the updates. */
const LISTED: readonly SettingField[] = [
  ...DAY_TYPE_FIELDS.map((f): SettingField => ({ id: `field-daytype-${f.key}`, title: f.label, section: 'settings-daytypes', keys: 'typ dnia' })),
  { id: 'field-week', title: 'Typy dni tygodnia', section: 'settings-daytypes', keys: 'tydzień poniedziałek wtorek środa czwartek piątek sobota niedziela' },
  ...MODULES.map((m): SettingField => ({ id: `field-module-${m}`, title: MODULE_NAMES[m], section: 'settings-modules', keys: 'moduł' })),
  { id: 'field-cost-scale', title: 'Przelicz koszty ×N', section: 'settings-categories', keys: 'mnożnik skala pomnóż koszt kosztów' },
  { id: 'field-bar', title: 'Pasek pulpitu', section: 'settings-bar', keys: 'widget włącz wyłącz' },
  { id: 'field-bar-back', title: 'Pasek wraca z oknem głównym', section: 'settings-bar', keys: 'schowany ×' },
  { id: 'field-bar-place', title: 'Miejsce paska', section: 'settings-bar', keys: 'monitor róg położenie' },
  { id: 'field-on-top', title: 'Zawsze na wierzchu', section: 'settings-bar', keys: 'nad oknami panel' },
  { id: 'field-modes', title: 'Tryb sesji i tryb zajęć', section: 'settings-bar', keys: 'zwarty przygaszony' },
  { id: 'field-bar-pulse', title: 'Pulsowanie paska', section: 'settings-bar', keys: 'animacja koniec bloku' },
  { id: 'field-notices', title: 'Powiadomienia Windows', section: 'settings-notices', keys: 'rezerwa energia sesja zajęcia dojazd twardy koniec projektów przypomnienia plan poranny rytuał' },
  { id: 'field-sound', title: 'Dźwięk', section: 'settings-notices', keys: 'głośność' },
  { id: 'field-autostart', title: 'Uruchamiaj z Windows', section: 'settings-machine', keys: 'autostart' },
  { id: 'field-quick-key', title: 'Skrót szybkiego zapisu', section: 'settings-machine', keys: 'skrzynka klawisz' },
  { id: 'field-hide-capture', title: 'Na nagraniach ekranu', section: 'settings-machine', keys: 'ukryte udostępnianie' },
  { id: 'field-zoom', title: 'Skala interfejsu', section: 'settings-machine', keys: 'rozmiar powiększenie' },
  { id: 'field-brightness', title: 'Jasność', section: 'settings-machine', keys: 'przyciemnienie' },
  { id: 'field-animations', title: 'Animacje', section: 'settings-machine' },
  { id: 'field-stationary', title: 'Zajęcia stacjonarne', section: 'settings-machine', keys: 'komputer na zajęciach' },
  { id: 'field-data-folder', title: 'Folder danych', section: 'settings-data', keys: 'OneDrive przypnij kreator' },
  { id: 'field-csv', title: 'Eksport CSV', section: 'settings-data', needsData: true },
  { id: 'field-backups', title: 'Kopie zapasowe', section: 'settings-data', keys: 'przywróć kopia', needsData: true },
  { id: 'field-backup-extra', title: 'Dodatkowe miejsce kopii', section: 'settings-data', keys: 'kopia kopie zapasowa folder' },
  { id: 'field-night-install', title: 'Instalacja w nocy', section: 'settings-updates', keys: 'aktualizacja' },
  { id: 'field-version', title: 'Wersja', section: 'settings-info', keys: 'numer aplikacji instalacja' },
  { id: 'field-helper', title: 'Pomocnik', section: 'settings-info' },
  { id: 'field-app-folder', title: 'Folder programu', section: 'settings-info', keys: 'konfiguracja logi' },
  { id: 'field-logs', title: 'Logi', section: 'settings-info', keys: 'dziennik błędy' }
]

export const SETTING_FIELDS: readonly SettingField[] = [
  ...LISTED,
  ...NUMBER_FIELDS.filter((f) => f.group !== 'dayTypes').map((f): SettingField => ({ id: `field-${f.key}`, title: f.label, section: `settings-${f.group}` })),
  ...TOGGLE_FIELDS.map((f): SettingField => ({ id: `field-${f.key}`, title: f.label, section: `settings-${f.group}` }))
]

/** A section or a field the page has only with the data folder open (a pick of it without the folder says so); an unknown id – false. */
export function needsDataFolder(id: string): boolean {
  const field = SETTING_FIELDS.find((f) => f.id === id)
  if (field) return field.needsData === true || sectionOf(field.section)?.needsData === true
  return sectionOf(id)?.needsData === true
}

/**
 * The records of the sections and of the fields for the search (kind `setting`; Enter opens `id` on the settings page). Without
 * the data folder open (`dataOpen` false) the page lacks the sections that need it – the box of the page leaves them out; Ctrl K
 * keeps them all (a pick of one that is not there ends with a message).
 */
export function settingRecords(dataOpen = true): SearchRecord[] {
  const there = (section: string) => dataOpen || !sectionOf(section)?.needsData
  const sections = SETTINGS_SECTIONS.filter((s) => there(s.id)).map((s): SearchRecord => ({ kind: 'setting', id: s.id, title: s.title, hint: 'w ustawieniach', ...(SECTION_KEYS[s.id] ? { keys: SECTION_KEYS[s.id] } : {}) }))
  const fields = SETTING_FIELDS.filter((f) => there(f.section) && (dataOpen || !f.needsData)).map((f): SearchRecord => ({ kind: 'setting', id: f.id, title: f.title, hint: `w ustawieniach · ${sectionOf(f.section)?.title ?? ''}`, ...(f.keys ? { keys: f.keys } : {}) }))
  return [...sections, ...fields]
}
