import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { sessionAtStart, type SessionHelper } from '../../src/main/crash/session'

/** A helper that is not running yet; it answers „session.start” as the volatile key would (the previous run: A). */
class LateHelper extends EventEmitter implements SessionHelper {
  running = false
  readonly requests: Array<{ cmd: string; args?: Record<string, unknown> }> = []
  request(cmd: string, args?: Record<string, unknown>): Promise<{ [key: string]: unknown }> {
    this.requests.push({ cmd, args })
    return Promise.resolve({ existed: true, prevRunId: 'A' })
  }
  start(): void {
    this.running = true
    this.emit('status', { state: 'running' })
  }
}

describe('klucz sesji logowania przy starcie (Terminy, D181)', () => {
  it('pomocnik w czasie: identyfikator poprzedniego uruchomienia do werdyktu, klucz z tym uruchomieniem', async () => {
    const h = new LateHelper()
    setTimeout(() => h.start(), 5)
    expect(await sessionAtStart(h, 'B', 1000, () => undefined)).toEqual({ prevRunId: 'A' })
    expect(h.requests).toEqual([{ cmd: 'session.start', args: { runId: 'B' } }])
  })

  it('pomocnik spóźniony: werdykt bez klucza, ale klucz i tak dostaje to uruchomienie, gdy pomocnik ruszy', async () => {
    const h = new LateHelper()
    const log: string[] = []
    expect(await sessionAtStart(h, 'B', 20, (_l, m) => void log.push(m))).toBeNull()
    expect(h.requests).toEqual([])
    h.start()
    await new Promise((r) => setTimeout(r, 0))
    expect(h.requests).toEqual([{ cmd: 'session.start', args: { runId: 'B' } }])
    expect(log).toContain('klucz sesji logowania ustawiony po starcie pomocnika')
    // Once only, and no listener left behind.
    h.start()
    expect(h.requests).toHaveLength(1)
    expect(h.listenerCount('status')).toBe(0)
  })

  it('bez pomocnika: brak klucza', async () => {
    expect(await sessionAtStart(null, 'B', 10, () => undefined)).toBeNull()
  })
})
