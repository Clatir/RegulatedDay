/**
 * The move of the layer of sessions into the templates in the data folder (D511): the leader makes it once, before the day,
 * and the day comes from the templates; a second check, a second computer and a day later write nothing more; a day made
 * before the move keeps its sessions of the layer.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { createDay } from '@shared/engine/createDay'
import { defaultTemplates, SETUP_FROM, templateJson } from '@shared/model/defaults'
import { templateFrom } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { SESSIONS_CHANGE_ID } from '@shared/model/sessionMigration'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'

const DAY = '2026-10-21'
let root: string
let dataDir: string
const write = (rel: string, value: unknown) => {
  mkdirSync(join(dataDir, rel, '..'), { recursive: true })
  writeFileSync(join(dataDir, rel), JSON.stringify(value, null, 2))
}
const read = (rel: string) => JSON.parse(readFileSync(join(dataDir, rel), 'utf8')) as Record<string, unknown>
/** Every record of the folder as text (what a move would change). */
const records = () => {
  const out: Record<string, string> = { [paths.settings]: readFileSync(join(dataDir, paths.settings), 'utf8') }
  for (const f of readdirSync(join(dataDir, 'templates'))) out[`templates/${f}`] = readFileSync(join(dataDir, 'templates', f), 'utf8')
  return out
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-sessions-'))
  dataDir = join(root, 'data')
  // A folder of a version before D511: the wizard's change, the sessions in the layer of the settings, the default templates.
  write(paths.settings, { schema: 1, settings: [{ id: 'kreator', from: SETUP_FROM, at: null, made: 1, patch: {} }], people: [] })
  for (const t of defaultTemplates()) write(paths.record('template', t.id), templateJson(t))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function computer(id: string, clock: { now: number }) {
  const folder = await DataFolder.open({
    fs: nodeFs,
    dataDir,
    stateDir: join(root, `state-${id}`),
    computer: id,
    computerName: id,
    appVersion: '1.25.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
  // The leader's tasks run once it leads, settled (a few checks a minute apart).
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      clock.now += 60_000
      await folder.check()
    }
  }
  return { folder, settle }
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
})
