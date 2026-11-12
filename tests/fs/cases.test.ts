/**
 * „Sprawy” in the data folder (OPS2: D383, D384, D385, D402): the files of requests from before „Sprawy” read as sprawy
 * on a copy of a folder, nothing written to them by opening it, an older version's edit keeping the new fields; the
 * quick capture into „Skrzynka”; a task put on the axis at 10:00 – a block of 30 min „Inne” and the task „zaplanowane”;
 * the end of its block – one question „Zadanie zrobione?” on two computers, answered on one – gone on both; the ritual.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { casePlan, caseItems, listedRaw, listOf, scheduledOf, taskQuestionId } from '@shared/engine/cases'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { dayFileFrom } from '@shared/model/plan'
import { requestFrom, type RequestRecord } from '@shared/model/requests'
import { logicalDayOf, placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { DataHub } from '../../src/main/data/hub'
import { WidgetEngine } from '../../src/main/widget'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-cases-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

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
      expect(await hub.quickAdd('   ')).toEqual({ ok: false, error: 'Wpisz, co zapisać.', id: null })
      const r = await hub.quickAdd('  Zamówić karmę dla kota ')
      expect(r).toMatchObject({ ok: true, error: null })
      const file = JSON.parse(readFileSync(join(dir, paths.record('request', r.id!)), 'utf8')) as Record<string, unknown>
      expect(file).toMatchObject({ kind: 'task', title: 'Zamówić karmę dla kota', list: 'inbox', estimateMin: 30, categoryId: 'inne', state: 'queued', person: null })
      expect(listOf(requestFrom(file)!, logicalDayOf(Date.now()))).toBe('inbox')
    } finally {
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
      const p = casePlan({ record, date: today, startMin: 10 * 60, files: { [today]: files[today] ?? null }, rules, at: Date.now(), begun: () => false })!
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
      notices: () => ({ start5: true, hardEnd: true, reserve: true }),
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

  it('rytuał spraw liczy dzień raz na zmianę danych (T762): to samo wywołanie co minutę – z pamięci; zmiana sprawy – od nowa', async () => {
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
    const first = await a.folder.casesRitual(DAY)
    expect(first.questions.map((q) => q.task)).toEqual(['t1'])
    const runs = a.folder.casesRitualRuns
    clock.now += 60_000
    expect(await a.folder.casesRitual(DAY)).toBe(first)
    expect(a.folder.casesRitualRuns).toBe(runs)
    // The task answered (its record): counted again, the question gone.
    const before = (await a.folder.recordView(rel))!
    await a.folder.edit([{ ...recordEdit(rel, before, { ...before, state: 'done', list: 'done', doneAt: clock.now })!, edits: recordEdit(rel, before, { ...before, state: 'done', list: 'done', doneAt: clock.now })!.edits.map((x) => ({ ...x, path: x.path.map(String) })) }])
    clock.now += 61_000
    expect((await a.folder.casesRitual(DAY)).questions).toEqual([])
    expect(a.folder.casesRitualRuns).toBe(runs + 1)
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
