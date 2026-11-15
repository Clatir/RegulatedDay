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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { readLogText } from '@shared/data/logText'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { isPassive } from '@shared/engine/facts'
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

  it('usunięcie rekordu, który w tym czasie zmienił się gdzie indziej: pytanie – „Usuń mimo to” usuwa, „Zostaw zmieniony” zostawia (A3-09)', async () => {
    const seen = { schema: 1, id: 'r1', note: 'a' }
    write(req, seen)
    let away = false
    const fs: DataFs = { ...nodeFs, remove: (p) => (away ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeFs.remove(p)) }
    const { folder } = await make({ fs })
    // Removed here while the file is held: the removal waits with the record as you saw it.
    away = true
    expect((await folder.edit([{ rel: req, edits: [], remove: true, base: seen }]))[0]!.status).toBe('waiting')
    // Meanwhile another computer added a note to it.
    write(req, { schema: 1, id: 'r1', note: 'z drugiego komputera' })
    away = false
    await folder.queue.apply(folder.records)
    const [q] = folder.queue.questions()
    expect(q!.outcome.status).toBe('changedElsewhere')
    expect(read(req).note).toBe('z drugiego komputera')
    await folder.queue.resolve(q!.edit.id, 'theirs')
    await folder.queue.apply(folder.records)
    expect(read(req).note).toBe('z drugiego komputera')
    // Removed again, seen as it is now: no question – „Usuń mimo to” is the same as a removal of what you see.
    expect((await folder.edit([{ rel: req, edits: [], remove: true, base: { schema: 1, id: 'r1', note: 'z drugiego komputera' } }]))[0]!.status).toBe('applied')
    expect(existsSync(join(dataDir, req))).toBe(false)
  })

  it('„Usuń mimo to” usuwa rekord zmieniony gdzie indziej (A3-09)', async () => {
    write(req, { schema: 1, id: 'r1', note: 'a' })
    const { folder } = await make()
    write(req, { schema: 1, id: 'r1', note: 'b' })
    expect((await folder.edit([{ rel: req, edits: [], remove: true, base: { schema: 1, id: 'r1', note: 'a' } }]))[0]!.status).toBe('changedElsewhere')
    const [q] = folder.queue.questions()
    await folder.queue.resolve(q!.edit.id, 'mine')
    await folder.queue.apply(folder.records)
    expect(existsSync(join(dataDir, req))).toBe(false)
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
    await folder.queue.resolve(q!.edit.id, 'mine')
    await folder.queue.apply(folder.records)
    expect(read(req).note).toBe('b')
    // Again, and „theirs” this time.
    write(req, { schema: 1, id: 'r1', note: 'd', estimateMin: 20 })
    await folder.edit([{ rel: req, edits: [{ path: ['note'], base: 'b', value: 'e' }] }])
    await folder.queue.resolve(folder.queue.questions()[0]!.edit.id, 'theirs')
    await folder.queue.apply(folder.records)
    expect(read(req).note).toBe('d')
    expect(folder.queue.questions()).toEqual([])
  })

  it('wpis, który idzie z innym (`after`): czeka, gdy tamten jest pytaniem; „ich” zabiera go ze sobą, „moje” zapisuje oba (T923)', async () => {
    const r2 = paths.record('request', 'r2')
    write(req, { schema: 1, id: 'r1', note: 'a' })
    write(r2, { schema: 1, id: 'r2', note: 'x' })
    const { folder } = await make()
    // Elsewhere the note became „c”: the first entry is a question, the one that goes with it waits.
    write(req, { schema: 1, id: 'r1', note: 'c' })
    const out = await folder.edit([{ rel: req, edits: [{ path: ['note'], base: 'a', value: 'b' }] }, { rel: r2, edits: [{ path: ['note'], base: 'x', value: 'y' }], after: [0] }])
    expect(out.map((o) => o.status)).toEqual(['conflict', 'waiting'])
    expect(read(r2).note).toBe('x')
    await folder.queue.resolve(folder.queue.questions()[0]!.edit.id, 'theirs')
    await folder.queue.apply(folder.records)
    expect([read(req).note, read(r2).note, folder.queue.pending.length]).toEqual(['c', 'x', 0])
    // Again, „mine” this time: both are written.
    write(req, { schema: 1, id: 'r1', note: 'd' })
    await folder.edit([{ rel: req, edits: [{ path: ['note'], base: 'c', value: 'e' }] }, { rel: r2, edits: [{ path: ['note'], base: 'x', value: 'y' }], after: [0] }])
    await folder.queue.resolve(folder.queue.questions()[0]!.edit.id, 'mine')
    await folder.queue.apply(folder.records)
    expect([read(req).note, read(r2).note, folder.queue.pending.length]).toEqual(['e', 'y', 0])
  })

  it('wpis zależny czekający za pytaniem: późniejszy wpis jego pliku idzie po nim; widok i licznik „czeka na folder” go nie liczą (T926–T928)', async () => {
    const att = paths.record('attachment', 'a1')
    write(req, { schema: 1, id: 'r1', note: 'a' })
    write(att, { schema: 1, id: 'a1', removedAt: null })
    const { folder } = await make()
    write(req, { schema: 1, id: 'r1', note: 'c' })
    // The block's removal is a question; its attachment's removal goes with it; then „Cofnij” of the attachment alone.
    await folder.edit([{ rel: req, edits: [{ path: ['note'], base: 'a', value: 'b' }] }, { rel: att, edits: [{ path: ['removedAt'], base: null, value: 5 }], after: [0] }])
    expect((await folder.edit([{ rel: att, edits: [{ path: ['removedAt'], base: 5, value: null }] }]))[0]!.status).toBe('waiting')
    // Shown as the folder has it until your answer; nothing of it waits for the folder.
    expect((await folder.recordView(att))!.removedAt).toBeNull()
    expect(folder.unsynced).toBe(0)
    await folder.queue.resolve(folder.queue.questions()[0]!.edit.id, 'mine')
    await folder.queue.apply(folder.records)
    // Laid in their order: removed, then brought back.
    expect([read(req).note, read(att).removedAt, folder.queue.pending.length]).toEqual(['b', null, 0])
  })

  it('kolejka z pliku: `after` inny niż lista nie zatrzymuje przebiegów (T929)', async () => {
    write(req, { schema: 1, id: 'r1', note: 'a' })
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(join(stateDir, 'queue.v1.json'), JSON.stringify({ format: 1, entries: [{ id: 'q1', rel: req, at: 1, schema: 1, edits: [{ path: ['note'], base: 'a', value: 'b' }], after: 'zly' }] }))
    const { folder } = await make()
    await folder.queue.apply(folder.records)
    expect([read(req).note, folder.queue.pending.length]).toEqual(['b', 0])
  })

  it('rekord usunięty gdzie indziej: pytanie, nigdy ciche przywrócenie; „przywróć” odtwarza go z ostatniej wersji z moją zmianą', async () => {
    write(req, { schema: 1, id: 'r1', note: 'a', person: 'p1' })
    const { folder } = await make()
    await folder.records.remove(req)
    const out = await folder.edit([{ rel: req, edits: [{ path: ['note'], base: 'a', value: 'b' }] }])
    expect(out[0]!.status).toBe('removedElsewhere')
    expect(existsSync(join(dataDir, req))).toBe(false)
    const last = (await folder.history.list('request', 'r1'))[0]!
    await folder.queue.resolve(folder.queue.questions()[0]!.edit.id, 'mine', last.record as Record<string, unknown>)
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
    await expect(folder.userEvents([{ k: 'day.snapshot', day: DAY, dayType: 'świąteczny', reason: 'type' }])).rejects.toThrow(/typ dnia/)
    const events = readLogText(readFileSync(join(dataDir, paths.log(DAY, 'pca')), 'utf8')).events
    expect(events.find((e) => e.k === 'boundary.approve')).toMatchObject({ dom: 'timer', auto: false })
    const snap = events.find((e) => e.k === 'day.snapshot') as unknown as { settings: { boundaryBufferMin: number }; at: number }
    expect(snap.settings.boundaryBufferMin).toBe(25)
    expect(snap.at).toBe(placeLogical(DAY, 10 * 60))
  })

  it('zmiana kosztu zaczętego bloku z okna (D501): block.cost w dziedzinie timera, chwila z zegara procesu głównego; zły koszt – odmowa', async () => {
    const { folder } = await make()
    await folder.userEvents([{ k: 'block.cost', day: DAY, block: 'x', costs: { head: 4, emotions: 0, senses: -2, body: 1 } }])
    await expect(folder.userEvents([{ k: 'block.cost', day: DAY, block: 'x', costs: { head: 9, emotions: 0, senses: 0, body: 0 } }])).rejects.toThrow(/costs/)
    // The first builds' kind is read, never written by the window any more.
    await expect(folder.userEvents([{ k: 'energy.cost', day: DAY, block: 'x', costs: null }])).rejects.toThrow(/nie pochodzi z okna/)
    const events = readLogText(readFileSync(join(dataDir, paths.log(DAY, 'pca')), 'utf8')).events
    expect(events.filter((e) => e.k === 'block.cost')).toEqual([expect.objectContaining({ dom: 'timer', block: 'x', costs: { head: 4, emotions: 0, senses: -2, body: 1 }, at: expect.any(Number) })])
    // This version knows it: no „unknown events of the timer” here. A version that does not know a kind of the timer's domain (as one
    // before 1.24 reads `block.cost`) sees one – the night installation without the 24 h.
    expect(await folder.unknownTimerEvents(placeLogical(DAY, 12 * 60))).toBe(false)
    const later = { id: 'pcb-1', c: 'pcb', n: 1, t: placeLogical(DAY, 11 * 60), l: placeLogical(DAY, 11 * 60), v: 99, day: DAY, dom: 'timer', k: 'block.later', block: 'x', at: placeLogical(DAY, 11 * 60) }
    mkdirSync(join(dataDir, paths.log(DAY, 'pcb'), '..'), { recursive: true })
    writeFileSync(join(dataDir, paths.log(DAY, 'pcb')), `${JSON.stringify(later)}
`)
    expect(await folder.unknownTimerEvents(placeLogical(DAY, 12 * 60))).toBe(true)
  })

  describe('zmiana kosztu rutyny (D514, T1430): routine.cost pisze proces główny przy każdym zapisie rekordu rutyny z innym kosztem', () => {
    const rut = paths.record('routine', 'r1')
    const C0 = { head: 4, emotions: 0, senses: 1, body: 1 }
    const C1 = { head: 5, emotions: 0, senses: 1, body: 2 }
    const C2 = { head: -1, emotions: 2, senses: 3, body: -1 }
    const routine = (costs: unknown, extra: Record<string, unknown> = {}) => ({ schema: 1, id: 'r1', name: 'Poranna', normal: [{ id: 's1', name: 'Woda', min: 5 }], worse: [], archived: false, costs, ...extra })
    /** Today's changes of a routine's cost as this computer sees them (its journal with the folder's logs). */
    const changes = async (folder: DataFolder) => (await folder.readDay(DAY)).events.filter((e) => e.k === 'routine.cost').map((e) => ({ ...e }) as Record<string, unknown>)

    it('zapis z okna: jedno zdarzenie w dziedzinie timera (koszt, koszt sprzed, chwila zegara procesu głównego), bierne; zmiana nazwy – bez zdarzenia', async () => {
      write(rut, routine(C0))
      const { folder } = await make()
      expect((await folder.edit([{ rel: rut, edits: [{ path: ['costs'], base: C0, value: C1 }] }]))[0]!.status).toBe('applied')
      expect(read(rut).costs).toEqual(C1)
      const [e] = await changes(folder)
      expect(e).toMatchObject({ dom: 'timer', c: 'pca', routine: 'r1', costs: C1, was: C0, at: placeLogical(DAY, 10 * 60) })
      expect(isPassive(e as never)).toBe(true)
      // Another field: no event; „jak podkategoria”: costs null.
      await folder.edit([{ rel: rut, edits: [{ path: ['name'], base: 'Poranna', value: 'Ranna' }] }])
      await folder.edit([{ rel: rut, edits: [{ path: ['costs'], base: C1, value: null }] }])
      expect((await changes(folder)).map((x) => [x.costs, x.was])).toEqual([
        [C1, C0],
        [null, C1]
      ])
      // In the folder's log with the next write of the log (the check), as every event of the day.
      await folder.check()
      expect(readLogText(readFileSync(join(dataDir, paths.log(DAY, 'pca')), 'utf8')).events.filter((x) => x.k === 'routine.cost')).toHaveLength(2)
      // This version knows it; an older one (1.24, `RULES_VERSION` 13) – an unknown event of the timer: the night installation without the 24 h.
      expect(await folder.unknownTimerEvents(placeLogical(DAY, 12 * 60))).toBe(false)
    })

    it('okno nie pisze zdarzeń kosztu rutyny (ani routine.cost, ani dawnego block.routineCost)', async () => {
      const { folder } = await make()
      await expect(folder.userEvents([{ k: 'routine.cost', day: DAY, routine: 'r1', costs: C1, was: null }])).rejects.toThrow(/nie pochodzi z okna/)
      await expect(folder.userEvents([{ k: 'block.routineCost', day: DAY, block: 'x', costs: C1 }])).rejects.toThrow(/nie pochodzi z okna/)
    })

    it('odpowiedź na pytanie o konflikt: dopiero „moje” zapisuje koszt – i wtedy zdarzenie; „ich” – bez zdarzenia', async () => {
      write(rut, routine(C0))
      const { folder } = await make()
      // Elsewhere the cost became C2 (that computer's log has its own event); here, from C0, C1.
      write(rut, routine(C2))
      expect((await folder.edit([{ rel: rut, edits: [{ path: ['costs'], base: C0, value: C1 }] }]))[0]!.status).toBe('conflict')
      expect(await changes(folder)).toEqual([])
      await folder.queue.resolve(folder.queue.questions()[0]!.edit.id, 'mine')
      await folder.queue.apply(folder.records)
      expect(read(rut).costs).toEqual(C1)
      expect((await changes(folder)).map((x) => [x.costs, x.was])).toEqual([[C1, C2]])
      write(rut, routine(C0))
      await folder.edit([{ rel: rut, edits: [{ path: ['costs'], base: C1, value: C2 }] }])
      await folder.queue.resolve(folder.queue.questions()[0]!.edit.id, 'theirs')
      await folder.queue.apply(folder.records)
      expect(await changes(folder)).toHaveLength(1)
    })

    it('zmiana czekająca na folder: zdarzenie, gdy kolejka ją zapisze', async () => {
      write(rut, routine(C0))
      let away = false
      const fs: DataFs = { ...nodeFs, writeAtomic: (p, t) => (away && p.includes('routines') ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeFs.writeAtomic(p, t)) }
      const { folder, tick } = await make({ fs })
      away = true
      expect((await folder.edit([{ rel: rut, edits: [{ path: ['costs'], base: C0, value: C1 }] }]))[0]!.status).toBe('waiting')
      expect(await changes(folder)).toEqual([])
      away = false
      tick()
      await folder.queue.apply(folder.records)
      expect(await changes(folder)).toEqual([expect.objectContaining({ costs: C1, was: C0, at: placeLogical(DAY, 10 * 60) + 61_000 })])
    })

    it('usunięcie rutyny: bez zdarzenia – zaczęty blok liczy dalej koszt, z którym biegł (T1445); plik z powrotem („Cofnij”) – zdarzenie z kosztem z pliku', async () => {
      write(rut, routine(C1))
      const { folder } = await make()
      expect((await folder.edit([{ rel: rut, edits: [], remove: true, base: routine(C1) }]))[0]!.status).toBe('applied')
      expect(existsSync(join(dataDir, rut))).toBe(false)
      expect(await changes(folder)).toEqual([])
      // „Cofnij”: the record made again – a file with a cost where there was none (the begun block keeps the same cost).
      expect((await folder.edit([recordEdit(rut, null, routine(C1))!]))[0]!.status).toBe('applied')
      expect((await changes(folder)).map((x) => [x.costs, x.was])).toEqual([[C1, null]])
    })

    it('dziennik nie przyjął zdarzenia: rekord zapisany, odpowiedź zapisu mówi to oknu (routineCostKept, T1446) – tylko przy tym zapisie', async () => {
      write(rut, routine(C0))
      const { folder } = await make()
      const append = vi.spyOn(folder.log, 'append').mockImplementationOnce(() => {
        throw Object.assign(new Error('ENOSPC: brak miejsca'), { code: 'ENOSPC' })
      })
      const [out] = await folder.edit([{ rel: rut, edits: [{ path: ['costs'], base: C0, value: C1 }] }])
      expect(out).toMatchObject({ status: 'applied', routineCostKept: true })
      expect(read(rut).costs).toEqual(C1)
      expect(await changes(folder)).toEqual([])
      // The next save writes its event and says nothing more.
      const [next] = await folder.edit([{ rel: rut, edits: [{ path: ['costs'], base: C1, value: C2 }] }])
      expect(next).toEqual(expect.not.objectContaining({ routineCostKept: true }))
      expect((await changes(folder)).map((x) => [x.costs, x.was])).toEqual([[C2, C1]])
      append.mockRestore()
    })

    it('kopia konfliktowa rutyny połączona z odpowiedzią „ich”: zapis z kosztem kopii – zdarzenie', async () => {
      write(rut, routine(C0))
      write('routines/r1-DESKTOP-B.json', routine(C2))
      const { folder } = await make()
      await folder.check()
      expect([...folder.copyConflicts.keys()]).toEqual(['routines/r1-DESKTOP-B.json'])
      await folder.resolveCopy('routines/r1-DESKTOP-B.json', 'theirs')
      expect(read(rut).costs).toEqual(C2)
      expect((await changes(folder)).map((x) => [x.costs, x.was])).toEqual([[C2, C0]])
    })
  })

  it('zmiana drzewa kategorii z okna (D510, T1313): tree.change w dziedzinie timera, bierne; ta wersja je zna, starsza – nie (instalacja bez 24 h)', async () => {
    const { folder } = await make()
    await folder.userEvents([{ k: 'tree.change', day: DAY }])
    const events = readLogText(readFileSync(join(dataDir, paths.log(DAY, 'pca')), 'utf8')).events
    const tree = events.filter((e) => e.k === 'tree.change')
    expect(tree).toEqual([expect.objectContaining({ dom: 'timer', at: expect.any(Number) })])
    expect(isPassive(tree[0]!)).toBe(true)
    // This version knows it: no „unknown events of the timer” here (one before 1.25 reads it as unknown – `block.later` above).
    expect(await folder.unknownTimerEvents(placeLogical(DAY, 12 * 60))).toBe(false)
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

  it('odpowiedź w trakcie wolnego zapisu kolejki: wpis „ich” nie wraca po jego końcu', async () => {
    const req2 = paths.record('request', 'r2')
    write(req, { schema: 1, id: 'r1', note: 'a' })
    write(req2, { schema: 1, id: 'r2', note: 'x' })
    let hold: Promise<void> | null = null
    let entered: () => void = () => undefined
    const inWrite = new Promise<void>((r) => (entered = r))
    const fs: DataFs = {
      ...nodeFs,
      writeAtomic: async (p, t) => {
        if (hold && p.replace(/\\/g, '/').endsWith(req2)) {
          entered()
          await hold
        }
        return nodeFs.writeAtomic(p, t)
      }
    }
    const { folder } = await make({ fs })
    write(req, { schema: 1, id: 'r1', note: 'c' })
    await folder.edit([{ rel: req, edits: [{ path: ['note'], base: 'a', value: 'b' }] }])
    const qid = folder.queue.questions()[0]!.edit.id
    folder.queue.add({ id: 'e-r2', rel: req2, at: placeLogical(DAY, 10 * 60), schema: 1, edits: [{ path: ['note'], base: 'x', value: 'y' }] })
    let release: () => void = () => undefined
    hold = new Promise<void>((r) => (release = r))
    const run = folder.queue.apply(folder.records)
    await inWrite
    const answered = folder.queue.resolve(qid, 'theirs')
    release()
    await run
    expect(await answered).toBe(true)
    expect(folder.queue.pending.map((e) => e.id)).not.toContain(qid)
    expect(folder.queue.questions()).toEqual([])
    expect(read(req).note).toBe('c')
    expect(read(req2).note).toBe('y')
  })

  it('prowadzący liczy dzień z plików folderu, nie z moich zmian, które jeszcze czekają', async () => {
    const change = { id: 's', from: DAY, at: placeLogical(DAY, 9 * 60), patch: { boundaryBufferMin: 25 } }
    write(paths.settings, { schema: 1, settings: [] })
    let away = false
    const fs: DataFs = { ...nodeFs, writeAtomic: (p, t) => (away ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeFs.writeAtomic(p, t)) }
    const { folder } = await make({ fs })
    away = true
    expect((await folder.edit([{ rel: paths.settings, edits: [{ path: ['settings'], base: [], value: [change] }] }]))[0]!.status).toBe('waiting')
    expect((await folder.inputs()).changes).toEqual([])
    expect((await folder.inputs(true)).changes.map((c) => c.id)).toEqual(['s'])
  })

  it('nowy rekord tylko tam, gdzie go nie ma: istniejący albo już w kolejce – odmowa, nic nie trafia do kolejki', async () => {
    write(req, { schema: 1, id: 'r1', note: 'a' })
    let away = false
    const fs: DataFs = { ...nodeFs, writeAtomic: (p, t) => (away ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' })) : nodeFs.writeAtomic(p, t)) }
    const { folder } = await make({ fs })
    await expect(folder.edit([{ rel: req, create: true, edits: [{ path: ['note'], base: undefined, value: 'b' }] }])).rejects.toThrow(/już jest/)
    expect(read(req).note).toBe('a')
    expect(folder.queue.pending).toEqual([])
    // A new record still in the queue (the folder away): a second „new” of it is refused too.
    const req3 = paths.record('request', 'r3')
    away = true
    expect((await folder.edit([{ rel: req3, create: true, edits: [{ path: ['note'], base: undefined, value: 'n' }] }]))[0]!.status).toBe('waiting')
    await expect(folder.edit([{ rel: req3, create: true, edits: [{ path: ['note'], base: undefined, value: 'm' }] }])).rejects.toThrow()
    expect(folder.queue.pending).toHaveLength(1)
  })

  it('znacznik ostatniej zmiany pliku nigdy się nie cofa (starsza zmiana nałożona później)', async () => {
    const later = placeLogical(DAY, 11 * 60)
    write(req, { schema: 1, id: 'r1', note: 'a', estimateMin: 10, updatedAt: later })
    const { folder } = await make()
    await folder.edit([{ rel: req, edits: [{ path: ['estimateMin'], base: 10, value: 20 }] }])
    expect(read(req)).toMatchObject({ estimateMin: 20, updatedAt: later })
  })

  it('kopia konfliktowa dnia z zeszłego roku (31.12 widziana 1.01) też się łączy', async () => {
    const day = '2025-12-31'
    write(paths.day(day), { schema: 1, date: day, dayType: 'zwykly' })
    write(`days/2025/${day}-DESKTOP-B.json`, { schema: 1, date: day, dayType: 'zwykly', wakeMin: 420 })
    const { folder } = await make()
    await folder.check()
    expect(existsSync(join(dataDir, `days/2025/${day}-DESKTOP-B.json`))).toBe(false)
    expect(read(paths.day(day)).wakeMin).toBe(420)
  })

  it('kopia przed aktualizacją także dla wersji beta', async () => {
    write(req, { schema: 1, id: 'r1', note: 'a' })
    const backups = join(dataDir, 'backups')
    expect(await createUpdateBackup(dataDir, backups, '0.3.0-beta.1', '0.3.0')).toMatchObject({ ok: true })
    expect(await createUpdateBackup(dataDir, backups, '0.3.0', '0.4.0-beta.2')).toMatchObject({ ok: true })
    expect(readdirSync(join(backups, 'aktualizacje')).sort()).toEqual(['0.3.0-beta.1-do-0.3.0.zip', '0.3.0-do-0.4.0-beta.2.zip'])
    expect(await createUpdateBackup(dataDir, backups, '../x', '0.3.0')).toMatchObject({ ok: false })
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
