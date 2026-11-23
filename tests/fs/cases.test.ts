/**
 * „Sprawy” in the data folder (OPS2: D383, D384, D385, D402): the files of requests from before „Sprawy” read as sprawy
 * on a copy of a folder, nothing written to them by opening it, an older version's edit keeping the new fields; the
 * quick capture into „Skrzynka”; a task put on the axis at 10:00 – a block of 30 min „Inne” and the task „zaplanowane”;
 * the end of its block – one question „Zadanie zrobione?” on two computers, answered on one – gone on both; the ritual.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { casePlan, caseItems, listedRaw, listOf, scheduledOf, taskQuestionId, type CasePlan } from '@shared/engine/cases'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { dayFileFrom } from '@shared/model/plan'
import { requestFrom, TITLE_MAX, type RequestRecord } from '@shared/model/requests'
import { logicalDayOf, placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { DataHub } from '../../src/main/data/hub'
import { WidgetEngine } from '../../src/main/widget'

/** A planning that is no refusal (the cases here never are). */
const planOk = (i: Parameters<typeof casePlan>[0]): CasePlan | null => casePlan(i) as CasePlan | null

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-cases-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/**
 * The folder moved away (or back) as Explorer or OneDrive would. On Windows a folder with a file held open in it – the
 * antivirus scanning the log just written, the service's own check under way – cannot be renamed (EPERM) until the file is
 * let go: tried again until it is, as the user would.
 */
async function moveFolder(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to)
      return
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (attempt >= 200 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e
      await new Promise((r) => setTimeout(r, 50))
    }
  }
}

const rules = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]))

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

/** A folder as 1.12 left it: rd.json, the requests in their four states, the day with the block of the planned one. */
function folderOf112(dir: string, today: string): Record<string, string> {
  const files: Record<string, unknown> = {
    'rd.json': { schema: 1, people: [{ id: 'mama', name: 'Mama', archived: false }] },
    'requests/q1.json': { schema: 1, id: 'q1', person: 'mama', estimateMin: 20, note: 'zakupy', createdAt: 1, state: 'queued', day: null, block: null, extra: 'pole nowszej wersji' },
    'requests/p1.json': { schema: 1, id: 'p1', person: 'mama', estimateMin: null, note: 'apteka', createdAt: 2, state: 'planned', day: today, block: 'rb' },
    'requests/p2.json': { schema: 1, id: 'p2', person: null, estimateMin: 30, note: 'poczta', createdAt: 3, state: 'planned', day: '2026-01-05', block: 'old' },
    'requests/d1.json': { schema: 1, id: 'd1', person: 'mama', estimateMin: 10, note: 'kot', createdAt: 4, state: 'done', day: '2026-01-05', block: 'old' },
    'requests/x1.json': { schema: 1, id: 'x1', person: null, estimateMin: null, note: 'nie wyszło', createdAt: 5, state: 'dropped', day: null, block: null },
    [paths.day(today)]: { schema: 1, date: today, blocks: [{ id: 'rb', categoryId: 'prosby', startMin: 17 * 60, durationMin: 20, origin: 'user', requests: ['p1'] }] }
  }
  const text: Record<string, string> = {}
  for (const [rel, v] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    text[rel] = JSON.stringify(v)
    writeFileSync(abs, text[rel])
  }
  return text
}

describe('migracja próśb (D402, T750) – na kopii folderu', () => {
  it('pliki próśb sprzed wersji czytają się jako sprawy bez utraty danych; otwarcie niczego w nich nie zapisuje', async () => {
    const today = logicalDayOf(Date.now())
    const original = join(root, 'stary')
    const text = folderOf112(original, today)
    const copy = join(root, 'kopia')
    cpSync(original, copy, { recursive: true })
    const hub = hubFor()
    try {
      expect(await hub.open(copy)).toBe(true)
      const view = await hub.view()
      const records = view.requests.map(requestFrom).filter((r): r is RequestRecord => !!r)
      const byId = Object.fromEntries(records.map((r) => [r.id, r]))
      expect(Object.keys(byId).sort()).toEqual(['d1', 'p1', 'p2', 'q1', 'x1'])
      // Every field of 1.12 is there, as it was.
      expect(byId.q1).toMatchObject({ kind: 'request', person: 'mama', estimateMin: 20, note: 'zakupy', state: 'queued' })
      expect(view.requests.find((r) => r.id === 'q1')).toMatchObject({ extra: 'pole nowszej wersji' })
      const files = await hub.dayFiles([today])
      const items = caseItems(records, today, (d) => (d === today ? dayFileFrom(files[today], today) : undefined))
      const of = (id: string) => items.find((x) => x.record.id === id)!
      expect([of('q1').list, of('p1').list, of('p2').list, of('d1').list, of('x1').list]).toEqual(['inbox', 'today', 'week', 'done', 'done'])
      expect(of('p1').scheduled).toEqual({ day: today, block: 'rb', startMin: 17 * 60, known: true })
      expect(of('x1').record.state).toBe('dropped')
      await hub.service!.folder.check()
      // Opening and a check of the folder wrote nothing into the files of requests (no migration in place).
      for (const rel of Object.keys(text).filter((r) => r.startsWith('requests/'))) expect(readFileSync(join(copy, rel), 'utf8')).toBe(text[rel])
      expect(readdirSync(join(copy, 'requests')).sort()).toEqual(['d1.json', 'p1.json', 'p2.json', 'q1.json', 'x1.json'])

      // The new version moves one to „Kiedyś / Może”: the file keeps every field it had; then an older version's „Zrobiona”
      // (the field `state` only, as 1.12 edits) – done, the new fields still there.
      const rel = paths.record('request', 'q1')
      const before = view.requests.find((r) => r.id === 'q1')!
      await hub.edit([recordEdit(rel, before, listedRaw(before, 'someday', Date.now()))!])
      const after = JSON.parse(readFileSync(join(copy, rel), 'utf8')) as Record<string, unknown>
      expect(after).toMatchObject({ id: 'q1', person: 'mama', estimateMin: 20, note: 'zakupy', extra: 'pole nowszej wersji', kind: 'request', list: 'someday', state: 'queued' })
      await hub.edit([recordEdit(rel, after, { ...after, state: 'done' })!])
      const older = JSON.parse(readFileSync(join(copy, rel), 'utf8')) as Record<string, unknown>
      expect(older).toMatchObject({ list: 'someday', kind: 'request', extra: 'pole nowszej wersji', state: 'done' })
      expect(listOf(requestFrom(older)!, today)).toBe('done')
    } finally {
      await hub.close('quit')
    }
    // The original folder untouched.
    for (const [rel, t] of Object.entries(text)) expect(readFileSync(join(original, rel), 'utf8')).toBe(t)
  })
})

describe('szybki zapis i zadanie na osi (D385, D384)', () => {
  it('Win+Alt+N / „+”: zadanie własne w „Skrzynce”; bez tytułu – nic', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.quickAdd('x')).toMatchObject({ ok: false })
      expect(await hub.open(dir)).toBe(true)
      expect(await hub.quickAdd('   ')).toEqual({ ok: false, error: 'Wpisz, co zapisać.', id: null, title: null })
      const r = await hub.quickAdd('  Zamówić karmę dla kota ')
      expect(r).toMatchObject({ ok: true, error: null, title: 'Zamówić karmę dla kota' })
      const file = JSON.parse(readFileSync(join(dir, paths.record('request', r.id!)), 'utf8')) as Record<string, unknown>
      expect(file).toMatchObject({ kind: 'task', title: 'Zamówić karmę dla kota', list: 'inbox', estimateMin: 30, categoryId: 'inne', state: 'queued', person: null })
      expect(listOf(requestFrom(file)!, logicalDayOf(Date.now()))).toBe('inbox')
    } finally {
      await hub.close('quit')
    }
  })

  it('wynik szybkiego zapisu niesie tytuł faktycznie zapisany (złączone białe znaki, TITLE_MAX), nie wpisany', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const r = await hub.quickAdd('Kup   mleko	  i chleb')
      const file = JSON.parse(readFileSync(join(dir, paths.record('request', r.id!)), 'utf8')) as Record<string, unknown>
      expect(file.title).toBe('Kup mleko i chleb')
      expect(r.title).toBe('Kup mleko i chleb')
      const long = await hub.quickAdd('a'.repeat(TITLE_MAX + 50))
      expect(long.title).toBe('a'.repeat(TITLE_MAX))
    } finally {
      await hub.close('quit')
    }
  })

  it('słowa daty na końcu tytułu (D409): „!jutro” – termin, „@dziś” – data wykonania, znikają z tytułu; same słowa – nic', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const today = logicalDayOf(Date.now())
      const r = await hub.quickAdd('Zapłacić czynsz !jutro @dziś')
      expect(r).toMatchObject({ ok: true, error: null, title: 'Zapłacić czynsz' })
      const file = JSON.parse(readFileSync(join(dir, paths.record('request', r.id!)), 'utf8')) as Record<string, unknown>
      expect(file).toMatchObject({ kind: 'task', title: 'Zapłacić czynsz', list: 'inbox', dueDate: addDays(today, 1), doDate: today })
      // The date of doing is today: on „Dziś” at once – counted, the file says „Skrzynka” (D451).
      expect(listOf(requestFrom(file)!, today)).toBe('today')
      // An unknown word stays in the title.
      const kept = await hub.quickAdd('Kup mleko !coś')
      expect(JSON.parse(readFileSync(join(dir, paths.record('request', kept.id!)), 'utf8'))).toMatchObject({ title: 'Kup mleko !coś', dueDate: null, doDate: null })
      expect(await hub.quickAdd('!jutro')).toEqual({ ok: false, error: 'Wpisz, co zapisać.', id: null, title: null })
    } finally {
      await hub.close('quit')
    }
  })

  it('podgląd słów daty liczy „dziś” z zegara procesu głównego – tego samego, którego używa zapis (D454)', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      // No folder: the clock of the window's own computer.
      expect(hub.quickToday()).toBe(logicalDayOf(Date.now()))
      expect(await hub.open(dir)).toBe(true)
      // The folder's clock a few days ahead (not the window's Date.now()): the day the preview counts from, and the one the save uses.
      const ahead = placeLogical(addDays(logicalDayOf(Date.now()), 3), 10 * 60)
      vi.spyOn(hub.service!.folder.clock, 'now').mockReturnValue(ahead)
      const today = logicalDayOf(ahead)
      expect(hub.quickToday()).toBe(today)
      const r = await hub.quickAdd('Zapłacić !jutro')
      const file = JSON.parse(readFileSync(join(dir, paths.record('request', r.id!)), 'utf8')) as Record<string, unknown>
      expect(file.dueDate).toBe(addDays(today, 1))
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('szybki zapis „Raport @jutro 15:00 1h #anal” (D600–D602): szacunek 60, podkategoria Analiza i blok 15:00–16:00 na osi jutra w tej samej edycji', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const today = logicalDayOf(Date.now())
      const tomorrow = addDays(today, 1)
      expect(await hub.quickCategories()).toEqual(expect.arrayContaining([{ id: 'analiza', name: 'Analiza' }, { id: 'inne', name: 'Inne obowiązki' }]))
      const r = await hub.quickAdd('Raport @jutro 15:00 1h #anal')
      expect(r).toMatchObject({ ok: true, error: null, title: 'Raport', placed: 'jutro 15:00' })
      expect(r).not.toHaveProperty('notPlaced')
      const file = JSON.parse(readFileSync(join(dir, paths.record('request', r.id!)), 'utf8')) as Record<string, unknown>
      expect(file).toMatchObject({ kind: 'task', title: 'Raport', estimateMin: 60, categoryId: 'analiza', doDate: tomorrow, day: tomorrow })
      expect(file.block).toEqual(expect.any(String))
      const day = dayFileFrom((await hub.dayFiles([tomorrow]))[tomorrow], tomorrow)
      expect(day.blocks).toEqual([expect.objectContaining({ id: file.block, categoryId: 'analiza', startMin: 900, durationMin: 60, fixed: false, task: r.id })])
      // „Zaplanowane”: the lists count it so (its block stands in its day).
      const rec = requestFrom(file)!
      expect(scheduledOf(rec, (d) => (d === tomorrow ? day : undefined))).toMatchObject({ day: tomorrow, known: true })
    } finally {
      await hub.close('quit')
    }
  })

  it('szybki zapis: samo „@15:00” = dziś o 15:00; długość bez godziny – tylko szacunek, bez bloku; „#xyz” zostaje w tytule', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const today = logicalDayOf(Date.now())
      // 10:00 by the folder's clock – the hour 15:00 of today has not passed whatever the time of the run (D603).
      vi.spyOn(hub.service!.folder.clock, 'now').mockReturnValue(placeLogical(today, 10 * 60))
      const now = await hub.quickAdd('Telefon @15:00 30m')
      expect(now).toMatchObject({ ok: true, title: 'Telefon', placed: 'dziś 15:00' })
      const nowFile = JSON.parse(readFileSync(join(dir, paths.record('request', now.id!)), 'utf8')) as Record<string, unknown>
      expect(nowFile).toMatchObject({ estimateMin: 30, doDate: today, day: today })
      expect(dayFileFrom((await hub.dayFiles([today]))[today], today).blocks).toEqual([expect.objectContaining({ id: nowFile.block, startMin: 900, durationMin: 30, task: now.id })])

      const long = await hub.quickAdd('Raport #xyz 1h30')
      expect(long).toMatchObject({ ok: true, title: 'Raport #xyz' })
      expect(long).not.toHaveProperty('placed')
      expect(JSON.parse(readFileSync(join(dir, paths.record('request', long.id!)), 'utf8'))).toMatchObject({ title: 'Raport #xyz', estimateMin: 90, categoryId: 'inne', day: null, block: null, doDate: null })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('szybki zapis „@jutro 15:00”, gdy pliku dnia nie da się odczytać: sprawa zapisana z datą, bez bloku, wynik mówi dlaczego; plik dnia nietknięty', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const tomorrow = addDays(logicalDayOf(Date.now()), 1)
      const broken = join(dir, paths.day(tomorrow))
      mkdirSync(join(broken, '..'), { recursive: true })
      writeFileSync(broken, '{ not json')
      const r = await hub.quickAdd('Raport @jutro 15:00 1h')
      expect(r).toMatchObject({ ok: true, title: 'Raport', notPlaced: 'pliku dnia nie da się teraz odczytać' })
      expect(r).not.toHaveProperty('placed')
      expect(JSON.parse(readFileSync(join(dir, paths.record('request', r.id!)), 'utf8'))).toMatchObject({ title: 'Raport', estimateMin: 60, doDate: tomorrow, day: null, block: null })
      expect(readFileSync(broken, 'utf8')).toBe('{ not json')
    } finally {
      await hub.close('quit')
    }
  })

  it('szybki zapis z godziną na dzień miniony: sprawa z datą, bez bloku – „ten dzień już minął”', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const r = await hub.quickAdd('Raport @2020-01-05 15:00')
      expect(r).toMatchObject({ ok: true, title: 'Raport', notPlaced: 'ten dzień już minął' })
      expect(JSON.parse(readFileSync(join(dir, paths.record('request', r.id!)), 'utf8'))).toMatchObject({ doDate: '2020-01-05', day: null, block: null })
    } finally {
      await hub.close('quit')
    }
  })

  it('szybki zapis „@HH:MM” dziś z godziną już minioną (D603): sprawa z datą, bez bloku – „ta godzina już minęła”; bieżąca minuta jeszcze stoi', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const today = logicalDayOf(Date.now())
      vi.spyOn(hub.service!.folder.clock, 'now').mockReturnValue(placeLogical(today, 16 * 60))
      const late = await hub.quickAdd('Raport @15:00')
      expect(late).toMatchObject({ ok: true, title: 'Raport', notPlaced: 'ta godzina już minęła' })
      expect(late).not.toHaveProperty('placed')
      expect(JSON.parse(readFileSync(join(dir, paths.record('request', late.id!)), 'utf8'))).toMatchObject({ doDate: today, day: null, block: null })
      // The minute that is now still stands.
      expect(await hub.quickAdd('Raport @16:00')).toMatchObject({ ok: true, placed: 'dziś 16:00' })
      // Tomorrow's 15:00 is no „past”, whatever the hour of today.
      expect(await hub.quickAdd('Raport @jutro 15:00')).toMatchObject({ ok: true, placed: 'jutro 15:00' })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('zegar szybkiego zapisu (T869, D604): dzień i minuta logiczna z jednej chwili zegara folderu – podgląd liczy z nich, nie z zegara okna', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const today = logicalDayOf(Date.now())
      const clock = vi.spyOn(hub.service!.folder.clock, 'now')
      clock.mockReturnValue(placeLogical(today, 1530))
      expect(hub.quickClock()).toEqual({ today, nowMin: 1530 })
      clock.mockReturnValue(placeLogical(today, 10 * 60 + 5))
      expect(hub.quickClock()).toEqual({ today, nowMin: 605 })
      // Past 04:00 of the next day it is that day's minute, never the night minute 1685.
      clock.mockReturnValue(placeLogical(addDays(today, 1), 4 * 60 + 5))
      expect(hub.quickClock()).toEqual({ today: addDays(today, 1), nowMin: 245 })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('szybki zapis bez godziny, gdy kolejka pyta o rekord sprawy: ok:true i „asked” (każdy wpis, nie tylko plik dnia), jedna sprawa', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const real = hub.edit.bind(hub)
      vi.spyOn(hub, 'edit').mockImplementation(async (entries) => (await real(entries)).map((o, i) => (i === 0 ? { status: 'conflict' as const, fields: [] } : o)))
      const r = await hub.quickAdd('Zadzwonić do mamy')
      expect(r).toMatchObject({ ok: true, error: null, title: 'Zadzwonić do mamy', asked: true })
      expect(readdirSync(join(dir, 'requests')).filter((n) => n.endsWith('.json'))).toEqual([`${r.id}.json`])
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('szybki zapis „@15:00” w nocy po dacie (D604): godzina od 04:00 to następny dzień logiczny, godzina przed 04:00 – ta noc, już miniona – „ta godzina już minęła”', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const today = logicalDayOf(Date.now())
      // 01:30 of the night after `today` (logical minute 1530).
      vi.spyOn(hub.service!.folder.clock, 'now').mockReturnValue(placeLogical(today, 1530))
      const day = await hub.quickAdd('Raport @15:00')
      expect(day).toMatchObject({ ok: true, placed: 'jutro 15:00' })
      expect(JSON.parse(readFileSync(join(dir, paths.record('request', day.id!)), 'utf8'))).toMatchObject({ doDate: addDays(today, 1), day: addDays(today, 1) })
      expect(await hub.quickAdd('Raport @02:00')).toMatchObject({ ok: true, placed: 'dziś 02:00 +1' })
      expect(await hub.quickAdd('Raport @01:00')).toMatchObject({ ok: true, notPlaced: 'ta godzina już minęła' })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('szybki zapis z godziną, gdy kolejka pyta o plik dnia (zmiana z innego komputera): ok:true i „asked”, bez „placed”, jedna sprawa – nigdy „spróbuj jeszcze raz”', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const real = hub.edit.bind(hub)
      // The day's file changed on another computer meanwhile: the queue answers its entry with a question (the record behind it waits).
      vi.spyOn(hub, 'edit').mockImplementation(async (entries) => (await real(entries)).map((o, i) => (i === 0 ? { status: 'changedElsewhere' as const } : o)))
      const r = await hub.quickAdd('Raport @jutro 15:00 1h')
      expect(r).toMatchObject({ ok: true, error: null, title: 'Raport', asked: true })
      // Nothing is „put” yet – the answer „ich wersja” takes the sprawa with its block.
      expect(r).not.toHaveProperty('placed')
      expect(r.id).toEqual(expect.any(String))
      const requests = readdirSync(join(dir, 'requests')).filter((n) => n.endsWith('.json'))
      expect(requests).toEqual([`${r.id}.json`])
      // A refusal or a broken file is no save – and says so.
      vi.mocked(hub.edit).mockResolvedValue([{ status: 'broken' }])
      expect(await hub.quickAdd('Drugie')).toMatchObject({ ok: false, error: 'Nie zapisano – spróbuj jeszcze raz.', id: null })
    } finally {
      vi.restoreAllMocks()
      await hub.close('quit')
    }
  })

  it('przeciągnięcie na „Dziś” 10:00 tworzy blok 30 min „Inne”, zadanie „zaplanowane”; blok usunięty – zadanie wraca, „Cofnij” przywraca', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const { id } = await hub.quickAdd('Zadzwonić do ubezpieczyciela')
      const today = logicalDayOf(Date.now())
      const rel = paths.record('request', id!)
      const record = (await hub.service!.folder.recordView(rel))!
      const files = await hub.dayFiles([today])
      const p = planOk({ record, date: today, startMin: 10 * 60, files: { [today]: files[today] ?? null }, rules, at: Date.now(), begun: () => false })!
      // One edit of the queue: the day's file and the record.
      const out = await hub.edit([recordEdit(paths.day(today), files[today] ?? null, p.days[today]!)!, recordEdit(rel, record, p.record)!])
      expect(out.every((o) => o.status === 'applied')).toBe(true)
      const day = dayFileFrom((await hub.dayFiles([today]))[today], today)
      expect(day.blocks).toEqual([expect.objectContaining({ id: p.block.id, categoryId: 'inne', startMin: 600, durationMin: 30, fixed: false, task: id, costs: null })])
      const task = requestFrom((await hub.service!.folder.recordView(rel))!)!
      expect(scheduledOf(task, () => day)).toEqual({ day: today, block: p.block.id, startMin: 600, known: true })
      // The block removed (the window's „Usuń”: out of the file): no longer planned – no write of the task.
      const planned = (await hub.dayFiles([today]))[today]!
      const removed = { ...planned, blocks: [] }
      await hub.edit([recordEdit(paths.day(today), planned, removed)!])
      const gone = dayFileFrom((await hub.dayFiles([today]))[today], today)
      expect(scheduledOf(task, () => gone)).toBeNull()
      expect(requestFrom((await hub.service!.folder.recordView(rel))!)).toMatchObject({ day: today, block: p.block.id })
      // „Cofnij” of the removal: the block back – „zaplanowane” again.
      await hub.edit([recordEdit(paths.day(today), removed, planned)!])
      expect(scheduledOf(task, () => dayFileFrom(planned, today))).toMatchObject({ startMin: 600 })
    } finally {
      await hub.close('quit')
    }
  })
})

describe('„Zadanie zrobione?” na dwóch komputerach (D384, T754)', () => {
  const DAY = '2026-10-21'
  async function computer(dataDir: string, id: string, clock: { now: number }) {
    const folder = await DataFolder.open({ fs: nodeFs, dataDir, stateDir: join(root, `state-${id}`), computer: id, computerName: id.toUpperCase(), appVersion: '1.13.0', clock: { wall: () => clock.now, mono: () => clock.now }, holidays: marketDay, oneDriveRunning: () => true })
    const w = new WidgetEngine({
      folder: () => folder,
      timer: async (c) => {
        const r = await folder.timerClick(c as never)
        return { ok: r.ok, why: r.ok ? null : r.why, confirm: r.confirm }
      },
      edit: async (entries) => (await folder.edit(entries.map((e) => ({ ...e, edits: e.edits.map((x) => ({ ...x, path: x.path.map(String) })) })))).map((o) => ({ status: o.status })),
      answer: async () => ({ ok: true, why: null, confirm: null }),
      seen: async () => 0,
      clickedApp: () => undefined,
      modePrefs: () => ({ sessionMode: true, classMode: true }),
      notices: () => ({ start5: true, hardEnd: true, reserve: true, reminders: true }),
      notify: () => true,
      showMain: () => undefined,
      emit: () => undefined,
      log: () => undefined,
      now: () => clock.now,
      mono: () => clock.now
    })
    return { folder, w }
  }

  it('koniec bloku daje jedno pytanie w pasku obu komputerów; odpowiedź na jednym – znika na obu, zadanie w „Zrobione”; bez odpowiedzi – w rytuale', async () => {
    const dataDir = join(root, 'data')
    mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
    mkdirSync(join(dataDir, 'requests'), { recursive: true })
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'tb', categoryId: 'inne', startMin: 10 * 60, durationMin: 30, fixed: false, origin: 'user', task: 't1' }] }))
    writeFileSync(join(dataDir, paths.record('request', 't1')), JSON.stringify({ schema: 1, id: 't1', kind: 'task', title: 'Zadzwonić', estimateMin: 30, categoryId: 'inne', note: '', createdAt: 1, state: 'planned', day: DAY, block: 'tb', list: 'today', listDay: DAY, doneAt: null }))
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const a = await computer(dataDir, 'pca', clock)
    const b = await computer(dataDir, 'pcb', clock)
    expect((await a.folder.timerClick({ a: 'start', block: 'tb', day: DAY } as never)).ok).toBe(true)
    clock.now = placeLogical(DAY, 10 * 60 + 30)
    expect((await a.folder.timerClick({ a: 'next', day: DAY } as never)).ok).toBe(true)
    await a.folder.log.flush()
    clock.now = placeLogical(DAY, 10 * 60 + 32)
    const id = taskQuestionId(DAY, 'tb')
    const taskLines = (w: WidgetEngine) => w.current().lines.filter((l) => l.id.startsWith('task:'))
    await a.w.refresh()
    await b.w.refresh()
    expect(taskLines(a.w)).toEqual([expect.objectContaining({ id, text: 'Zadanie zrobione? „Zadzwonić”', dot: false })])
    expect(taskLines(b.w)).toEqual([expect.objectContaining({ id })])
    // Not answered: the ritual of the day has it.
    expect((await b.folder.casesRitual(DAY)).questions).toEqual([expect.objectContaining({ id, task: 't1' })])
    await a.w.act('line', `${id}|done`, 'bar')
    const answeredAt = clock.now
    await a.w.refresh()
    expect(taskLines(a.w)).toEqual([])
    expect(requestFrom(JSON.parse(readFileSync(join(dataDir, paths.record('request', 't1')), 'utf8')))).toMatchObject({ state: 'done', list: 'done', doneAt: answeredAt })
    // The other computer's list of sprawy is at most a minute old (`LIST_TRUST_MS`): its line clicked meanwhile writes
    // nothing over the answer – the record is read again – and says so.
    clock.now += 20_000
    await b.w.refresh()
    await b.w.act('line', `${id}|back`, 'bar')
    expect(b.w.current().note?.text).toBe('To pytanie ma już odpowiedź.')
    expect(requestFrom(JSON.parse(readFileSync(join(dataDir, paths.record('request', 't1')), 'utf8')))).toMatchObject({ state: 'done', list: 'done', block: 'tb' })
    clock.now += 61_000
    await b.w.refresh()
    expect(taskLines(b.w)).toEqual([])
    expect((await b.folder.casesRitual(DAY)).questions).toEqual([])
    await a.folder.close('quit')
    await b.folder.close('quit')
  })

  it('rytuał spraw: odpowiedź na pytanie (rekord) – pytanie znika (T762, bez pamięci – T771)', async () => {
    const dataDir = join(root, 'data')
    mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
    mkdirSync(join(dataDir, 'requests'), { recursive: true })
    writeFileSync(join(dataDir, paths.day(DAY)), JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'tb', categoryId: 'inne', startMin: 10 * 60, durationMin: 30, fixed: false, origin: 'user', task: 't1' }] }))
    const rel = paths.record('request', 't1')
    writeFileSync(join(dataDir, rel), JSON.stringify({ schema: 1, id: 't1', kind: 'task', title: 'Zadzwonić', estimateMin: 30, categoryId: 'inne', note: '', createdAt: 1, state: 'planned', day: DAY, block: 'tb', list: 'today', listDay: DAY, doneAt: null }))
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const a = await computer(dataDir, 'pca', clock)
    expect((await a.folder.timerClick({ a: 'start', block: 'tb', day: DAY } as never)).ok).toBe(true)
    clock.now = placeLogical(DAY, 10 * 60 + 30)
    expect((await a.folder.timerClick({ a: 'next', day: DAY } as never)).ok).toBe(true)
    await a.folder.log.flush()
    clock.now = placeLogical(DAY, 20 * 60)
    expect((await a.folder.casesRitual(DAY)).questions.map((q) => q.task)).toEqual(['t1'])
    // The task answered (its record): counted again, the question gone.
    const before = (await a.folder.recordView(rel))!
    await a.folder.edit([{ ...recordEdit(rel, before, { ...before, state: 'done', list: 'done', doneAt: clock.now })!, edits: recordEdit(rel, before, { ...before, state: 'done', list: 'done', doneAt: clock.now })!.edits.map((x) => ({ ...x, path: x.path.map(String) })) }])
    clock.now += 61_000
    expect((await a.folder.casesRitual(DAY)).questions).toEqual([])
    await a.folder.close('quit')
  })

  it('pamięć rytuału spraw: plik dnia zmieniony na dysku i notatka sprawy zmieniona – liczone od nowa (T766)', async () => {
    const dataDir = join(root, 'data')
    mkdirSync(join(dataDir, 'days', '2026'), { recursive: true })
    mkdirSync(join(dataDir, 'requests'), { recursive: true })
    const dayFile = join(dataDir, paths.day(DAY))
    writeFileSync(dayFile, JSON.stringify({ schema: 1, date: DAY, blocks: [{ id: 'tb', categoryId: 'inne', startMin: 10 * 60, durationMin: 30, fixed: false, origin: 'user', task: 't1' }] }))
    writeFileSync(join(dataDir, paths.record('request', 't1')), JSON.stringify({ schema: 1, id: 't1', kind: 'task', title: 'Zadzwonić', estimateMin: 30, categoryId: 'inne', note: '', createdAt: 1, state: 'planned', day: DAY, block: 'tb', list: 'inbox', listDay: null, doneAt: null }))
    const rRel = paths.record('request', 'r1')
    writeFileSync(join(dataDir, rRel), JSON.stringify({ schema: 1, id: 'r1', kind: 'request', person: null, note: 'stara', estimateMin: 15, createdAt: 2, state: 'queued', list: 'today', listDay: DAY, day: null, block: null, doneAt: null }))
    const clock = { now: placeLogical(DAY, 10 * 60) }
    const a = await computer(dataDir, 'pca', clock)
    expect((await a.folder.timerClick({ a: 'start', block: 'tb', day: DAY } as never)).ok).toBe(true)
    clock.now = placeLogical(DAY, 10 * 60 + 30)
    expect((await a.folder.timerClick({ a: 'next', day: DAY } as never)).ok).toBe(true)
    await a.folder.log.flush()
    clock.now = placeLogical(DAY, 20 * 60)
    expect((await a.folder.casesRitual(DAY)).questions.map((q) => q.task)).toEqual(['t1'])
    // Another computer took the block out of the day (the file on the disk): no question any more.
    writeFileSync(dayFile, JSON.stringify({ schema: 1, date: DAY, blocks: [], updatedAt: 1 }))
    clock.now += 61_000
    expect((await a.folder.casesRitual(DAY)).questions).toEqual([])
    // The note of a sprawa of „Dziś” changed: the ritual names it anew.
    const before = (await a.folder.recordView(rRel))!
    const e = recordEdit(rRel, before, { ...before, note: 'nowa' })!
    await a.folder.edit([{ ...e, edits: e.edits.map((x) => ({ ...x, path: x.path.map(String) })) }])
    clock.now += 61_000
    expect((await a.folder.casesRitual(DAY)).back.map((r) => r.note)).toEqual(['nowa'])
    await a.folder.close('quit')
  })
})

describe('dni „Spraw” (T768)', () => {
  it('ponad limit dni: najpierw dziś i przyszłe, potem od najnowszych minionych; minione z pamięci, póki log się nie zmienił', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const today = logicalDayOf(Date.now())
      const past = Array.from({ length: 70 }, (_, i) => addDays(today, -(i + 1)))
      const coming = [today, addDays(today, 1), addDays(today, 30)]
      const out = await hub.caseDays([...past, ...coming].sort())
      expect(Object.keys(out.gone)).toHaveLength(62)
      for (const d of coming) expect(out.gone).toHaveProperty(d)
      expect(out.gone).toHaveProperty(past[0]!)
      expect(out.gone).not.toHaveProperty(past[69]!)
      // Asked again with nothing changed: no day gone by folded again (today and later – every time).
      const folds = hub.caseDayFolds
      await hub.caseDays([...past, ...coming].sort())
      expect(hub.caseDayFolds - folds).toBe(coming.length)
      // A new event in a day gone by: that day only, again.
      hub.service!.folder.append({ day: past[0]!, dom: 'meta', k: 'observe.alive', at: placeLogical(past[0]!, 600) })
      await hub.service!.folder.log.flush()
      const again = hub.caseDayFolds
      await hub.caseDays([...past, ...coming].sort())
      expect(hub.caseDayFolds - again).toBe(coming.length + 1)
    } finally {
      await hub.close('quit')
    }
  })
})

describe('dni „Spraw” – pamięć i folder chwilowo niedostępny (T773)', () => {
  it('pamięć dni minionych nie znika, gdy ktoś zapyta o inne dni (zaplanowanie, plan poranny)', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      const today = logicalDayOf(Date.now())
      const past = [addDays(today, -3), addDays(today, -2)]
      await hub.caseDays(past)
      await hub.caseDays([today])
      const folds = hub.caseDayFolds
      await hub.caseDays(past)
      expect(hub.caseDayFolds - folds).toBe(0)
    } finally {
      await hub.close('quit')
    }
  })

  it('folder chwilowo niedostępny, dzień znany (`away`): jego bloki zaczęte i odeszłe są (jak `dayUsable`)', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const day = addDays(logicalDayOf(Date.now()), 1)
    mkdirSync(join(dir, 'days', day.slice(0, 4)), { recursive: true })
    writeFileSync(join(dir, paths.day(day)), JSON.stringify({ schema: 1, date: day, blocks: [{ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'user', task: 't1' }] }))
    const hub = hubFor()
    try {
      expect(await hub.open(dir)).toBe(true)
      hub.service!.folder.append({ day, dom: 'meta', k: 'observe.alive', at: Date.now() })
      await hub.service!.folder.log.flush()
      expect((await hub.caseDays([day])).begun).toEqual({ [day]: [] })
      await moveFolder(dir, `${dir}-ukryty`)
      try {
        expect((await hub.service!.folder.readDay(day)).away).toBe(true)
        const out = await hub.caseDays([day])
        expect(out.begun).toEqual({ [day]: [] })
        expect(out.gone).toEqual({ [day]: [] })
      } finally {
        await moveFolder(`${dir}-ukryty`, dir)
      }
    } finally {
      await hub.close('quit')
    }
  })
})

describe('dni „zaplanowane” z niepełnym logiem (T766)', () => {
  it('log dnia niepełny teraz: dzień bez „gone” (nieznany, „zaplanowane” jak w pliku), nigdy „usunięty”', async () => {
    const dir = join(root, 'data')
    mkdirSync(dir, { recursive: true })
    await DataHub.createFirst(dir, [{ rel: 'rd.json', value: { schema: 1 } }], 'pca', 0)
    const day = '2099-03-02'
    mkdirSync(join(dir, 'days', '2099'), { recursive: true })
    writeFileSync(join(dir, paths.day(day)), JSON.stringify({ schema: 1, date: day, blocks: [{ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'user', task: 't1' }] }))
    let broken = false
    const hub = new DataHub({
      ...(hubFor() as unknown as { o: ConstructorParameters<typeof DataHub>[0] }).o,
      start: async (o) => (await import('../../src/main/data/service')).DataService.start({ ...o, fs: { ...nodeFs, list: (abs) => (broken && abs.includes(day) && abs.includes('log') ? Promise.reject(new Error('EIO')) : nodeFs.list(abs)) } })
    })
    try {
      expect(await hub.open(dir)).toBe(true)
      expect((await hub.caseDays([day])).gone).toEqual({ [day]: [] })
      broken = true
      const out = await hub.caseDays([day])
      expect(out.gone).toEqual({})
      expect(Object.keys(out.files)).toEqual([day])
    } finally {
      await hub.close('quit')
    }
  })
})
