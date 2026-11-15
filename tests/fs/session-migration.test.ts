/**
 * The move of the layer of sessions into the templates in the data folder (D511): the leader makes it once, before the day,
 * and the day comes from the templates; a second check, a second computer and a day later write nothing more; a day made
 * before the move keeps its sessions of the layer. A day from the move to come – of a copy of a split – has its file (and its
 * attachments) rewritten to the copy's ids an older version makes too; a copy keeps what its original's file holds; the
 * edit is made from one reading of the records; a day of the move waits for its templates (OneDrive may bring rd.json first).
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { createDay, dayPlan, templateBlockId } from '@shared/engine/createDay'
import { defaultTemplates, SETUP_FROM, templateJson } from '@shared/model/defaults'
import { dayFileFrom, planBlock, templateFrom, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { SESSIONS_CHANGE_ID } from '@shared/model/sessionMigration'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { MOVED, sessionMoveEdits } from '../../src/main/data/sessionMove'

const DAY = '2026-10-21'
let root: string
let dataDir: string
const write = (rel: string, value: unknown, dir = dataDir) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), JSON.stringify(value, null, 2))
}
const read = (rel: string, dir = dataDir) => JSON.parse(readFileSync(join(dir, rel), 'utf8')) as Record<string, unknown>
/** Every record of the folder as text (what a move would change). */
const records = () => {
  const out: Record<string, string> = { [paths.settings]: readFileSync(join(dataDir, paths.settings), 'utf8') }
  for (const f of readdirSync(join(dataDir, 'templates'))) out[`templates/${f}`] = readFileSync(join(dataDir, 'templates', f), 'utf8')
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
  // The leader's tasks run once it leads, settled (a few checks a minute apart).
  const settle = async (n = 6) => {
    for (let i = 0; i < n; i++) {
      clock.now += 60_000
      await folder.check()
    }
  }
  return { folder, settle }
}

/** The ordinary day with an analysis 09:00 (its weekend goes to a copy of the move). */
function withAnalysis(extra: Record<string, unknown> = {}) {
  const t: Template = { ...defaultTemplates().find((x) => x.id === 'zwykly')!, versions: [{ from: SETUP_FROM, blocks: [planBlock({ id: 'an', categoryId: 'analiza', startMin: 9 * 60, durationMin: 60, origin: 'template' })], budgetMin: null, maxMin: null }] }
  write(paths.record('template', 'zwykly'), { ...templateJson(t), ...extra })
}

const sessionsMade = async (f: DataFolder, day: string) => {
  const created = (await f.readDay(day)).events.find((e) => e.k === 'day.create')
  if (!created) return null
  return (created as unknown as { snapshot: { blocks: Array<{ origin: string; sourceId: string }> } }).snapshot.blocks.filter((b) => b.origin === 'session').map((b) => b.sourceId)
}

describe('przeniesienie sesji do szablonów w folderze danych (D511)', () => {
  it('prowadzący przenosi raz, przed utworzeniem dnia; dzień ma sesje z szablonu; drugie sprawdzenie i dzień później – nic', async () => {
    const clock = { now: placeLogical(DAY, 5 * 60) }
    const a = await computer('pca', clock)
    await a.settle()
    const rd = rdFrom(read(paths.settings))
    expect(rd.settings.map((c) => c.id)).toEqual(['kreator', SESSIONS_CHANGE_ID])
    expect(rd.settings[1]!.from).toBe(DAY)
    const zwykly = templateFrom(read(paths.record('template', 'zwykly')))!
    expect(zwykly.versions.map((v) => v.from)).toEqual([SETUP_FROM, DAY])
    expect(zwykly.versions[1]!.blocks.filter((b) => b.session).map((b) => b.id)).toEqual(['londyn', 'ny'])
    expect(existsSync(join(dataDir, paths.record('template', 'zwykly_67')))).toBe(true)
    expect(existsSync(join(dataDir, paths.record('template', 'sesje-zjazd-zdalny')))).toBe(true)
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
    expect(Object.keys(once).sort()).toEqual([paths.settings, 'templates/sesje-zjazd-zdalny.json', 'templates/sobota.json', 'templates/zwykly_67.json', 'templates/zwykly.json'].sort())
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

  it('dzień kopii po przeniesieniu: plik dnia i załącznik przepisane na identyfikatory kopii – starsza wersja liczy te same', async () => {
    withAnalysis()
    const sat = '2026-10-24'
    const was = templateBlockId(sat, 'zwykly', 'an')
    const now = templateBlockId(sat, 'zwykly_67', 'an')
    write(paths.day(sat), { schema: 1, date: sat, dayType: 'zwykly', cancelled: { [was]: true } })
    write(paths.record('attachment', 'z1'), { schema: 1, id: 'z1', owner: { scope: 'day', date: sat, blockId: was }, kind: 'link', name: 'notatki', link: { url: 'https://example.com' }, addedAt: 1, removedAt: null })
    const a = await computer('pca', { now: placeLogical(DAY, 5 * 60) })
    await a.settle()
    const file = read(paths.day(sat))
    expect([file.cancelled, file[MOVED]]).toEqual([{ [now]: true }, DAY])
    expect((read(paths.record('attachment', 'z1')).owner as { blockId: string }).blockId).toBe(now)
    // This version: the block cancelled on its day; an older one (no field „według czasu”) – the same ids, the same day.
    const changes = rdFrom(read(paths.settings)).settings
    const templates = readdirSync(join(dataDir, 'templates')).map((f) => templateFrom(read(`templates/${f}`))!)
    const older = templates.map((t) => ({ ...t, versions: t.versions.map((v) => ({ ...v, blocks: v.blocks.map(({ session: _s, ...b }) => b) })) }))
    for (const ts of [templates, older]) {
      const snap = createDay({ date: sat, changes, templates: ts, lectures: [], series: [], dayFile: dayFileFrom(file, sat), holidays: marketDay, at: null })
      expect(snap.blocks.some((b) => b.id === now)).toBe(true)
      expect(dayPlan(snap, dayFileFrom(file, sat)).some((b) => b.id === now)).toBe(false)
    }
  })

  it('kopia z podziału ma to, czego ta wersja nie czyta, z pliku oryginału (pola szablonu, wersji i bloku), od dnia przeniesienia', async () => {
    withAnalysis({ nowePole: 'zostaje' })
    const raw = read(paths.record('template', 'zwykly'))
    const versions = raw.versions as Record<string, Record<string, unknown>>
    versions[SETUP_FROM] = { ...versions[SETUP_FROM]!, poleWersji: 3, blocks: (versions[SETUP_FROM]!.blocks as Array<Record<string, unknown>>).map((b) => ({ ...b, poleBloku: 2 })) }
    write(paths.record('template', 'zwykly'), raw)
    const a = await computer('pca', { now: placeLogical(DAY, 5 * 60) })
    await a.settle()
    const copy = read(paths.record('template', 'zwykly_67'))
    expect([copy.id, copy.nowePole, copy[MOVED]]).toEqual(['zwykly_67', 'zostaje', DAY])
    const v = (copy.versions as Record<string, Record<string, unknown>>)[DAY]!
    expect(v.poleWersji).toBe(3)
    expect((v.blocks as Array<Record<string, unknown>>).find((b) => b.id === 'an')!.poleBloku).toBe(2)
    // Only from the move's date: a day before it stays its original's.
    expect(Object.keys(copy.versions as object)).toEqual([DAY])
  })

  it('zapis przeniesienia z jednego odczytu: każda zmiana pola ma za bazę odczytaną wartość, pól spoza przeniesienia nie dotyka', () => {
    withAnalysis()
    const rd = read(paths.settings)
    const zwykly = read(paths.record('template', 'zwykly'))
    const sobota = read(paths.record('template', 'sobota'))
    const entries = sessionMoveEdits({ rd, templates: [zwykly, sobota], days: new Map(), attachments: [], today: DAY, todayMade: false })!
    const edit = entries.find((e) => e.rel === paths.record('template', 'zwykly'))!
    expect(edit.edits.every((e) => ['versions', MOVED].includes(e.path[0]!))).toBe(true)
    const at = (path: readonly string[]) => path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), zwykly)
    for (const e of edit.edits) expect(e.base).toEqual(at(e.path))
    // rd.json goes last, after every record of the move, with the list of what a day of the move waits for.
    const last = entries.at(-1)!
    expect(last.rel).toBe(paths.settings)
    expect(last.after).toEqual(entries.slice(0, -1).map((_, i) => i))
    expect(JSON.stringify(last.edits)).toContain('"expect":["templates/zwykly.json","templates/zwykly_67.json","templates/sesje-zjazd-zdalny.json"]')
  })

  it('drugi komputer dostał rd.json po przeniesieniu, a szablony sprzed niego: dzień czeka na nie, potem ma sesje z szablonu; najwyżej 30 min', async () => {
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
    expect(await sessionsMade(b.folder, DAY)).toBeNull()
    for (const f of readdirSync(join(dataDir, 'templates'))) writeFileSync(join(second, 'templates', f), readFileSync(join(dataDir, 'templates', f)))
    await b.settle(2)
    expect(await sessionsMade(b.folder, DAY)).toEqual(['londyn', 'ny'])
    await b.folder.close()
    // The templates never come (a file removed meanwhile): after 30 min the day is made as it is.
    const third = join(root, 'trzeci')
    before(third)
    write(paths.settings, read(paths.settings), third)
    const c = await computer('pcc', { now: placeLogical(DAY, 5 * 60) }, third)
    await c.settle(20)
    expect(await sessionsMade(c.folder, DAY)).toBeNull()
    await c.settle(15)
    expect(await sessionsMade(c.folder, DAY)).toEqual([])
    await c.folder.close()
  })
})
