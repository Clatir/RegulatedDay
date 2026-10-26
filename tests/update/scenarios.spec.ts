/**
 * Windows CI: the scenarios of the installation (spec „Testy”, „Instalacja, aktualizacje i log”) beyond the four paths:
 * the guard's modes and 10 000 parallel writes of the task file, two guards and the app at once, exceptions of the
 * guard (once while the installer works, at every start, a failed write of its count), four logons with „odłożono” and a
 * guard dying right after it, „Uruchom mimo to” while the files are copied and before the installer, a hung and a
 * missing guard, X+1 installed by hand while a task for X waits, the installer run by hand (its marker within 5 s of
 * the clock), the app opened while the install helper works, a slowed installer, the installer's mutex held by the
 * test, a file locked before the uninstall and while the files are copied, and the crash dumps of the main process, the
 * renderer and the GPU.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { minidumpProcessType } from '../../src/main/crash/minidump'
import { mainPage } from '../e2e/app'
import { RDWIN_PRELUDE, click, foreground, topWindows, type TopWindow } from '../e2e/win32'
import { readSharedSync, writeSyncAtomic } from '../../src/main/update/files'
import { newTask } from '../../src/main/update/install'
import { readTask, writeTask, type Task } from '../../src/shared/task'
import { APP_EXE, MANIFEST, SETUP, appProcesses, appRunning, dump, installed, powershell, processEnd, productionData, readJson, readText, runEntry, sha256, sleep, stopAll, uninstall } from './util'

const FROM = resolve(process.env.RD_UPDATE_FROM ?? 'release')
const TO = resolve(process.env.RD_UPDATE_TO ?? 'release-next')
const NEXT = process.env.RD_UPDATE_TO_VERSION ?? ''
const CURRENT = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version
const HELPERS = ['rd-guard.exe', 'rd-install.exe', 'rd-helper.exe']

test.skip(process.platform !== 'win32' || !NEXT, 'Windows CI only: needs release/ and release-next/')
// Each test starts from a fresh installation: one failure does not skip the rest (one worker, in order).
test.describe.configure({ mode: 'default' })

const env = (extra: Record<string, string> = {}): Record<string, string> => ({
  ...(process.env as Record<string, string>),
  // No release server here: the downloads are staged by the tests.
  RD_UPDATE_URL: 'http://127.0.0.1:9',
  RD_UPDATE_CHECK_DELAY_MS: '3600000',
  ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  ...extra
})

const taskDir = (v = NEXT) => join(productionData(), 'update', v)
const taskFile = (v = NEXT) => join(taskDir(v), 'task.json')
const readTaskNow = (v = NEXT): Task | null => {
  const r = readTask(readSharedSync(taskFile(v)))
  return r.kind === 'task' ? r.task : null
}

async function install(from: string, version: string): Promise<string> {
  await stopAll()
  expect(await uninstall()).toBe(true)
  // Every test counts only its own log lines (the serial group repeats from the start after a failure).
  for (const p of ['update', 'logs', 'launched.json', 'closed-by-installer.json', 'plan-blocks.json']) rmSync(join(productionData(), p), { recursive: true, force: true, maxRetries: 10 })
  const r = spawnSync(join(from, SETUP), ['/S'], { stdio: 'ignore', timeout: 600_000 })
  expect(r.status).toBe(0)
  await expect.poll(() => installed()?.version, { timeout: 120_000 }).toBe(version)
  mkdirSync(productionData(), { recursive: true })
  writeFileSync(join(productionData(), 'config.json'), `${JSON.stringify({ format: 1, autostart: { enabled: true } }, null, 2)}\n`)
  return installed()!.dir
}

/** A download staged and copied with the programs, as the updater leaves it (`version` from `from`). */
function stage(installDir: string, from = TO, version = NEXT): void {
  const dl = join(taskDir(version), 'download')
  mkdirSync(dl, { recursive: true })
  for (const f of [SETUP, MANIFEST]) {
    copyFileSync(join(from, f), join(dl, f))
    copyFileSync(join(from, f), join(taskDir(version), f))
  }
  writeFileSync(join(dl, 'ready.json'), `${JSON.stringify({ version, notes: 'CI', at: Date.now() })}\n`)
  for (const p of HELPERS) {
    copyFileSync(join(installDir, 'resources', 'helper', p), join(taskDir(version), p))
    copyFileSync(join(installDir, 'resources', 'helper', `${p}.config`), join(taskDir(version), `${p}.config`))
  }
}

/** A task the app would write (no owner started), with the guard's Run entry. */
function scheduleTask(installDir: string, trigger: Task['trigger'], version = NEXT): Task {
  const task = { ...newTask({ version, trigger, start: trigger === 'logon' ? 'hidden' : 'none', url: null, autostart: true }, 'scheduled', Date.now()), installDir, appExe: join(installDir, APP_EXE) }
  writeFileSync(taskFile(version), writeTask(task))
  const r = spawnSync(join(taskDir(version), 'rd-guard.exe'), ['--run-entry', 'set'], { encoding: 'utf8' })
  expect(JSON.parse(r.stdout.trim()).ok).toBe(true)
  return task
}

/** The guard as Windows starts it from its Run entry at a logon. */
function logon(extraEnv: Record<string, string> = {}): ChildProcess {
  return spawn(join(taskDir(), 'rd-guard.exe'), ['--autostart'], { cwd: taskDir(), detached: true, stdio: 'ignore', env: env(extraEnv) })
}

const exited = (p: ChildProcess, ms: number) =>
  new Promise<boolean>((r) => {
    if (p.exitCode != null) return r(true)
    const t = setTimeout(() => r(false), ms)
    p.once('exit', () => {
      clearTimeout(t)
      r(true)
    })
  })

const plan = (blocking: boolean) =>
  writeSyncAtomic(
    join(productionData(), 'plan-blocks.json'),
    `${JSON.stringify({ format: 1, from: Date.now() - 60_000, to: Date.now() + 7 * 86_400_000, blocks: blocking ? [{ start: Date.now() - 60_000, end: Date.now() + 3_600_000, kind: 'session' }] : [] })}\n`
  )

async function expectNext(installDir: string): Promise<void> {
  await expect.poll(() => installed()?.version, { timeout: 600_000, intervals: [2000] }).toBe(NEXT)
  await expect.poll(() => appProcesses().some((p) => p.path.toLowerCase() === join(installDir, APP_EXE).toLowerCase()), { timeout: 180_000, intervals: [1000] }).toBe(true)
}

const count = (text: string, re: RegExp) => (text.match(new RegExp(re.source, 'g')) ?? []).length

async function guarded(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    await dump(name)
    throw e
  } finally {
    await stopAll()
  }
}

test('tryby strażnika: proces, który właśnie się skończył, daje {"ok": false}; 10 000 równoległych zapisów pliku zadania', async () => {
  test.setTimeout(15 * 60_000)
  const guard = resolve(FROM, 'win-unpacked', 'resources', 'helper', 'rd-guard.exe')
  const child = spawn('cmd.exe', ['/C', 'exit 0'])
  const pid = child.pid!
  await exited(child, 10_000)
  const r = spawnSync(guard, ['--query', 'process', '--pid', String(pid)], { encoding: 'utf8' })
  expect(JSON.parse(r.stdout.trim())).toMatchObject({ ok: false })
  // C# and Node write and read the same file at once.
  const dir = join(productionData(), 'stress')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'task.json')
  const cs = spawn(guard, ['--stress-write', file, '--count', '10000'], { stdio: ['ignore', 'pipe', 'ignore'] })
  let out = ''
  cs.stdout!.on('data', (d) => (out += String(d)))
  let failed = 0
  let unreadable = 0
  let missing = 0
  for (let i = 0; i < 10_000; i++) {
    try {
      writeSyncAtomic(file, writeTask({ ...newTask({ version: '0.0.0', trigger: 'exit', start: 'none', url: null, autostart: false }, 'scheduled', Date.now()) }))
    } catch {
      failed++
    }
    try {
      const t = readSharedSync(file)
      if (t == null) missing++
      else JSON.parse(t)
    } catch {
      unreadable++
    }
  }
  await exited(cs, 600_000)
  const csResult = JSON.parse(out.trim()) as { failed: number; unreadable: number; missing: number }
  console.log('10 000 zapisów – Node:', { failed, unreadable, missing }, 'C#:', csResult)
  expect({ failed, unreadable, missing }).toEqual({ failed: 0, unreadable: 0, missing: 0 })
  expect(csResult).toMatchObject({ failed: 0, unreadable: 0, missing: 0 })
  rmSync(dir, { recursive: true, force: true })
})

for (const order of ['strażnicy, potem aplikacja', 'aplikacja, potem strażnicy'] as const) {
  test(`dwóch strażników i aplikacja naraz (${order}): instalator rusza raz`, async () => {
    test.setTimeout(20 * 60_000)
    await guarded(`dwóch strażników: ${order}`, async () => {
      const dir = await install(FROM, CURRENT)
      stage(dir)
      scheduleTask(dir, 'logon')
      plan(false)
      const app = () => spawn(join(dir, APP_EXE), ['--hidden'], { detached: true, stdio: 'ignore', env: env({ RD_TEST_KEEP_PLAN: '1' }) })
      if (order === 'aplikacja, potem strażnicy') app().unref()
      logon().unref()
      logon().unref()
      if (order === 'strażnicy, potem aplikacja') app().unref()
      await expectNext(dir)
      await sleep(5000)
      expect(count(await readText(join(productionData(), 'logs', 'guard.log')), /instalator wystartował/)).toBe(1)
    })
  })
}

test('wyjątek strażnika w trakcie instalatora: nowy strażnik z --after naprawia, aplikacja uruchomiona bez ponownego logowania', async () => {
  test.setTimeout(20 * 60_000)
  await guarded('wyjątek w trakcie instalatora', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'logon')
    plan(false)
    logon({ RD_TEST_OWNER_THROW: 'duringInstaller', RD_TEST_INSTALLER_SLEEP_MS: '8000' }).unref()
    await expectNext(dir)
    const log = await readText(join(productionData(), 'logs', 'guard.log'))
    expect(log).toContain('nieobsłużony wyjątek właściciela')
    expect(log).toContain('--after')
  })
})

test('widoczny start strażnika i wymuszony wyjątek nie zmieniają okna na pierwszym planie', async () => {
  test.setTimeout(20 * 60_000)
  let probe: ChildProcess | null = null
  await guarded('pierwszy plan przy strażniku', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'exit')
    plan(false)
    probe = spawn('notepad.exe', [], { detached: true, stdio: 'ignore' })
    let pw: TopWindow | undefined
    await expect.poll(() => (pw = topWindows().find((w) => w.pid === probe!.pid && w.visible && w.cls === 'Notepad')) != null, { timeout: 30_000 }).toBe(true)
    click((pw!.rect[0] + pw!.rect[2]) / 2, pw!.rect[1] + 60)
    await expect.poll(foreground, { timeout: 10_000 }).toBe(pw!.hwnd)
    // Started by hand (no --autostart): its window shows – without taking the focus; then an exception and a new guard.
    spawn(join(taskDir(), 'rd-guard.exe'), [], { cwd: taskDir(), detached: true, stdio: 'ignore', env: env({ RD_TEST_OWNER_THROW: 'duringInstaller', RD_TEST_INSTALLER_SLEEP_MS: '15000' }) }).unref()
    const until = Date.now() + 120_000
    let sawWindow = false
    while (Date.now() < until && installed()?.version !== NEXT) {
      expect(foreground()).toBe(pw!.hwnd)
      if (topWindows().some((w) => w.visible && w.title === 'Regulated Day – aktualizacja')) sawWindow = true
      await sleep(1000)
    }
    expect(sawWindow).toBe(true)
    await expectNext(dir)
    expect(await readText(join(productionData(), 'logs', 'guard.log'))).toContain('nieobsłużony wyjątek właściciela')
  })
  ;(probe as ChildProcess | null)?.kill()
})

/**
 * „Uruchom mimo to” in the guard's window, clicked by the real cursor as soon as `marker` disappears (null: once the
 * button is there) – as you click it. UI Automation's Invoke is no click here: it sends BM_CLICK, which an inactive
 * window ignores, and the guard's window is never activated by itself. One PowerShell finds the button (and minimizes
 * what covers its window) first, then watches the file every 20 ms, so the click falls into the copying of files.
 * Answers „clicked”, „no-window”, „no-button” or „covered …” (another window at the button).
 */
function pressRunAnyway(marker: string | null): Promise<string> {
  const script = `${RDWIN_PRELUDE}
# DPI aware before UI Automation's rectangles (physical pixels, as SendInput's).
[RdWin]::At(0, 0) | Out-Null
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$scope = [System.Windows.Automation.TreeScope]
$byName = New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, 'Regulated Day – aktualizacja')
$win = $null
for ($i = 0; $i -lt 900 -and -not $win; $i++) { $win = $A::RootElement.FindFirst($scope::Children, $byName); if (-not $win) { Start-Sleep -Milliseconds 200 } }
if (-not $win) { 'no-window'; exit }
$btn = $win.FindFirst($scope::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, 'Uruchom mimo to')))
if (-not $btn) { 'no-button'; exit }
$hwnd = [long]$win.Current.NativeWindowHandle
$r = $btn.Current.BoundingRectangle
$x = [int]($r.X + $r.Width / 2)
$y = [int]($r.Y + $r.Height / 2)
[RdWin]::Uncover($hwnd) | Out-Null
Start-Sleep -Milliseconds 500
${marker ? `for ($i = 0; $i -lt 15000 -and (Test-Path -LiteralPath '${marker}'); $i++) { Start-Sleep -Milliseconds 20 }` : ''}
$at = [RdWin]::At($x, $y)
if ($at -ne [string]$hwnd) { 'covered ' + $at; exit }
[RdWin]::Click($x, $y)
'clicked'`
  return new Promise((r) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    ps.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')))
    ps.on('exit', () => r(out.trim()))
  })
}

test('„Uruchom mimo to” w czasie kopiowania plików: instalator przerwany, pliki naprawione według manifestu, nowa wersja uruchomiona', async () => {
  test.setTimeout(20 * 60_000)
  await guarded('Uruchom mimo to w czasie kopiowania', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'logon')
    plan(false)
    // The installation's marker goes with the old version's uninstall and comes back after the new files are in: while
    // it is missing, the files are being replaced. The slowed start leaves the time to find the button.
    const pressed = pressRunAnyway(join(dir, 'resources', 'rd-installed'))
    spawn(join(taskDir(), 'rd-guard.exe'), [], { cwd: taskDir(), detached: true, stdio: 'ignore', env: env({ RD_TEST_INSTALLER_SLEEP_MS: '8000' }) }).unref()
    expect(await pressed).toBe('clicked')
    await expectNext(dir)
    await expect.poll(() => readJson<{ version: string }>(join(productionData(), 'launched.json'))?.version, { timeout: 300_000, intervals: [1000] }).toBe(NEXT)
    const log = await readText(join(productionData(), 'logs', 'guard.log'))
    expect(log).toContain('„Uruchom mimo to”: przerywam instalator')
    // The repair runs to the end: a second installer, not stopped again; the stopped one is no attempt.
    expect(count(log, /instalator wystartował/)).toBe(2)
    expect(log).toContain(`zainstalowano ${NEXT}`)
    await expect.poll(() => existsSync(taskFile()), { timeout: 120_000, intervals: [1000] }).toBe(false)
    expect(runEntry('Regulated Day Guard')).toBeNull()
  })
})

test('„Uruchom mimo to” przed instalatorem: obecna wersja startuje od razu, instalacja odłożona', async () => {
  test.setTimeout(20 * 60_000)
  await guarded('Uruchom mimo to przed instalatorem', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'logon')
    plan(false)
    // Another installer's mutex: the guard waits for it (up to 60 s) – the press comes before its installer starts.
    const holder = spawn('powershell.exe', ['-NoProfile', '-Command', `$m = New-Object System.Threading.Mutex($true, 'E2A45BEE-EF15-48BC-9498-F12E5B866145'); Start-Sleep -Seconds 90; $m.ReleaseMutex()`], { stdio: 'ignore' })
    try {
      await sleep(3000)
      const pressed = pressRunAnyway(null)
      spawn(join(taskDir(), 'rd-guard.exe'), [], { cwd: taskDir(), detached: true, stdio: 'ignore', env: env() }).unref()
      expect(await pressed).toBe('clicked')
      await expect.poll(appRunning, { timeout: 120_000 }).toBe(true)
      await expect.poll(() => readTaskNow()?.state, { timeout: 60_000, intervals: [500] }).toBe('postponed')
      expect(installed()!.version).toBe(CURRENT)
      const log = await readText(join(productionData(), 'logs', 'guard.log'))
      expect(log).toContain('„Uruchom mimo to” przed instalatorem')
      expect(count(log, /instalator wystartował/)).toBe(0)
      // „odłożono”: the guard's entry stays for the next logon.
      expect(runEntry('Regulated Day Guard')).not.toBeNull()
    } finally {
      holder.kill()
    }
  })
})

test('wyjątek przy każdym starcie: najpóźniej przy czwartym starcie „nieudane” i uruchomiona aplikacja', async () => {
  test.setTimeout(15 * 60_000)
  await guarded('wyjątek przy każdym starcie', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'logon')
    plan(false)
    logon({ RD_TEST_OWNER_THROW: 'every-start' }).unref()
    await expect.poll(() => readTaskNow()?.state, { timeout: 300_000, intervals: [1000] }).toBe('failed')
    expect(readTaskNow()!.starts).toBeLessThanOrEqual(4)
    await expect.poll(appRunning, { timeout: 120_000 }).toBe(true)
    expect(installed()!.version).toBe(CURRENT)
    expect(runEntry('Regulated Day Guard')).toBeNull()
  })
})

test('nieudany zapis licznika: bez instalacji i bez nowego strażnika; kończy się „nieudane” i uruchomioną aplikacją', async () => {
  test.setTimeout(15 * 60_000)
  await guarded('nieudany zapis licznika', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'logon')
    plan(false)
    logon({ RD_TEST_TASK_WRITE_FAIL: '1' }).unref()
    await expect.poll(() => readTaskNow()?.state, { timeout: 300_000, intervals: [1000] }).toBe('failed')
    await expect.poll(appRunning, { timeout: 120_000 }).toBe(true)
    expect(installed()!.version).toBe(CURRENT)
  })
})

test('cztery logowania z „odłożono”, strażnik padający po „odłożono”, potem instalacja X', async () => {
  test.setTimeout(25 * 60_000)
  await guarded('odłożono', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'logon')
    plan(true)
    // A guard that dies right after writing „odłożono”: its count stays, nothing breaks.
    const dying = logon({ RD_TEST_DIE_AFTER_POSTPONE: '1', RD_TEST_KEEP_PLAN: '1' })
    expect(await exited(dying, 120_000)).toBe(true)
    expect(readTaskNow()).toMatchObject({ state: 'postponed', starts: 1, cleanEnd: false })
    for (let i = 0; i < 4; i++) {
      const g = logon({ RD_TEST_KEEP_PLAN: '1' })
      expect(await exited(g, 180_000)).toBe(true)
      expect(readTaskNow()).toMatchObject({ state: 'postponed', starts: 0, cleanEnd: true })
    }
    await expect.poll(appRunning, { timeout: 60_000 }).toBe(true)
    expect(installed()!.version).toBe(CURRENT)
    // The session is over: the next logon installs X.
    await stopAll()
    plan(false)
    logon({ RD_TEST_KEEP_PLAN: '1' }).unref()
    await expectNext(dir)
  })
})

test('zawieszony strażnik: aplikacja zamyka go po 30 s bez sygnału, nowy strażnik naprawia instalację', async () => {
  test.setTimeout(20 * 60_000)
  await guarded('zawieszony strażnik', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'logon')
    plan(false)
    logon({ RD_TEST_OWNER_HANG: '1' }).unref()
    await expect.poll(() => readText(join(productionData(), 'logs', 'guard.log')), { timeout: 60_000 }).toContain('RD_TEST_OWNER_HANG')
    spawn(join(dir, APP_EXE), [], { detached: true, stdio: 'ignore', env: env({ RD_TEST_KEEP_PLAN: '1' }) }).unref()
    await expectNext(dir)
    expect(await readText(join(productionData(), 'logs', 'main.log'))).toContain('zawieszony')
  })
})

test('brak programu strażnika: aplikacja startuje z banerem „nie dokończyła się”', async () => {
  test.setTimeout(15 * 60_000)
  await guarded('brak strażnika', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'exit')
    rmSync(join(taskDir(), 'rd-guard.exe'), { force: true })
    rmSync(join(dir, 'resources', 'helper', 'rd-guard.exe'), { force: true })
    const app = await electron.launch({ executablePath: join(dir, APP_EXE), env: env(), timeout: 180_000 })
    // The start waits up to 60 s for an owner before its windows exist; the first one may be the bar's or the panel's.
    await app.firstWindow({ timeout: 180_000 })
    const page = await mainPage(app)
    await expect(page.getByTestId('banner-update-failed')).toContainText('nie dokończyła się', { timeout: 120_000 })
    expect(readTaskNow()?.state).toBe('failed')
    await app.close()
  })
})

test('X+1 zainstalowana ręcznie przy zadaniu X: strażnik kończy zadanie bez cofania wersji', async () => {
  test.setTimeout(15 * 60_000)
  await guarded('X+1 przy zadaniu X', async () => {
    const dir = await install(TO, NEXT)
    // A task for the older X (= CURRENT) waits.
    stage(dir, FROM, CURRENT)
    scheduleTask(dir, 'logon', CURRENT)
    plan(false)
    const g = spawn(join(taskDir(CURRENT), 'rd-guard.exe'), ['--autostart'], { cwd: taskDir(CURRENT), detached: true, stdio: 'ignore', env: env() })
    expect(await exited(g, 300_000)).toBe(true)
    expect(installed()!.version).toBe(NEXT)
    expect(existsSync(taskFile(CURRENT))).toBe(false)
    expect(count(await readText(join(productionData(), 'logs', 'guard.log')), /instalator wystartował/)).toBe(0)
  })
})

test('ręcznie uruchomiony instalator: zamyka działającą aplikację ze znacznikiem w 5 s od zegara; to nie awaria', async () => {
  test.setTimeout(15 * 60_000)
  await guarded('ręczny instalator', async () => {
    const dir = await install(FROM, CURRENT)
    const app = await electron.launch({ executablePath: join(dir, APP_EXE), env: env() })
    await app.firstWindow()
    await sleep(5000)
    const closed = app.waitForEvent('close', { timeout: 300_000 })
    spawn(join(TO, SETUP), ['/S'], { detached: true, stdio: 'ignore' }).unref()
    await closed
    const marker = readJson<{ at: number }>(join(productionData(), 'closed-by-installer.json'))
    expect(marker).not.toBeNull()
    expect(Math.abs(marker!.at - Date.now())).toBeLessThan(60_000)
    await expect.poll(() => installed()?.version, { timeout: 600_000, intervals: [2000] }).toBe(NEXT)
    const ts = Number(powershell('[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()'))
    expect(Math.abs(marker!.at - ts)).toBeLessThan(10 * 60_000)
    // The start after it: „zamknięte przez instalator”, not a crash.
    const again = await electron.launch({ executablePath: join(dir, APP_EXE), env: env() })
    await again.firstWindow()
    await expect.poll(() => readText(join(productionData(), 'logs', 'main.log')), { timeout: 30_000 }).toMatch(/poprzednie uruchomienie: (installer|clean)/)
    await again.close()
  })
})

test('ręczny instalator: znacznik zamknięcia różni się od zegara o mniej niż 5 s', async () => {
  test.setTimeout(10 * 60_000)
  await guarded('znacznik instalatora', async () => {
    const dir = await install(FROM, CURRENT)
    const child = spawn(join(dir, APP_EXE), [], { detached: true, stdio: 'ignore', env: env() })
    child.unref()
    await expect.poll(appRunning, { timeout: 60_000 }).toBe(true)
    await sleep(5000)
    const before = Date.now()
    const r = spawnSync(join(FROM, SETUP), ['/S'], { stdio: 'ignore', timeout: 600_000 })
    expect(r.status).toBe(0)
    const marker = readJson<{ at: number }>(join(productionData(), 'closed-by-installer.json'))
    expect(marker).not.toBeNull()
    expect(marker!.at).toBeGreaterThanOrEqual(before - 5000)
    expect(marker!.at - before).toBeLessThan(5000 + 60_000)
    console.log(`znacznik instalatora: ${marker!.at - before} ms po starcie instalatora`)
  })
})

test('otwarcie aplikacji w czasie instalacji pomocnika: start przekazany, instalator biegnie raz, nic nie jest zamykane', async () => {
  test.setTimeout(20 * 60_000)
  await guarded('otwarcie w czasie instalacji', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    const app = await electron.launch({ executablePath: join(dir, APP_EXE), env: env({ RD_TEST_INSTALLER_SLEEP_MS: '25000' }) })
    const page = await mainPage(app)
    await expect.poll(() => page.evaluate(() => window.rd.update().then((u) => u.phase)), { timeout: 60_000 }).toBe('ready')
    const ended = processEnd(app, 120_000)
    await page.evaluate(() => window.rd.updateAction('installNow')).catch(() => undefined)
    await ended
    await expect.poll(() => readText(join(productionData(), 'logs', 'install.log')), { timeout: 120_000 }).toContain('instalator wystartował')
    const opened = spawn(join(dir, APP_EXE), [], { detached: true, stdio: 'ignore', env: env() })
    expect(await exited(opened, 30_000)).toBe(true)
    expect(readFileSync(join(taskDir(), 'handover.jsonl'), 'utf8')).toContain('"hidden":false')
    await expectNext(dir)
    expect(count(await readText(join(productionData(), 'logs', 'install.log')), /instalator wystartował/)).toBe(1)
  })
})

test('instalator spowolniony do 60 s instaluje się do końca', async () => {
  test.setTimeout(20 * 60_000)
  await guarded('spowolniony instalator', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'logon')
    plan(false)
    logon({ RD_TEST_INSTALLER_SLEEP_MS: '60000' }).unref()
    await expectNext(dir)
  })
})

test('mutex instalatora trzymany przez test nie zatrzymuje instalacji na zawsze', async () => {
  test.setTimeout(25 * 60_000)
  await guarded('mutex instalatora', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'logon')
    plan(false)
    const holder = spawn('powershell.exe', ['-NoProfile', '-Command', `$m = New-Object System.Threading.Mutex($true, '${'E2A45BEE-EF15-48BC-9498-F12E5B866145'}'); Start-Sleep -Seconds 90; $m.ReleaseMutex()`], { stdio: 'ignore' })
    await sleep(3000)
    logon().unref()
    await expectNext(dir)
    holder.kill()
  })
})

test('plik zablokowany przed deinstalacją: po dwóch próbach baner „nie udała się”, stara wersja działa', async () => {
  test.setTimeout(25 * 60_000)
  let locker: ChildProcess | null = null
  await guarded('plik zablokowany', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'logon')
    plan(false)
    const target = join(dir, 'LICENSES.chromium.html')
    locker = spawn('powershell.exe', ['-NoProfile', '-Command', `$f = [System.IO.File]::Open('${target}', 'Open', 'Read', 'None'); Start-Sleep -Seconds 1200; $f.Close()`], { stdio: 'ignore' })
    await sleep(3000)
    logon({ RD_TEST_NO_WAIT_WINDOWS: '1' }).unref()
    await expect.poll(() => readTaskNow()?.state, { timeout: 900_000, intervals: [2000] }).toBe('failed')
    expect(readTaskNow()!.attempts).toBe(2)
    expect(installed()!.version).toBe(CURRENT)
    // The old version is whole: the app starts and shows „nie udała się”.
    await expect.poll(appRunning, { timeout: 120_000 }).toBe(true)
    expect(await readText(join(productionData(), 'logs', 'main.log'))).toContain(`aktualizacja do ${NEXT}: nie udała się`)
    locker.kill()
    locker = null
  })
  ;(locker as ChildProcess | null)?.kill()
})

/**
 * Holds `file` of the installation (FileShare None, emptied) for `seconds` from the moment the old version's files are
 * gone (its exe and the file itself) – the new files are not in yet. Resolves with the first line: „locked” or „no-lock”.
 */
function holdDuringCopy(dir: string, file: string, seconds: number): { first: Promise<string>; child: ChildProcess } {
  const exe = join(dir, APP_EXE)
  const script = `
for ($i = 0; $i -lt 30000 -and ((Test-Path -LiteralPath '${exe}') -or (Test-Path -LiteralPath '${file}')); $i++) { Start-Sleep -Milliseconds 20 }
Start-Sleep -Milliseconds 300
[System.IO.Directory]::CreateDirectory('${dir}') | Out-Null
$h = $null
for ($i = 0; $i -lt 100 -and -not $h; $i++) { try { $h = [System.IO.File]::Open('${file}', 'OpenOrCreate', 'ReadWrite', 'None') } catch { Start-Sleep -Milliseconds 50 } }
if (-not $h) { 'no-lock'; exit }
$h.SetLength(0)
'locked'
Start-Sleep -Seconds ${seconds}
$h.Close()`
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['ignore', 'pipe', 'ignore'] })
  const first = new Promise<string>((r) => {
    let out = ''
    child.stdout!.on('data', (d: Buffer) => {
      out += d.toString('utf8')
      if (out.includes('\n')) r(out.split(/\r?\n/)[0]!.trim())
    })
    child.on('exit', () => r(out.trim() || 'exit'))
  })
  return { first, child }
}

test('plik aplikacji zablokowany w czasie kopiowania: instalator kończy się „sukcesem”, strażnik wykrywa to manifestem i naprawia', async () => {
  test.setTimeout(25 * 60_000)
  let locker: ChildProcess | null = null
  await guarded('plik zablokowany w czasie kopiowania', async () => {
    const dir = await install(FROM, CURRENT)
    stage(dir)
    scheduleTask(dir, 'logon')
    plan(false)
    const target = join(dir, 'LICENSES.chromium.html')
    // 40 s: past the installer's five copies and its forced extraction; its repair starts after a 30 s sleep, unlocked.
    const hold = holdDuringCopy(dir, target, 40)
    locker = hold.child
    logon({ RD_TEST_INSTALLER_SLEEP_MS: '30000' }).unref()
    expect(await hold.first).toBe('locked')
    await expectNext(dir)
    const log = await readText(join(productionData(), 'logs', 'guard.log'))
    expect(log).toContain('pliki niezgodne z manifestem')
    expect(count(log, /instalator wystartował/)).toBe(2)
    const manifest = JSON.parse(readFileSync(join(TO, MANIFEST), 'utf8')) as { files: Array<{ path: string; sha256: string }> }
    expect(await sha256(target)).toBe(manifest.files.find((f) => f.path === 'LICENSES.chromium.html')!.sha256)
  })
  ;(locker as ChildProcess | null)?.kill()
})

test('zrzuty awarii: proces główny to awaria (adnotacja process_type „browser”), renderer i GPU nie', async () => {
  test.setTimeout(10 * 60_000)
  const exe = resolve(FROM, 'win-unpacked', APP_EXE)
  const userData = join(productionData(), '..', 'rd-ci-crash')
  rmSync(userData, { recursive: true, force: true })
  /** A run that ends normally (app.close() quits like „Zakończ”), or by the crash asked for. */
  const run = async (crash: string | null) => {
    const app = await electron.launch({ executablePath: exe, env: { ...env(), RD_USER_DATA: userData, ...(crash ? { RD_TEST_CRASH: crash, RD_TEST_CRASH_MS: '4000' } : {}) } })
    await app.firstWindow()
    if (crash === 'main') await app.waitForEvent('close', { timeout: 60_000 })
    else {
      await sleep(crash ? 9000 : 3000)
      await app.close()
    }
    await sleep(1000)
  }
  const mainLog = () => readFileSync(join(userData, 'logs', 'main.log'), 'utf8')
  await run(null)
  await run('main')
  await run(null)
  expect(mainLog()).toContain('poprzednie uruchomienie: crash (zrzut procesu głównego)')
  const dumps: string[] = []
  const walk = (d: string) => {
    for (const n of existsSync(d) ? readdirSync(d) : []) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (n.endsWith('.dmp')) dumps.push(p)
    }
  }
  walk(join(userData, 'crashes'))
  expect(dumps.map((d) => minidumpProcessType(readFileSync(d)))).toContain('browser')
  for (const kind of ['renderer', 'gpu']) {
    await run(kind)
    await run(null)
    expect(mainLog().split('\n').filter((l) => l.includes('poprzednie uruchomienie')).at(-1), kind).not.toContain(': crash')
  }
})
