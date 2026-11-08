/**
 * The installer closing a running app (E4a.13, spec „Instalacja, aktualizacje i log”): resources/installer.nsh asks the
 * app to end first – taskkill without /F, a WM_CLOSE to the hidden windows of its main process (T396) – waits up to 5 s,
 * kills only after that, and lists what is still there into logs\installer-check.log before „appCannotBeClosed”.
 * Everywhere: the order of the steps in the script. Windows: the script's own PowerShell runs against stand-in processes
 * in a temporary folder (nothing is installed), and so does the listing of docs/vm/procesy.ps1.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const nsh = readFileSync('resources/installer.nsh', 'utf8').replace(/\r\n/g, '\n')

/** A macro's body. */
function macro(name: string): string {
  const m = new RegExp(`^!macro ${name}\\b[^\\n]*\\n([\\s\\S]*?)^!macroend`, 'm').exec(nsh)
  if (!m) throw new Error(`installer.nsh: brak makra ${name}`)
  return m[1]!
}

/**
 * A !define's text as NSIS writes it into the command line: lines joined at a trailing backslash (the next line's indent
 * dropped, as makensis does), the defines in it expanded, `$$` = `$`.
 */
function defined(name: string): { raw: string; text: string } {
  const m = new RegExp(`^!define ${name} "((?:[^"\\n\\\\]|\\\\\\n|\\\\)*)"`, 'm').exec(nsh)
  if (!m) throw new Error(`installer.nsh: brak definicji ${name}`)
  const raw = m[1]!.replace(/\\\n[ \t]*/g, '').replace(/\$\{(RD_PS_\w+)\}/g, (_, inner: string) => defined(inner).raw)
  return { raw, text: raw.replace(/\$\$/g, '$') }
}

describe('instalator zamyka aplikację (E4a.13)', () => {
  it('najpierw prosi o zamknięcie i czeka do 5 s, zabija dopiero potem; przed „Nie można zamknąć” lista procesów', () => {
    const body = macro('customCheckAppRunning')
    // KILL_PROCESS … 0 of electron-builder is Stop-Process (TerminateProcess) when PowerShell is there: never a step here;
    // its FIND_PROCESS misses a single process (a lone CimInstance has no .Count in PowerShell 5.1).
    expect(body).not.toMatch(/KILL_PROCESS|FIND_PROCESS/)
    const at = (s: string) => body.indexOf(s)
    expect(at('!insertmacro rdFindProcess $R0')).toBeGreaterThan(-1)
    expect(at('!insertmacro rdWriteClosedMarker')).toBeGreaterThan(at('!insertmacro rdFindProcess $R0'))
    expect(at('!insertmacro rdCloseApp')).toBeGreaterThan(at('!insertmacro rdWriteClosedMarker'))
    expect(at('!insertmacro rdKillProcess')).toBeGreaterThan(at('!insertmacro rdCloseApp'))
    expect(at('!insertmacro rdListProcesses')).toBeGreaterThan(at('!insertmacro rdKillProcess'))
    expect(at('"$(appCannotBeClosed)"')).toBeGreaterThan(at('!insertmacro rdListProcesses'))
    expect(nsh).toMatch(/^!define RD_CLOSE_WAIT_MS 5000$/m)
  })

  it('łagodny krok nigdy nie zabija: taskkill bez /F, w PowerShellu bez Stop-Process', () => {
    const close = macro('rdCloseApp')
    expect(close).toContain('${RD_PS_CLOSE}')
    expect(close).toMatch(/taskkill \/IM "\$\{APP_EXECUTABLE_FILENAME\}"/)
    expect(close).not.toMatch(/\/F\b/)
    expect(defined('RD_PS_CLOSE').text).not.toMatch(/Stop-Process|\/F\b|\.Kill\(/i)
    expect(macro('rdFindProcess')).toContain('${RD_PS_FIND}')
    expect(macro('rdKillProcess')).toContain('${RD_PS_KILL}')
    expect(macro('rdListProcesses')).toContain('${RD_PS_LIST}')
  })

  it('tekst PowerShella przechodzi przez NSIS bez zmian: tylko $$, bez cudzysłowów i odwrotnych apostrofów', () => {
    for (const name of ['RD_PS_FIND', 'RD_PS_CLOSE', 'RD_PS_KILL', 'RD_PS_LIST']) {
      const { raw } = defined(name)
      // A single $ would be an NSIS variable; " and ` end the strings of the command line.
      expect(raw.replace(/\$\$/g, '')).not.toContain('$')
      expect(raw).not.toMatch(/["`]|\$\{/)
      expect(raw.length).toBeLessThan(4000)
    }
  })
})

const win = process.platform === 'win32'
const sysRoot = process.env.SystemRoot ?? 'C:\\Windows'
// The installer is a 32-bit process: its $SYSDIR\…\powershell.exe is the 32-bit one.
const wow = join(sysRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const PS = existsSync(wow) ? wow : join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

/** A stand-in with one hidden top-level window (as the app's BrowserWindows): WM_CLOSE writes `<marker>.closed`, ends it. */
const STAND_IN = `
$code = @'
using System;
using System.IO;
using System.Windows.Forms;
public class RdStandIn : NativeWindow {
  readonly string marker;
  public RdStandIn(string m) { marker = m; CreateParams cp = new CreateParams(); cp.Caption = "rd stand-in"; cp.Style = 0x00CF0000; CreateHandle(cp); }
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x0010) { File.WriteAllText(marker + ".closed", "WM_CLOSE"); Application.ExitThread(); return; }
    base.WndProc(ref m);
  }
}
'@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms
$w = New-Object RdStandIn $args[0]
[IO.File]::WriteAllText($args[0] + '.ready', 'ready')
[System.Windows.Forms.Application]::Run()
`

describe.skipIf(!win)('PowerShell instalatora na procesach zastępczych (Windows)', () => {
  let root = ''
  let inst = ''
  const children: ChildProcess[] = []

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rd-installer-'))
    inst = join(root, 'Regulated Day')
    mkdirSync(join(inst, 'resources', 'helper'), { recursive: true })
    writeFileSync(join(root, 'stand-in.ps1'), STAND_IN)
  })
  afterEach(async () => {
    for (const c of children.splice(0)) if (c.exitCode == null) spawnSync('taskkill', ['/F', '/PID', String(c.pid)], { stdio: 'ignore' })
    await vi.waitFor(() => rmSync(root, { recursive: true, force: true }), { timeout: 10_000, interval: 200 })
  })

  /** The app's main process (or with `--type=` one of its children), with a hidden window. */
  async function windowed(marker: string, extra: string[] = []): Promise<ChildProcess> {
    const exe = join(inst, 'Regulated Day.exe')
    if (!existsSync(exe)) copyFileSync(join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), exe)
    const c = spawn(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'stand-in.ps1'), join(root, marker), ...extra], { stdio: 'ignore' })
    children.push(c)
    await vi.waitFor(() => expect(existsSync(join(root, `${marker}.ready`))).toBe(true), { timeout: 30_000, interval: 100 })
    return c
  }

  /** A process under the installation without any window (as rd-helper.exe): no WM_CLOSE reaches it. */
  async function windowless(name = 'rd-helper.exe'): Promise<ChildProcess> {
    const exe = join(inst, 'resources', 'helper', name)
    if (!existsSync(exe)) copyFileSync(join(sysRoot, 'System32', 'PING.EXE'), exe)
    const c = spawn(exe, ['-n', '120', '127.0.0.1'], { stdio: 'ignore' })
    children.push(c)
    await vi.waitFor(() => expect(c.pid).toBeGreaterThan(0))
    return c
  }

  const env = (extra: Record<string, string> = {}) => ({
    ...process.env,
    RD_SETUP_INSTDIR: inst,
    RD_SETUP_EXE: 'Regulated Day.exe',
    RD_SETUP_WAIT_MS: '5000',
    RD_SETUP_LOG: join(root, 'logs', 'installer-check.log'),
    RD_SETUP_VERSION: '9.9.9',
    ...extra
  })

  /** One step of the script, as nsExec starts it. */
  function step(name: string, e: NodeJS.ProcessEnv): { code: number | null; ms: number } {
    const t = Date.now()
    const r = spawnSync(PS, ['-NoProfile', '-NonInteractive', '-C', defined(name).text], { env: e, stdio: 'ignore', timeout: 60_000 })
    return { code: r.status, ms: Date.now() - t }
  }

  const alive = (c: ChildProcess) => c.exitCode == null && c.signalCode == null

  it('ukryte okno procesu głównego dostaje WM_CLOSE: aplikacja kończy się sama, krok nie czeka do końca terminu', async () => {
    const app = await windowed('main')
    const r = step('RD_PS_CLOSE', env({ RD_SETUP_WAIT_MS: '20000' }))
    expect(r.code).toBe(0)
    expect(readFileSync(join(root, 'main.closed'), 'utf8')).toBe('WM_CLOSE')
    await vi.waitFor(() => expect(alive(app)).toBe(false), { timeout: 5000 })
    expect(r.ms).toBeLessThan(15_000)
  }, 60_000)

  it('procesy potomne (--type=) i bez okna: nic ich nie zabija, krok czeka do terminu i zgłasza, że zostały', async () => {
    const app = await windowed('main')
    const renderer = await windowed('renderer', ['--type=renderer'])
    const helper = await windowless()
    const r = step('RD_PS_CLOSE', env({ RD_SETUP_WAIT_MS: '2000' }))
    expect(r.code).toBe(1)
    expect(r.ms).toBeGreaterThanOrEqual(2000)
    // Only the main process is asked; Electron's children end with it.
    expect(existsSync(join(root, 'main.closed'))).toBe(true)
    expect(existsSync(join(root, 'renderer.closed'))).toBe(false)
    await vi.waitFor(() => expect(alive(app)).toBe(false), { timeout: 5000 })
    expect(alive(renderer)).toBe(true)
    expect(alive(helper)).toBe(true)
  }, 90_000)

  it('szukanie widzi też jeden proces (FIND_PROCESS electron-buildera go nie widzi), nigdy samego instalatora', async () => {
    expect(step('RD_PS_FIND', env()).code).toBe(1)
    const helper = await windowless()
    expect(step('RD_PS_FIND', env()).code).toBe(0)
    // The installer itself under the installation (an uninstaller run in place, _?=): not counted.
    expect(step('RD_PS_FIND', env({ RD_SETUP_SELF: String(helper.pid) })).code).toBe(1)
  }, 60_000)

  it('dobicie po terminie: Stop-Process każdego procesu spod instalacji poza samym instalatorem', async () => {
    const helper = await windowless()
    const self = await windowless('rd-self.exe')
    expect(step('RD_PS_KILL', env({ RD_SETUP_SELF: String(self.pid) })).code).toBe(0)
    await vi.waitFor(() => expect(alive(helper)).toBe(false), { timeout: 10_000 })
    expect(alive(self)).toBe(true)
  }, 60_000)

  it('lista przed „Nie można zamknąć”: nazwa, PID, rodzic, czas startu i wiersz poleceń, dopisywana, bez nazwy konta', async () => {
    const helper = await windowless()
    expect(step('RD_PS_LIST', env()).code).toBe(0)
    expect(step('RD_PS_LIST', env()).code).toBe(0)
    const bytes = readFileSync(join(root, 'logs', 'installer-check.log'))
    expect(bytes.subarray(0, 3).toString('hex')).not.toBe('efbbbf')
    const text = bytes.toString('utf8')
    const head = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z WARN instalator 9\.9\.9: procesy spod .+, które nie dały się zamknąć:$/gm
    expect(text.match(head)?.length).toBe(2)
    const line = new RegExp(`^  rd-helper\\.exe \\| pid ${helper.pid} \\| rodzic ${process.pid}( \\S.*)? \\| start \\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z \\| .*rd-helper\\.exe"? +-n 120 127\\.0\\.0\\.1$`, 'm')
    expect(text).toMatch(line)
    const profile = process.env.USERPROFILE
    if (profile && inst.toLowerCase().startsWith(profile.toLowerCase())) {
      expect(text).not.toContain(profile)
      expect(text).toContain('%USERPROFILE%')
    }
  }, 60_000)

  it('docs/vm/procesy.ps1 listuje te same dane ręcznie (odbiór w maszynie)', async () => {
    const helper = await windowless()
    const out = join(root, 'procesy.txt')
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'docs/vm/procesy.ps1', inst, out], { encoding: 'utf8', timeout: 60_000 })
    expect(r.status).toBe(0)
    const text = readFileSync(out, 'utf8')
    expect(r.stdout).toContain(`pid ${helper.pid}`)
    expect(text).toMatch(new RegExp(`rd-helper\\.exe \\| pid ${helper.pid} \\| rodzic ${process.pid}( \\S.*)? \\| start \\d{4}-\\d\\d-\\d\\dT[^|]+\\| .*-n 120 127\\.0\\.0\\.1`))
  }, 60_000)
})
