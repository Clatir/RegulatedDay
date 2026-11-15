/**
 * The move of the layer of sessions into the templates in the data folder (D511, D515): the leader makes it once, before the
 * day, and the day comes from the templates; a second check, a second computer and a day later write nothing more; a day made
 * before the move keeps its sessions of the layer; no day's file nor attachment is touched (the ids stay). The edit is made
 * from one reading of the records and waits, with a line of the check, behind a queued edit of rd.json or a template. A
 * computer that gets rd.json before the templates (OneDrive) makes the day at once with the sessions of the layer as it was,
 * and once the templates come – the same sessions, never twice.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { createDay, dayPlan, sessionBlockId, templateBlockId } from '@shared/engine/createDay'
import { defaultTemplates, SETUP_FROM, templateJson } from '@shared/model/defaults'
import { dayFileFrom, planBlock, templateFrom, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { SESSIONS_CHANGE_ID } from '@shared/model/sessionMigration'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { sessionMoveEdits } from '../../src/main/data/sessionMove'

const DAY = '2026-10-21'
let root: string
let dataDir: string
const write = (rel: string, value: unknown, dir = dataDir) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), JSON.stringify(value, null, 2))
}
const read = (rel: string, dir = dataDir) => JSON.parse(readFileSync(join(dir, rel), 'utf8')) as Record<string, unknown>
const text = (rel: string, dir = dataDir) => readFileSync(join(dir, rel), 'utf8')
/** Every record of the folder as text (what a move would change). */
const records = () => {
  const out: Record<string, string> = { [paths.settings]: text(paths.settings) }
  for (const f of readdirSync(join(dataDir, 'templates'))) out[`templates/${f}`] = text(`templates/${f}`)
  return out
}
/** A folder of a version before D511: the wizard's change, the sessions in the layer of the settings, the default templates. */
const before = (dir: string) => {
  write(paths.settings, { schema: 1, settings: [{ id: 'kreator', from: SETUP_FROM, at: null, made: 1, patch: {} }], people: [] }, dir)
  for (const t of defaultTemplates()) write(paths.record('template', t.id), templateJson(t), dir)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-sessions-'))
  dataDir = join(root, 'data')
  before(dataDir)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function computer(id: string, clock: { now: number }, dir = dataDir) {
  const folder = await DataFolder.open({
    fs: nodeFs,
    dataDir: dir,
    stateDir: join(root, `state-${id}`),
    computer: id,
    computerName: id,
    appVersion: '1.25.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
  // The leader's tasks run once it leads, settled (a few checks a minute apart); the lines of the last check.
  const settle = async (n = 6) => {
    let problems: string[] = []
    for (let i = 0; i < n; i++) {
      clock.now += 60_000
      problems = (await folder.check()).problems
    }
    return problems
  }
  return { folder, settle }
}

/** The ordinary day with an analysis 09:00. */
function withAnalysis(extra: Record<string, unknown> = {}) {
  const t: Template = { ...defaultTemplates().find((x) => x.id === 'zwykly')!, versions: [{ from: SETUP_FROM, blocks: [planBlock({ id: 'an', categoryId: 'analiza', startMin: 9 * 60, durationMin: 60, origin: 'template' })], budgetMin: null, maxMin: null }] }
  write(paths.record('template', 'zwykly'), { ...templateJson(t), ...extra })
}

const sessionsMade = async (f: DataFolder, day: string) => {
  const created = (await f.readDay(day)).events.find((e) => e.k === 'day.create')
  if (!created) return null
  return (created as unknown as { snapshot: { blocks: Array<{ id: string; origin: string; sourceId: string }> } }).snapshot.blocks.filter((b) => b.origin === 'session').map((b) => [b.id, b.sourceId])
}

describe('przeniesienie sesji do szablonów w folderze danych (D511, D515)', () => {
  it('prowadzący przenosi raz, przed utworzeniem dnia; dzień ma sesje z szablonu; drugie sprawdzenie i dzień później – nic', async () => {
    const clock = { now: placeLogical(DAY, 5 * 60) }
    const a = await computer('pca', clock)
    await a.settle()
    const rd = rdFrom(read(paths.settings))
    expect(rd.settings.map((c) => c.id)).toEqual(['kreator', SESSIONS_CHANGE_ID])
    expect(rd.settings[1]!.from).toBe(DAY)
    const zwykly = templateFrom(read(paths.record('template', 'zwykly')))!
    expect([zwykly.versions.map((v) => v.from), zwykly.sessionsMoved]).toEqual([[SETUP_FROM, DAY], DAY])
    expect(zwykly.versions[1]!.blocks.filter((b) => b.session).map((b) => [b.id, b.session!.days.join(' ')])).toEqual([
      ['londyn', 'yes yes yes yes yes no no'],
      ['ny', 'yes yes yes yes yes no no']
    ])
    // No copy: the templates there were and one for the remote „zjazd”, which had none.
    expect(readdirSync(join(dataDir, 'templates')).sort()).toEqual(['sesje-zjazd-zdalny.json', 'sobota.json', 'zwykly.json'])
    expect(a.folder.queue.pending).toEqual([])
    // The day was made after the move: its sessions are the template's (named by it).
    const created = (await a.folder.readDay(DAY)).events.find((e) => e.k === 'day.create')!
    const blocks = (created as unknown as { snapshot: { blocks: Array<{ origin: string; sourceId: string; name: string | null }> } }).snapshot.blocks
    expect(blocks.filter((b) => b.origin === 'session').map((b) => [b.sourceId, b.name])).toEqual([
      ['londyn', 'Sesja Londyn'],
      ['ny', 'Sesja NY']
    ])
    // Again, and a day later: nothing more is written.
    const once = records()
    await a.settle()
    expect(records()).toEqual(once)
    clock.now = placeLogical(addDays(DAY, 1), 5 * 60)
    await a.settle()
    expect(records()).toEqual(once)
  })

  it('dwa komputery: przenosi tylko prowadzący, drugi niczego nie dopisuje – bez kopii konfliktowych i drugiej zmiany', async () => {
    const clock = { now: placeLogical(DAY, 5 * 60) }
    const a = await computer('pca', clock)
    const b = await computer('pcb', clock)
    // Both in use: one of them leads (the latest presence), settled at the latest 10 min after the start.
    for (let i = 0; i < 14; i++) {
      clock.now += 60_000
      a.folder.noteInput(clock.now, true)
      b.folder.noteInput(clock.now, true)
      await a.folder.check()
      await b.folder.check()
    }
    const once = records()
    expect(Object.keys(once).sort()).toEqual([paths.settings, 'templates/sesje-zjazd-zdalny.json', 'templates/sobota.json', 'templates/zwykly.json'].sort())
    expect(rdFrom(read(paths.settings)).settings.filter((c) => c.id === SESSIONS_CHANGE_ID)).toHaveLength(1)
    // The other one leads (the first closed): the move is made – it writes nothing.
    await a.folder.close()
    for (let i = 0; i < 20; i++) {
      clock.now += 60_000
      b.folder.noteInput(clock.now, true)
      await b.folder.check()
    }
    expect(b.folder.leader.iLead).toBe(true)
    expect(records()).toEqual(once)
    expect(b.folder.queue.pending).toEqual([])
  })

  it('dzień przeszły bez zmian: dzień utworzony przed przeniesieniem zostaje z sesjami warstwy ustawień', async () => {
    const clock = { now: placeLogical(DAY, 5 * 60) }
    const yesterday = addDays(DAY, -1)
    const a = await computer('pca', clock)
    // Yesterday was made by the version before (its snapshot in the log): the layer's sessions, without names of their own.
    const inp = { changes: rdFrom(read(paths.settings)).settings, templates: defaultTemplates(), lectures: [], series: [] }
    const snapshot = createDay({ date: yesterday, ...inp, dayFile: null, holidays: marketDay, at: null })
    a.folder.append({ day: yesterday, dom: 'timer', k: 'day.create', snapshot })
    await a.settle()
    expect(rdFrom(read(paths.settings)).settings.some((c) => c.id === SESSIONS_CHANGE_ID)).toBe(true)
    const state = await a.folder.dayState(yesterday)
    expect(state.blocks.filter((b) => b.origin === 'session').map((b) => [b.id, b.sourceId])).toEqual(snapshot.blocks.filter((b) => b.origin === 'session').map((b) => [b.id, b.sourceId]))
    // Its snapshot is the one written before the move – the only one of the day.
    const made = (await a.folder.readDay(yesterday)).events.filter((e) => e.k === 'day.create')
    expect(made).toHaveLength(1)
    expect((made[0] as unknown as { snapshot: unknown }).snapshot).toEqual(JSON.parse(JSON.stringify(snapshot)))
  })

  it('przyszły dzień i jego załącznik zostają nietknięte: te same identyfikatory bloków, Twoja zmiana dnia działa dalej', async () => {
    withAnalysis({ nowePole: 'zostaje' })
    const sat = '2026-10-24'
    const an = templateBlockId(sat, 'zwykly', 'an')
    write(paths.day(sat), { schema: 1, date: sat, dayType: 'zwykly', cancelled: { [an]: true } })
    write(paths.record('attachment', 'z1'), { schema: 1, id: 'z1', owner: { scope: 'day', date: sat, blockId: an }, kind: 'link', name: 'notatki', link: { url: 'https://example.com' }, addedAt: 1, removedAt: null })
    const dayText = text(paths.day(sat))
    const attachmentText = text(paths.record('attachment', 'z1'))
    const a = await computer('pca', { now: placeLogical(DAY, 5 * 60) })
    await a.settle()
    expect(rdFrom(read(paths.settings)).settings.some((c) => c.id === SESSIONS_CHANGE_ID)).toBe(true)
    expect([text(paths.day(sat)), text(paths.record('attachment', 'z1'))]).toEqual([dayText, attachmentText])
    // The template keeps what this version does not read.
    expect(read(paths.record('template', 'zwykly')).nowePole).toBe('zostaje')
    // The day made from the folder as it is now: its analysis is the same block, still cancelled.
    const changes = rdFrom(read(paths.settings)).settings
    const templates = readdirSync(join(dataDir, 'templates')).map((f) => templateFrom(read(`templates/${f}`))!)
    const file = dayFileFrom(read(paths.day(sat)), sat)
    const snap = createDay({ date: sat, changes, templates, lectures: [], series: [], dayFile: file, holidays: marketDay, at: null })
    expect(snap.blocks.some((b) => b.id === an)).toBe(true)
    expect(dayPlan(snap, file).some((b) => b.id === an)).toBe(false)
  })

  it('zapis przeniesienia z jednego odczytu: każda zmiana pola ma za bazę odczytaną wartość; tylko szablony i rd.json, rd.json ostatni', () => {
    withAnalysis()
    const rd = read(paths.settings)
    const zwykly = read(paths.record('template', 'zwykly'))
    const sobota = read(paths.record('template', 'sobota'))
    const entries = sessionMoveEdits({ rd, templates: [zwykly, sobota], today: DAY })!
    expect(entries.map((e) => e.rel)).toEqual([paths.record('template', 'zwykly'), paths.record('template', 'sesje-zjazd-zdalny'), paths.settings])
    const edit = entries[0]!
    expect(edit.edits.every((e) => ['versions', 'sessionsMoved'].includes(e.path[0]!))).toBe(true)
    const at = (path: readonly string[]) => path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), zwykly)
    for (const e of edit.edits) expect(e.base).toEqual(at(e.path))
    // rd.json goes last, after every record of the move; its change keeps the layer and the templates the move wrote.
    const last = entries.at(-1)!
    expect(last.after).toEqual([0, 1])
    expect(JSON.stringify(last.edits)).toContain('"templates":["sesje-zjazd-zdalny","zwykly"]')
  })

  it('edycja rd.json albo szablonu w kolejce (pytanie): przeniesienie czeka z linią sprawdzenia, nie zapisuje nic', async () => {
    const a = await computer('pca', { now: placeLogical(DAY, 5 * 60) })
    const rel = paths.record('template', 'zwykly')
    const raw = read(rel)
    // An edit made from a value changed meanwhile: a question of the queue.
    await a.folder.edit([recordEdit(rel, { ...raw, name: 'Inna nazwa' }, { ...raw, name: 'Nowa nazwa' })!])
    const problems = await a.settle()
    expect(a.folder.queue.pending.length).toBeGreaterThan(0)
    expect(problems).toContain('sesje w szablonach: przeniesienie czeka na zapis rd.json albo szablonu z kolejki')
    expect(rdFrom(read(paths.settings)).settings.some((c) => c.id === SESSIONS_CHANGE_ID)).toBe(false)
    // Till the move is laid the day comes from the layer: its sessions are there.
    expect((await sessionsMade(a.folder, DAY))!.map(([, s]) => s)).toEqual(['londyn', 'ny'])
  })

  it('drugi komputer dostał rd.json po przeniesieniu przed szablonami: dzień od razu z sesjami, po dojściu szablonów – te same, nigdy podwójnie', async () => {
    // The first computer moves (its own folder); the second's folder gets that rd.json first (OneDrive), the templates later.
    const first = await computer('pca', { now: placeLogical(DAY, 5 * 60) })
    await first.settle()
    await first.folder.close()
    const second = join(root, 'drugi')
    before(second)
    write(paths.settings, read(paths.settings), second)
    const clock = { now: placeLogical(DAY, 5 * 60) }
    const b = await computer('pcb', clock, second)
    await b.settle()
    // No waiting: the day is made at once, with the sessions of the layer the move kept.
    const ids = [
      [sessionBlockId(DAY, 'londyn'), 'londyn'],
      [sessionBlockId(DAY, 'ny'), 'ny']
    ]
    expect(await sessionsMade(b.folder, DAY)).toEqual(ids)
    // The templates come: the day keeps them once; the next day – the same sessions from the templates.
    for (const f of readdirSync(join(dataDir, 'templates'))) writeFileSync(join(second, 'templates', f), readFileSync(join(dataDir, 'templates', f)))
    await b.settle(2)
    const state = await b.folder.dayState(DAY)
    expect(state.blocks.filter((x) => x.origin === 'session').map((x) => [x.id, x.sourceId])).toEqual(ids)
    clock.now = placeLogical(addDays(DAY, 1), 5 * 60)
    await b.settle()
    const next = addDays(DAY, 1)
    expect(await sessionsMade(b.folder, next)).toEqual([
      [sessionBlockId(next, 'londyn'), 'londyn'],
      [sessionBlockId(next, 'ny'), 'ny']
    ])
    // Nothing written by the second computer: the move was the first's.
    expect(rdFrom(read(paths.settings, second)).settings.filter((c) => c.id === SESSIONS_CHANGE_ID)).toHaveLength(1)
    await b.folder.close()
  })
  it('wersja szablonu z widoku sprzed przeniesienia (bez znacznika) dochodzi później: dzień ma sesje, prowadzący daje jej wpisy przed dniem', async () => {
    const clock = { now: placeLogical(DAY, 5 * 60) }
    const a = await computer('pca', clock)
    await a.settle()
    // A laptop offline changed the ordinary day from tomorrow on its view from before the move: a version without entries.
    const next = addDays(DAY, 1)
    const rel = paths.record('template', 'zwykly')
    const raw = read(rel)
    const versions = raw.versions as Record<string, Record<string, unknown>>
    write(rel, { ...raw, versions: { ...versions, [next]: { blocks: [planBlock({ id: 'an', categoryId: 'analiza', startMin: 9 * 60, durationMin: 60, origin: 'template' })], budgetMin: null, maxMin: null } } })
    clock.now = placeLogical(next, 5 * 60)
    await a.settle()
    const v = templateFrom(read(rel))!.versions.find((x) => x.from === next)!
    expect([v.sessionsMoved, v.blocks.map((b) => [b.id, b.session?.days.join(' ') ?? null])]).toEqual([
      DAY,
      [
        ['an', null],
        ['londyn', 'yes yes yes yes yes no no'],
        ['ny', 'yes yes yes yes yes no no']
      ]
    ])
    expect((await sessionsMade(a.folder, next))!.map(([, x]) => x)).toEqual(['londyn', 'ny'])
    // Once fixed: nothing more written.
    const once = records()
    await a.settle()
    expect(records()).toEqual(once)
    await a.folder.close()
  })

  it('rd.json przed szablonem zrobionym przez przeniesienie (zjazd zdalny): dzień tego typu od razu z sesjami warstwy', async () => {
    const first = await computer('pca', { now: placeLogical(DAY, 5 * 60) })
    await first.settle()
    await first.folder.close()
    const second = join(root, 'drugi')
    before(second)
    write(paths.settings, read(paths.settings), second)
    write(paths.day(DAY), { schema: 1, date: DAY, dayType: 'zjazd-zdalny' }, second)
    const b = await computer('pcb', { now: placeLogical(DAY, 5 * 60) }, second)
    await b.settle()
    expect(await sessionsMade(b.folder, DAY)).toEqual([
      [sessionBlockId(DAY, 'londyn'), 'londyn'],
      [sessionBlockId(DAY, 'ny'), 'ny']
    ])
    await b.folder.close()
  })

  it('po przeniesieniu prowadzący nie czyta rd.json od nowa przy każdym sprawdzeniu – dopiero po jego zmianie', async () => {
    const clock = { now: placeLogical(DAY, 5 * 60) }
    const a = await computer('pca', clock)
    await a.settle()
    const memo = () => (a.folder as unknown as { movedRd: unknown }).movedRd
    const seen = memo()
    expect(seen).not.toBeNull()
    await a.settle(2)
    expect(memo()).toBe(seen)
    // rd.json changed (another computer): read again once, remembered anew.
    write(paths.settings, { ...read(paths.settings), people: [{ id: 'p', name: 'Mama', archived: false }] })
    clock.now = placeLogical(addDays(DAY, 1), 5 * 60)
    await a.settle(2)
    expect(memo()).not.toBe(seen)
    expect(memo()).not.toBeNull()
    await a.folder.close()
  })
})

