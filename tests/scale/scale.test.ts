/**
 * The test of scale (spec „Skala”, plan E1): a folder of 3 years (about 1 100 days, 15 000 blocks, 3 000 requests) opens
 * in under 3 s, and the daily operations take under 0.1 s. The limits are scaled by the disk's measured speed: a short
 * calibration of small files against a reference time (a slow CI disk gets proportionally more time, never less). The disk's
 * speed changes while the test runs (parallel workers, a virus scanner), so the opening is scaled by the slower of the
 * calibrations before and after it, and each round of the daily operations by the slower of the two taken around it
 * (instead of the one from the start).
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { addDays } from '@shared/time/zone'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'
import { generate, type Generated } from './generate'

const TODAY = '2026-10-21'
/** Writing and reading 300 small files takes about this long on a plain SSD. */
const REFERENCE_MS = 120
/** The short calibration around each round of the daily operations: 100 files, so a third of the reference time. */
const ROUND_FILES = 100
const ROUND_REFERENCE_MS = (REFERENCE_MS * ROUND_FILES) / 300
/** The same kind of work as the folder does (many files at once through the thread pool): 300 files, about this long on a plain SSD. */
const ASYNC_REFERENCE_MS = 100

let root: string
let data: string
let gen: Generated
let factor = 1

/** The disk and the machine now: how many times slower than the plain SSD the synchronous and the parallel asynchronous work on small files is (at least 1). */
async function disk(root: string): Promise<number> {
  const sync = calibrate(join(root, 'calibration-round'), ROUND_FILES) / ROUND_REFERENCE_MS
  // A busy machine slows the folder's many parallel reads far more than one thread's synchronous loop (measured: the look at
  // 3000 files 30–60-fold of the quiet one while the synchronous calibration said 8–17-fold).
  const dir = join(root, 'calibration-async')
  mkdirSync(dir, { recursive: true })
  const t0 = performance.now()
  await Promise.all(Array.from({ length: 300 }, (_, i) => writeFile(join(dir, `f${i}.json`), JSON.stringify({ i, text: 'x'.repeat(400) }))))
  await Promise.all(readdirSync(dir).map(async (n) => JSON.parse(await readFile(join(dir, n), 'utf8'))))
  return Math.max(1, sync, (performance.now() - t0) / ASYNC_REFERENCE_MS)
}

function calibrate(dir: string, files = 300): number {
  mkdirSync(dir, { recursive: true })
  const t0 = performance.now()
  for (let i = 0; i < files; i++) writeFileSync(join(dir, `f${i}.json`), JSON.stringify({ i, text: 'x'.repeat(400) }))
  for (const n of readdirSync(dir)) JSON.parse(readFileSync(join(dir, n), 'utf8'))
  return performance.now() - t0
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-scale-'))
  data = join(root, 'OneDrive', 'RegulatedDay')
  gen = generate(data, TODAY)
  factor = Math.max(1, calibrate(join(root, 'calibration')) / REFERENCE_MS)
}, 300_000)

// Deleting ~5 700 generated files took 4–12 s with the synchronous `rmSync` on a loaded disk (the default hook timeout is
// 10 s; the Windows runner passed it, then exceeded it): slow, not stuck. The asynchronous `rm` does not hold the thread
// (1.8 s against 5.3 s in the same conditions) and the hook gets a limit well above what was measured.
afterAll(() => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }), 120_000)

describe('test skali (3 lata danych)', () => {
  it('zestaw ma rozmiar z celu: ~1100 dni, ~15 000 bloków, ~3000 próśb', () => {
    expect(gen.days).toBe(1100)
    expect(gen.blocks).toBeGreaterThanOrEqual(15_000)
    expect(gen.requests).toBeGreaterThanOrEqual(3_000)
  })

  it('otwarcie folderu poniżej 3 s, codzienne operacje poniżej 0,1 s', { timeout: 600_000 }, async () => {
    let wall = Date.parse(`${TODAY}T10:00:00Z`)
    let mono = 0
    const t0 = performance.now()
    const folder = await DataFolder.open({
      fs: nodeFs,
      dataDir: data,
      stateDir: join(root, 'state'),
      computer: 'pca',
      computerName: 'PC A',
      appVersion: '0.2.0',
      clock: { wall: () => wall, mono: () => mono },
      holidays: marketDay,
      oneDriveRunning: () => true,
      // The game over the whole folder; the ritual from today – its days are already frozen (the files of grades).
      ritualFrom: TODAY,
      gameFrom: addDays(TODAY, -gen.days)
    })
    await folder.check()
    const state = await folder.dayState(TODAY)
    const requests = await folder.collection('request')
    // The grades of frozen days come from the derived files, not the logs.
    const grades: string[] = []
    for (const year of readdirSync(join(data, 'grades'))) for (const f of readdirSync(join(data, 'grades', year))) grades.push(...readFileSync(join(data, 'grades', year, f), 'utf8').split('\n').filter(Boolean))
    // The first view of the game reads the files of grades of 3 years and writes the unlocked room – once after the
    // start, so it counts into the opening (T499).
    let summary = await folder.gameState()
    const openMs = performance.now() - t0
    // The opening takes tens of seconds when the machine is loaded (30-fold of the quiet one measured with three scale runs
    // and the whole suite at once), so it is scaled by the slower of the disk before it and the disk right after it.
    const afterOpen = await disk(root)
    expect(requests.length).toBe(gen.requests)
    expect(grades.length).toBe(gen.days - 1)
    expect(state.budgetUsedMin).toBeGreaterThan(0)
    expect(openMs, `otwarcie (dysk przed ${factor.toFixed(1)}×, po ${afterOpen.toFixed(1)}×)`).toBeLessThan(3_000 * Math.max(factor, afterOpen))

    // Daily operations, on a warm cache: a click (into the journal and the log), a check of the leader, the day counted,
    // the day's energy, the game (the streak and the notes of 3 years from the files of grades, today's notes so far).
    // Three rounds of a minute, each with a new click („Odcinam się”, „Wracam”, „Odcinam się”), so every operation works
    // on a changed log as in the app; each counts by its best round – one pause of a shared CI runner (the GC, the
    // scheduler) is not the operation's time, while a slow operation is slow in every round (T499). The disk is measured
    // again around every round (the slower of the two measurements scales the round): a load that came after the calibration
    // of the start slowed the first rounds 10-fold on a shared machine, and the last round was already fast.
    const time = async (fn: () => Promise<unknown>) => {
      const s = performance.now()
      await fn()
      return performance.now() - s
    }
    wall += 4 * 60_000
    mono += 4 * 60_000
    await folder.check()
    const rounds: Record<string, number>[] = []
    const fullLooks: number[] = []
    const measured = [afterOpen]
    for (const k of ['disconnect.start', 'disconnect.end', 'disconnect.start'] as const) {
      wall += 60_000
      mono += 60_000
      // A minute on: the requests' files are looked at again once (the window's first view after it); every view after
      // that within LIST_TRUST_MS takes them from memory.
      fullLooks.push(await time(() => folder.collection('request')))
      rounds.push({
        click: await time(async () => {
          folder.append({ day: TODAY, dom: 'timer', k, at: wall })
          await folder.log.flush()
        }),
        check: await time(() => folder.check()),
        day: await time(() => folder.dayState(TODAY)),
        energy: await time(() => folder.energyState(TODAY)),
        game: await time(async () => (summary = await folder.gameState())),
        // The window's view and its signature read every request at each change (A3-08).
        requests: await time(() => folder.collection('request'))
      })
      measured.push(await disk(root))
    }
    // A round is scaled by the slower of the two measurements around it.
    const factors = rounds.map((_, k) => Math.max(1, measured[k]!, measured[k + 1]!))
    expect(summary!.steps).toHaveLength(gen.days - 1)
    expect(summary!.notes.final).toBeGreaterThan(5_000)
    // A cassette for every week closed by its frozen Sunday (157 in 3 years), the room and the celebrations with them.
    expect(summary!.cassettes.length).toBeGreaterThanOrEqual(155)
    expect(summary!.room.next).toBeNull()
    // Each operation counts by its best round, against the limit of that round's disk.
    const best = (values: number[], limit: number) => Math.min(...values.map((v, k) => v / (limit * factors[k]!)))
    for (const what of Object.keys(rounds[0]!)) expect(best(rounds.map((r) => r[what]!), 100), `${what} (część limitu 0,1 s; w rundach ${rounds.map((r) => Math.round(r[what]!)).join(', ')} ms, dysk ${factors.map((f) => f.toFixed(1)).join(', ')}×)`).toBeLessThan(1)
    // The look at all 3000 files, once a minute at most: under 0.3 s.
    expect(best(fullLooks, 300), `requests (pełne przejrzenie: ${fullLooks.map(Math.round).join(', ')} ms, dysk ${factors.map((f) => f.toFixed(1)).join(', ')}×)`).toBeLessThan(1)
  })
})
