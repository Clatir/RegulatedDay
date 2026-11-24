/**
 * Wklejenie listy w polu szybkiego zapisu (N11, D605, D606) w folderze danych: `hub.quickAddMany` – wiele spraw w jednej edycji, każda
 * linia przez słowa szybkiego zapisu (daty, długość, #podkategoria, godzina → blok na osi), i `hub.quickUndo` – „Cofnij” wszystkich.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { dayFileFrom } from '@shared/model/plan'
import { logicalDayOf, placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataHub } from '../../src/main/data/hub'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-cases-list-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function hubFor(name = 'pca') {
  return new DataHub({
    userData: join(root, `appdata-${name}`),
    computer: () => name,
    computerName: name.toUpperCase(),
    appVersion: '1.13.0',
    runId: `run-${Math.random()}`,
    holidays: marketDay,
    idleSeconds: () => 0,
    log: () => undefined,
    writeGuardPlan: false,
    extraBackupDir: () => null,
    previousVersion: () => null,
    onChange: () => undefined
  })
}

const LINES = ['Kup mleko', 'Raport @jutro 15:00 1h #anal', 'Telefon @jutro 16:00', 'Stara @2020-01-05 15:00', 'Zamówić karmę !jutro']

async function open() {
  const dir = join(root, 'data')
  mkdirSync(dir, { recursive: true })
  await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
  const hub = hubFor()
  expect(await hub.open(dir)).toBe(true)
  const today = logicalDayOf(Date.now())
  // 10:00 by the folder's clock – the hours of tomorrow stand whatever the time of the run.
  vi.spyOn(hub.service!.folder.clock, 'now').mockReturnValue(placeLogical(today, 10 * 60))
  return { dir, hub, today, tomorrow: addDays(today, 1) }
}
const files = (dir: string) => readdirSync(join(dir, 'requests')).filter((n) => n.endsWith('.json'))
const read = (dir: string) => files(dir).map((n) => JSON.parse(readFileSync(join(dir, 'requests', n), 'utf8')) as Record<string, unknown>)
const titles = (dir: string) => read(dir).map((x) => x.title as string).sort()

describe('hub.quickAddMany (N11, D605, D606)', () => {
  it('5 linii – 5 spraw w jednej edycji; dwie godziny jutra – dwa bloki w jednym pliku dnia; przeszła data – bez bloku, policzona', async () => {
    const { dir, hub, tomorrow } = await open()
    try {
      const edit = vi.spyOn(hub, 'edit')
      const r = await hub.quickAddMany(LINES)
      expect(r).toMatchObject({ ok: true, error: null, count: 5, notPlaced: 1, batch: expect.any(String) })
      expect(r).not.toHaveProperty('asked')
      // One edit for all of it: the day's file of tomorrow once and the five records.
      expect(edit).toHaveBeenCalledTimes(1)
      expect(edit.mock.calls[0]![0]).toHaveLength(6)
      expect(titles(dir)).toEqual(['Kup mleko', 'Raport', 'Stara', 'Telefon', 'Zamówić karmę'])
      const day = dayFileFrom((await hub.dayFiles([tomorrow]))[tomorrow], tomorrow)
      expect(day.blocks.map((b) => [b.startMin, b.durationMin, b.categoryId])).toEqual(expect.arrayContaining([[900, 60, 'analiza'], [960, 30, 'inne']]))
      expect(day.blocks).toHaveLength(2)
      const by = Object.fromEntries(read(dir).map((x) => [x.title as string, x]))
      expect(by['Raport']).toMatchObject({ day: tomorrow, doDate: tomorrow, estimateMin: 60, categoryId: 'analiza' })
      expect(by['Telefon']).toMatchObject({ day: tomorrow })
      expect(by['Stara']!.block ?? null).toBeNull()
      expect(by['Kup mleko']!.block ?? null).toBeNull()
      expect(by['Zamówić karmę']).toMatchObject({ dueDate: tomorrow })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('linie bez tytułu (same słowa) i puste są pomijane; same takie – „Wpisz, co zapisać.”, nic nie zapisane; nie tablica – odmowa', async () => {
    const { dir, hub } = await open()
    try {
      expect(await hub.quickAddMany(['Jedno', '!jutro', '   ', 'Drugie'])).toMatchObject({ ok: true, count: 2, notPlaced: 0 })
      expect(titles(dir)).toEqual(['Drugie', 'Jedno'])
      expect(await hub.quickAddMany(['!jutro', ' '])).toMatchObject({ ok: false, error: 'Wpisz, co zapisać.', count: 0, batch: null })
      expect(await hub.quickAddMany('Jedno' as unknown)).toMatchObject({ ok: false, count: 0, batch: null })
      expect(titles(dir)).toEqual(['Drugie', 'Jedno'])
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('najwyżej 50 linii naraz (D605): reszta nie jest zapisana', async () => {
    const { dir, hub } = await open()
    try {
      expect(await hub.quickAddMany(Array.from({ length: 53 }, (_, i) => `Zadanie ${i + 1}`))).toMatchObject({ ok: true, count: 50 })
      expect(files(dir)).toHaveLength(50)
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('kolejka pyta o plik dnia (zmiana z innego komputera): ok, „asked”, bez „Cofnij” (batch null); odmowa – nie zapisano', async () => {
    const { hub } = await open()
    try {
      const real = hub.edit.bind(hub)
      vi.spyOn(hub, 'edit').mockImplementation(async (entries) => (await real(entries)).map((o, i) => (i === 0 ? { status: 'changedElsewhere' as const } : o)))
      expect(await hub.quickAddMany(['Raport @jutro 15:00', 'Drugie'])).toMatchObject({ ok: true, count: 2, asked: true, batch: null })
      vi.mocked(hub.edit).mockResolvedValue([{ status: 'broken' }])
      expect(await hub.quickAddMany(['Trzecie', 'Czwarte'])).toMatchObject({ ok: false, error: 'Nie zapisano – spróbuj jeszcze raz.', count: 0, batch: null })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })
})

describe('hub.quickUndo (N11, D606)', () => {
  it('zdejmuje wszystkie sprawy i ich bloki, plik dnia utworzony przez zapis znika; drugi raz – nie ma czego cofać', async () => {
    const { dir, hub, tomorrow } = await open()
    try {
      const { batch } = await hub.quickAddMany(LINES)
      expect(await hub.quickUndo(batch)).toEqual({ ok: true, error: null, undone: 5, kept: 0 })
      expect(files(dir)).toEqual([])
      const day = (await hub.dayFiles([tomorrow]))[tomorrow]
      expect(day ? dayFileFrom(day, tomorrow).blocks : []).toEqual([])
      expect(await hub.quickUndo(batch)).toMatchObject({ ok: false, undone: 0 })
      expect(await hub.quickUndo('nie-ma')).toMatchObject({ ok: false, undone: 0 })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('zdejmuje swoje bloki z pliku dnia, który miał już inne – tamte zostają', async () => {
    const { hub, tomorrow, dir } = await open()
    try {
      mkdirSync(join(dir, 'days', tomorrow.slice(0, 4)), { recursive: true })
      writeFileSync(join(dir, paths.day(tomorrow)), JSON.stringify({ schema: 1, date: tomorrow, blocks: [{ id: 'cudzy', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'user' }] }))
      const { batch } = await hub.quickAddMany(['Raport @jutro 15:00', 'Telefon @jutro 16:00'])
      expect(dayFileFrom((await hub.dayFiles([tomorrow]))[tomorrow], tomorrow).blocks).toHaveLength(3)
      expect(await hub.quickUndo(batch)).toMatchObject({ ok: true, undone: 2, kept: 0 })
      expect(dayFileFrom((await hub.dayFiles([tomorrow]))[tomorrow], tomorrow).blocks.map((b) => b.id)).toEqual(['cudzy'])
      expect(files(dir)).toEqual([])
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('nie zdejmuje sprawy zmienionej od zapisu ani dnia, w którym przesunięto blok z listy – ich sprawy zostają razem z blokami', async () => {
    const { dir, hub, tomorrow } = await open()
    try {
      const { batch } = await hub.quickAddMany(LINES)
      // „Kup mleko” renamed since the save: its field no longer holds what the save wrote.
      const milkRel = `requests/${files(dir).find((n) => (JSON.parse(readFileSync(join(dir, 'requests', n), 'utf8')) as { title: string }).title === 'Kup mleko')!}`
      const before = (await hub.service!.folder.recordView(milkRel))!
      await hub.edit([recordEdit(milkRel, before, { ...before, title: 'Kup masło' })!])
      // The block of „Raport” moved in the day's file since: the day's file no longer stands as the save left it.
      const file = (await hub.dayFiles([tomorrow]))[tomorrow]!
      const blocks = (file.blocks as Array<Record<string, unknown>>).map((b) => (b.startMin === 900 ? { ...b, startMin: 1000 } : b))
      await hub.edit([recordEdit(paths.day(tomorrow), file, { ...file, blocks })!])
      // Taken: „Stara” and „Zamówić karmę” (no block, untouched). Kept: the renamed one, and „Raport” and „Telefon” with their day's file.
      expect(await hub.quickUndo(batch)).toEqual({ ok: true, error: null, undone: 2, kept: 3 })
      expect(titles(dir)).toEqual(['Kup masło', 'Raport', 'Telefon'])
      expect(dayFileFrom((await hub.dayFiles([tomorrow]))[tomorrow], tomorrow).blocks).toHaveLength(2)
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })
})

describe('hub.quickUndo – dzień i odmowy (N11, D607)', () => {
  const THREE = ['A @jutro 10:00', 'B @jutro 11:00', 'C @jutro 12:00']

  it('zmieniona jedna sprawa listy zatrzymuje dzień: wszystkie 3 sprawy i ich bloki zostają (kept 3), żadna sprawa nie wskazuje na zdjęty blok', async () => {
    const { dir, hub, tomorrow } = await open()
    try {
      const { batch } = await hub.quickAddMany(THREE)
      const a = files(dir).find((n) => (JSON.parse(readFileSync(join(dir, 'requests', n), 'utf8')) as { title: string }).title === 'A')!
      const before = (await hub.service!.folder.recordView(`requests/${a}`))!
      await hub.edit([recordEdit(`requests/${a}`, before, { ...before, title: 'A zmieniona' })!])
      expect(await hub.quickUndo(batch)).toEqual({ ok: true, error: null, undone: 0, kept: 3 })
      const day = dayFileFrom((await hub.dayFiles([tomorrow]))[tomorrow], tomorrow)
      expect(day.blocks).toHaveLength(3)
      for (const x of read(dir)) expect(day.blocks.map((b) => b.id)).toContain(x.block)
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('wszystkie wpisy cofnięcia odmówione – lista wraca do ponownego „Cofnij”; pytanie kolejki – „asked”, lista zużyta', async () => {
    const { dir, hub, tomorrow } = await open()
    try {
      const { batch } = await hub.quickAddMany(THREE)
      const real = hub.edit.bind(hub)
      vi.spyOn(hub, 'edit').mockImplementation(async (entries) => entries.map(() => ({ status: 'broken' as const })))
      expect(await hub.quickUndo(batch)).toMatchObject({ ok: false, error: 'Nie cofnięto – spróbuj jeszcze raz.' })
      vi.mocked(hub.edit).mockImplementation(real)
      expect(await hub.quickUndo(batch)).toEqual({ ok: true, error: null, undone: 3, kept: 0 })
      expect(files(dir)).toEqual([])
      expect((await hub.dayFiles([tomorrow]))[tomorrow]?.blocks ?? []).toEqual([])

      const second = (await hub.quickAddMany(THREE)).batch
      vi.mocked(hub.edit).mockImplementation(async (entries) => (await real(entries)).map((o, i) => (i === 0 ? { status: 'changedElsewhere' as const } : o)))
      expect(await hub.quickUndo(second)).toMatchObject({ ok: true, error: null, asked: true })
      // Spent: the answer decides, a second „Cofnij” has nothing to take.
      expect(await hub.quickUndo(second)).toMatchObject({ ok: false, error: 'Tego zapisu nie da się już cofnąć.' })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })
})
