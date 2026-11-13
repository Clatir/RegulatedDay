/**
 * Kalendarze w folderze danych (SNT2, D419): stary folder bez kalendarzy czyta się jako jeden „Moje” i odczyt niczego nie
 * przepisuje; zmiana kalendarzy idzie kolejką pole po polu (zmiana innego pola ich nie rusza, dwa komputery dopisujące różne
 * kalendarze łączą się bez pytania); starsza wersja aplikacji, zmieniając inne ustawienie, nie gubi kalendarzy ani pól kategorii.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { recordEdit as editOf } from '@shared/data/merge'
import { addCalendarRaw, calendarOfCategory, newCalendar, removeCalendarRaw, setCategoryCalendarRaw, updateCalendarRaw } from '@shared/model/calendars'
import { CATEGORY_COLORS, rdFrom } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'

const DAY = '2026-10-21'
let root: string
let dataDir: string
let stateDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-cal-'))
  dataDir = join(root, 'data')
  stateDir = join(root, 'state')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function open(dir = dataDir) {
  const now = placeLogical(DAY, 10 * 60)
  return DataFolder.open({
    fs: nodeFs,
    dataDir: dir,
    stateDir,
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '1.17.0',
    clock: { wall: () => now, mono: () => now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
}
const write = (rel: string, v: unknown) => {
  mkdirSync(join(dataDir, rel, '..'), { recursive: true })
  writeFileSync(join(dataDir, rel), JSON.stringify(v))
}
const read = (rel: string) => JSON.parse(readFileSync(join(dataDir, rel), 'utf8')) as Record<string, unknown>
/** What the window does: the record changed by `fn`, saved through the queue as the edit of the fields that differ. */
async function change(folder: DataFolder, fn: (raw: Record<string, unknown>) => Record<string, unknown>) {
  const before = (await folder.recordView(paths.settings)) ?? { schema: 1 }
  const out = await folder.edit([editOf(paths.settings, before, fn({ ...before }))!])
  expect(out[0]!.status).toBe('applied')
}

// An rd.json of the 1.0 line: no calendars, a category with its own fields.
const OLD = { schema: 1, general: { waterEveryMin: 45 }, categories: { analiza: { name: 'Analiza', color: null, archived: false } }, people: [{ id: 'a', name: 'Mama', archived: false }] }

describe('kalendarze w folderze danych', () => {
  it('kopia starego folderu: jeden kalendarz „Moje” ze wszystkimi kategoriami, odczyt niczego nie przepisuje', async () => {
    write(paths.settings, OLD)
    const copy = join(root, 'kopia')
    cpSync(dataDir, copy, { recursive: true })
    const before = readFileSync(join(copy, paths.settings), 'utf8')
    const mtime = statSync(join(copy, paths.settings)).mtimeMs
    const folder = await open(copy)
    await folder.check()
    const rd = rdFrom(await folder.recordView(paths.settings))
    expect(rd.calendars.map((c) => [c.id, c.name])).toEqual([['moje', 'Moje']])
    for (const id of Object.keys(rd.categories)) expect(calendarOfCategory(rd, id)).toBe('moje')
    expect(readFileSync(join(copy, paths.settings), 'utf8')).toBe(before)
    expect(statSync(join(copy, paths.settings)).mtimeMs).toBe(mtime)
  })

  it('nowy kalendarz i kategoria w nim zapisują się kolejką; reszta pliku zostaje', async () => {
    write(paths.settings, { ...OLD, przyszle: { x: 1 } })
    const folder = await open()
    const cal = newCalendar(rdFrom(OLD).calendars, 'Praca')!
    await change(folder, (raw) => setCategoryCalendarRaw(addCalendarRaw(raw, cal), 'analiza', cal.id))
    const file = read(paths.settings)
    expect(file.calendars).toEqual([cal])
    expect((file.categories as Record<string, Record<string, unknown>>).analiza).toEqual({ name: 'Analiza', color: null, archived: false, calendar: cal.id })
    expect(file.przyszle).toEqual({ x: 1 })
    expect(file.people).toEqual(OLD.people)
    const rd = rdFrom(await folder.recordView(paths.settings))
    expect(calendarOfCategory(rd, 'analiza')).toBe(cal.id)
  })

  it('starsza wersja zmienia inne ustawienie z rekordu, który zna tylko po swojemu: kalendarze i pole kategorii zostają', async () => {
    const cal = newCalendar(rdFrom(OLD).calendars, 'Praca')!
    write(paths.settings, { ...OLD, calendars: [cal], categories: { analiza: { ...OLD.categories.analiza, calendar: cal.id } } })
    const folder = await open()
    // Starsza wersja: widzi rd.json bez kalendarzy (jej `rdFrom` ich nie czyta) i zmienia tylko woda i nazwę kategorii.
    const seen = (await folder.recordView(paths.settings))!
    const older = { ...seen } as Record<string, unknown>
    delete older.calendars
    older.categories = { analiza: { name: 'Analiza', color: null, archived: false } }
    const after = { ...older, general: { waterEveryMin: 60 }, categories: { analiza: { name: 'Analiza 2', color: null, archived: false } } }
    const out = await folder.edit([editOf(paths.settings, older, after)!])
    expect(out[0]!.status).toBe('applied')
    const file = read(paths.settings)
    expect(file.calendars).toEqual([cal])
    expect((file.general as Record<string, unknown>).waterEveryMin).toBe(60)
    expect((file.categories as Record<string, Record<string, unknown>>).analiza).toMatchObject({ name: 'Analiza 2', calendar: cal.id })
  })

  it('dwa komputery dopisały różne kalendarze (kopia konfliktowa): oba zostają, bez pytania', async () => {
    const a = newCalendar(rdFrom(OLD).calendars, 'Praca')!
    const b = { ...newCalendar([...rdFrom(OLD).calendars, a], 'Dom')! }
    write(paths.settings, { ...OLD, calendars: [a] })
    write('rd-DESKTOP-B.json', { ...OLD, calendars: [a, b] })
    const folder = await open()
    await folder.check()
    expect(folder.copyConflicts.size).toBe(0)
    expect(read(paths.settings).calendars).toEqual([a, b])
  })

  it('T940/T944: dwa komputery dodają pierwszy kalendarz do starego pliku (obie edycje z tej samej bazy) – oba zostają, bez pytania; tak samo dwie pierwsze zmiany „Moje”', async () => {
    write(paths.settings, OLD)
    const folder = await open()
    const a = newCalendar(rdFrom(OLD).calendars, 'Praca')!
    const b = newCalendar(rdFrom(OLD).calendars, 'Dom')!
    const out = await folder.edit([
      editOf(paths.settings, OLD, addCalendarRaw(OLD, a))!,
      editOf(paths.settings, OLD, addCalendarRaw(OLD, b))!,
      editOf(paths.settings, OLD, updateCalendarRaw(OLD, 'moje', { name: 'Prywatne' }))!,
      editOf(paths.settings, OLD, updateCalendarRaw(OLD, 'moje', { color: CATEGORY_COLORS[5] }))!
    ])
    expect(out.map((o) => o.status)).toEqual(['applied', 'applied', 'applied', 'applied'])
    expect(folder.queue.questions()).toHaveLength(0)
    const rd = rdFrom(read(paths.settings))
    expect(rd.calendars.map((c) => [c.name, c.color])).toEqual([['Prywatne', CATEGORY_COLORS[5]], ['Praca', a.color], ['Dom', b.color]])
  })

  it('kalendarz usunięty tu, a na drugim komputerze przypisana do niego kategoria: czyta się jako „Moje”', async () => {
    const cal = newCalendar(rdFrom(OLD).calendars, 'Praca')!
    write(paths.settings, { ...OLD, calendars: [cal], categories: { analiza: { ...OLD.categories.analiza, calendar: cal.id } } })
    const folder = await open()
    // Usunięcie przenosi kategorie z pliku do „Moje”…
    await change(folder, (raw) => removeCalendarRaw(raw, cal.id))
    expect(read(paths.settings).calendars).toEqual([])
    expect((read(paths.settings).categories as Record<string, Record<string, unknown>>).analiza).not.toHaveProperty('calendar')
    // …a pole, które wróciło z drugiego komputera (starsza kopia), wskazuje kalendarz, którego nie ma: „Moje”.
    write(paths.settings, { ...OLD, categories: { analiza: { ...OLD.categories.analiza, calendar: cal.id } } })
    expect(calendarOfCategory(rdFrom((await folder.recordView(paths.settings)) ?? undefined), 'analiza')).toBe('moje')
  })
})
