/**
 * The self-test of the real helper on Windows CI (spec „Testy”): what it reads of the session, the layout of
 * SYSTEM_POWER_CAPABILITIES (CI machines report modern standby off – only the layout can be checked), the volatile key of
 * the logon session, the attributes of files on a path with Polish letters, the power requests – with the culture pl-PL
 * and the zone „Central European Standard Time” set by the job, so a Polish format never leaks into the JSON; and the
 * guard's self-test.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, existsSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { expect, test } from '@playwright/test'

const HELPER = resolve(process.env.RD_HELPER_EXE ?? 'release/win-unpacked/resources/helper/rd-helper.exe')

test.skip(process.platform !== 'win32' || !existsSync(HELPER), 'Windows CI: needs the built helper')

class Helper {
  private child: ChildProcess
  private lines: Array<Record<string, unknown>> = []
  private waiters: Array<() => void> = []
  private id = 1
  constructor(cwd: string, identity: string) {
    this.child = spawn(HELPER, [], { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    createInterface({ input: this.child.stdout! }).on('line', (l) => {
      this.lines.push(JSON.parse(l) as Record<string, unknown>)
      for (const w of this.waiters.splice(0)) w()
    })
    this.child.stdin!.write(`${JSON.stringify({ cmd: 'init', identity, aumid: 'app.regulatedday.test', logs: join(cwd, 'logs') })}\n`)
  }
  async waitFor(pred: (m: Record<string, unknown>) => boolean, ms = 15_000): Promise<Record<string, unknown>> {
    const until = Date.now() + ms
    for (;;) {
      const found = this.lines.find(pred)
      if (found) return found
      if (Date.now() > until) throw new Error(`pomocnik: brak odpowiedzi; linie: ${JSON.stringify(this.lines).slice(0, 2000)}`)
      await new Promise<void>((r) => {
        this.waiters.push(r)
        setTimeout(r, 200)
      })
    }
  }
  async request(cmd: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.id++
    this.child.stdin!.write(`${JSON.stringify({ cmd, id, ...args })}\n`)
    return this.waitFor((m) => m.re === id)
  }
  quit(): Promise<number | null> {
    this.child.stdin!.write(`${JSON.stringify({ cmd: 'quit' })}\n`)
    return new Promise((r) => this.child.once('exit', (code) => r(code)))
  }
}

test('samotest pomocnika: sesja, powiadomienia, układ SYSTEM_POWER_CAPABILITIES, kultura niezmienna', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rd-pomocnik-'))
  // A path with Polish letters: the working folder, the logs and the attributes.
  const cwd = join(root, 'Zażółć gęślą jaźń')
  mkdirSync(cwd, { recursive: true })
  const h = new Helper(cwd, `Regulated Day Samotest ${Date.now()}`)
  await h.waitFor((m) => m.type === 'hello')
  const s = await h.request('selftest')
  expect(s.ok).toBe(true)
  expect(s.powerCapabilities).toEqual({ size: 76, aoAcOffset: 20, batteryScaleOffset: 32, acOnLineWakeOffset: 56 })
  expect(s.logonId).toMatch(/^[0-9a-f]{16}$/)
  expect(['notPresent', 'busy', 'd3dFullscreen', 'presentation', 'accepts', 'quietTime', 'app', 'unknown']).toContain(s.notificationState)
  expect(['enabled', 'disabledForApplication', 'disabledForUser', 'disabledByGroupPolicy', 'disabledByManifest', 'unknown']).toContain(s.toastSetting)
  expect(s.culture).toBe('')
  expect(String(s.framework)).toMatch(/^4\./)
  // The runner's temp folder is a short 8.3 path (RUNNER~1): compared by the long one.
  expect(String(s.cwd).toLowerCase()).toBe(realpathSync.native(cwd).toLowerCase())
  console.log('samotest pomocnika:', JSON.stringify(s))

  // The volatile key: the second run in the same logon session sees the first.
  const first = await h.request('session.start', { runId: 'run-1' })
  const second = await h.request('session.start', { runId: 'run-2' })
  expect(second.existed).toBe(true)
  expect(second.prevRunId).toBe('run-1')
  expect(second.prevLogonId).toBe(first.logonId)

  const attrs = (await h.request('attributes', { paths: [cwd, join(cwd, 'brak')] })).attributes as Record<string, number>
  expect(attrs[cwd]! & 0x10).toBe(0x10)
  expect(attrs[join(cwd, 'brak')]).toBe(-1)

  // The confirmation the guard waits for at a logon in a session (T523): the helper's working folder, by any spelling
  // (the runner's short 8.3 path, the long one, another case), held only with the lock of sleep.
  const sleepHeld = (dir: string) => {
    const r = spawnSync(join(dirname(HELPER), 'rd-guard.exe'), ['--query', 'sleepHeld', '--user-data', dir], { encoding: 'utf8', windowsHide: true })
    return JSON.parse(r.stdout.trim()) as { ok: boolean; held: boolean }
  }
  expect(sleepHeld(cwd)).toMatchObject({ ok: true, held: false })
  const power = await h.request('power', { display: true, system: true, reason: 'Regulated Day: samotest' })
  expect(power).toMatchObject({ display: true, system: true })
  expect(sleepHeld(cwd).held).toBe(true)
  expect(sleepHeld(realpathSync.native(cwd).toUpperCase() + '\\').held).toBe(true)
  expect(await h.request('power', { display: true, system: false })).toMatchObject({ display: true, system: false })
  expect(sleepHeld(cwd).held).toBe(false)
  expect(await h.request('power', { display: false, system: false })).toMatchObject({ display: false, system: false })
  expect(await h.request('powerState')).toHaveProperty('modernStandby')

  expect(await h.quit()).toBe(0)
  expect(readFileSync(join(cwd, 'logs', 'helper.log'), 'utf8')).toContain('koniec')
})

test('samotest strażnika: kultura niezmienna, licznik ustawiony przez właściciela czytany od razu (limit 4 startów)', () => {
  const r = spawnSync(join(dirname(HELPER), 'rd-guard.exe'), ['--selftest'], { encoding: 'utf8', windowsHide: true })
  const s = JSON.parse(r.stdout.trim()) as Record<string, unknown>
  expect(s.ok).toBe(true)
  expect(s.culture).toBe('')
  expect(s.powerCapabilities).toEqual({ size: 76, aoAcOffset: 20, batteryScaleOffset: 32, acOnLineWakeOffset: 56 })
  expect(s.startsAfterSet).toBe(4)
  // Install.Compare orders versions as the app does (beta.10 after beta.9, build metadata ignored).
  expect(s.versionOrderWrong).toBe(0)
})
