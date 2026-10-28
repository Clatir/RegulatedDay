/**
 * Starting an installation (spec „Instalacja, aktualizacje i log”). Before it the app copies the helper, the guard, the
 * install helper and the installer to its app data (update\<X>) and runs them from there – the installer replaces the
 * installation folder. It writes the task file there, the guard's Run entry (by the guard itself, without
 * StartupApproved) and its record of closing; then the install helper starts as a detached process and waits for the
 * app's process to end. Without the helper (unavailable) the FI path: the installer detached with „--updated /S”
 * („--force-run” only for „Zainstaluj teraz”), the task in the state „FI” with the installer's process id, and a status
 * window of PowerShell (WPF, without activation) shown only after the app ended.
 */
import { execFile, spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, promises as fs, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { MANIFEST_ASSET, NSIS_GUID, SETUP_ASSET, UNINSTALL_KEY } from '@shared/update'
import { writeSyncAtomic } from './files'
import { TASK_FORMAT, writeTask, type Task, type TaskStart, type TaskTrigger } from '@shared/task'

export const PROGRAMS = ['rd-guard.exe', 'rd-install.exe', 'rd-helper.exe']
export const GUARD_RUN_NAME = 'Regulated Day Guard'

export interface InstallInput {
  version: string
  /** update\<X>\download with the verified installer and manifest. */
  downloadDir: string
  updateDir: string
  /** resources\helper of the running installation. */
  helperDir: string
  trigger: TaskTrigger
  start: TaskStart
  url: string | null
  autostart: boolean
  appPid: number
  /** The helper runs: the install helper owns the installation; otherwise the FI path. */
  owner: boolean
  userDataDir: string
  log: (level: 'info' | 'warn' | 'error', msg: string) => void
}

export const newAttemptId = (): string => randomBytes(8).toString('hex')

/** The task of a new attempt (counters from zero). */
export function newTask(i: Pick<InstallInput, 'version' | 'trigger' | 'start' | 'url' | 'autostart'>, state: Task['state'], now: number): Task {
  return {
    format: TASK_FORMAT,
    version: i.version,
    attemptId: newAttemptId(),
    state,
    trigger: i.trigger,
    start: i.start,
    url: i.url,
    autostart: i.autostart,
    guid: NSIS_GUID,
    uninstallKey: UNINSTALL_KEY,
    installDir: dirname(process.execPath),
    appExe: process.execPath,
    installer: SETUP_ASSET,
    manifest: MANIFEST_ASSET,
    attempts: 0,
    starts: 0,
    cleanEnd: true,
    installerStartedAt: null,
    installerPid: null,
    createdAt: now,
    updatedAt: now,
    message: null
  }
}

/** The guard's one line of JSON; `why` – the exit code or the error when there is none. */
function guardLine(stdout: string | null | undefined, why: unknown): Record<string, unknown> {
  const line = (stdout ?? '').trim().split(/\r?\n/).pop() ?? ''
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return { ok: false, error: `brak odpowiedzi (kod ${String(why)})` }
  }
}

/** A JSON-line mode of the guard (one line; an exception there answers {"ok": false}). */
export function guardMode(guardExe: string, args: string[], timeoutMs = 15_000): Record<string, unknown> {
  const r = spawnSync(guardExe, args, { encoding: 'utf8', windowsHide: true, timeout: timeoutMs })
  return guardLine(r.stdout, r.status ?? r.signal ?? r.error?.message)
}

/** The same without holding the main process up (a query at the start; .NET's start takes a moment). */
export function guardModeAsync(guardExe: string, args: string[], timeoutMs = 15_000): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    execFile(guardExe, args, { encoding: 'utf8', windowsHide: true, timeout: timeoutMs }, (err, stdout) => resolve(guardLine(stdout, err ? (err.code ?? err.message) : 0)))
  })
}

type StageInput = Pick<InstallInput, 'updateDir' | 'version' | 'downloadDir' | 'helperDir'>

/** What staging copies – [from, to, compared by SHA-256] – into the task's folder. */
function stagePlan(i: StageInput): { dir: string; copies: Array<[string, string, boolean]> } {
  const dir = join(i.updateDir, i.version)
  const copies: Array<[string, string, boolean]> = [
    [join(i.downloadDir, SETUP_ASSET), join(dir, SETUP_ASSET), false],
    [join(i.downloadDir, MANIFEST_ASSET), join(dir, MANIFEST_ASSET), true]
  ]
  for (const p of PROGRAMS) {
    if (!existsSync(join(i.helperDir, p))) continue
    copies.push([join(i.helperDir, p), join(dir, p), true])
    if (existsSync(join(i.helperDir, `${p}.config`))) copies.push([join(i.helperDir, `${p}.config`), join(dir, `${p}.config`), true])
  }
  return { dir, copies }
}

const sha256Of = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
const sameCopy = (from: string, to: string, byHash: boolean) => existsSync(to) && statSync(to).size === statSync(from).size && (!byHash || sha256Of(to) === sha256Of(from))
const tmpName = (to: string) => `${to}.${randomBytes(4).toString('hex')}.tmp`

/**
 * Copies the programs and the release into update\<X>; answers the task's folder. Each copy goes under a temporary name
 * and is renamed, so a copy cut short never has the final name. A copy already there is kept when it is the same (staged
 * right after the download; the exit then only starts): the installer by its size – it was verified at the download and
 * is only ever copied whole – the small files by their SHA-256 (another version's program may have the same size).
 */
export function stageInstall(i: StageInput): string {
  const { dir, copies } = stagePlan(i)
  mkdirSync(dir, { recursive: true })
  for (const [from, to, byHash] of copies) {
    if (sameCopy(from, to, byHash)) continue
    const tmp = tmpName(to)
    copyFileSync(from, tmp)
    renameSync(tmp, to)
  }
  return dir
}

/** The same in the background – right after a download, so the ~100 MB installer never holds the main process up. */
export async function stageInstallAsync(i: StageInput): Promise<string> {
  const { dir, copies } = stagePlan(i)
  await fs.mkdir(dir, { recursive: true })
  for (const [from, to, byHash] of copies) {
    if (sameCopy(from, to, byHash)) continue
    const tmp = tmpName(to)
    await fs.copyFile(from, tmp)
    await fs.rename(tmp, to)
  }
  return dir
}

/**
 * A detached process; its id, or null when it did not start – Node throws at once for some failures (a file that is no
 * program: „spawn UNKNOWN”) and reports others by „error”.
 */
function startDetached(exe: string, args: string[], cwd: string, what: string, log: InstallInput['log']): number | null {
  try {
    const child = spawn(exe, args, { cwd, detached: true, stdio: 'ignore' })
    child.on('error', (e) => log('error', `${what} nie wystartował: ${e.message}`))
    child.unref()
    return child.pid ?? null
  } catch (e) {
    log('error', `${what} nie wystartował: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/**
 * Prepares the installation and (except at the start of Windows, when the guard of the Run entry does it) starts its
 * owner. Synchronous: the app quits right after. Answers false when nothing could start (the app keeps running).
 */
export function startInstall(i: InstallInput): boolean {
  const dir = stageInstall(i)
  const taskFile = join(dir, 'task.json')
  const now = Date.now()
  // A new attempt: starts handed over to an earlier one never shape this one's start.
  rmSync(join(dir, 'handover.jsonl'), { force: true })
  // The task file, read by the owner meanwhile too: always through a temporary file (spec, A5-09).
  if (i.owner && existsSync(join(dir, 'rd-guard.exe')) && existsSync(join(dir, 'rd-install.exe'))) {
    const task = newTask(i, 'scheduled', now)
    writeSyncAtomic(taskFile, writeTask(task))
    const entry = guardMode(join(dir, 'rd-guard.exe'), ['--run-entry', 'set'])
    if (entry.ok !== true) i.log('warn', `wpis strażnika nie zapisany: ${JSON.stringify(entry)}`)
    // At the start of Windows the guard owns the installation (as from its Run entry); otherwise the install helper.
    const owner = i.trigger === 'logon' ? join(dir, 'rd-guard.exe') : join(dir, 'rd-install.exe')
    const args = ['--task', taskFile, '--wait-pid', String(i.appPid), ...(i.trigger === 'logon' ? ['--autostart'] : [])]
    const pid = startDetached(owner, args, dir, 'właściciel instalacji', i.log)
    i.log('info', `instalacja ${i.version} (${i.trigger}): ${i.trigger === 'logon' ? 'strażnik' : 'pomocnik instalacji'} pid ${pid ?? '?'}`)
    if (pid == null) {
      // No owner: the state goes back (T410) – never a „scheduled” left with the guard's entry for the next start to
      // wait 60 s on and take for an installation that did not finish (A5-06).
      guardMode(join(dir, 'rd-guard.exe'), ['--run-entry', 'remove'])
      writeSyncAtomic(taskFile, writeTask({ ...task, state: 'failed', message: 'pomocnik instalacji nie wystartował', updatedAt: Date.now() }))
      return false
    }
    return true
  }
  // The FI path: no owner, no power request, no guard's entry (the settings say it).
  const task = newTask(i, 'fi', now)
  writeSyncAtomic(taskFile, writeTask(task))
  const args = ['--updated', '/S', ...(i.trigger === 'now' ? ['--force-run'] : [])]
  const pid = startDetached(join(dir, SETUP_ASSET), args, dir, 'instalator', i.log)
  if (pid == null) {
    // Never a fresh „FI” without an installer (a start within 60 s would take it for one under way and end at once).
    writeSyncAtomic(taskFile, writeTask({ ...task, state: 'failed', message: 'instalator nie wystartował', updatedAt: Date.now() }))
    return false
  }
  writeSyncAtomic(taskFile, writeTask({ ...task, installerPid: pid, installerStartedAt: Date.now(), updatedAt: Date.now() }))
  i.log('info', `instalacja ${i.version} ścieżką FI (${i.trigger}), instalator pid ${pid}`)
  try {
    startFiStatus({ version: i.version, appPid: i.appPid, installerPid: pid, restart: i.trigger === 'now', attemptId: task.attemptId, launchedFile: join(i.userDataDir, 'launched.json'), logFile: join(i.userDataDir, 'logs', 'update.log'), appExe: process.execPath })
  } catch (e) {
    // Only the status window is missing; the installer works on (as in FI).
    i.log('warn', `okno stanu instalacji niedostępne: ${e instanceof Error ? e.message : String(e)}`)
  }
  return true
}

// ------------------------------------------------------------------ the FI path's status window (PowerShell, WPF)

/** Single-quoted PowerShell literal (no expansion; a quote is escaped by doubling it). */
export const psLiteral = (text: string): string => `'${text.replace(/'/g, "''")}'`
/** -EncodedCommand payload: base64 of UTF-16LE, immune to command-line quoting and code pages. */
export const encodePowerShell = (script: string): string => Buffer.from(script, 'utf16le').toString('base64')

export interface FiStatus {
  version: string
  appPid: number
  installerPid: number
  restart: boolean
  attemptId: string
  launchedFile: string
  logFile: string
  appExe: string
}

/**
 * The status window of the FI path: waits for the app's process to end, then shows a WPF window without activation
 * (ShowActivated false), not always on top, with a taskbar button – a window opened by your click (D257). „Instaluję
 * X…”; with „Zainstaluj teraz”, after 180 s without the file „uruchomiono wersję X” of this attempt, „Uruchom ręcznie” –
 * only once the installer is gone, before that „Instalator jeszcze działa”; at the exit it closes when the installer
 * ends. Success is the file, never a window appearing. Without a window (constrained language mode) it works on.
 */
export function fiStatusScript(s: FiStatus): string {
  return `$ErrorActionPreference = 'Continue'
$log = ${psLiteral(s.logFile)}
function Log([string]$m) {
  $line = [DateTime]::UtcNow.ToString('o') + ' fi-status ' + $m
  for ($t = 0; $t -lt 50; $t++) { try { Add-Content -LiteralPath $log -Value $line -Encoding UTF8 -ErrorAction Stop; return } catch { Start-Sleep -Milliseconds 100 } }
}
$appPid = ${s.appPid}
$installerPid = ${s.installerPid}
$restart = $${s.restart ? 'true' : 'false'}
$launched = ${psLiteral(s.launchedFile)}
$attempt = ${psLiteral(s.attemptId)}
Log ('start (wersja ${s.version}, restart=' + $restart + ')')
$app = Get-Process -Id $appPid -ErrorAction SilentlyContinue
if ($app) { $app.WaitForExit(120000) | Out-Null }
$window = $null
$text = $null
try {
  Add-Type -AssemblyName PresentationFramework
  $window = New-Object System.Windows.Window
  $window.Title = 'Regulated Day – aktualizacja'
  $window.Width = 420
  $window.Height = 120
  $window.WindowStartupLocation = 'CenterScreen'
  $window.ResizeMode = 'NoResize'
  $window.ShowActivated = $false
  $window.Topmost = $false
  $window.ShowInTaskbar = $true
  $window.Background = '#2B232E'
  $text = New-Object System.Windows.Controls.TextBlock
  $text.Foreground = '#EEE3D6'
  $text.FontSize = 14
  $text.Margin = '16'
  $text.TextWrapping = 'Wrap'
  $text.Text = 'Instaluję ${s.version}…'
  $window.Content = $text
  $window.Show()
} catch { Log ('bez okna stanu: ' + $_.Exception.Message); $window = $null }
function Pump([int]$ms) {
  $end = (Get-Date).AddMilliseconds($ms)
  do {
    if ($window) { try { $frame = New-Object System.Windows.Threading.DispatcherFrame; [System.Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke('Background', [Action]{ $frame.Continue = $false }) | Out-Null; [System.Windows.Threading.Dispatcher]::PushFrame($frame) } catch { } }
    Start-Sleep -Milliseconds 100
  } while ((Get-Date) -lt $end)
}
function Say([string]$t) { if ($text) { try { $text.Text = $t } catch { } } }
function InstallerAlive { return [bool](Get-Process -Id $installerPid -ErrorAction SilentlyContinue) }
$started = Get-Date
$installerEnd = $null
while ($true) {
  $alive = InstallerAlive
  if (-not $alive -and -not $installerEnd) { $installerEnd = Get-Date; Log 'instalator zakończył się' }
  if (-not $restart -and -not $alive) { break }
  if ($restart) {
    $ok = $false
    try { if (Test-Path -LiteralPath $launched) { $j = Get-Content -LiteralPath $launched -Raw -Encoding UTF8 | ConvertFrom-Json; $ok = ($j.attemptId -eq $attempt) } } catch { }
    if ($ok) { Log 'nowa wersja potwierdziła start'; break }
    if (((Get-Date) - $started).TotalSeconds -ge 180) {
      if ($alive) { Say 'Instalator jeszcze działa…' }
      else {
        Say 'Nowa wersja nie uruchomiła się sama – uruchom ją ręcznie.'
        Log 'brak potwierdzenia startu po 180 s'
        if ($window) {
          try {
            $button = New-Object System.Windows.Controls.Button
            $button.Content = 'Uruchom ręcznie'
            $button.Margin = '16,0,16,16'
            $button.Add_Click({ Start-Process -FilePath ${psLiteral(s.appExe)}; $script:done = $true })
            $panel = New-Object System.Windows.Controls.StackPanel
            $window.Content = $null
            $panel.Children.Add($text) | Out-Null
            $panel.Children.Add($button) | Out-Null
            $window.Content = $panel
            $window.Height = 160
          } catch { }
          $script:done = $false
          $until = (Get-Date).AddMinutes(10)
          while (-not $script:done -and (Get-Date) -lt $until) { Pump 300 }
        }
        break
      }
    }
  }
  Pump 500
}
if ($window) { try { $window.Close() } catch { } }
Log 'koniec'
`
}

function powershellExe(): string {
  return join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/**
 * Starts the status script so that it outlives the app: a short-lived PowerShell with a hidden console starts it with
 * Start-Process (a grandchild, outside the app's job object). The script itself is in a file, loaded by a short command.
 */
export function startFiStatus(s: FiStatus): void {
  if (process.platform !== 'win32') return
  const ps = powershellExe()
  const file = join(tmpdir(), `rd-update-${process.pid}-${Date.now()}.ps1`)
  writeFileSync(file, fiStatusScript(s), 'utf8')
  const boot = `$f = ${psLiteral(file)}; $s = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8); Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue; & ([scriptblock]::Create($s))`
  const helperArgs = ['-NoProfile', '-NonInteractive', '-Sta', '-EncodedCommand', encodePowerShell(boot)]
  const starter = `Start-Process -FilePath ${psLiteral(ps)} -WindowStyle Hidden -WorkingDirectory ${psLiteral(tmpdir())} -ArgumentList ${helperArgs.map(psLiteral).join(',')}`
  const r = spawnSync(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(starter)], { cwd: tmpdir(), stdio: 'ignore', windowsHide: true, timeout: 30_000 })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`skrypt stanu nie wystartował (kod ${r.status})`)
}
