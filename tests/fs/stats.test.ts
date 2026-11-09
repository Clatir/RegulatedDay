/**
 * Statystyki z folderu (D358): the frozen days of a period from the files of grades, each counted from its log up to the
 * events its freeze names; a day not frozen, today and the days before the period are not in it; a frozen day that
 * cannot be read is counted apart; the days are counted again only when what they are made of changed.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { paths } from '@shared/data/paths'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { inProcess, type Worker } from '../../src/main/worker/host'

const TODAY = '2026-10-21'
let root: string
let dataDir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-stats-'))
  dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

async function make(worker?: Worker) {
  const clock = { now: placeLogical(TODAY, 10 * 60) }
  const folder = await DataFolder.open({
    ...(worker ? { worker } : {}),
    fs: nodeFs,
    dataDir,
    stateDir: join(root, 'state'),
    computer: 'pca',
    computerName: 'PC A',
    appVersion: '1.3.0',
    clock: { wall: () => clock.now, mono: () => clock.now },
    holidays: marketDay,
    oneDriveRunning: () => true,
    ritualFrom: '2026-01-01',
    gameFrom: '2026-01-01'
  })
  return { folder, clock }
}

/** A day's log: the presence, a check-in at 08:00 (all answers „trochę” – 65), a request of 20 min of „mama”, a felt cost; returns the last event number. */
function writeDay(day: string, o: { extra?: boolean } = {}): number {
  mkdirSync(join(dataDir, paths.logDir(day)), { recursive: true })
  const lines: string[] = []
  let n = 0
  const ev = (k: string, dom: string, at: number, extra: Record<string, unknown> = {}) => lines.push(JSON.stringify({ id: `pca-${day}-${n}`, c: 'pca', n: n++, t: at, l: at, v: 1, day, dom, k, at, ...extra }))
  const at = (hhmm: number) => placeLogical(day, hhmm)
  ev('presence.first', 'meta', at(7 * 60))
  ev('energy.checkin', 'energy', at(8 * 60), { answers: { head: [1, 1], emotions: [1, 1], senses: [1, 1] } })
  ev('request.start', 'timer', at(12 * 60), { request: 'r1', mode: 'now', person: 'mama', estimateMin: null, hardEndAt: null })
  ev('request.end', 'timer', at(12 * 60 + 20), { request: 'r1' })
  ev('cost.felt', 'energy', at(21 * 60), { category: 'analiza', feel: 'heavier' })
  const know = n - 1
  // What came after the freeze: „poza oceną”.
  if (o.extra) ev('energy.checkin', 'energy', at(15 * 60), { answers: { head: [2, 2], emotions: [2, 2], senses: [2, 2] } })
  writeFileSync(join(dataDir, paths.log(day, 'pca')), lines.join('\n') + '\n')
  return know
}

function grade(days: Record<string, number>, extra: Record<string, unknown> = {}): void {
  mkdirSync(join(dataDir, 'grades', '2026'), { recursive: true })
  const lines = Object.entries(days).map(([day, know]) => JSON.stringify({ day, at: placeLogical(addDays(day, 2), 9 * 60), v: 1, how: 'ready', know: { pca: know }, missing: [], grade: { boundary: 'kept', free: false, closed: 'ritual', dayType: 'zwykly', ...extra } }))
  writeFileSync(join(dataDir, paths.grades('2026', 'pca')), lines.join('\n') + '\n')
}

describe('statystyki z folderu', () => {
  it('dni zamrożone okresu z ich logów: energia, prośby, odczuwany koszt, granice; zdarzenia po zamrożeniu nie liczą się', async () => {
    const days = ['2026-10-12', '2026-10-13', '2026-10-14']
    const known = Object.fromEntries(days.map((d, i) => [d, writeDay(d, { extra: i === 0 })]))
    grade(known)
    const m = await make()
    const r = await m.folder.stats('4w')
    expect(r).toMatchObject({ period: '4w', days: 3, first: '2026-10-12', last: '2026-10-14', unreadable: 0, enough: true })
    expect(r.energy.checkins).toBe(3)
    expect(r.energy.byHour[2]).toEqual({ key: 2, checkins: 3, mean: 65 })
    expect(r.energy.felt).toEqual([{ category: 'analiza', answers: 3, heavier: 3, share: 1, reliable: true }])
    expect(r.requests).toMatchObject({ count: 3, minutes: 60, people: [{ person: 'mama', count: 3, minutes: 60 }] })
    expect(r.boundaries.totals).toEqual({ kept: 3, broken: 0, noData: 0, free: 0 })
    // 2026-10-12 is a Monday: all three days in one week.
    expect(r.boundaries.weeks).toEqual([{ week: '2026-10-12', kept: 3, broken: 0, noData: 0, free: 0 }])
  })

  it('okres: 4 tygodnie nie sięgają dalej, „od początku” tak; dzień bez oceny i dzisiejszy nie liczą się', async () => {
    const old = '2026-06-20'
    const recent = '2026-10-15'
    const open = '2026-10-16'
    const known = { [old]: writeDay(old), [recent]: writeDay(recent) }
    writeDay(open)
    writeDay(TODAY)
    grade({ ...known, [TODAY]: 4 })
    const m = await make()
    expect((await m.folder.stats('4w')).first).toBe(recent)
    expect((await m.folder.stats('4w')).days).toBe(1)
    expect((await m.folder.stats('3m')).days).toBe(1)
    // 3 months back from today: 2026-07-22.
    const all = await m.folder.stats('all')
    expect(all).toMatchObject({ days: 2, first: old, last: recent, enough: false })
  })

  it('dzień zamrożony, którego logu nie da się odczytać, jest pominięty i policzony jako nieczytelny', async () => {
    const good = ['2026-10-12', '2026-10-13']
    const known = Object.fromEntries(good.map((d) => [d, writeDay(d)]))
    // Its grade is there, its log is not (OneDrive has not brought it yet).
    grade({ ...known, '2026-10-14': 3 })
    const m = await make()
    const r = await m.folder.stats('4w')
    expect(r).toMatchObject({ days: 2, unreadable: 1, enough: false })
    expect(r.energy.checkins).toBe(2)
  })

  it('bez zamrożonych dni – pusty wynik; kolejne liczenie bierze dni z pamięci, zmiana loga liczy dzień od nowa', async () => {
    const calls: string[] = []
    const worker: Worker = {
      run: (t) => {
        calls.push(t.kind)
        return inProcess.run(t)
      }
    }
    const m = await make(worker)
    expect(await m.folder.stats('all')).toMatchObject({ days: 0, enough: false, unreadable: 0 })
    const d = '2026-10-12'
    grade({ [d]: writeDay(d) })
    expect((await m.folder.stats('all')).days).toBe(1)
    expect(calls).toEqual(['stats'])
    await m.folder.stats('all')
    expect(calls).toEqual(['stats'])
    // A later line of the log (OneDrive brings another computer's records): the day is counted again.
    writeDay(d, { extra: true })
    await m.folder.stats('all')
    expect(calls).toEqual(['stats', 'stats'])
  })
})
