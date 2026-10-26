/**
 * The leader's tasks keep the energy apart (fix after the review of E2): an error in counting the energy never stops the
 * segments of minutes and the hard end of E1.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { readLogText } from '@shared/data/logText'
import { paths } from '@shared/data/paths'
import { placeLogical } from '@shared/time/day'
import { DataFolder } from '../../src/main/data/folder'
import { nodeFs } from '../../src/main/data/fsio'

const broken = vi.hoisted(() => ({ on: true }))
vi.mock('@shared/engine/energy', async (orig) => {
  const m = await orig<typeof import('@shared/engine/energy')>()
  return {
    ...m,
    computeEnergy: (...a: Parameters<typeof m.computeEnergy>) => {
      if (broken.on) throw new Error('energia w teście')
      return m.computeEnergy(...a)
    }
  }
})

const DAY = '2026-10-21'
let root: string
let dataDir: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-folder-energy-'))
  dataDir = join(root, 'data')
  mkdirSync(dataDir, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('zadania prowadzącego a energia', () => {
  it('błąd liczenia energii nie zatrzymuje odcinków minut', async () => {
    writeFileSync(join(dataDir, paths.settings), JSON.stringify({ schema: 1, settings: [] }))
    let now = placeLogical(DAY, 9 * 60)
    const folder = await DataFolder.open({
      fs: nodeFs,
      dataDir,
      stateDir: join(root, 'state'),
      computer: 'pca',
      computerName: 'PC A',
      appVersion: '0.2.0',
      clock: { wall: () => now, mono: () => now },
      holidays: marketDay,
      oneDriveRunning: () => true
    })
    folder.append({ day: DAY, dom: 'timer', k: 'block.start', block: 'x', at: now, bg: false, planned: { categoryId: 'analiza', variantId: null, durationMin: 600, tag: null, fixed: false }, confirmUntil: null, how: 'click' })
    let last = await folder.check()
    for (let i = 0; i < 10; i++) {
      now += 60_000
      folder.noteInput(now, true)
      last = await folder.check()
    }
    const events = readLogText(readFileSync(join(dataDir, paths.log(DAY, 'pca')), 'utf8')).events
    expect(events.filter((e) => e.k === 'minutes').length).toBeGreaterThan(0)
    expect(last.problems.some((p) => p.includes('energia w teście'))).toBe(true)
  })
})
