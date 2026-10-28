import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HELPER_CRASH_WINDOW_MS, HelperClient, helperUnavailable, restartDelay } from '../../src/main/helper/client'

describe('pomocnik po awarii (Widget → Pomocnik)', () => {
  it('ponowny start po 5 s, potem coraz rzadziej, najwyżej co 5 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12].map(restartDelay)).toEqual([5000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000])
  })

  it('3 awarie w 10 min: „niedostępny”; starsze się nie liczą', () => {
    const now = 1_000_000_000
    expect(helperUnavailable([now - 1000, now - 2000], now)).toBe(false)
    expect(helperUnavailable([now - 1000, now - 2000, now - 3000], now)).toBe(true)
    expect(helperUnavailable([now - HELPER_CRASH_WINDOW_MS - 1, now - 2000, now - 3000], now)).toBe(false)
  })

  it('program, którego nie da się uruchomić (pusty exe), to awaria – start aplikacji idzie dalej (A4-01)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rd-helper-'))
    const logs: string[] = []
    const program = join(dir, 'rd-helper.exe')
    writeFileSync(program, '')
    const client = new HelperClient({ program, cwd: dir, init: {}, log: (_l, msg) => logs.push(msg) })
    try {
      expect(() => client.start()).not.toThrow()
      // Thrown at once on Windows, an error event on Linux: either way a crash, a start again later.
      for (let i = 0; i < 50 && !logs.some((l) => l.startsWith('pomocnik zakończył się')); i++) await new Promise((r) => setTimeout(r, 20))
      expect(logs).toContain('pomocnik nie wystartował')
      expect(client.status.state).toBe('starting')
      expect(client.running).toBe(false)
    } finally {
      client.stop()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
