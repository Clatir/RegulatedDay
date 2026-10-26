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
      oneDriveRunning: () => true
    })
    await folder.check()
    const state = await folder.dayState(TODAY)
    const requests = await folder.collection('request')
    // The grades of frozen days come from the derived files, not the logs.
    const grades: string[] = []
    for (const year of readdirSync(join(data, 'grades'))) for (const f of readdirSync(join(data, 'grades', year))) grades.push(...readFileSync(join(data, 'grades', year, f), 'utf8').split('\n').filter(Boolean))
    const openMs = performance.now() - t0
    expect(requests.length).toBe(gen.requests)
    expect(grades.length).toBe(gen.days - 1)
    expect(state.budgetUsedMin).toBeGreaterThan(0)
    expect(openMs).toBeLessThan(3_000 * factor)

    // Daily operations, on a warm cache: a click (into the journal and the log), a check of the leader, the day counted.
    const time = async (fn: () => Promise<unknown> | unknown) => {
      const s = performance.now()
      await fn()
      return performance.now() - s
    }
    wall += 4 * 60_000
    mono += 4 * 60_000
    await folder.check()
    wall += 60_000
    mono += 60_000
    const click = await time(async () => {
      folder.append({ day: TODAY, dom: 'timer', k: 'disconnect.start', at: wall })
      await folder.log.flush()
    })
    const check = await time(() => folder.check())
    const day = await time(() => folder.dayState(TODAY))
    for (const [what, ms] of Object.entries({ click, check, day })) expect(ms, what).toBeLessThan(100 * factor)
  })
})
