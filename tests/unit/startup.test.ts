import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { manifestMismatch } from '../../src/main/update/files'
import { runStartup, type StartupDeps } from '../../src/main/update/startup'
import { readTask, writeTask, type Task } from '@shared/task'

const DIR = 'C:\\upd'
const T = `${DIR}\\0.1.1`

function task(patch: Partial<Task> = {}): Task {
  return {
    format: 1,
    version: '0.1.1',
    attemptId: 'a1',
    state: 'installing',
    trigger: 'exit',
    start: 'none',
    url: null,
    autostart: true,
    guid: 'G',
    uninstallKey: 'K',
    installDir: 'C:\\App',
    appExe: 'C:\\App\\Regulated Day.exe',
    installer: 'Regulated-Day-Setup.exe',
    manifest: 'Regulated-Day-manifest.json',
    attempts: 1,
    starts: 1,
    cleanEnd: false,
    installerStartedAt: 0,
    installerPid: null,
    createdAt: 0,
    updatedAt: 0,
    ...patch
  } as Task
}

interface World {
  deps: StartupDeps
  files: Map<string, string>
  held: Set<string>
  log: string[]
  guardStarts: number
  removed: number
  killed: number
  clock: { now: number }
}

function world(opts: { version: string; argv?: string[]; task?: Task | string | null; lock?: (now: number) => { held: boolean; counter: number } | null; sizes?: boolean; alive?: Set<number> }): World {
  const files = new Map<string, string>()
  const held = new Set<string>()
  const log: string[] = []
  const clock = { now: 1_000_000 }
  if (opts.task !== null && opts.task !== undefined) files.set(`${T}\\task.json`, typeof opts.task === 'string' ? opts.task : writeTask(opts.task))
  const w: World = {
    files,
    held,
    log,
    guardStarts: 0,
    removed: 0,
    killed: 0,
    clock,
    deps: {
      updateDir: DIR,
      version: opts.version,
      argv: opts.argv ?? ['Regulated Day.exe'],
      protocol: 'regulatedday',
      now: () => clock.now,
      sleep: async (ms) => {
        clock.now += ms
      },
      readText: (p) => {
        if (p.endsWith('guard.lock')) {
          const l = opts.lock?.(clock.now)
          return l ? JSON.stringify({ role: 'guard', pid: 42, startMs: 5, counter: l.counter }) : null
        }
        return files.get(p) ?? null
      },
      writeText: (p, t) => void files.set(p, t),
      appendText: (p, t) => void files.set(p, (files.get(p) ?? '') + t),
      listDirs: (d) => (d === DIR ? ['0.1.1'] : null),
      heldOpen: (p) => (p.endsWith('guard.lock') ? !!opts.lock?.(clock.now)?.held : held.has(p)),
      processAlive: (pid) => opts.alive?.has(pid) ?? false,
      filesMismatch: () => ((opts.sizes ?? true) ? null : 'resources/app.asar – 1 B zamiast 2 B'),
      startGuard: () => {
        w.guardStarts++
        return { pid: 77, exited: () => false }
      },
      killOwner: () => {
        w.killed++
        return true
      },
      removeGuardEntry: () => void w.removed++,
      log: (_l, m) => void log.push(m)
    }
  }
  return w
}

const state = (w: World) => (readTask(w.files.get(`${T}\\task.json`) ?? null) as { kind: string; task?: Task }).task?.state

describe('start aplikacji przy zadaniu instalacji (Instalacja, aktualizacje i log)', () => {
  it('brak zadania, nieczytelne, nieznany format, „odłożono” i „nieudane”: zwykły start bez opóźnienia', async () => {
    for (const t of [null, '{oops', JSON.stringify({ format: 9, version: '0.1.1', state: 'installing' }), task({ state: 'postponed' }), task({ state: 'failed' })]) {
      const w = world({ version: '0.1.0', task: t })
      const r = await runStartup(w.deps)
      expect(r.kind).toBe('normal')
      expect(w.clock.now).toBe(1_000_000)
    }
    const w = world({ version: '0.1.0', task: '{oops' })
    await runStartup(w.deps)
    expect(w.log.join(' ')).toContain('nieczytelny')
  })

  it('FI z żywym instalatorem: starsza wersja i X bez --updated kończą się od razu', async () => {
    const live = task({ state: 'fi', installerPid: 900, updatedAt: 1_000_000 - 5000 })
    for (const version of ['0.1.0', '0.1.1']) {
      const w = world({ version, task: live, alive: new Set([900]) })
      w.held.add(`${T}\\Regulated-Day-Setup.exe`)
      expect((await runStartup(w.deps)).kind).toBe('exit')
      expect(w.clock.now).toBe(1_000_000)
    }
    // Fresh „FI” without the installer's id yet counts as live too.
    const fresh = world({ version: '0.1.0', task: task({ state: 'fi', installerPid: null, updatedAt: 1_000_000 - 10_000 }) })
    expect((await runStartup(fresh.deps)).kind).toBe('exit')
  })

  it('FI po instalacji: X ze zgodnymi plikami „zakończono”, z niezgodnymi „nieudane” i baner, starsza „nie udała się”', async () => {
    const dead = task({ state: 'fi', installerPid: 900, updatedAt: 1_000_000 - 5000 })
    const ok = world({ version: '0.1.1', task: dead, argv: ['x', '--updated'] })
    const r = await runStartup(ok.deps)
    expect(r.kind === 'normal' && r.afterLock?.()).toBe(null)
    expect(state(ok)).toBe('done')
    const bad = world({ version: '0.1.1', task: dead, sizes: false })
    const rb = await runStartup(bad.deps)
    expect(rb.kind === 'normal' && rb.afterLock?.()).toEqual({ kind: 'unfinished', version: '0.1.1' })
    expect(state(bad)).toBe('failed')
    // The log names the file that disagrees.
    expect(bad.log).toContain('pliki niezgodne z manifestem 0.1.1: resources/app.asar – 1 B zamiast 2 B')
    const older = world({ version: '0.1.0', task: dead })
    const ro = await runStartup(older.deps)
    expect(ro.kind === 'normal' && ro.afterLock?.()).toEqual({ kind: 'failed', version: '0.1.1' })
  })

  it('wersja nowsza niż X kończy zadanie i usuwa wpis strażnika; X tylko przy „zakończono”', async () => {
    const newer = world({ version: '0.1.2', task: task() })
    const r = await runStartup(newer.deps)
    expect(r.kind).toBe('normal')
    if (r.kind === 'normal') r.afterLock?.()
    expect(state(newer)).toBe('done')
    expect(newer.removed).toBe(1)
    const doneX = world({ version: '0.1.1', task: task({ state: 'done' }) })
    const rd = await runStartup(doneX.deps)
    if (rd.kind === 'normal') rd.afterLock?.()
    expect(doneX.removed).toBe(1)
  })

  it('X uruchomiona przez właściciela (--updated) potwierdza start i nie przekazuje go', async () => {
    const w = world({ version: '0.1.1', task: task(), argv: ['x', '--updated'], lock: () => ({ held: true, counter: 3 }) })
    const r = await runStartup(w.deps)
    expect(r.kind === 'normal' && r.confirmed?.version).toBe('0.1.1')
    expect(w.files.has(`${T}\\handover.jsonl`)).toBe(false)
  })

  it('żywy strażnik (licznik zmienił się w 6 s): start przekazany i koniec', async () => {
    const w = world({ version: '0.1.0', task: task(), argv: ['x', '--hidden'], lock: (now) => ({ held: true, counter: Math.floor(now / 5000) }) })
    const r = await runStartup(w.deps)
    expect(r.kind).toBe('exit')
    expect(w.clock.now - 1_000_000).toBe(6000)
    expect(JSON.parse(w.files.get(`${T}\\handover.jsonl`)!.trim())).toMatchObject({ hidden: true, url: null })
    expect(w.guardStarts).toBe(0)
  })

  it('zawieszony strażnik (sygnał stoi 30 s): zamknięty, nowy strażnik przejmuje start', async () => {
    let started = 0
    const w = world({
      version: '0.1.0',
      task: task(),
      lock: (now) => (started ? { held: true, counter: 100 + Math.floor((now - started) / 2000) } : { held: true, counter: 7 })
    })
    const start = w.deps.startGuard
    w.deps.startGuard = (dir) => {
      started = w.clock.now
      return start(dir)
    }
    const r = await runStartup(w.deps)
    expect(w.killed).toBe(1)
    expect(w.guardStarts).toBe(1)
    expect(r.kind).toBe('exit')
  })

  it('wolny guard.lock: aplikacja uruchamia strażnika i czeka; bez właściciela w 60 s „nieudane” i baner', async () => {
    const w = world({ version: '0.1.0', task: task(), lock: () => ({ held: false, counter: 0 }) })
    const r = await runStartup(w.deps)
    expect(w.guardStarts).toBe(1)
    expect(r).toMatchObject({ kind: 'normal', banner: { kind: 'unfinished', version: '0.1.1' } })
    expect(state(w)).toBe('failed')
    expect(w.removed).toBe(1)
    expect(w.clock.now - 1_000_000).toBeGreaterThanOrEqual(60_000)
  })
})

describe('pliki instalacji według manifestu (rozmiary)', () => {
  it('pierwszy plik brakujący albo o innym rozmiarze; null, gdy wszystkie się zgadzają', () => {
    const root = mkdtempSync(join(tmpdir(), 'rd-manifest-'))
    try {
      const app = join(root, 'app')
      mkdirSync(join(app, 'resources'), { recursive: true })
      writeFileSync(join(app, 'a.dll'), 'abc')
      writeFileSync(join(app, 'resources', 'app.asar'), 'abcd')
      const files = [
        { path: 'a.dll', size: 3, sha256: '0'.repeat(64) },
        { path: 'resources/app.asar', size: 4, sha256: '0'.repeat(64) }
      ]
      const write = (f: typeof files) => writeFileSync(join(root, 'm.json'), JSON.stringify({ format: 1, version: '0.1.1', electron: '44.5.1', files: f }))
      const t = task({ installDir: app, manifest: 'm.json' })
      write(files)
      expect(manifestMismatch(root, t)).toBeNull()
      write([files[0]!, { ...files[1]!, size: 5 }])
      expect(manifestMismatch(root, t)).toBe('resources/app.asar – 4 B zamiast 5 B')
      write([...files, { path: 'resources/helper/rd-guard.exe', size: 1, sha256: '0'.repeat(64) }])
      expect(manifestMismatch(root, t)).toBe('resources/helper/rd-guard.exe – brak pliku')
      writeFileSync(join(root, 'm.json'), '{')
      expect(manifestMismatch(root, t)).toMatch(/^manifest nieczytelny/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
