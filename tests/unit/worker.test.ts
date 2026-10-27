/**
 * The helper process (T190): a task answered by its id; a crash fails the tasks waiting and the next task starts a new
 * process; a task over its limit kills the hung process and starts again with a line in the log; the quit stops it. The
 * CSV task writes its three files through temporary ones.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { rdFrom } from '@shared/model/rd'
import { WorkerHost, type WorkerChild } from '../../src/main/worker/host'
import { runTask } from '../../src/main/worker/tasks'
import { block, Scenario } from './engine/dsl'

/** A fake child: it answers what `reply` says (or nothing – a hang), and can crash. */
function fakeChild(reply: (task: { kind: string }) => unknown | undefined) {
  const listeners: { message?: (m: unknown) => void; exit?: (c: number) => void } = {}
  let killed = false
  const child: WorkerChild & { crash: (code: number) => void; killed: () => boolean } = {
    postMessage: (m) => {
      const { id, task } = m as { id: number; task: { kind: string } }
      const r = reply(task)
      if (r !== undefined) queueMicrotask(() => listeners.message?.({ id, ok: true, result: r }))
    },
    on: (event: 'message' | 'exit', l: never) => {
      listeners[event] = l
      return child
    },
    kill: () => {
      killed = true
      return true
    },
    crash: (code) => listeners.exit?.(code),
    killed: () => killed
  }
  return child
}

describe('proces pomocniczy', () => {
  it('odpowiedź po identyfikatorze zadania; jeden proces na wiele zadań', async () => {
    let forks = 0
    const host = new WorkerHost({ fork: () => (forks++, fakeChild(() => 'ok')), log: () => undefined })
    expect(await Promise.all([host.run({ kind: 'ping' }), host.run({ kind: 'ping' })])).toEqual(['ok', 'ok'])
    expect(forks).toBe(1)
  })

  it('awaria: czekające zadania odrzucone, następne uruchamia nowy proces, w logu linia', async () => {
    const children: Array<ReturnType<typeof fakeChild>> = []
    const lines: string[] = []
    const host = new WorkerHost({ fork: () => (children.push(fakeChild((t) => (t.kind === 'ping' && children.length > 1 ? 'ok' : undefined))), children.at(-1)!), log: (_l, m) => lines.push(m) })
    const p = host.run({ kind: 'ping' })
    children[0]!.crash(1)
    await expect(p).rejects.toThrow('zakończył się')
    expect(await host.run({ kind: 'ping' })).toBe('ok')
    expect(children).toHaveLength(2)
    expect(lines.some((l) => l.includes('zakończył się (kod 1)'))).toBe(true)
  })

  it('zawieszenie: po limicie czasu proces zabity, zadanie odrzucone, następne w nowym procesie', async () => {
    const children: Array<ReturnType<typeof fakeChild>> = []
    const host = new WorkerHost({ fork: () => (children.push(fakeChild(() => (children.length > 1 ? 'ok' : undefined))), children.at(-1)!), log: () => undefined, timeouts: { ping: 20 } })
    await expect(host.run({ kind: 'ping' })).rejects.toThrow('limit czasu')
    expect(children[0]!.killed()).toBe(true)
    expect(await host.run({ kind: 'ping' })).toBe('ok')
  })

  it('wyjście zatrzymuje proces; nowe zadanie jest odmówione', async () => {
    const child = fakeChild(() => undefined)
    const host = new WorkerHost({ fork: () => child, log: () => undefined })
    const p = host.run({ kind: 'ping' })
    host.stop()
    await expect(p).rejects.toThrow('zatrzymany')
    expect(child.killed()).toBe(true)
    await expect(host.run({ kind: 'ping' })).rejects.toThrow('zatrzymany')
  })
})

describe('zadanie CSV', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('zapisuje trzy pliki (przez pliki tymczasowe – żadnego nie zostaje)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'rd-csv-'))
    const s = new Scenario({ date: '2026-10-28', plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] })
    s.ran('a', '08:00', '09:00')
    const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
    expect(await runTask({ kind: 'csv', days: [{ ctx: s.contextAt(s.at('20:00')), names }], dir })).toEqual(['bloki.csv', 'prosby.csv', 'checkiny.csv'])
    expect(readdirSync(dir).sort()).toEqual(['bloki.csv', 'checkiny.csv', 'prosby.csv'])
    expect(readFileSync(join(dir, 'bloki.csv'), 'utf8')).toContain('28.10.2026;Inne obowiązki')
  })
})
