/**
 * The data folder for the main window (E3): your queued edit shows at once (also while the folder is away), a field
 * changed here and elsewhere is a question answered „mine” or „theirs”, a record removed elsewhere comes back from its
 * last version only when you ask, the main window writes only its own kinds of events (checked like a line of the log),
 * OneDrive's conflict copies of any record are joined field by field and their differences are questions, the history
 * lists the records with versions.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { readLogText } from '@shared/data/logText'
import { paths } from '@shared/data/paths'
import { placeLogical } from '@shared/time/day'
import { createUpdateBackup, readBackupEntry } from '../../src/main/data/backup'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs, type DataFs } from '../../src/main/data/fsio'

const DAY = '2026-10-21'
let root: string
let dataDir: string
let stateDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-e3data-'))
  dataDir = join(root, 'data')
  stateDir = join(root, 'state')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make(o: { fs?: DataFs } = {}) {
  let now = placeLogical(DAY, 10 * 60)
  const folder = await DataFolder.open({
    fs: o.fs ?? nodeFs,
    dataDir,
    stateDir,
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '0.2.0',
    clock: { wall: () => now, mono: () => now },
    holidays: marketDay,
    oneDriveRunning: () => true
  })
  return { folder, tick: (ms = 61_000) => (now += ms) }
}

const write = (rel: string, v: unknown) => {
  mkdirSync(join(dataDir, rel, '..'), { recursive: true })
  writeFileSync(join(dataDir, rel), JSON.stringify(v))
}
const read = (rel: string) => JSON.parse(readFileSync(join(dataDir, rel), 'utf8')) as Record<string, unknown>
const req = paths.record('request', 'r1')

describe('folder danych dla okna głównego', () => {
  it('zmiana z kolejki widać od razu, także gdy folder jest niedostępny; zapisuje się po jego powrocie', async () => {
    write(req, { schema: 1, id: 'r1', note: 'a' })
    let away = false
    const fs: DataFs = { ...nodeFs, writeAtomic: (p, t) => (away ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeFs.writeAtomic(p, t)) }
    const { folder } = await make({ fs })
    away = true
    const out = await folder.edit([{ rel: req, edits: [{ path: ['note'], base: 'a', value: 'b' }] }])
    expect(out[0]!.status).toBe('waiting')
    expect((await folder.recordView(req))!.note).toBe('b')
    expect(read(req).note).toBe('a')
    away = false
    await folder.queue.apply(folder.records)
    expect(read(req).note).toBe('b')
  })

  it('pole zmienione tu i gdzie indziej: pytanie; „moje” zapisuje moje, „ich” zostawia tamto', async () => {
    write(req, { schema: 1, id: 'r1', note: 'a', estimateMin: 10 })
    const { folder } = await make()
    // Elsewhere the note became „c”; here, from „a”, „b” – and the estimate (changed only here) is written at once.
    write(req, { schema: 1, id: 'r1', note: 'c', estimateMin: 10 })
    const out = await folder.edit([{ rel: req, edits: [{ path: ['note'], base: 'a', value: 'b' }, { path: ['estimateMin'], base: 10, value: 20 }] }])
    expect(out[0]!.status).toBe('conflict')
    expect(read(req)).toMatchObject({ note: 'c', estimateMin: 20 })
    const [q] = folder.queue.questions()
    expect(q!.outcome.status).toBe('conflict')
    folder.queue.resolve(q!.edit.id, 'mine')
    await folder.queue.apply(folder.records)
    expect(read(req).note).toBe('b')
    // Again, and „theirs” this time.
    write(req, { schema: 1, id: 'r1', note: 'd', estimateMin: 20 })
    await folder.edit([{ rel: req, edits: [{ path: ['note'], base: 'b', value: 'e' }] }])
    folder.queue.resolve(folder.queue.questions()[0]!.edit.id, 'theirs')
    await folder.queue.apply(folder.records)
    expect(read(req).note).toBe('d')
    expect(folder.queue.questions()).toEqual([])
  })

  it('rekord usunięty gdzie indziej: pytanie, nigdy ciche przywrócenie; „przywróć” odtwarza go z ostatniej wersji z moją zmianą', async () => {
    write(req, { schema: 1, id: 'r1', note: 'a', person: 'p1' })
    const { folder } = await make()
    await folder.records.remove(req)
    const out = await folder.edit([{ rel: req, edits: [{ path: ['note'], base: 'a', value: 'b' }] }])
    expect(out[0]!.status).toBe('removedElsewhere')
    expect(existsSync(join(dataDir, req))).toBe(false)
    const last = (await folder.history.list('request', 'r1'))[0]!
    folder.queue.resolve(folder.queue.questions()[0]!.edit.id, 'mine', last.record as Record<string, unknown>)
    await folder.queue.apply(folder.records)
    expect(read(req)).toMatchObject({ note: 'b', person: 'p1' })
  })

  it('zdarzenia z okna: tylko dozwolone rodzaje, sprawdzone jak linia logu; migawka „od dziś” dostaje ustawienia z tej chwili', async () => {
    write(paths.settings, { schema: 1, settings: [{ id: 's', from: DAY, at: placeLogical(DAY, 9 * 60), patch: { boundaryBufferMin: 25 } }] })
    const { folder } = await make()
    await folder.userEvents([{ k: 'boundary.approve', day: DAY, boundary: placeLogical(DAY, 17 * 60), auto: false }])
    await folder.userEvents([{ k: 'day.snapshot', day: DAY, dayType: 'zwykly', reason: 'today' }])
    await expect(folder.userEvents([{ k: 'block.start', day: DAY, block: 'x', planned: {} }])).rejects.toThrow(/nie pochodzi z okna/)
    await expect(folder.userEvents([{ k: 'boundary.exception', day: DAY, minutes: -5 }])).rejects.toThrow(/minutes/)
    const events = readLogText(readFileSync(join(dataDir, paths.log(DAY, 'pca')), 'utf8')).events
    expect(events.find((e) => e.k === 'boundary.approve')).toMatchObject({ dom: 'timer', auto: false })
    const snap = events.find((e) => e.k === 'day.snapshot') as unknown as { settings: { boundaryBufferMin: number }; at: number }
    expect(snap.settings.boundaryBufferMin).toBe(25)
    expect(snap.at).toBe(placeLogical(DAY, 10 * 60))
  })

  it('kopia konfliktowa rd.json: różnice tylko z jednej strony się łączą, po obu stronach – pytanie; odpowiedź zamyka kopię', async () => {
    write(paths.settings, { schema: 1, general: { waterEveryMin: 45, breakMin: 15 }, people: [{ id: 'a', name: 'Mama' }] })
    write('rd-DESKTOP-B.json', { schema: 1, general: { waterEveryMin: 60, breakMin: 15 }, people: [{ id: 'a', name: 'Mama' }, { id: 'b', name: 'Tata' }] })
    const { folder } = await make()
    await folder.check()
    expect(folder.copyConflicts.size).toBe(1)
    const q = folder.copyConflicts.get('rd-DESKTOP-B.json')!
    expect(q.conflicts.map((c) => c.path.join('.'))).toEqual(['general.waterEveryMin'])
    await folder.resolveCopy('rd-DESKTOP-B.json', 'theirs')
    expect(existsSync(join(dataDir, 'rd-DESKTOP-B.json'))).toBe(false)
    const rd = read(paths.settings) as { general: { waterEveryMin: number }; people: Array<{ name: string }> }
    expect(rd.general.waterEveryMin).toBe(60)
    expect(rd.people.map((p) => p.name)).toEqual(['Mama', 'Tata'])
    // Both versions are in the history.
    expect((await folder.history.list('settings', 'rd')).filter((v) => v.reason === 'conflict')).toHaveLength(2)
  })

  it('kopia przed aktualizacją: raz na aktualizację, z danymi sprzed niej, ostatnie 5', async () => {
    write(paths.settings, { schema: 1, general: { waterEveryMin: 45 } })
    write(req, { schema: 1, id: 'r1', note: 'a' })
    const backups = join(dataDir, 'backups')
    const first = await createUpdateBackup(dataDir, backups, '0.2.0', '0.3.0')
    expect(first).toMatchObject({ ok: true, files: 2 })
    expect(await createUpdateBackup(dataDir, backups, '0.2.0', '0.3.0')).toBeNull()
    expect((await readBackupEntry(join(backups, 'aktualizacje', '0.2.0-do-0.3.0.zip'), req))?.toString('utf8')).toContain('"note":"a"')
    for (let i = 1; i <= 6; i++) await createUpdateBackup(dataDir, backups, `0.3.${i - 1}`, `0.3.${i}`)
    expect(readdirSync(join(backups, 'aktualizacje'))).toHaveLength(5)
  })

  it('historia: rekordy z wersjami (bez czytania plików), najnowsze pierwsze', async () => {
    write(req, { schema: 1, id: 'r1', note: 'a' })
    const { folder, tick } = await make()
    await folder.edit([{ rel: req, edits: [{ path: ['note'], base: 'a', value: 'b' }] }])
    tick()
    await folder.edit([{ rel: paths.day(DAY), create: true, edits: [{ path: ['date'], base: undefined, value: DAY }] }])
    await folder.edit([{ rel: paths.day(DAY), edits: [{ path: ['wakeMin'], base: undefined, value: 420 }] }])
    const records = await folder.history.records()
    expect(records.map((r) => `${r.kind}/${r.id}`)).toEqual([`day/${DAY}`, 'request/r1'])
    expect(records[0]!.versions).toBe(1)
  })
})
