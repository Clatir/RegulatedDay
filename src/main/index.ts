// adapted from FI src/main/index.ts @ de81f2b
/**
 * The main process: loaded by start.ts once the identity of this run is fixed. It owns the windows (main, icon panel,
 * desktop bar), the tray icon, the helper, the trial of E0 and, from E1 on, the timer and the deadlines (spec „Baza kodu
 * i technika”: the timer, the deadlines and the widget's writes belong to the main process, not to the main window).
 */
import { join } from 'node:path'
import { BrowserWindow, Menu, app, clipboard, crashReporter, ipcMain, powerMonitor, screen, session, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import { CH, type AppInfo, type BarLayout, type TrialAction, type UpdateAction, type ViewKind, type WidgetAction } from '@shared/api'
import type { MachinePrefs } from '@shared/machine'
import { patchMachinePrefs } from '@shared/machine'
import { barRect, cornerOffset, panelRect } from '@shared/placement'
import { urlFromArgv, type PanelTarget } from '@shared/protocol'
import { UPDATES_OFF } from '@shared/updateView'
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
import { notify } from './notify'
import { Trial } from './trial'
import { helperProgram } from './helper/program'

// Crash dumps of every process stay on this computer (no upload); only the main process's („browser”) count as a crash.
crashReporter.start({ uploadToServer: false, submitURL: '', compress: false })

const APP_TITLE = identity.name

// One instance per identity (the lock is tied to the folder of app data): a second start only shows the window – one
// from the autostart (--hidden) not even that – or opens the panel for an address.
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) app.quit()

const config = new ConfigStore(app.getPath('userData'), Number(process.env.RD_CONFIG_WRITE_DELAY_MS) || 0)
const preload = join(__dirname, '../preload/index.js')

let mainWindow: BrowserWindow | null = null
let bar: DesktopBar | null = null
let panel: IconPanel | null = null
let tray: AppTray | null = null
let helper: HelperClient | null = null
let autostart: Autostart | null = null
let thisComputer = ''
const trial = new Trial()
let quitting = false
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
  broadcast(CH.onWidget, view)
  layoutBar()
}

/** The desktop bar as the settings, the widget and the helper allow: laid under the windows before it shows. */
function layoutBar(): void {
  if (!bar) return
  const view = widgetView()
  const want = prefs().desktopBar && !view.hidden
  if (!want) {
    barProblem = null
    bar.apply({ visible: false })
    helper?.send('bar.unwatch')
    return
  }
  const primary = primaryDisplay()
  const zoom = prefs().zoom
  const r = barRect(prefs().barPlacement, displays(), primary, zoom, Math.ceil(barFoldedHeight * zoom), Math.ceil(barLayoutNow.height * zoom))
  bar.apply({ bounds: r.bounds, contentProtection: prefs().hideFromCapture })
  bar.webContents.send('rd:barGrows', r.growsUp ? 'up' : 'down')
  if (!helper?.running) {
    barProblem = 'helper'
    bar.apply({ visible: false })
    return
  }
  helper.send('bar.watch', { hwnd: bar.hwnd })
}

function onHelperEvent(m: HelperMessage): void {
  if (m.type === 'bar') {
    trial.log(`pasek: ${String(m.state)}${m.detail ? ` – ${String(m.detail)}` : ''}`)
    if (m.state === 'confirmed') {
      barProblem = null
      bar?.apply({ visible: true })
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
  } else if (m.type === 'notificationState') {
    trial.log(`stan powiadomień: ${String(m.state)}`)
  } else if (m.type === 'power') {
    trial.log(`zasilanie: ${JSON.stringify(m)}`)
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
  helper?.stop()
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
  return [
    { label: 'Otwórz Regulated Day', click: () => showMainWindow() },
    { label: 'Próba', submenu: trialMenu() },
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
      const sent = notify({ id: `trial-${Date.now()}`, title: 'Próba Regulated Day', body: 'Kliknij, żeby otworzyć panel ikony na linii próby.', line: 'trial', day: null }, log, () =>
        helper?.send('toastSetting')
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
    const size = { width: current?.width ?? 480, height: Math.ceil(64 * prefs().zoom) }
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
    userData: app.getPath('userData'),
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
    await shell.openPath(join(app.getPath('userData'), 'logs'))
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
  handle(CH.update, () => UPDATES_OFF(app.getVersion(), 'Aktualizacje pojawią się w tej wersji próbnej później.'))
  handle(CH.updateAction, (_e, _action: UpdateAction) => UPDATES_OFF(app.getVersion(), 'Aktualizacje pojawią się w tej wersji próbnej później.'))
}

// ------------------------------------------------------------------ start

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

app.on('second-instance', (_e, argv) => handleArgv(argv, false))

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return
  Menu.setApplicationMenu(null)
  initLog(app.getPath('userData'))
  log('info', `start v${app.getVersion()} (${identity.kind}, ${identity.name}) Electron ${process.versions.electron}`)
  await config.load()
  if (config.setAside) log('warn', `config.json uszkodzony – odłożony jako ${config.setAside}, ustawienia domyślne`)
  if (config.loadFailed) log('warn', `config.json nieczytelny: ${config.loadFailed} – nic nie jest nadpisywane`)
  try {
    const id = await computerId(app.getPath('userData'), config.get().computerId)
    thisComputer = id.id
    if (id.created) log('info', `nowy identyfikator komputera ${id.id}`)
    if (config.get().computerId !== id.id && !config.loadFailed) await config.update({ computerId: id.id })
  } catch (e) {
    log('error', 'identyfikator komputera nieczytelny', e)
  }
  denyPermissions(session.defaultSession)
  app.on('session-created', denyPermissions)
  if (identity.kind === 'test' && identity.protocol && process.platform === 'win32') app.setAsDefaultProtocolClient(identity.protocol)

  autostart = new Autostart({ supported: identity.systemIntegration, switchedOn: () => config.get().autostart.enabled, log })
  autostart.checkPath()

  helper = new HelperClient({
    program: helperProgram(),
    cwd: app.getPath('userData'),
    init: { identity: identity.name, aumid: identity.appUserModelId, userData: app.getPath('userData'), logs: join(app.getPath('userData'), 'logs'), parentPid: process.pid },
    log
  })
  helper.on('event', onHelperEvent)
  helper.on('status', (s) => {
    trial.log(`pomocnik: ${s.state}${s.note ? ` (${s.note})` : ''}`)
    if (s.state === 'running') {
      helper?.send('foreground.watch')
    }
    layoutBar()
    broadcast(CH.onWidget, widgetView())
  })

  registerIpc()
  tray = new AppTray({ title: APP_TITLE, iconDir: join(app.getPath('userData'), 'icons'), click: () => panel?.toggle(), menu: trayMenu, log })
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

  bar = new DesktopBar(preload, loadView)
  bar.onExternalClose = quitApp
  panel = new IconPanel(preload, loadView, {
    place: (height) => {
      const all = displays()
      const icon = tray?.bounds() ?? null
      const cursor = screen.getCursorScreenPoint()
      const wa = (all.find((d) => icon && icon.x >= d.bounds.x && icon.x < d.bounds.x + d.bounds.width) ?? primaryDisplay()).workArea
      const width = Math.floor(Math.min(480 * prefs().zoom, wa.width - 16))
      return panelRect(icon, cursor, all, { width, height: Math.min(height, wa.height) })
    },
    helperRunning: () => !!helper?.running,
    log: (m) => trial.log(m)
  })
  panel.onExternalClose = quitApp

  trial.on('change', (view: WidgetView) => showWidget(view))
  trial.on('log', (line: string) => broadcast(CH.onTrialLog, line))
  showWidget(widgetView())
  helper.start()

  screen.on('display-metrics-changed', () => {
    tray?.refresh()
    layoutBar()
  })
  screen.on('display-added', () => layoutBar())
  screen.on('display-removed', () => layoutBar())
  powerMonitor.on('resume', () => layoutBar())
  powerMonitor.on('unlock-screen', () => layoutBar())

  handleArgv(process.argv, true)
})

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
  log('info', 'koniec pracy')
  flushLog()
})

process.on('uncaughtException', (e) => log('error', 'nieobsłużony wyjątek w procesie głównym', e))
process.on('unhandledRejection', (reason) => log('error', 'nieobsłużone odrzucenie w procesie głównym', reason))
app.on('render-process-gone', (_e, contents, details) => {
  log('error', `okno przestało działać (${viewOf(contents)}): ${details.reason}, kod ${details.exitCode}`)
  if (details.reason !== 'clean-exit' && !quitting && !contents.isDestroyed()) contents.reload()
})
app.on('child-process-gone', (_e, details) => log('warn', `proces pomocniczy Electrona zakończył się: ${details.type} ${details.name ?? ''} ${details.reason}, kod ${details.exitCode}`))
