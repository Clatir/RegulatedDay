// adapted from FI src/main/index.ts @ de81f2b
/**
 * The main process: loaded by start.ts once the identity of this run is fixed. It owns the windows (main, icon panel,
 * desktop bar), the tray icon, the helper, updates, the life marker, the trial of E0 and, from E1 on, the timer and the
 * deadlines (spec „Baza kodu i technika”: the timer, the deadlines and the widget's writes belong to the main process).
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, Menu, app, clipboard, crashReporter, ipcMain, net, powerMonitor, screen, session, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import { CH, type AppInfo, type BarLayout, type TrialAction, type UpdateAction, type ViewKind, type WidgetAction } from '@shared/api'
import type { MachinePrefs } from '@shared/machine'
import { patchMachinePrefs } from '@shared/machine'
import { barRect, cornerOffset, panelRect } from '@shared/placement'
import { urlFromArgv, type PanelTarget } from '@shared/protocol'
import { compareVersions } from '@shared/update'
import type { UpdateView } from '@shared/updateView'
import { BAR_NOTE_FAILED, BAR_NOTE_HELPER, type WidgetView } from '@shared/widget'
import { identity } from './identity'
import { flushLog, initLog, log } from './log'
import { ConfigStore, computerId } from './config'
import { Autostart, HIDDEN_ARG } from './autostart'
import { AppTray } from './tray'
import { displays, primaryDisplay } from './displays'
import { createMainWindow } from './windows/mainWindow'
import { DesktopBar } from './windows/desktopBar'
import { IconPanel } from './windows/iconPanel'
import { HelperClient, type HelperMessage } from './helper/client'
import { helperProgram } from './helper/program'
import { notify } from './notify'
import { Trial } from './trial'
import { runStartup, type Banner, type StartupResult } from './update/startup'
import { cleanUpdateFolders, fsDeps, manifestOf, writeLaunched, writePlan } from './update/files'
import { UpdateController } from './update/controller'
import { guardMode } from './update/install'
import { LifeKeeper, judge } from './crash/lifeMarker'
import { sessionAtStart } from './crash/session'
import { recordRun } from './crash/versions'

// Crash dumps of every process stay on this computer (no upload); only the main process's („browser”) count as a crash.
crashReporter.start({ uploadToServer: false, submitURL: '', compress: false })

const APP_TITLE = identity.name
const userData = app.getPath('userData')
const updateDir = join(userData, 'update')
const helperDir = app.isPackaged ? join(process.resourcesPath, 'helper') : join(app.getAppPath(), 'build', 'helper')
const config = new ConfigStore(userData, Number(process.env.RD_CONFIG_WRITE_DELAY_MS) || 0)
/** An unreadable config.json is read again this often (held by an antivirus or a backup at the start with Windows). */
const CONFIG_RETRY_MS = 10_000
const preload = join(__dirname, '../preload/index.js')
const runId = randomBytes(8).toString('hex')
const life = new LifeKeeper(userData)

let mainWindow: BrowserWindow | null = null
let bar: DesktopBar | null = null
let panel: IconPanel | null = null
let tray: AppTray | null = null
let helper: HelperClient | null = null
let autostart: Autostart | null = null
let updates: UpdateController | null = null
let thisComputer = ''
const trial = new Trial()
let quitting = false
/** Windows ends the session (logoff, shutdown): never an installer now (spec), the record of closing written at once. */
let sessionEnding = false
/** A session that was only asked to end and still runs after this was cancelled (Windows ends one within seconds). */
const SESSION_RESUME_MS = 60_000
let sessionResume: ReturnType<typeof setTimeout> | null = null
/** The bar's content height now (CSS px), whether something in it is unfolded, and its height folded. */
let barLayoutNow: BarLayout = { height: 64, unfolded: false }
let barFoldedHeight = 64
/** Why the desktop bar is hidden although it is on (the settings and the panel say it). */
let barProblem: 'helper' | 'failed' | null = null

const prefs = (): MachinePrefs => config.get().prefs

function loadView(win: BrowserWindow): Promise<void> {
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) win.webContents.setZoomFactor(prefs().zoom)
  })
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return devUrl ? win.loadURL(devUrl) : win.loadFile(join(__dirname, '../renderer/index.html'))
}

const appWindows = (): Electron.WebContents[] =>
  [mainWindow?.isDestroyed() ? null : mainWindow?.webContents, bar?.webContents, panel?.webContents].filter((w): w is Electron.WebContents => !!w && !w.isDestroyed())

function broadcast(channel: string, payload: unknown): void {
  for (const w of appWindows()) w.send(channel, payload)
}

function viewOf(sender: Electron.WebContents): ViewKind {
  if (bar && sender === bar.webContents) return 'bar'
  if (panel && sender === panel.webContents) return 'panel'
  return 'main'
}

// ------------------------------------------------------------------ the widget

function widgetView(): WidgetView {
  const view = trial.view()
  const barNote = !prefs().desktopBar || view.hidden ? null : barProblem === 'failed' ? BAR_NOTE_FAILED : barProblem === 'helper' ? BAR_NOTE_HELPER : null
  return { ...view, barNote }
}

function showWidget(view: WidgetView): void {
  tray?.set({ color: view.iconColor, dot: view.dot, drop: view.drop }, view.tooltip)
  broadcast(CH.onWidget, widgetView())
  layoutBar()
}

/** The desktop bar as the settings, the widget and the helper allow: laid under the windows before it shows. */
/** The settings and the widget want the desktop bar shown now. */
const barWanted = (): boolean => prefs().desktopBar && !widgetView().hidden

function layoutBar(): void {
  // Destroyed at the quit: the helper's last status and events come after the windows.
  if (!bar?.alive) return
  if (!barWanted()) {
    barProblem = null
    bar.apply({ visible: false })
    helper?.send('bar.unwatch')
    return
  }
  const primary = primaryDisplay()
  const zoom = prefs().zoom
  const r = barRect(prefs().barPlacement, displays(), primary, zoom, Math.ceil(barFoldedHeight * zoom), Math.ceil(barLayoutNow.height * zoom))
  bar.apply({ bounds: r.bounds, contentProtection: prefs().hideFromCapture })
  bar.webContents?.send('rd:barGrows', r.growsUp ? 'up' : 'down')
  if (!helper?.running) {
    barProblem = 'helper'
    bar.apply({ visible: false })
    return
  }
  helper.send('bar.watch', { hwnd: bar.hwnd })
}

let lastBarState = ''
function onHelperEvent(m: HelperMessage): void {
  if (m.type === 'bar') {
    trial.log(`pasek: ${String(m.state)}${m.detail ? ` – ${String(m.detail)}` : ''}`)
    if (m.state !== lastBarState) log('info', `pasek pulpitu: ${String(m.state)}${m.detail ? ` (${String(m.detail)})` : ''}`)
    lastBarState = String(m.state)
    if (m.state === 'confirmed') {
      barProblem = null
      // A confirmation of a watch sent just before the bar was switched off or hidden: it stays hidden.
      if (barWanted()) bar?.apply({ visible: true })
    } else if (m.state === 'failed') {
      barProblem = 'failed'
      bar?.apply({ visible: false })
    }
    broadcast(CH.onWidget, widgetView())
  } else if (m.type === 'foreground') {
    const hwnd = String(m.hwnd ?? '')
    trial.log(`pierwszy plan: ${String(m.cls ?? '?')} (${String(m.process ?? '?')})${m.shell ? ' – okno powłoki' : ''}${m.fullscreen ? ' – pełny ekran' : ''}`)
    panel?.foreground(hwnd, m.shell === true)
  } else if (m.type === 'shell') {
    trial.log('Eksplorator uruchomiony ponownie – ikona ustawiona jeszcze raz')
    tray?.refresh()
    layoutBar()
  } else if (m.type === 'power') {
    trial.log(`zasilanie: ${String(m.event)}${m.value !== undefined ? ` = ${String(m.value)}` : ''}`)
  } else if (m.type === 'session' || m.type === 'display') {
    trial.log(`${m.type === 'session' ? 'sesja' : 'ekrany'}: ${String(m.event ?? 'zmiana')}`)
  } else {
    trial.log(`pomocnik: ${JSON.stringify(m)}`)
  }
}

function openPanel(target: PanelTarget | null): void {
  panel?.open(target)
}

// ------------------------------------------------------------------ quitting

function quitApp(): void {
  if (quitting) return
  quitting = true
  log('info', 'zamykanie: wyjście z aplikacji')
  if (bar) bar.quitting = true
  if (panel) panel.quitting = true
  tray?.destroy()
  void config
    .flush()
    .catch(() => undefined)
    .finally(() => app.quit())
}

function showMainWindow(page?: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (page) mainWindow.webContents.send(CH.onNavigate, page)
}

/**
 * The end of the Windows session, from any window (spec „Pliki na OneDrive”): the app never holds Windows up – the record
 * of closing goes out at once, one synchronous write without fsync; no installer starts now. Only asked (another app or
 * you may still cancel it): the app goes on as before, and once the session has not ended in a while the life marker
 * beats again. When it does end, the record is written once more (a marker beaten again made the first one stale).
 */
function onSystemEnd(ending: boolean): void {
  if (!sessionEnding) log('info', 'koniec sesji Windows – zapis zamknięcia')
  sessionEnding = true
  life.close('system')
  if (sessionResume) clearTimeout(sessionResume)
  sessionResume = null
  if (ending) return
  sessionResume = setTimeout(() => {
    sessionResume = null
    sessionEnding = false
    life.resume()
    log('info', 'koniec sesji Windows odwołany – działam dalej')
  }, Number(process.env.RD_TEST_SESSION_RESUME_MS) || SESSION_RESUME_MS)
  sessionResume.unref?.()
}

// ------------------------------------------------------------------ the tray's menu

function trialMenu(): MenuItemConstructorOptions[] {
  const t = trial.state
  const radio = <T extends string>(label: string, values: Array<[T, string]>, now: T, key: 'tone' | 'warn'): MenuItemConstructorOptions => ({
    label,
    submenu: values.map(([v, text]) => ({ label: text, type: 'radio', checked: now === v, click: () => trial.set({ [key]: v }) }))
  })
  const check = (label: string, key: 'dot' | 'drop' | 'hidden' | 'quiet' | 'long' | 'session' | 'question'): MenuItemConstructorOptions => ({
    label,
    type: 'checkbox',
    checked: t[key],
    click: () => trial.set({ [key]: !t[key] })
  })
  return [
    { label: 'Powiadomienie za 10 s', click: () => void trialAction('notifyIn10s') },
    { label: 'Otwórz panel', click: () => openPanel({ line: 'trial', day: null }) },
    { label: 'Połóż pasek pulpitu ponownie', click: () => void trialAction('placeBar') },
    { label: 'Pasek pulpitu na następnym ekranie', click: () => void trialAction('nextDisplay') },
    { type: 'separator' },
    radio('Kolor', [['praca', 'praca'], ['zycie', 'życie i opieka'], ['wolne', 'wolne'], ['rezerwa', 'rezerwa energii'], ['brak', 'bez bloku']], t.tone, 'tone'),
    radio('Ostrzeżenie', [['none', 'brak'], ['warm', '15 min'], ['five', '5 min'], ['zero', '0 min']], t.warn, 'warn'),
    check('Kropka', 'dot'),
    check('Kropla', 'drop'),
    check('Pytanie „Dalej?”', 'question'),
    check('Tryb ciszy (zwarty pasek)', 'quiet'),
    check('Sesja (Skończyłem)', 'session'),
    check('Najdłuższe teksty', 'long'),
    check('Widget ukryty', 'hidden'),
    { type: 'separator' },
    { label: 'Ekran świeci (nagrywanie)', click: () => void trialAction('powerDisplay') },
    { label: 'Bez usypiania systemu', click: () => void trialAction('powerSystem') },
    { label: 'Zwolnij blokady usypiania', click: () => void trialAction('powerOff') }
  ]
}

function trayMenu(): MenuItemConstructorOptions[] {
  const ready = updates?.updater?.readyRelease
  return [
    { label: 'Otwórz Regulated Day', click: () => showMainWindow() },
    { label: 'Próba', submenu: trialMenu() },
    ...(ready ? [{ label: `Zainstaluj teraz (${ready.version})`, click: () => void updates?.action('installNow') }] : []),
    { type: 'separator' },
    { label: 'Zakończ', click: () => quitApp() }
  ]
}

// ------------------------------------------------------------------ the trial's actions

async function trialAction(action: TrialAction, arg?: string): Promise<void> {
  trial.log(`akcja próby: ${action}${arg ? ` (${arg})` : ''}`)
  if (action === 'notifyIn10s') {
    setTimeout(() => {
      void helper
        ?.request('notificationState')
        .then((m) => trial.log(`stan powiadomień przed wysłaniem: ${String(m.state)}`))
        .catch(() => trial.log('stan powiadomień: pomocnik nie odpowiedział'))
      // Refused by Windows: why (the app's setting, the user's, a group policy) goes to the log and the trial's log.
      const sent = notify({ id: `trial-${Date.now()}`, title: 'Próba Regulated Day', body: 'Kliknij, żeby otworzyć panel ikony na linii próby.', line: 'trial', day: null }, log, () =>
        void helper
          ?.request('toastSetting')
          .then((m) => {
            log('warn', `powiadomienie odrzucone – ustawienie Windows: ${String(m.setting)}`)
            trial.log(`ustawienie powiadomień Windows: ${String(m.setting)}`)
          })
          .catch(() => trial.log('ustawienie powiadomień: pomocnik nie odpowiedział'))
      )
      trial.log(sent ? 'powiadomienie wysłane' : 'powiadomienie niedostępne w tej tożsamości')
    }, 10_000).unref?.()
  } else if (action === 'showBar') {
    await setPrefs({ desktopBar: true })
  } else if (action === 'hideBar') {
    await setPrefs({ desktopBar: false })
  } else if (action === 'placeBar') {
    barProblem = null
    helper?.send('bar.retry')
    layoutBar()
  } else if (action === 'nextDisplay' || action === 'corner') {
    const all = displays()
    const current = bar?.currentBounds
    const now = all.find((d) => current && current.x >= d.workArea.x && current.x < d.workArea.x + d.workArea.width) ?? primaryDisplay()
    const target = action === 'nextDisplay' ? all[(all.indexOf(now) + 1) % all.length]! : now
    const corner = (action === 'corner' ? arg : 'bottom-left') as 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
    const size = { width: current?.width ?? 480, height: Math.ceil(barFoldedHeight * prefs().zoom) }
    await setPrefs({ barPlacement: { display: { label: target.label, bounds: target.bounds }, offset: cornerOffset(corner, target.workArea, size) } })
  } else if (action === 'powerDisplay') {
    helper?.send('power', { display: true, system: true, reason: 'Regulated Day: próba nagrywania wykładu' })
  } else if (action === 'powerSystem') {
    helper?.send('power', { display: false, system: true, reason: 'Regulated Day: próba blokady usypiania' })
  } else if (action === 'powerOff') {
    helper?.send('power', { display: false, system: false })
  } else if (action === 'openPanel') {
    openPanel({ line: 'trial', day: null })
  } else if (action === 'clearLog') {
    trial.clear()
  }
}

// ------------------------------------------------------------------ settings

async function setPrefs(patch: unknown): Promise<MachinePrefs> {
  const before = prefs()
  const next = patchMachinePrefs(before, patch)
  const saved = config.update({ prefs: next })
  saved.catch((e) => log('warn', 'zapis ustawień komputera nie udał się', e))
  if (next.zoom !== before.zoom) for (const w of appWindows()) w.setZoomFactor(next.zoom)
  broadcast(CH.onPrefs, next)
  layoutBar()
  await saved.catch(() => undefined)
  return config.get().prefs
}

// ------------------------------------------------------------------ IPC

function handle<A extends unknown[], R>(channel: string, fn: (e: IpcMainInvokeEvent, ...args: A) => Promise<R> | R): void {
  ipcMain.handle(channel, async (e, ...args) => {
    try {
      return await fn(e, ...(args as A))
    } catch (err) {
      log('error', `IPC ${channel}`, err)
      throw err
    }
  })
}

function registerIpc(): void {
  handle(CH.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    identity: identity.kind,
    name: identity.name,
    userData,
    computerId: thisComputer,
    helper: helper?.status ?? { state: 'off', note: null },
    platform: process.platform
  }))
  handle(CH.prefs, () => prefs())
  handle(CH.setPrefs, (_e, patch: unknown) => setPrefs(patch))
  handle(CH.autostart, () => autostart!.read())
  handle(CH.setAutostart, async (_e, on: unknown) => {
    const value = on === true
    autostart!.set(value)
    await config.update({ autostart: { enabled: value } })
    return autostart!.read()
  })
  handle(CH.openLogs, async () => {
    await shell.openPath(join(userData, 'logs'))
  })
  handle(CH.widget, () => widgetView())
  handle(CH.copyText, (_e, text: unknown) => {
    if (typeof text === 'string') clipboard.writeText(text.slice(0, 200_000))
  })
  handle(CH.widgetAction, (e, action: WidgetAction, arg?: string) => {
    trial.log(`przycisk paska (${viewOf(e.sender)}): ${action}${arg ? ` ${arg}` : ''}`)
  })
  ipcMain.on(CH.barLayout, (e, layout: BarLayout) => {
    if (!layout || typeof layout.height !== 'number') return
    const view = viewOf(e.sender)
    if (view === 'bar') {
      barLayoutNow = { height: Math.max(24, Math.min(900, layout.height)), unfolded: layout.unfolded === true }
      if (!barLayoutNow.unfolded) barFoldedHeight = barLayoutNow.height
      layoutBar()
    } else if (view === 'panel') panel?.layout(Math.max(80, Math.min(900, layout.height)), prefs().zoom, layout.unfolded === true)
  })
  ipcMain.on(CH.panelTouch, (_e, unfolded?: boolean) => panel?.touch(typeof unfolded === 'boolean' ? unfolded : undefined))
  ipcMain.on(CH.panelClose, () => panel?.close('Esc'))
  ipcMain.on(CH.showMain, (_e, page?: string) => {
    panel?.close('otwarcie okna głównego')
    showMainWindow(typeof page === 'string' ? page : undefined)
  })
  handle(CH.trial, () => trial.state)
  handle(CH.setTrial, (_e, patch: unknown) => trial.set(patch))
  handle(CH.trialAction, (_e, action: TrialAction, arg?: string) => trialAction(action, arg))
  handle(CH.trialLog, () => trial.history())
  handle(CH.update, () => updates!.view())
  handle(CH.updateAction, (_e, action: UpdateAction) => updates!.action(action))
}

// ------------------------------------------------------------------ the start

/**
 * The windows need no permission at all; „notifications” above all is refused in every session of every identity – only
 * the main process shows notifications, through notify.ts (spec „Powiadomienia i dźwięki”).
 */
function denyPermissions(s: Electron.Session): void {
  s.setPermissionRequestHandler((_wc, _permission, cb) => cb(false))
  s.setPermissionCheckHandler(() => false)
}

function handleArgv(argv: readonly string[], firstStart: boolean): void {
  const target = identity.protocol ? urlFromArgv(argv, identity.protocol) : null
  if (target) {
    log('info', `adres aplikacji: panel${target.line ? ` (linia ${target.line})` : ''}`)
    openPanel(target)
    return
  }
  if (!firstStart && !argv.includes(HIDDEN_ARG)) showMainWindow()
}

const guardExe = (dir: string): string => (existsSync(join(dir, 'rd-guard.exe')) ? join(dir, 'rd-guard.exe') : join(helperDir, 'rd-guard.exe'))

/** The start sequence of the production app (update/startup.ts): before the lock of one copy, without the helper. */
async function startupGate(): Promise<StartupResult> {
  if (!identity.updates || process.platform !== 'win32') return { kind: 'normal', banner: null, afterLock: null, confirmed: null }
  return runStartup({
    updateDir,
    version: app.getVersion(),
    argv: process.argv,
    protocol: identity.protocol ?? 'regulatedday',
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    ...fsDeps(),
    startGuard: (dir) => {
      const child = spawn(guardExe(dir), ['--task', join(dir, 'task.json'), '--hidden'], { cwd: dir, detached: true, stdio: 'ignore' })
      child.on('error', (e) => log('error', `strażnik nie wystartował: ${e.message}`))
      child.unref()
      let exited = false
      child.on('exit', () => {
        exited = true
      })
      return child.pid ? { pid: child.pid, exited: () => exited } : null
    },
    killOwner: (pid, startMs) => guardMode(guardExe(updateDir), ['--kill', '--pid', String(pid), '--start', String(startMs)]).killed === true,
    removeGuardEntry: () => void guardMode(guardExe(updateDir), ['--run-entry', 'remove']),
    log
  })
}

/** „Co nowego” after an update: this version's section of CHANGELOG (bundled), shown at the first opening of the window. */
function whatsNew(): UpdateView['whatsNew'] {
  const last = config.get().updates.lastRunVersion
  const version = app.getVersion()
  if (!last || last === version) return null
  try {
    if (compareVersions(version, last) <= 0) return null
  } catch {
    return null
  }
  const file = join(app.getAppPath(), 'CHANGELOG.md')
  let notes = ''
  try {
    const text = readFileSync(file, 'utf8')
    const at = text.indexOf(`## ${version}`)
    if (at >= 0) notes = text.slice(text.indexOf('\n', at) + 1).split(/\n## /)[0]!.trim()
  } catch {
    notes = ''
  }
  return { version, notes }
}

/** The previous run's end from the life marker (a crash or not), then this run's marker. */
async function judgePreviousRun(): Promise<void> {
  const prev = life.previous()
  const close = life.closeRecord()
  const installerAt = life.installerMarker()
  const dumps = LifeKeeper.mainDumpSince(app.getPath('crashDumps'), prev?.startedAt ?? Number.MAX_SAFE_INTEGER)
  const sessionInfo = process.platform === 'win32' ? await sessionAtStart(helper, runId, 5000, log) : null
  const verdict = judge(prev, close, sessionInfo, installerAt, dumps.found)
  if (dumps.types.length) log('info', `nowe zrzuty awarii: ${dumps.types.join(', ')}`)
  log(verdict.kind === 'crash' ? 'warn' : 'info', `poprzednie uruchomienie: ${verdict.kind} (${verdict.why})`)
  life.start(runId, app.getVersion())
  recordRun(userData, app.getVersion(), verdict.kind === 'crash' && verdict.previous ? verdict.previous.version : null, log)
}

async function main(): Promise<void> {
  initLog(userData)
  const startup = await startupGate()
  if (startup.kind === 'exit') {
    log('info', `start zakończony: ${startup.reason}`)
    flushLog()
    app.exit(0)
    return
  }
  // One instance per identity (the lock is tied to the folder of app data): a second start only shows the window – one
  // from the autostart (--hidden) not even that – or opens the panel for an address.
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  app.on('second-instance', (_e, argv) => handleArgv(argv, false))
  await app.whenReady()
  // A quit during the start (the tray's „Zakończ”, the end of the session, a test) stops it at every wait: nothing
  // starts after the record of closing.
  if (quitting) return
  Menu.setApplicationMenu(null)
  log('info', `start v${app.getVersion()} (${identity.kind}, ${identity.name}) Electron ${process.versions.electron}`)
  let banner: Banner | null = startup.kind === 'normal' ? (startup.afterLock?.() ?? startup.banner) : null
  if (startup.kind === 'normal' && startup.confirmed) {
    writeLaunched(userData, startup.confirmed.version, startup.confirmed.attemptId)
    log('info', `uruchomiono wersję ${startup.confirmed.version} (próba ${startup.confirmed.attemptId})`)
  }
  if (identity.updates) {
    cleanUpdateFolders(updateDir, app.getVersion(), (m) => log('info', m))
    // The first start of a new version: its version and Electron's against the manifest; a mismatch repairs like an
    // interrupted installation (the guard).
    const m = manifestOf(updateDir, app.getVersion())
    if (m && (m.version !== app.getVersion() || m.electron !== process.versions.electron)) {
      log('warn', `wersja niezgodna z manifestem (${m.version}/${m.electron}) – strażnik naprawia instalację`)
      spawn(guardExe(join(updateDir, app.getVersion())), ['--task', join(updateDir, app.getVersion(), 'task.json'), '--hidden'], { detached: true, stdio: 'ignore' }).unref()
    }
  }
  await config.load()
  if (config.setAside) log('warn', `config.json uszkodzony – odłożony jako ${config.setAside}, ustawienia domyślne`)
  if (config.loadFailed) {
    log('warn', `config.json nieczytelny: ${config.loadFailed} – nic nie jest nadpisywane, czytam ponownie co ${CONFIG_RETRY_MS / 1000} s`)
    config.retryLoad(CONFIG_RETRY_MS, (c) => {
      log('info', 'config.json przeczytany – zmiany z tej sesji zapisane')
      if (thisComputer && c.computerId !== thisComputer) void config.update({ computerId: thisComputer }).catch(() => undefined)
      if (c.updates.lastRunVersion !== app.getVersion()) void config.update({ updates: { ...c.updates, lastRunVersion: app.getVersion() } }).catch(() => undefined)
      for (const w of appWindows()) w.setZoomFactor(c.prefs.zoom)
      broadcast(CH.onPrefs, c.prefs)
      layoutBar()
    })
  }
  try {
    const id = await computerId(userData, config.get().computerId)
    thisComputer = id.id
    if (id.created) log('info', `nowy identyfikator komputera ${id.id}`)
    if (config.get().computerId !== id.id && !config.loadFailed) await config.update({ computerId: id.id })
  } catch (e) {
    log('error', 'identyfikator komputera nieczytelny', e)
  }
  if (quitting) return
  denyPermissions(session.defaultSession)
  app.on('session-created', denyPermissions)
  if (identity.kind === 'test' && identity.protocol && process.platform === 'win32') app.setAsDefaultProtocolClient(identity.protocol)

  autostart = new Autostart({ supported: identity.systemIntegration, switchedOn: () => config.get().autostart.enabled, log })
  autostart.checkPath()

  helper = new HelperClient({
    program: helperProgram(),
    cwd: userData,
    init: { identity: identity.name, aumid: identity.appUserModelId, userData, logs: join(userData, 'logs'), parentPid: process.pid },
    log
  })
  helper.on('event', onHelperEvent)
  helper.on('status', (s) => {
    trial.log(`pomocnik: ${s.state}${s.note ? ` (${s.note})` : ''}`)
    if (s.state === 'running') helper?.send('foreground.watch')
    layoutBar()
    broadcast(CH.onWidget, widgetView())
    broadcast(CH.onUpdate, updates?.view())
  })
  helper.start()

  updates = new UpdateController({
    enabled: identity.updates && app.isPackaged && process.platform === 'win32',
    version: app.getVersion(),
    userData,
    helperDir,
    fetch: (url, init) => net.fetch(url, init),
    helperRunning: () => !!helper?.running,
    autostartOn: () => config.get().autostart.enabled,
    nightInstall: () => config.get().updates.nightInstall,
    beforeInstall: () => life.close('update'),
    installFailed: () => life.resume(),
    quit: quitApp,
    openExternal: (url) => void shell.openExternal(url),
    broadcast: (v) => {
      broadcast(CH.onUpdate, v)
      tray?.refresh()
    },
    log
  })
  // The local plan of sessions and classes for the guard: E1 / E4a fill it; empty, it covers the next 7 days.
  // RD_TEST_KEEP_PLAN=1 (CI): the plan a test wrote for the guard stays.
  if (identity.updates && process.env.RD_TEST_KEEP_PLAN !== '1') writePlan(userData, [])

  registerIpc()
  tray = new AppTray({ title: APP_TITLE, iconDir: join(userData, 'icons'), click: () => panel?.toggle(), menu: trayMenu, log })
  tray.ensure()

  const startHidden = process.argv.includes(HIDDEN_ARG)
  mainWindow = createMainWindow({
    preload,
    title: APP_TITLE,
    saved: config.get().window,
    load: loadView,
    savePlace: (place) => void config.update({ window: place }).catch(() => undefined),
    quitting: () => quitting,
    externalClose: quitApp,
    log: (m) => log('info', m)
  })
  mainWindow.once('ready-to-show', () => {
    if (startHidden) log('info', 'start w zasobniku (uruchomienie z Windows)')
    else showMainWindow()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.on('query-session-end', () => onSystemEnd(false))
  mainWindow.on('session-end', () => onSystemEnd(true))

  bar = new DesktopBar(preload, loadView)
  bar.onExternalClose = quitApp
  bar.onSystemEnd(onSystemEnd)
  panel = new IconPanel(preload, loadView, {
    place: (height, cursor) => {
      const all = displays()
      const icon = tray?.bounds() ?? null
      const wa = (all.find((d) => icon && icon.x >= d.bounds.x && icon.x < d.bounds.x + d.bounds.width) ?? primaryDisplay()).workArea
      const width = Math.floor(Math.min(480 * prefs().zoom, wa.width - 16))
      return panelRect(icon, cursor, all, { width, height: Math.min(height, wa.height) })
    },
    helperRunning: () => !!helper?.running,
    hideFromCapture: () => prefs().hideFromCapture,
    log: (m) => trial.log(m)
  })
  panel.onExternalClose = quitApp
  panel.onSystemEnd(onSystemEnd)

  trial.on('change', (view: WidgetView) => showWidget(view))
  trial.on('log', (line: string) => broadcast(CH.onTrialLog, line))
  showWidget(widgetView())

  screen.on('display-metrics-changed', () => {
    tray?.refresh()
    layoutBar()
  })
  screen.on('display-added', () => layoutBar())
  screen.on('display-removed', () => layoutBar())
  powerMonitor.on('resume', () => layoutBar())
  powerMonitor.on('unlock-screen', () => layoutBar())

  await judgePreviousRun()
  if (quitting) return
  if (banner) log('warn', `aktualizacja do ${banner.version}: ${banner.kind === 'failed' ? 'nie udała się' : 'nie dokończyła się'}`)
  updates.init(banner, whatsNew())
  banner = null
  if (config.get().updates.lastRunVersion !== app.getVersion() && !config.loadFailed) void config.update({ updates: { ...config.get().updates, lastRunVersion: app.getVersion() } })
  // Started by the autostart with a downloaded update: the guard installs it at the start of Windows.
  if (startHidden && updates.atAutostart()) return
  handleArgv(process.argv, true)
}

// The windows are hidden, never closed, while the app runs: this fires only when it quits.
app.on('window-all-closed', () => {
  if (!quitting) quitApp()
})

app.on('before-quit', () => {
  quitting = true
  if (bar) bar.quitting = true
  if (panel) panel.quitting = true
})

app.on('will-quit', () => {
  // A ready download installs at the full exit (never at the end of the Windows session).
  updates?.onQuit(sessionEnding)
  helper?.stop()
  if (!sessionEnding) life.close('quit')
  log('info', 'koniec pracy')
  flushLog()
})

process.on('uncaughtException', (e) => log('error', 'nieobsłużony wyjątek w procesie głównym', e))
process.on('unhandledRejection', (reason) => log('error', 'nieobsłużone odrzucenie w procesie głównym', reason))
app.on('render-process-gone', (_e, contents, details) => {
  log('error', `okno przestało działać (${viewOf(contents)}): ${details.reason}, kod ${details.exitCode}`)
  if (details.reason !== 'clean-exit' && !quitting && !contents.isDestroyed()) contents.reload()
})
// A window that stops answering leaves a line in the log, for every window (the bar and the panel too).
app.on('browser-window-created', (_e, win) => {
  win.on('unresponsive', () => log('warn', `okno nie odpowiada: ${win.getTitle()}`))
  win.on('responsive', () => log('info', `okno znów odpowiada: ${win.getTitle()}`))
})
app.on('child-process-gone', (_e, details) => log('warn', `proces pomocniczy Electrona zakończył się: ${details.type} ${details.name ?? ''} ${details.reason}, kod ${details.exitCode}`))

// Test hooks of CI (RD_TEST_CRASH): a crash of the main process, the renderer or the GPU – only the first is a crash.
if (process.env.RD_TEST_CRASH) {
  app.whenReady().then(() =>
    setTimeout(() => {
      const kind = process.env.RD_TEST_CRASH
      log('info', `RD_TEST_CRASH=${kind}`)
      if (kind === 'main') process.crash()
      else if (kind === 'renderer') mainWindow?.webContents.forcefullyCrashRenderer()
      else if (kind === 'gpu') void new BrowserWindow({ show: false }).loadURL('chrome://gpucrash').catch(() => undefined)
    }, Number(process.env.RD_TEST_CRASH_MS) || 3000)
  )
}

main().catch((e) => {
  log('error', 'start aplikacji nie udał się', e)
  flushLog()
  app.exit(1)
})
