/**
 * All-day events in a real data folder (D405, HKU1): the engine of the day never reads them (the same day with an event
 * and without), the window sees them (a bad record is left out, the rest stays, the view's signature changes with them),
 * OneDrive's conflict copies of allday/ join like any record's, the window's save writes only what you changed (unknown
 * fields and another computer's change stay), a removal's „Cofnij” brings back the same record, and „Wolne” for the days
 * of an event „To wolne” goes as one write with one „Cofnij”.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawRecord, RdApi } from '@shared/api'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { createDay } from '@shared/engine/createDay'
import { allDayDraft, type AllDayEvent, type FreeDayInfo } from '@shared/model/allDay'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { DataHub } from '../../src/main/data/hub'

// The window's modules (typed by the web project, not this one – loaded by path, with the few types used here).
const load = <T,>(rel: string): Promise<T> => import(/* @vite-ignore */ rel) as Promise<T>
interface Toast {
  text: string
  kind?: string
}
type FreeChange = { days: Array<{ date: string }> }
const { reloadData, useData } = await load<{ reloadData: () => Promise<void>; useData: { getState: () => { allDay: AllDayEvent[] } } }>('../../src/renderer/store/data')
const { useUi } = await load<{ useUi: { getState: () => { toasts: Toast[] }; setState: (s: { toasts: Toast[] }) => void } }>('../../src/renderer/store/ui')
const { saveAllDay, removeAllDay, restoreAllDay } = await load<{
  saveAllDay: (e: AllDayEvent, base?: AllDayEvent | null) => Promise<boolean>
  removeAllDay: (id: string) => Promise<RawRecord | null>
  restoreAllDay: (raw: RawRecord) => Promise<boolean>
}>('../../src/renderer/store/allDay')
const { freeDayInfos, askFreeDays, setFreeDays, undoFreeDays, undoFreeLine } = await load<{
  freeDayInfos: (dates: string[], today: string) => Promise<Record<string, FreeDayInfo & { duringDay: boolean }>>
  askFreeDays: (e: AllDayEvent, today: string) => Promise<string[]>
  setFreeDays: (dates: string[], today: string) => Promise<{ saved: boolean; change: FreeChange | null; duringDay: string | null; unreadable: string[] }>
  undoFreeLine: (seq: number) => Promise<void>
  undoFreeDays: (change: FreeChange) => Promise<{ saved: boolean; undone: string[]; changed: string[]; unreadable: string[] }>
}>('../../src/renderer/features/allday/freeDays')
const { showAllDayLine, dropAllDayLine, useAllDayLines } = await load<{
  showAllDayLine: (page: 'today' | 'week', what: { kind: 'free'; change: FreeChange }) => number
  dropAllDayLine: (seq: number) => void
  useAllDayLines: { getState: () => { lines: Array<{ seq: number; kind: string; change?: FreeChange }> }; setState: (s: { lines: [] }) => void }
}>('../../src/renderer/store/allDayLine')
const { saveDay } = await load<{ saveDay: (date: string, seen: RawRecord | null, next: (raw: RawRecord) => RawRecord) => Promise<unknown> }>('../../src/renderer/features/today/dayActions')

let root: string
let dir: string
let hub: DataHub
let changes = 0

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'rd-allday-'))
  dir = join(root, 'data')
  mkdirSync(dir, { recursive: true })
  changes = 0
  hub = new DataHub({
    userData: join(root, 'appdata'),
    computer: () => 'pca',
    computerName: 'PC A',
    appVersion: '1.4.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: () => undefined,
    writeGuardPlan: false,
    extraBackupDir: () => null,
    previousVersion: () => null,
    onChange: () => void changes++
  })
  expect(await hub.open(dir)).toBe(true)
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = {
    rd: {
      dataView: () => hub.view(),
      dayFiles: (dates) => hub.dayFiles(dates),
      dayData: (date) => hub.day(date),
      edit: (entries) => hub.edit(entries),
      logEvents: (events) => hub.events(events)
    }
  }
  useUi.setState({ toasts: [] })
  await reloadData()
})
afterEach(async () => {
  for (const l of useAllDayLines.getState().lines) dropAllDayLine(l.seq)
  await hub.close('quit')
  delete (globalThis as { window?: unknown }).window
  rmSync(root, { recursive: true, force: true })
})

const today = () => logicalDayOf(hub.service!.folder.clock.now())
const write = (rel: string, v: unknown) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), typeof v === 'string' ? v : JSON.stringify(v))
}
const read = (rel: string) => JSON.parse(readFileSync(join(dir, rel), 'utf8')) as Record<string, unknown>
const dayOf = (date: string) => (existsSync(join(dir, paths.day(date))) ? read(paths.day(date)) : null)
const event = (id: string, startDate: string, endDate = startDate, more: Partial<AllDayEvent> = {}): AllDayEvent => ({ ...allDayDraft(id, startDate, endDate), title: 'Konferencja', ...more })
const rel = (id: string) => paths.record('allDay', id)
/** Today made by the leader (its snapshot in the log), as on any day after 04:00 with the app running. */
async function makeToday(): Promise<void> {
  const folder = hub.service!.folder
  const t = today()
  if ((await hub.day(t)).events.some((e) => (e as { k?: string }).k === 'day.create')) return
  const snapshot = createDay({ date: t, changes: [], templates: [], lectures: [], dayFile: null, holidays: marketDay, at: folder.clock.now() })
  folder.append({ day: t, dom: 'timer', k: 'day.create', snapshot })
  await folder.log.flush()
}

describe('wydarzenia nie zmieniają dnia (D405)', () => {
  it('ten sam dzień z wydarzeniem „To wolne” w folderze i bez: identyczny stan – budżet, regeneracja, pora snu', async () => {
    const folder = hub.service!.folder
    const at = folder.clock.now()
    const days = [today(), addDays(today(), 1)]
    const before = await Promise.all(days.map((d) => folder.dayState(d, undefined, at)))
    write(rel('urlop'), { schema: 1, id: 'urlop', title: 'ZNACZNIK-URLOPU', startDate: days[0], endDate: days[1], color: 'sky', note: '', free: true, calendarId: null })
    expect((await folder.collection('allDay')).map((r) => r.id)).toEqual(['urlop'])
    const after = await Promise.all(days.map((d) => folder.dayState(d, undefined, at)))
    expect(after).toEqual(before)
    // What the day is counted from – the leader's and the window's – carries nothing of the event.
    expect(JSON.stringify(await folder.inputs())).not.toContain('ZNACZNIK-URLOPU')
    expect(JSON.stringify(await folder.inputs(true))).not.toContain('ZNACZNIK-URLOPU')
    for (const d of days) expect(JSON.stringify(await hub.day(d))).not.toContain('ZNACZNIK-URLOPU')
  })
})

describe('wydarzenia w oknie', () => {
  it('widok: wydarzenia z folderu; zły rekord pominięty, reszta widoczna; podpis widoku zmienia się z nimi', async () => {
    write(rel('k1'), { schema: 1, id: 'k1', title: 'Konferencja', startDate: '2026-11-18', endDate: '2026-11-20', color: 'teal', note: '', free: false, calendarId: null })
    write(rel('zle'), { schema: 1, id: 'zle', title: 'Zła', startDate: '2026-11-20', endDate: '2026-11-18' })
    write(rel('uszk'), '{"id": "uszk", ')
    await reloadData()
    expect(useData.getState().allDay.map((e) => e.id)).toEqual(['k1'])
    expect((await hub.view()).allDay.map((r) => r.id).sort()).toEqual(['k1', 'zle'])
    // A new event written on another computer reaches the window like a change of the settings.
    const settled = async () => {
      let n = -1
      while (n !== changes) {
        n = changes
        hub.changed()
        await new Promise((r) => setTimeout(r, 50))
      }
    }
    await settled()
    const n = changes
    write(rel('k2'), { schema: 1, id: 'k2', title: 'Wyjazd', startDate: '2026-11-21', endDate: '2026-11-21' })
    hub.changed()
    await vi.waitFor(() => expect(changes).toBe(n + 1))
  })

  it('kopia konfliktowa allday/<id>-DESKTOP-ABC.json: pole z jednej strony się łączy, różne po obu – pytanie', async () => {
    // A folder of its own, opened with the copies there: its first check looks for them (then every 60 s).
    const data = join(root, 'kopie')
    const put = (r: string, v: unknown) => {
      mkdirSync(join(data, r, '..'), { recursive: true })
      writeFileSync(join(data, r), JSON.stringify(v))
    }
    const base = { schema: 1, id: 'k1', title: 'Konferencja', startDate: '2026-11-18', endDate: '2026-11-20', color: 'teal', note: '', free: false, calendarId: null }
    put(rel('k1'), base)
    put('allday/k1-DESKTOP-ABC.json', { ...base, extra: 'z drugiego komputera' })
    put(rel('k2'), { ...base, id: 'k2' })
    put('allday/k2-DESKTOP-ABC.json', { ...base, id: 'k2', title: 'Konferencja PTE' })
    const now = Date.now()
    const folder = await DataFolder.open({ fs: nodeFs, dataDir: data, stateDir: join(root, 'kopie-stan'), computer: 'pcb', computerName: 'PC B', appVersion: '1.4.0', clock: { wall: () => now, mono: () => now }, holidays: marketDay, oneDriveRunning: () => true })
    try {
      await folder.check()
      expect(existsSync(join(data, 'allday/k1-DESKTOP-ABC.json'))).toBe(false)
      expect((JSON.parse(readFileSync(join(data, rel('k1')), 'utf8')) as Record<string, unknown>).extra).toBe('z drugiego komputera')
      expect(folder.copyConflicts.get('allday/k2-DESKTOP-ABC.json')?.conflicts.map((c) => c.path.join('.'))).toEqual(['title'])
      // Both versions of the joined one are in the history, as for any record.
      expect((await folder.history.list('allDay', 'k1')).filter((v) => v.reason === 'conflict')).toHaveLength(2)
    } finally {
      await folder.close()
    }
  })

  it('zapis z okna: nowe wydarzenie; zmiana pola zostawia nieznane pola i zmianę z innego komputera', async () => {
    const e = event('k1', '2026-11-18', '2026-11-20')
    expect(await saveAllDay(e)).toBe(true)
    expect(read(rel('k1'))).toMatchObject({ schema: 1, id: 'k1', title: 'Konferencja', startDate: '2026-11-18', endDate: '2026-11-20', calendarId: null, color: 'amber', note: '', free: false })
    // Another computer added a field this version does not know and changed the note meanwhile.
    write(rel('k1'), { ...read(rel('k1')), extra: { a: 1 }, note: 'sala 2' })
    await reloadData()
    expect(await saveAllDay({ ...e, title: 'Konferencja PTE' }, e)).toBe(true)
    expect(read(rel('k1'))).toMatchObject({ title: 'Konferencja PTE', note: 'sala 2', extra: { a: 1 } })
    expect((await hub.view()).questions).toEqual([])
  })

  it('pusty tytuł albo „do” przed „od”: nic nie zapisane, komunikat', async () => {
    expect(await saveAllDay(event('k1', '2026-11-18', '2026-11-18', { title: '  ' }))).toBe(false)
    expect(await saveAllDay(event('k2', '2026-11-18', '2026-11-18', { endDate: '2026-11-17' }))).toBe(false)
    expect(existsSync(join(dir, 'allday'))).toBe(false)
    expect(useUi.getState().toasts.filter((t) => t.kind === 'error').map((t) => t.text)).toEqual(['Wpisz tytuł wydarzenia.', 'Data „do” nie może być przed datą „od”.'])
  })

  it('zmiana wydarzenia usuniętego w międzyczasie: nic nie wraca, komunikat', async () => {
    const e = event('k1', '2026-11-18')
    expect(await saveAllDay(e)).toBe(true)
    rmSync(join(dir, rel('k1')))
    await reloadData()
    expect(await saveAllDay({ ...e, title: 'Inny' }, e)).toBe(false)
    expect(existsSync(join(dir, rel('k1')))).toBe(false)
    expect(useUi.getState().toasts.some((t) => t.text.includes('już nie ma'))).toBe(true)
  })

  it('usunięcie bez pytania; „Cofnij” przywraca ten sam rekord (także pola nieznane tej wersji)', async () => {
    write(rel('k1'), { schema: 1, id: 'k1', title: 'Konferencja', startDate: '2026-11-18', endDate: '2026-11-20', color: 'teal', note: 'sala 2', free: true, calendarId: null, extra: [1, 2] })
    await reloadData()
    const was = read(rel('k1'))
    const removed = await removeAllDay('k1')
    expect(removed).toEqual(was)
    expect(existsSync(join(dir, rel('k1')))).toBe(false)
    expect(useData.getState().allDay).toEqual([])
    expect(await restoreAllDay(removed!)).toBe(true)
    const { updatedAt: _a, updatedBy: _b, ...back } = read(rel('k1'))
    const { updatedAt: _c, updatedBy: _d, ...orig } = was
    expect(back).toEqual(orig)
    expect(useData.getState().allDay.map((e) => e.id)).toEqual(['k1'])
    // „Cofnij” twice: the record is there – nothing is written over, nothing doubled.
    expect(await restoreAllDay(removed!)).toBe(false)
    expect(await removeAllDay('nie-ma')).toBeNull()
  })

  it('usunięcie wydarzenia już usuniętego (gdzie indziej): nic się nie dzieje, komunikat jak przy zapisie', async () => {
    expect(await saveAllDay(event('k1', '2026-11-18'))).toBe(true)
    rmSync(join(dir, rel('k1')))
    await reloadData()
    useUi.setState({ toasts: [] })
    expect(await removeAllDay('k1')).toBeNull()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Tego wydarzenia już nie ma – usunięto je w międzyczasie.'])
  })
})

describe('„To wolne” – typ „Wolne” na dni wydarzenia (D405)', () => {
  it('pyta tylko o dni od dziś, które nie są „Wolne”; dni minione pominięte', async () => {
    const t = today()
    write(paths.day(addDays(t, 2)), { schema: 1, date: addDays(t, 2), dayType: 'wolne' })
    const e = event('u', addDays(t, -2), addDays(t, 3), { free: true })
    const info = await freeDayInfos([addDays(t, 1), addDays(t, 2)], t)
    expect(info[addDays(t, 2)]).toMatchObject({ type: 'wolne', closed: false, duringDay: false })
    const asked = await askFreeDays(e, t)
    expect(asked).not.toContain(addDays(t, -1))
    expect(asked).not.toContain(addDays(t, 2))
    expect(asked).toEqual(expect.arrayContaining([addDays(t, 1), addDays(t, 3)]))
  })

  it('„Tak”: typ „Wolne” dni od jutra jednym zapisem; jedno „Cofnij” oddaje typy, dzień zmieniony w międzyczasie zostaje', async () => {
    const t = today()
    const [d1, d2, d3] = [addDays(t, 1), addDays(t, 2), addDays(t, 3)]
    write(paths.day(d2), { schema: 1, date: d2, dayType: 'zwykly', wakeMin: 7 * 60 })
    write(paths.day(d3), { schema: 1, date: d3, wakeMin: 8 * 60 })
    await reloadData()
    const r = await setFreeDays([d1, d2, d3], t)
    expect(r).toMatchObject({ saved: true, duringDay: null })
    expect(r.change!.days.map((d) => d.date)).toEqual([d1, d2, d3])
    expect([d1, d2, d3].map((d) => dayOf(d)?.dayType)).toEqual(['wolne', 'wolne', 'wolne'])
    // Meanwhile the type of d3 changed again (by you, in „Kalendarz”).
    await saveDay(d3, dayOf(d3) as RawRecord, (raw) => ({ ...raw, dayType: 'weekend' }))
    const u = await undoFreeDays(r.change!)
    expect(u).toMatchObject({ saved: true, undone: [d1, d2], changed: [d3], unreadable: [] })
    // d1 had no file: the one made goes; d2 has its type back; d3 stays as changed.
    expect(dayOf(d1)).toBeNull()
    expect(dayOf(d2)).toMatchObject({ dayType: 'zwykly', wakeMin: 7 * 60 })
    expect(dayOf(d3)).toMatchObject({ dayType: 'weekend', wakeMin: 8 * 60 })
    expect(useUi.getState().toasts.some((t) => t.text.includes('zmieni'))).toBe(true)
  })

  it('dziś po utworzeniu dnia: zmiana w trakcie dnia (propozycje „Dziś”) – nie w tym zapisie; dni od jutra tak', async () => {
    const t = today()
    await makeToday()
    expect((await freeDayInfos([t], t))[t]).toMatchObject({ duringDay: true, closed: false })
    const r = await setFreeDays([t, addDays(t, 1)], t)
    expect(r).toMatchObject({ saved: true, duringDay: t })
    expect(r.change!.days.map((d) => d.date)).toEqual([addDays(t, 1)])
    expect(dayOf(t)?.dayType).toBeUndefined()
    expect(dayOf(addDays(t, 1))?.dayType).toBe('wolne')
  })

  it('dziś zamknięty (rytuał): bez pytania o dziś', async () => {
    const t = today()
    await makeToday()
    const folder = hub.service!.folder
    folder.append({ day: t, dom: 'timer', k: 'ritual.close', at: folder.clock.now(), how: 'asWritten' })
    await folder.log.flush()
    expect((await freeDayInfos([t], t))[t]).toMatchObject({ closed: true })
    expect(await askFreeDays(event('u', t, addDays(t, 1), { free: true }), t)).toEqual([addDays(t, 1)])
  })

  it('dzień, którego nie da się teraz odczytać: bez pytania o niego i bez zapisu', async () => {
    const t = today()
    write(paths.day(addDays(t, 1)), '{"schema": 1, ')
    await reloadData()
    expect(await askFreeDays(event('u', addDays(t, 1), addDays(t, 2), { free: true }), t)).toEqual([addDays(t, 2)])
  })
})

describe('„Tak” na pytaniu „Wolne” – dziś i dni nieczytelne', () => {
  it('brak klucza dnia w odpowiedzi dayFiles to dzień nieczytelny – także dziś: pominięty z komunikatem, plik nie powstaje; jedno wywołanie dayFiles na wszystkie dni', async () => {
    const t = today()
    const d1 = addDays(t, 1)
    const calls: string[][] = []
    const rd = (globalThis as unknown as { window: { rd: Partial<RdApi> } }).window.rd
    rd.dayFiles = async (dates) => {
      calls.push([...dates])
      const files = await hub.dayFiles(dates)
      delete files[t]
      return files
    }
    const r = await setFreeDays([t, d1], t)
    expect(r.change!.days.map((d) => d.date)).toEqual([d1])
    expect(r.unreadable).toEqual([t])
    expect(r.duringDay).toBeNull()
    expect(dayOf(t)).toBeNull()
    expect(dayOf(d1)?.dayType).toBe('wolne')
    expect(useUi.getState().toasts.some((x) => x.kind === 'error' && /nieczytel/.test(x.text))).toBe(true)
    expect(calls).toHaveLength(1)
    expect([...calls[0]!].sort()).toEqual([t, d1].sort())
  })

  it('dziś zamknięty (rytuał) w chwili „Tak”: bez okna zmiany typu (duringDay puste), nic dziś nie zapisane', async () => {
    const t = today()
    await makeToday()
    const folder = hub.service!.folder
    folder.append({ day: t, dom: 'timer', k: 'ritual.close', at: folder.clock.now(), how: 'asWritten' })
    await folder.log.flush()
    const r = await setFreeDays([t, addDays(t, 1)], t)
    expect(r.duringDay).toBeNull()
    expect(r.change!.days.map((d) => d.date)).toEqual([addDays(t, 1)])
    expect(dayOf(t)?.dayType).toBeUndefined()
  })
})

describe('linia „Wolne · Cofnij” – dni nieczytelne zostają na linii', () => {
  it('„Cofnij” z jednym dniem nieczytelnym: linia zostaje z tym dniem, drugie „Cofnij” po naprawie kończy ją', async () => {
    const t = today()
    const [d1, d2] = [addDays(t, 1), addDays(t, 2)]
    write(paths.day(d2), { schema: 1, date: d2, dayType: 'zwykly', wakeMin: 7 * 60 })
    await reloadData()
    const r = await setFreeDays([d1, d2], t)
    const seq = showAllDayLine('week', { kind: 'free', change: r.change! })
    // The file of d2 cannot be read for a while: its days are not in the answer of dayFiles.
    const rd = (globalThis as unknown as { window: { rd: Partial<RdApi> } }).window.rd
    const read = rd.dayFiles!
    rd.dayFiles = async (dates) => {
      const files = await read(dates)
      delete files[d2]
      return files
    }
    await undoFreeLine(seq)
    expect(dayOf(d1)).toBeNull()
    const line = useAllDayLines.getState().lines.find((l) => l.seq === seq)
    expect(line?.change?.days.map((d) => d.date)).toEqual([d2])
    rd.dayFiles = read
    await undoFreeLine(seq)
    expect(useAllDayLines.getState().lines.some((l) => l.seq === seq)).toBe(false)
    expect(dayOf(d2)).toMatchObject({ dayType: 'zwykly', wakeMin: 7 * 60 })
  })
})
