/**
 * The test of scale (spec „Skala”, plan E1): a folder of 3 years (about 1 100 days, 15 000 blocks, 3 000 requests) opens
 * in under 3 s, and the daily operations take under 0.1 s. The limits are scaled by the disk's measured speed: a short
 * calibration of small files against a reference time (a slow CI disk gets proportionally more time, never less).
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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

let root: string
let data: string
let gen: Generated
let factor = 1

function calibrate(dir: string): number {
  mkdirSync(dir, { recursive: true })
  const t0 = performance.now()
  for (let i = 0; i < 300; i++) writeFileSync(join(dir, `f${i}.json`), JSON.stringify({ i, text: 'x'.repeat(400) }))
  for (const n of readdirSync(dir)) JSON.parse(readFileSync(join(dir, n), 'utf8'))
  return performance.now() - t0
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-scale-'))
  data = join(root, 'OneDrive', 'RegulatedDay')
  gen = generate(data, TODAY)
  factor = Math.max(1, calibrate(join(root, 'calibration')) / REFERENCE_MS)
}, 300_000)

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('test skali (3 lata danych)', () => {
  it('zestaw ma rozmiar z celu: ~1100 dni, ~15 000 bloków, ~3000 próśb', () => {
    expect(gen.days).toBe(1100)
    expect(gen.blocks).toBeGreaterThanOrEqual(15_000)
    expect(gen.requests).toBeGreaterThanOrEqual(3_000)
  })

  it('otwarcie folderu poniżej 3 s, codzienne operacje poniżej 0,1 s', { timeout: 120_000 }, async () => {
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
    expect(requests.length).toBe(gen.requests)
    expect(grades.length).toBe(gen.days - 1)
    expect(state.budgetUsedMin).toBeGreaterThan(0)
    expect(openMs).toBeLessThan(3_000 * factor)

    // Daily operations, on a warm cache: a click (into the journal and the log), a check of the leader, the day counted,
    // the day's energy, the game (the streak and the notes of 3 years from the files of grades, today's notes so far).
    // Three rounds of a minute, each with a new click („Odcinam się”, „Wracam”, „Odcinam się”), so every operation works
    // on a changed log as in the app; each counts by its best round – one pause of a shared CI runner (the GC, the
    // scheduler) is not the operation's time, while a slow operation is slow in every round (T499).
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
    }
    expect(summary!.steps).toHaveLength(gen.days - 1)
    expect(summary!.notes.final).toBeGreaterThan(5_000)
    // A cassette for every week closed by its frozen Sunday (157 in 3 years), the room and the celebrations with them.
    expect(summary!.cassettes.length).toBeGreaterThanOrEqual(155)
    expect(summary!.room.next).toBeNull()
    for (const what of Object.keys(rounds[0]!)) expect(Math.min(...rounds.map((r) => r[what]!)), what).toBeLessThan(100 * factor)
    // The look at all 3000 files, once a minute at most: under 0.3 s.
    expect(Math.min(...fullLooks), 'requests (pełne przejrzenie)').toBeLessThan(300 * factor)
  })
})
