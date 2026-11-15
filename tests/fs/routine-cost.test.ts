/**
 * D512 in a real data folder: the leader counts a day from the routines too (`inputs().routines`) – the energy of a block of a routine with
 * a cost of its own is the routine's; a routine changed in its file counts at once (its file looked at every time, never from the memory
 * of a list). A routine's file that cannot be read now keeps the version read before (the cost stays); one never read in this run is
 * unknown (`routinesUnknown`): its blocks cost as without it, and a block begun then writes no routine's cost in its start – its cost is
 * the routine's once the file reads again, never an empty cost frozen for good. The days remembered for the views are counted again only
 * when a routine's cost changes, not at every change of its steps.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import type { EnergyState } from '@shared/engine/energy'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { inProcess } from '../../src/main/worker/host'

const DAY = '2026-10-21'
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-routine-cost-'))
  dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const write = (rel: string, v: unknown) => {
  mkdirSync(join(dataDir, rel, '..'), { recursive: true })
  writeFileSync(join(dataDir, rel), typeof v === 'string' ? v : JSON.stringify(v))
}
const ROUTINE = paths.record('routine', 'poranek')
const routine = (costs: unknown, steps = [{ id: 'a', name: 'Prysznic', min: 30 }]) => ({ schema: 1, id: 'poranek', name: 'Poranek', archived: false, normal: steps, worse: [], costs })
const curve = (e: EnergyState) => (['head', 'emotions', 'senses'] as const).map((p) => Array.from(e.series[p]))

async function make() {
  const now = placeLogical(DAY, 9 * 60)
  const runs: string[] = []
  const folder = await DataFolder.open({
    fs: nodeFs,
    dataDir,
    stateDir: join(root, 'state'),
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '1.25.0',
    clock: { wall: () => now, mono: () => now },
    holidays: marketDay,
    oneDriveRunning: () => true,
    worker: { run: (t) => (runs.push(t.kind === 'horizon' ? `${t.kind}:${t.ctx.date}` : t.kind), inProcess.run(t)) as never }
  })
  folder.append({ day: DAY, dom: 'energy', k: 'energy.checkin', at: placeLogical(DAY, 7 * 60), answers: { head: [0, 0], emotions: [0, 0], senses: [0, 0] } })
  folder.append({ day: DAY, dom: 'meta', k: 'presence.first', at: placeLogical(DAY, 7 * 60) })
  await folder.log.flush()
  return { folder, runs }
}

/** The day with one block of „Rutyny” (10:00, 2 h) pointing at the routine, or (`costs`) the same block with an own cost instead. */
function day(o: { routine?: string | null; costs?: unknown; cat?: string } = {}) {
  write(paths.day(DAY), { schema: 1, date: DAY, dayType: 'zwykly', blocks: [{ id: 'm', categoryId: o.cat ?? 'rutyny', startMin: 10 * 60, durationMin: 120, origin: 'user', routine: o.routine ?? null, costs: o.costs ?? null }] })
}

describe('koszt rutyny u prowadzącego (D512)', () => {
  it('wejścia dnia mają rutyny; energia bloku rutyny z kosztem – jak ten sam koszt własny; zmiana pliku rutyny liczy się od razu', async () => {
    write(ROUTINE, routine({ head: 5, emotions: 5, senses: 5 }))
    day({ routine: 'poranek' })
    const { folder } = await make()
    expect((await folder.inputs()).routines.map((r) => [r.id, r.costs])).toEqual([['poranek', { head: 5, emotions: 5, senses: 5 }]])
    const viaRoutine = curve((await folder.energyState(DAY)).energy)
    day({ costs: { head: 5, emotions: 5, senses: 5 } })
    expect(curve((await folder.energyState(DAY)).energy)).toEqual(viaRoutine)
    // The routine without a cost now (its file rewritten, no minute waited): the block costs its category's.
    day({ routine: 'poranek' })
    write(ROUTINE, routine(null))
    const category = curve((await folder.energyState(DAY)).energy)
    expect(category).not.toEqual(viaRoutine)
    day()
    expect(curve((await folder.energyState(DAY)).energy)).toEqual(category)
  })

  it('rutyna na bloku innej kategorii (ukryta w panelu) nie daje kosztu także u prowadzącego', async () => {
    write(ROUTINE, routine({ head: 5, emotions: 5, senses: 5 }))
    day({ routine: 'poranek', cat: 'inne' })
    const { folder } = await make()
    const hidden = curve((await folder.energyState(DAY)).energy)
    day({ cat: 'inne' })
    expect(curve((await folder.energyState(DAY)).energy)).toEqual(hidden)
  })

  it('plik rutyny nieczytelny po dobrym odczycie – zostaje znana wersja (koszt się nie gubi)', async () => {
    write(ROUTINE, routine({ head: 5, emotions: 5, senses: 5 }))
    day({ routine: 'poranek' })
    const { folder } = await make()
    const before = curve((await folder.energyState(DAY)).energy)
    write(ROUTINE, '{ "id": "poranek", "costs": { "head"')
    expect((await folder.inputs()).routines.map((r) => r.costs)).toEqual([{ head: 5, emotions: 5, senses: 5 }])
    expect(curve((await folder.energyState(DAY)).energy)).toEqual(before)
  })

  it('plik rutyny nieczytelny od otwarcia: rutyna nieznana – dzień się liczy, start bloku nie zamraża pustego kosztu; po naprawie pliku – koszt rutyny', async () => {
    write(ROUTINE, '{ "id": "poranek", "costs": { "head"')
    day({ routine: 'poranek' })
    const { folder } = await make()
    const inp = await folder.inputs()
    expect(inp.routines).toEqual([])
    expect(inp.routinesUnknown).toEqual(['poranek'])
    const unknown = curve((await folder.energyState(DAY)).energy)
    day()
    expect(curve((await folder.energyState(DAY)).energy)).toEqual(unknown)
    day({ routine: 'poranek' })
    expect((await folder.timerClick({ a: 'start', block: 'm', day: DAY } as never)).ok).toBe(true)
    await folder.log.flush()
    const start = (await folder.log.readDay(DAY)).events.find((e) => (e as { k?: string }).k === 'block.start') as unknown as { planned: Record<string, unknown> }
    expect(start.planned).not.toHaveProperty('routineCosts')
    // The file reads again: the begun block costs the routine's (as one begun with it would).
    write(ROUTINE, routine({ head: 5, emotions: 5, senses: 5 }))
    const repaired = (await folder.dayState(DAY)).blocks.find((b) => b.id === 'm')!
    expect(repaired.routineCosts).toEqual({ head: 5, emotions: 5, senses: 5 })
    expect(curve((await folder.energyState(DAY)).energy)).not.toEqual(unknown)
  })

  it('dni zapamiętane dla widoków liczą się od nowa po zmianie kosztu rutyny, nie po zmianie jej kroków', async () => {
    write(ROUTINE, routine({ head: 5, emotions: 5, senses: 5 }))
    day({ routine: 'poranek' })
    const { folder, runs } = await make()
    await folder.weekView(DAY)
    expect(runs.filter((r) => r.startsWith('horizon')).length).toBeGreaterThan(0)
    runs.length = 0
    write(ROUTINE, routine({ head: 5, emotions: 5, senses: 5 }, [{ id: 'a', name: 'Prysznic i kawa', min: 35 }]))
    await folder.weekView(DAY)
    expect(runs.filter((r) => r.startsWith('horizon'))).toEqual([])
    write(ROUTINE, routine({ head: 4, emotions: 5, senses: 5 }, [{ id: 'a', name: 'Prysznic i kawa', min: 35 }]))
    await folder.weekView(DAY)
    expect(runs).toContain(`horizon:${DAY}`)
  })
})
