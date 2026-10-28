import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MANIFEST_ASSET, SETUP_ASSET } from '@shared/update'
import { readTask } from '@shared/task'

// Every process the code under test starts (the real spawn still runs).
const spawned = vi.hoisted(() => [] as string[])
vi.mock('node:child_process', async (importOriginal) => {
  const m = await importOriginal<typeof import('node:child_process')>()
  const spawn = ((cmd: string, ...rest: unknown[]) => {
    spawned.push(cmd)
    return (m.spawn as (...a: unknown[]) => unknown)(cmd, ...rest)
  }) as typeof m.spawn
  return { ...m, spawn }
})
// The files written through a temporary file (the real writer still writes).
const atomic = vi.hoisted(() => [] as string[])
vi.mock('../../src/main/update/files', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/main/update/files')>()
  return { ...m, writeSyncAtomic: (path: string, text: string) => (atomic.push(path), m.writeSyncAtomic(path, text)) }
})

const { guardModeAsync, stageInstall, stageInstallAsync, startInstall } = await import('../../src/main/update/install')
const { UpdateController } = await import('../../src/main/update/controller')

let root = ''
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rd-install-'))
  spawned.length = 0
})
// A controller's check started by `init` (its fetch rejected) may still write its state while the folder goes: retried.
afterEach(() => rmSync(root, { recursive: true, force: true, maxRetries: 5 }))

/** A ready download of 0.1.1 whose „installer” is no program (it cannot start). */
function download(): { userData: string; updateDir: string; dl: string; helperDir: string } {
  const userData = join(root, 'data')
  const updateDir = join(userData, 'update')
  const dl = join(updateDir, '0.1.1', 'download')
  const helperDir = join(root, 'helper')
  mkdirSync(dl, { recursive: true })
  mkdirSync(helperDir, { recursive: true })
  writeFileSync(join(dl, SETUP_ASSET), 'to nie jest program')
  writeFileSync(join(dl, MANIFEST_ASSET), '{}')
  writeFileSync(join(dl, 'ready.json'), JSON.stringify({ version: '0.1.1', notes: '' }))
  return { userData, updateDir, dl, helperDir }
}

describe('przygotowanie instalacji (update\\<X>)', () => {
  it('kopia programu tego samego rozmiaru, ale innej treści, jest zastąpiona; bez plików tymczasowych', () => {
    const { updateDir, dl, helperDir } = download()
    writeFileSync(join(helperDir, 'rd-guard.exe'), 'nowy strażnik')
    const dir = join(updateDir, '0.1.1')
    // Another version's guard of the very same size.
    writeFileSync(join(dir, 'rd-guard.exe'), 'stary strażni')
    expect(readFileSync(join(dir, 'rd-guard.exe')).length).toBe(readFileSync(join(helperDir, 'rd-guard.exe')).length)
    stageInstall({ updateDir, version: '0.1.1', downloadDir: dl, helperDir })
    expect(readFileSync(join(dir, 'rd-guard.exe'), 'utf8')).toBe('nowy strażnik')
    expect(readFileSync(join(dir, SETUP_ASSET), 'utf8')).toBe('to nie jest program')
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('w tle (zaraz po pobraniu) to samo, bez trzymania procesu głównego', async () => {
    const { updateDir, dl, helperDir } = download()
    writeFileSync(join(helperDir, 'rd-install.exe'), 'pomocnik instalacji')
    const dir = await stageInstallAsync({ updateDir, version: '0.1.1', downloadDir: dl, helperDir })
    expect(readFileSync(join(dir, 'rd-install.exe'), 'utf8')).toBe('pomocnik instalacji')
    expect(readFileSync(join(dir, MANIFEST_ASSET), 'utf8')).toBe('{}')
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })
})

describe('tryb strażnika w tle', () => {
  it('jeden wiersz JSON; bez odpowiedzi {"ok": false} z kodem', async () => {
    expect(await guardModeAsync(process.execPath, ['-e', 'console.log("x"); console.log(JSON.stringify({ ok: true, approved: false }))'])).toEqual({ ok: true, approved: false })
    const none = await guardModeAsync(process.execPath, ['-e', 'process.exit(3)'])
    expect(none.ok).toBe(false)
    expect(String(none.error)).toContain('brak odpowiedzi')
  })
})

describe('instalacja, która nie wystartowała', () => {
  it('ścieżka FI: instalator się nie uruchamia – bez okna stanu, zadanie „nieudane” (nie świeże „FI”), stare przekazania usunięte', () => {
    const { userData, updateDir, dl, helperDir } = download()
    writeFileSync(join(updateDir, '0.1.1', 'handover.jsonl'), `${JSON.stringify({ at: 1, hidden: false, url: null })}\n`)
    const ok = startInstall({ version: '0.1.1', downloadDir: dl, updateDir, helperDir, trigger: 'now', start: 'visible', url: null, autostart: true, appPid: process.pid, owner: false, userDataDir: userData, log: () => undefined })
    expect(ok).toBe(false)
    expect(spawned.filter((c) => /powershell/i.test(c))).toEqual([])
    // Starts handed over to an earlier attempt are gone with the new one.
    expect(existsSync(join(updateDir, '0.1.1', 'handover.jsonl'))).toBe(false)
    const t = readTask(readFileSync(join(updateDir, '0.1.1', 'task.json'), 'utf8'))
    expect(t.kind === 'task' && t.task.state).toBe('failed')
  })

  it('aplikacja żyje dalej: pobranie znów gotowe, kolejna próba możliwa, znacznik życia wznowiony, bez wyjścia', () => {
    const { userData, helperDir } = download()
    const calls = { before: 0, failed: 0, quit: 0 }
    const c = new UpdateController({
      enabled: true,
      version: '0.1.0',
      userData,
      helperDir,
      fetch: () => Promise.reject(new Error('bez sieci')),
      helperRunning: () => false,
      autostartOn: () => true,
      nightInstall: () => false,
      beforeInstall: () => void calls.before++,
      installFailed: () => void calls.failed++,
      quit: () => void calls.quit++,
      openExternal: () => undefined,
      broadcast: () => undefined,
      log: () => undefined
    })
    c.init(null, null)
    expect(c.view().phase).toBe('ready')
    expect(c.install('now', 'visible')).toBe(false)
    expect(c.view().phase).toBe('ready')
    expect(calls).toEqual({ before: 1, failed: 1, quit: 0 })
    expect(c.install('now', 'visible')).toBe(false)
    expect(calls).toEqual({ before: 2, failed: 2, quit: 0 })
    c.updater?.stopAuto()
  })

  it('„Spróbuj ponownie” po niedokończonej instalacji uruchomionej wersji: jej własny instalator jeszcze raz', async () => {
    const { userData, updateDir, helperDir } = download()
    writeFileSync(join(updateDir, '0.1.1', 'task.json'), `${JSON.stringify({ format: 1, version: '0.1.1', state: 'failed', message: 'pliki niezgodne z manifestem' })}\n`)
    const calls = { before: 0 }
    const c = new UpdateController({
      enabled: true,
      version: '0.1.1',
      userData,
      helperDir,
      fetch: () => Promise.reject(new Error('bez sieci')),
      helperRunning: () => false,
      autostartOn: () => true,
      nightInstall: () => false,
      beforeInstall: () => void calls.before++,
      installFailed: () => undefined,
      quit: () => undefined,
      openExternal: () => undefined,
      broadcast: () => undefined,
      log: () => undefined
    })
    c.init({ kind: 'unfinished', version: '0.1.1' }, null)
    await c.action('retry')
    // The attempt was made (its installer here is no program, so it stops right after).
    expect(calls.before).toBe(1)
    expect(spawned.some((s) => s.endsWith(SETUP_ASSET))).toBe(true)
    c.updater?.stopAuto()
  })

  it('właściciel trzyma guard.lock wersji X: żadnej drugiej instalacji, jego zadanie nietknięte', () => {
    const { userData, updateDir, helperDir } = download()
    const calls = { before: 0 }
    const c = new UpdateController({
      enabled: true,
      version: '0.1.0',
      userData,
      helperDir,
      fetch: () => Promise.reject(new Error('bez sieci')),
      helperRunning: () => true,
      autostartOn: () => true,
      nightInstall: () => false,
      beforeInstall: () => void calls.before++,
      installFailed: () => undefined,
      lockHeld: (p) => p === join(updateDir, '0.1.1', 'guard.lock'),
      quit: () => undefined,
      openExternal: () => undefined,
      broadcast: () => undefined,
      log: () => undefined
    })
    c.init(null, null)
    expect(c.atAutostart()).toBe(false)
    expect(calls.before).toBe(0)
    expect(existsSync(join(updateDir, '0.1.1', 'task.json'))).toBe(false)
    c.updater?.stopAuto()
  })

  it('pomocnik instalacji, który nie wystartował: zadanie „nieudane”, nie „zaplanowane” (A5-06)', () => {
    const { userData, updateDir, dl, helperDir } = download()
    writeFileSync(join(helperDir, 'rd-guard.exe'), '')
    writeFileSync(join(helperDir, 'rd-install.exe'), '')
    atomic.length = 0
    const ok = startInstall({ version: '0.1.1', downloadDir: dl, updateDir, helperDir, trigger: 'exit', start: 'none', url: null, autostart: true, appPid: process.pid, owner: true, userDataDir: userData, log: () => undefined })
    // The task file only through a temporary file – the owner reads it meanwhile (A5-09).
    expect(atomic.filter((p) => p.endsWith('task.json')).length).toBeGreaterThan(0)
    if (ok) return // a platform that starts an empty file (it cannot be told here)
    const t = readTask(readFileSync(join(updateDir, '0.1.1', 'task.json'), 'utf8'))
    expect(t.kind === 'task' && t.task.state).toBe('failed')
  })
})

describe('proces odłączony, który nie wystartował (A5-11, strażnik naprawy przy starcie)', () => {
  it('plik, który nie jest programem: bez wyjątku, null i wpis w logu', async () => {
    const { startDetached } = await import('../../src/main/update/install')
    const file = join(root, 'rd-guard.exe')
    writeFileSync(file, 'to nie jest program')
    const logs: string[] = []
    expect(() => startDetached(file, ['--task', 'x'], root, 'strażnik naprawy', (_l, m) => void logs.push(m))).not.toThrow()
    await vi.waitFor(() => expect(logs.some((m) => m.startsWith('strażnik naprawy nie wystartował'))).toBe(true))
  })
})

describe('instalacja a sesja i zajęcia (A5-02, A5-03, A5-05)', () => {
  const controller = (o: { userData: string; helperDir: string; sessionOrClass?: () => boolean; before: { n: number } }) =>
    new UpdateController({
      enabled: true,
      version: '0.1.0',
      userData: o.userData,
      helperDir: o.helperDir,
      fetch: () => Promise.reject(new Error('bez sieci')),
      helperRunning: () => true,
      autostartOn: () => true,
      nightInstall: () => false,
      beforeInstall: () => void o.before.n++,
      installFailed: () => undefined,
      sessionOrClass: o.sessionOrClass,
      quit: () => undefined,
      openExternal: () => undefined,
      broadcast: () => undefined,
      log: () => undefined
    })

  it('wyjście i start z Windows w czasie sesji albo zajęć: nic się nie instaluje', () => {
    const { userData, helperDir } = download()
    const before = { n: 0 }
    const c = controller({ userData, helperDir, sessionOrClass: () => true, before })
    c.init(null, null)
    c.onQuit(false)
    expect(c.atAutostart()).toBe(false)
    expect(before.n).toBe(0)
    c.updater?.stopAuto()
  })

  it('plan strażnika: sesja teraz albo w ciągu 30 min blokuje, później nie', async () => {
    const { planBlocking, writePlan } = await import('../../src/main/update/files')
    const { userData } = download()
    const now = Date.UTC(2026, 9, 28, 12, 0)
    writePlan(userData, [{ start: now + 20 * 60_000, end: now + 80 * 60_000, kind: 'session' }], now - 60 * 60_000)
    expect(planBlocking(userData, now)).toBe(true)
    expect(planBlocking(userData, now - 15 * 60_000)).toBe(false)
    expect(planBlocking(userData, now + 81 * 60_000)).toBe(false)
  })

  it('plan strażnika, którego nie ma, nie da się odczytać albo który nie obejmuje tej chwili: jak strażnik – bez instalacji', async () => {
    const { planBlocking, writePlan } = await import('../../src/main/update/files')
    const { userData } = download()
    const now = Date.UTC(2026, 9, 28, 12, 0)
    expect(planBlocking(userData, now)).toBe(true)
    writeFileSync(join(userData, 'plan-blocks.json'), '{"format":1,')
    expect(planBlocking(userData, now)).toBe(true)
    writePlan(userData, [], now - 8 * 24 * 60 * 60_000)
    expect(planBlocking(userData, now)).toBe(true)
    writePlan(userData, [], now - 60_000)
    expect(planBlocking(userData, now)).toBe(false)
  })

  it('pusty plan przy starcie tylko bez folderu danych – nieczytelny config.json zostawia ostatni plan (A5-02)', async () => {
    const { emptyPlanAtStart } = await import('../../src/main/update/files')
    expect(emptyPlanAtStart({ dataFolder: null, configUnreadable: false })).toBe(true)
    expect(emptyPlanAtStart({ dataFolder: 'C:\\OneDrive\\RD', configUnreadable: false })).toBe(false)
    expect(emptyPlanAtStart({ dataFolder: null, configUnreadable: true })).toBe(false)
  })

  it('„nieudane” dla X: noc nie zgłasza „instaluję X”', () => {
    const { userData, updateDir, helperDir } = download()
    writeFileSync(join(updateDir, '0.1.1', 'task.json'), `${JSON.stringify({ format: 1, version: '0.1.1', state: 'failed', message: 'x' })}\n`)
    const c = controller({ userData, helperDir, before: { n: 0 } })
    c.init(null, null)
    expect(c.automaticReady()).toBeNull()
    c.updater?.stopAuto()
  })
})
