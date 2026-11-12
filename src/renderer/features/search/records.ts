/**
 * What the global search (Ctrl K, D387, T652) can find, as plain records: the screens, the settings' sections and the
 * commands are a static list; blocks of the days come from the main process (`searchDays`), the rest from the data the
 * window already has – templates (name and blocks), „Sprawy” (a task by its title, a request by its person; the note –
 * every list, „Zrobione” of any day too, D402), routines (name, steps) and categories. The matching itself is
 * `shared/search.ts`.
 */
import type { SearchBlock } from '@shared/api'
import { blockName, type Names } from '@shared/blockName'
import { plDate, WEEKDAY_NAMES } from '@shared/format'
import { FIELD_GROUP_NAMES } from '@shared/model/fields'
import { templateVersionOn, type Template } from '@shared/model/plan'
import { personName, type RdFile } from '@shared/model/rd'
import { CASE_LIST_NAMES, CASE_LISTS, type RequestRecord } from '@shared/model/requests'
import { listOf } from '@shared/engine/cases'
import type { Routine } from '@shared/model/routines'
import { currentSeries, seriesVersionOn, type SeriesPlan } from '@shared/model/series'
import { occurrenceBlock } from '@shared/engine/series'
import { seriesText } from '@shared/seriesText'
import { settingsOn } from '@shared/model/settings'
import type { SearchRecord } from '@shared/search'
import { addDays, weekday } from '@shared/time/zone'
import { PAGES, type Page } from '../../store/ui'

/** The commands (D387: they only navigate, nothing is moved): „nowe” finds both „Nowy …” (the spec's example). */
export const COMMANDS: SearchRecord[] = [
  { kind: 'command', id: 'newBlock', title: 'Nowy blok', hint: 'Ctrl N w „Dziś”', keys: 'nowe' },
  { kind: 'command', id: 'newRequest', title: 'Nowa prośba', hint: 'w „Sprawach”', keys: 'nowe' },
  { kind: 'command', id: 'tomorrow', title: 'Jutro', hint: 'plan na jutro' },
  { kind: 'command', id: 'yesterday', title: 'Wczoraj', hint: 'plan wczorajszego dnia' },
  { kind: 'command', id: 'ritual', title: 'Rytuał', hint: 'rytuał dzisiejszego dnia', keys: 'wieczór podsumowanie' }
]

/** The sections of the settings by the test id of their box (the screen scrolls to it); words only searched. */
export const SETTING_SECTIONS: Array<{ id: string; title: string; keys?: string }> = [
  { id: 'settings-modules', title: 'Moduły' },
  { id: 'settings-daytypes', title: 'Typy dni' },
  { id: 'settings-sleep', title: FIELD_GROUP_NAMES.sleep },
  { id: 'settings-sessions', title: 'Sesje' },
  { id: 'settings-boundary', title: FIELD_GROUP_NAMES.boundary },
  { id: 'settings-energy', title: FIELD_GROUP_NAMES.energy },
  { id: 'settings-categories', title: 'Kategorie' },
  { id: 'settings-regen-ways', title: 'Sposoby regeneracji' },
  { id: 'settings-lectures', title: 'Plan wykładów' },
  { id: 'settings-reminders', title: FIELD_GROUP_NAMES.reminders },
  { id: 'settings-timer', title: FIELD_GROUP_NAMES.timer },
  { id: 'settings-care', title: FIELD_GROUP_NAMES.care },
  { id: 'settings-calibration', title: 'Kalibracja' },
  { id: 'settings-data', title: 'Dane', keys: 'folder kopie zapasowe' },
  { id: 'settings-computers', title: 'Komputery' },
  { id: 'settings-machine', title: 'Ten komputer', keys: 'autostart pasek dźwięk powiadomienia skala jasność animacje' },
  { id: 'settings-updates', title: 'Aktualizacje' },
  { id: 'settings-info', title: 'Informacje', keys: 'wersja' },
  { id: 'settings-shortcuts', title: 'Skróty klawiszowe' }
]

export interface RecordsInput {
  today: string
  rd: RdFile
  templates: readonly Template[]
  requests: readonly RequestRecord[]
  routines: readonly Routine[]
  /** The series with their last days (D381, `seriesPlans`) – each found once, by its name and rule; its occurrences are not blocks of the days here. */
  series: readonly SeriesPlan[]
  /** The blocks of the days (`searchDays`); none while they are read. */
  blocks: readonly SearchBlock[]
  /** The names of the screens and the keys shown beside them (the menu's own). */
  pageLabel: Record<Page, string>
  pageKeys: (page: Page) => string | null
}

/** „dziś · 10.11.2026 · wtorek” – the day of a block. */
export const dayHint = (date: string, today: string): string => `${date === today ? 'dziś · ' : ''}${plDate(date)} · ${WEEKDAY_NAMES[weekday(date) - 1]}`

export function searchRecords(i: RecordsInput): SearchRecord[] {
  const out: SearchRecord[] = [...COMMANDS]
  for (const p of PAGES) out.push({ kind: 'screen', id: p, title: i.pageLabel[p], ...(i.pageKeys(p) ? { hint: i.pageKeys(p)! } : {}) })
  for (const s of SETTING_SECTIONS) out.push({ kind: 'setting', id: s.id, title: s.title, hint: 'w ustawieniach', ...(s.keys ? { keys: s.keys } : {}) })
  for (const [id, meta] of Object.entries(i.rd.categories)) out.push({ kind: 'category', id, title: meta.name, hint: meta.archived ? 'kategoria w archiwum' : 'w ustawieniach' })

  // A template block is named as the template's editor shows it (the version in force from tomorrow).
  const names: Names = { rd: i.rd, settings: settingsOn(i.rd.settings, addDays(i.today, 1)), routines: i.routines, requests: i.requests }
  for (const t of [...i.templates].sort((a, b) => a.name.localeCompare(b.name, 'pl'))) {
    const hint = t.archived ? 'w archiwum' : undefined
    out.push({ kind: 'template', id: t.id, title: t.name, ...(hint ? { hint } : {}) })
    for (const b of templateVersionOn(t, addDays(i.today, 1))?.blocks ?? []) {
      out.push({ kind: 'templateBlock', id: b.id, parent: t.id, title: blockName(b, names), text: b.note, hint: `szablon: ${t.name}` })
    }
  }

  // A series is one record (D401, `currentSeries` – one per root).
  const lastOf = new Map(i.series.map((p) => [p.series.id, p.last]))
  for (const s of currentSeries(i.series.map((p) => p.series), i.today)) {
    const v = seriesVersionOn(s, i.today) ?? s.versions[0]!
    // Ended by its date or its count (`SeriesPlan.last`), as the list of „Szablony” says it.
    const last = lastOf.get(s.id) ?? s.until
    const ended = last != null && last < i.today
    out.push({ kind: 'series', id: s.id, title: blockName(occurrenceBlock(s, v.block, i.today), names), text: seriesText(s, i.today), hint: ended ? 'seria zakończona' : 'seria' })
  }

  // „Sprawy” (D383, SNT6): in the order of the lists, the newest first; the hint says what it is and where it lies.
  const lists = i.requests.map((r) => ({ r, list: listOf(r, i.today) }))
  for (const { r, list } of lists.sort((a, b) => CASE_LISTS.indexOf(a.list) - CASE_LISTS.indexOf(b.list) || b.r.createdAt - a.r.createdAt)) {
    const title = r.kind === 'task' ? r.title || 'zadanie' : personName(i.rd, r.person)
    out.push({ kind: 'request', id: r.id, title, text: r.note, hint: `${r.kind === 'task' ? 'zadanie' : 'prośba'} · ${CASE_LIST_NAMES[list]}${r.state === 'dropped' ? ' · porzucone' : ''}` })
  }
  for (const r of [...i.routines].sort((a, b) => a.name.localeCompare(b.name, 'pl'))) {
    out.push({ kind: 'routine', id: r.id, title: r.name, text: [...r.normal, ...r.worse].map((s) => s.name).filter(Boolean).join(' · '), ...(r.archived ? { hint: 'w archiwum' } : {}) })
  }
  for (const b of i.blocks) out.push({ kind: 'block', id: b.id, date: b.date, title: b.title, text: b.note, hint: dayHint(b.date, i.today) })
  return out
}
