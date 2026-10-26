// adapted from FI src/main/index.ts @ de81f2b
/**
 * The main process: loaded by start.ts once the identity of this run is fixed. It owns the windows (main, icon panel,
 * desktop bar), the tray icon, the helper, updates, the life marker, the trial of E0 and, from E1 on, the timer and the
 * deadlines (spec „Baza kodu i technika”: the timer, the deadlines and the widget's writes belong to the main process).
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, Menu, app, clipboard, crashReporter, dialog, ipcMain, net, powerMonitor, powerSaveBlocker, screen, session, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import {
  CH,
  type AppInfo,
  type BarLayout,
  type EditEntry,
  type EventIn,
  type SystemSettingsPage,
  type TimerIn,
  type TrialAction,
  type UpdateAction,
  type ViewKind,
  type WidgetAction,
  type WizardFinish
} from '@shared/api'
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
import { readVersions, recordRun } from './crash/versions'
import { NightInstaller } from './update/night'
import { marketDay } from '@shared/calendar/holidays'
import { STOP_TIMEOUT_MS, type DataService } from './data/service'
import { DataHub } from './data/hub'
import { PowerKeeper } from './power'
import { OneDriveWatch } from './onedrive'
import { toneOnChange, WidgetEngine } from './widget'
import { SoundWindow } from './windows/soundWindow'

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
let sound: SoundWindow | null = null
let helper: HelperClient | null = null
let autostart: Autostart | null = null
let updates: UpdateController | null = null
let thisComputer = ''
/**
 * The data folder at work: the one the wizard chose on this computer (config.json), or RD_DATA_DIR (tests and the
 * developer's version), which wins.
 */
let hub: DataHub | null = null
let dataClosing = false
/** The version that ran on this computer before this start (read before it is overwritten): a backup after an update. */
let lastRunVersion: string | null = null
const data = (): DataService | null => hub?.service ?? null
const trial = new Trial()
/** The block of sleep: the helper holds the system, the app the screen (T290, T301). */
const power = new PowerKeeper({
  request: (cmd, args, timeoutMs) => (helper ? helper.request(cmd, args, timeoutMs) : Promise.reject(new Error('pomocnik nie działa'))),
  blocker: { start: (type) => powerSaveBlocker.start(type), stop: (id) => powerSaveBlocker.stop(id) },
  log: (level, msg) => log(level, msg)
})
/** OneDrive in this session (the helper), for the folder's decisions of who leads. */
const oneDrive = new OneDriveWatch({
  ask: async () => {
    if (!helper?.running) throw new Error('pomocnik nie działa')
    return (await helper.request('oneDrive', {}, 5000)).running === true
  },
  inOneDrive: () => {
    const dir = dataFolderNow()
    return !!dir && DataHub.inOneDrive(dir)
  },
  log: (level, msg) => log(level, msg)
})
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

/**
 * The widget's engine (E4b): the engine's view once a data folder is open (the trial while none is, and for 10 min
 * after a change of the trial), the bar's clicks as actions of the timer, the notifications of the leader.
 */
const widget = new WidgetEngine({
  folder: () => hub?.service?.folder ?? null,
  timer: (click) => (hub ? hub.timer(click) : Promise.resolve({ ok: false, why: 'folder danych nie jest otwarty', confirm: null })),
  answer: (id, a, value) => (hub ? hub.answer(id, a, value) : Promise.resolve({ ok: false, why: 'folder danych nie jest otwarty', confirm: null })),
  seen: (ids, how) => hub?.seen(ids, how) ?? Promise.resolve(0),
  clickedApp: () => hub?.clickedApp(),
  modePrefs: () => ({ sessionMode: prefs().sessionMode, classMode: prefs().classMode }),
  notices: () => prefs().notices,
  trial: () => ({ view: trial.view(), changedAt: trial.changedAt }),
  notify: (n) => notify(n, log),
  showMain: (page) => showMainWindow(page),
  emit: (view) => showWidget(view),
  log
})

function widgetView(): WidgetView {
  const view = widget.current()
  const barNote = !prefs().desktopBar || view.hidden ? null : barProblem === 'failed' ? BAR_NOTE_FAILED : barProblem === 'helper' ? BAR_NOTE_HELPER : null
  return { ...view, barNote }
}

/** The block and the step of the warning last shown (a tone plays when the step of the same block turns to 5 or 0 min). */
let lastWarn: { block: string; warn: string } | null = null

function showWidget(view: WidgetView): void {
  tray?.set({ color: view.iconColor, dot: view.dot, drop: view.drop }, view.tooltip)
  broadcast(CH.onWidget, widgetView())
  layoutBar()
  const tone = toneOnChange(lastWarn, view)
  lastWarn = tone.next
  if (tone.play && prefs().sound) sound?.play(tone.play, prefs().soundVolume)
  // The open icon's panel shows the questions: they count as seen (spec D231).
  if (panel?.isOpen) {
    const ids = widget.shownQuestions()
    if (ids.length) void hub?.seen(ids, 'panel').catch(() => undefined)
  }
}

/** The window in the foreground covers its monitor (the helper's event): a bar „na wierzchu” hides over it (D291). */
let fullscreenNow = false
/** The desktop bar is „na wierzchu” now. */
let barTop = false

/** The settings and the widget want the desktop bar shown now. */
const barWanted = (): boolean => prefs().desktopBar && !widgetView().hidden && !(prefs().onTop !== 'off' && fullscreenNow)

/**
 * The desktop bar as the settings, the widget and the helper allow: laid under the windows before it shows – or, with
 * „Zawsze na wierzchu” chosen on this computer (D291), above them, still without activation, hidden over a full screen.
 */
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
  const onTop = prefs().onTop !== 'off'
  // Off again: hidden first – dropping „topmost” would leave it above the windows until the helper lays it under them.
  if (!onTop && barTop) bar.apply({ visible: false })
  barTop = onTop
  bar.apply({ bounds: r.bounds, contentProtection: prefs().hideFromCapture, onTop })
  bar.webContents?.send('rd:barGrows', r.growsUp ? 'up' : 'down')
  if (onTop) {
    // Above the windows: nothing to lay under them, no confirmation needed.
    barProblem = null
    helper?.send('bar.unwatch')
    bar.apply({ visible: true })
    return
  }
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
    // An own window in the foreground keeps the state (the bar itself never takes it).
    if (hwnd !== bar?.hwnd && hwnd !== panel?.hwnd && fullscreenNow !== (m.fullscreen === true)) {
      fullscreenNow = m.fullscreen === true
      if (prefs().onTop !== 'off') layoutBar()
    }
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

const TIMER_ACTIONS = new Set(['start', 'startNew', 'pause', 'next', 'extend', 'workEnd', 'finish', 'cancel', 'park', 'confirm', 'undo', 'cutOff', 'back', 'fewer', 'better', 'drink', 'restart', 'mark'])

/** A click of the timer from a window, only with the fields an action takes (anything else is dropped). */
function timerIn(c: TimerIn): TimerIn {
  if (!c || typeof c !== 'object' || !TIMER_ACTIONS.has(String(c.a))) throw new Error('nieznane działanie timera')
  const str = (v: unknown) => (typeof v === 'string' && v.length <= 64 ? v : undefined)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  return {
    a: String(c.a),
    day: str(c.day),
    block: str(c.block),
    minutes: num(c.minutes),
    done: typeof c.done === 'boolean' ? c.done : undefined,
    confirm: c.confirm === true,
    categoryId: str(c.categoryId),
    durationMin: num(c.durationMin),
    variantId: str(c.variantId) ?? null,
    target: str(c.target),
    question: str(c.question),
    answer: str(c.answer)
  }
}

/** The data folder of this computer: RD_DATA_DIR (tests, the developer), else the wizard's choice; none – the wizard. */
const dataFolderNow = (): string | null => process.env.RD_DATA_DIR || config.get().dataFolder

function createHub(): DataHub {
  return new DataHub({
    userData,
    computer: () => thisComputer,
    computerName: hostname(),
    appVersion: app.getVersion(),
    runId,
    holidays: marketDay,
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    appFocused: () => (!!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) || (!!panel?.isOpen && !!panel.webContents?.isFocused()),
    oneDriveRunning: () => oneDrive.running,
    onPower: (need) => power.want(need),
    versions: () => readVersions(userData),
    log,
    writeGuardPlan: identity.updates && process.env.RD_TEST_KEEP_PLAN !== '1',
    extraBackupDir: () => prefs().backupDir,
    previousVersion: () => lastRunVersion,
    onChange: () => {
      broadcast(CH.onData, null)
      void widget.refresh()
    }
  })
}

/**
 * The wizard's end (spec „Kreator pierwszego komputera”, „Kreator kolejnego komputera”): this computer's settings, the
 * folder opened, and – on the first computer only – the shared data written then, never before; the next computer
 * writes nothing shared.
 */
async function wizardFinish(w: WizardFinish): Promise<{ ok: boolean; error: string | null }> {
  if (!hub || !thisComputer) return { ok: false, error: 'Aplikacja jeszcze się uruchamia.' }
  if (process.env.RD_DATA_DIR) return { ok: false, error: 'Folder danych jest ustawiony zmienną RD_DATA_DIR.' }
  // The folder this computer already works in may be written there: no second folder chosen beside it meanwhile.
  if (config.loadFailed) return { ok: false, error: 'Ustawienia tego komputera (config.json) są teraz nieczytelne – spróbuj ponownie za chwilę.' }
  const probe = await DataHub.probe(w.folder)
  if (probe.unreadable) return { ok: false, error: `Nie mogę odczytać folderu: ${probe.unreadable}` }
  if (w.first && probe.hasData) return { ok: false, error: 'W tym folderze są już dane Regulated Day – ten komputer może do nich dołączyć.' }
  if (!w.first && !probe.hasData) return { ok: false, error: 'W tym folderze nie ma danych Regulated Day.' }
  if (w.first) {
    // The shared data before the folder opens (its first check makes today's day from them).
    try {
      await DataHub.createFirst(probe.path, w.records, thisComputer, Date.now())
    } catch (e) {
      log('error', 'kreator: zapis danych wspólnych nie udał się', e)
      return { ok: false, error: `Nie zapisano danych: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  await setPrefs(w.prefs)
  if (w.autostart != null && autostart?.read().supported) {
    autostart.set(w.autostart)
    await config.update({ autostart: { enabled: w.autostart } }).catch(() => undefined)
  }
  if (!(await hub.open(probe.path))) return { ok: false, error: hub.error ?? 'Folder danych nie otworzył się.' }
  await config.update({ dataFolder: probe.path })
  if (w.pin && probe.inOneDrive && process.platform === 'win32') {
    await DataHub.pin(probe.path).then(
      () => log('info', `folder danych przypięty („Zawsze przechowuj na tym urządzeniu”): ${probe.path}`),
      (e) => log('warn', 'przypięcie folderu danych nie udało się', e)
    )
  }
  log('info', `kreator zakończony (${w.first ? 'pierwszy komputer' : 'kolejny komputer'}): ${probe.path}`)
  return { ok: true, error: null }
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
  // One synchronous line in the folder's journal (no fsync): Windows may end the process right after.
  try {
    data()?.systemEnd()
  } catch {
    /* the journal could not be written – nothing to hold Windows up for */
  }
  if (sessionResume) clearTimeout(sessionResume)
  sessionResume = null
  if (ending) return
  sessionResume = setTimeout(() => {
    sessionResume = null
    sessionEnding = false
    life.resume()
    data()?.systemResumed()
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
  const appInfo = (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    identity: identity.kind,
    name: identity.name,
    userData,
    computerId: thisComputer,
    helper: helper?.status ?? { state: 'off', note: null },
    platform: process.platform,
    nightInstall: config.get().updates.nightInstall
  })
  handle(CH.appInfo, appInfo)
  handle(CH.setNightInstall, async (_e, on: unknown) => {
    await config.update({ updates: { ...config.get().updates, nightInstall: on === true } })
    return appInfo()
  })
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
  handle(CH.widgetAction, async (e, action: WidgetAction, arg?: string) => {
    const from = viewOf(e.sender)
    trial.log(`przycisk paska (${from}): ${action}${arg ? ` ${arg}` : ''}`)
    await widget.act(String(action), typeof arg === 'string' ? arg.slice(0, 200) : undefined, from)
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

  // The data folder for the main window (E3).
  const needHub = (): DataHub => {
    if (!hub) throw new Error('Aplikacja jeszcze się uruchamia.')
    return hub
  }
  handle(CH.dataView, () => needHub().view())
  handle(CH.dayData, (_e, date: string) => needHub().day(String(date)))
  handle(CH.dayFiles, (_e, dates: string[]) => needHub().dayFiles(Array.isArray(dates) ? dates.map(String) : []))
  handle(CH.edit, (_e, entries: EditEntry[]) => needHub().edit(Array.isArray(entries) ? entries : []))
  handle(CH.logEvents, (_e, events: EventIn[]) => needHub().events(Array.isArray(events) ? events : []))
  handle(CH.resolve, (_e, id: string, choice: 'mine' | 'theirs') => needHub().resolve(String(id), choice === 'theirs' ? 'theirs' : 'mine'))
  handle(CH.monthEvents, (_e, month: string, kinds: string[]) => needHub().monthEvents(String(month), Array.isArray(kinds) ? kinds.map(String) : []))
  handle(CH.timer, (_e, click: TimerIn) => needHub().timer(timerIn(click)))
  handle(CH.answer, (_e, id: string, answer: string, value: number | null) => needHub().answer(String(id), String(answer), typeof value === 'number' && Number.isFinite(value) ? value : null))
  ipcMain.on(CH.seen, (e, ids: unknown) => {
    // Seen only in the main window in the foreground (spec D231); the panel counts while it is open (E4b).
    const view = viewOf(e.sender)
    const shown = view === 'main' ? !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused() : view === 'panel' && !!panel?.isOpen
    if (!shown || !Array.isArray(ids)) return
    void hub?.seen(ids.filter((x): x is string => typeof x === 'string'), view === 'panel' ? 'panel' : 'main').catch((err) => log('warn', 'zapis zobaczenia pytania nie udał się', err))
  })
  handle(CH.historyList, () => needHub().historyList())
  handle(CH.historyVersions, (_e, kind: string, id: string) => needHub().historyVersions(String(kind), String(id)))
  handle(CH.historyRestore, (_e, kind: string, id: string, file: string) => needHub().historyRestore(String(kind), String(id), String(file)))
  handle(CH.folderDefault, () => dataFolderNow() ?? DataHub.defaultFolder(app.getPath('documents')))
  handle(CH.folderPick, async (e, current: string | null) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = { title: 'Folder danych Regulated Day', defaultPath: typeof current === 'string' ? current : undefined, properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  handle(CH.folderProbe, (_e, path: string) => DataHub.probe(String(path)))
  handle(CH.wizardFinish, (_e, w: WizardFinish) => wizardFinish(w))
  handle(CH.pinFolder, async () => {
    const dir = dataFolderNow()
    if (!dir || process.platform !== 'win32') return { ok: false, error: 'Przypięcie działa tylko w folderze OneDrive na Windows.' }
    try {
      await DataHub.pin(dir)
      log('info', `folder danych przypięty („Zawsze przechowuj na tym urządzeniu”): ${dir}`)
      return { ok: true, error: null }
    } catch (err) {
      log('warn', 'przypięcie folderu danych nie udało się', err)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  handle(CH.openSystemSettings, async (_e, page: SystemSettingsPage) => {
    if (process.platform === 'win32') await shell.openExternal(page === 'taskbar' ? 'ms-settings:taskbar' : 'ms-settings:notifications')
  })
  handle(CH.openDataFolder, async () => {
    const dir = dataFolderNow()
    if (dir) await shell.openPath(dir)
  })
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
  lastRunVersion = config.get().updates.lastRunVersion
  if (config.setAside) log('warn', `config.json uszkodzony – odłożony jako ${config.setAside}, ustawienia domyślne`)
  if (config.loadFailed) {
    log('warn', `config.json nieczytelny: ${config.loadFailed} – nic nie jest nadpisywane, czytam ponownie co ${CONFIG_RETRY_MS / 1000} s`)
    config.retryLoad(CONFIG_RETRY_MS, (c) => {
      log('info', 'config.json przeczytany – zmiany z tej sesji zapisane')
      lastRunVersion = c.updates.lastRunVersion
      // The folder was unknown until now: it opens (or the wizard of a computer without one comes).
      const dir = dataFolderNow()
      if (hub && dir && thisComputer && hub.status === 'failed' && hub.folder === null) void hub.open(dir)
      else if (!dir) hub?.noFolder()
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
  hub = createHub()
  const folderAtStart = dataFolderNow()
  if (folderAtStart) hub.expect(folderAtStart)
  else if (config.loadFailed) hub.unknownFolder('ustawienia tego komputera (config.json) są nieczytelne – czytam je ponownie')
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
    if (s.state === 'running') {
      helper?.send('foreground.watch')
      oneDrive.start()
      // The helper (re)started: it gets the state of the sleep block at once (T301).
      void data()?.tick()
    }
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
  // The night installation (D162): judged every minute and at the lock of the screen (modern standby sleeps after it).
  const night = new NightInstaller({
    now: () => Date.now(),
    me: () => thisComputer,
    ready: () => updates?.updater?.readyRelease?.version ?? null,
    peers: () => (data()?.folder.presence.peers() ?? []).map((p) => ({ computer: p.presence.computer, appVersion: p.presence.appVersion, versions: p.presence.versions, installing: p.presence.installing })),
    unknownTimerEvents: async () => (await data()?.folder.unknownTimerEvents()) ?? false,
    state: async () => {
      const f = data()?.folder
      const notif = helper?.running ? await helper.request('notificationState', {}, 3000).catch(() => null) : null
      const caps = helper?.running ? await helper.request('powerState', {}, 3000).catch(() => null) : null
      return {
        now: Date.now(),
        quiet: f ? await f.nightQuiet().catch(() => false) : false,
        locked: powerMonitor.getSystemIdleState(1) === 'locked',
        idleMs: powerMonitor.getSystemIdleTime() * 1000,
        onMains: typeof caps?.onMains === 'boolean' ? caps.onMains : !powerMonitor.isOnBatteryPower(),
        blockRunning: f ? await f.anyBlockRunning().catch(() => true) : false,
        notificationState: typeof notif?.state === 'string' ? notif.state : null,
        enabled: config.get().updates.nightInstall,
        helperRunning: !!helper?.running
      }
    },
    claim: (v) => data()?.folder.setInstalling(v),
    install: () => !!updates?.install('night', 'hidden'),
    log: (level, msg) => log(level, msg)
  })
  if (identity.updates && app.isPackaged && process.platform === 'win32') {
    setInterval(() => void night.check(), 60_000).unref?.()
    powerMonitor.on('lock-screen', () => void night.check())
  }
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
    stayOnTop: () => prefs().onTop === 'barPanel',
    log: (m) => trial.log(m)
  })
  panel.onExternalClose = quitApp
  panel.onSystemEnd(onSystemEnd)

  sound = new SoundWindow(preload, loadView)
  trial.on('change', () => showWidget(widgetView()))
  trial.on('log', (line: string) => broadcast(CH.onTrialLog, line))
  showWidget(widgetView())
  widget.start()

  screen.on('display-metrics-changed', () => {
    tray?.refresh()
    layoutBar()
  })
  screen.on('display-added', () => layoutBar())
  screen.on('display-removed', () => layoutBar())
  powerMonitor.on('resume', () => {
    layoutBar()
    data()?.resume()
  })
  powerMonitor.on('unlock-screen', () => {
    layoutBar()
    data()?.unlock()
  })
  powerMonitor.on('suspend', () => data()?.suspend())
  powerMonitor.on('lock-screen', () => data()?.lock())

  await judgePreviousRun()
  if (quitting) return
  // The folder opens beside the rest of the start (a slow folder never holds the updates or an address back).
  const folderNow = dataFolderNow()
  if (folderNow && thisComputer) void hub?.open(folderNow)
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

app.on('before-quit', (e) => {
  quitting = true
  if (bar) bar.quitting = true
  if (panel) panel.quitting = true
  // The data folder closes first, by any way out (its journal is on the disk already: this writes what OneDrive can take
  // now and the presence „closed”), also while it is still opening – once, with a limit of time, and never at the end of
  // the Windows session, which the app does not hold up.
  if (hub && (hub.service || hub.status === 'opening') && !sessionEnding && !dataClosing) {
    dataClosing = true
    e.preventDefault()
    void Promise.race([hub.close('quit'), new Promise((r) => setTimeout(r, 2 * STOP_TIMEOUT_MS))])
      .catch((err) => log('warn', 'zamykanie folderu danych', err))
      .finally(() => app.quit())
  }
})

app.on('will-quit', () => {
  // A ready download installs at the full exit (never at the end of the Windows session).
  updates?.onQuit(sessionEnding)
  power.stop()
  oneDrive.stop()
  widget.stop()
  sound?.destroy()
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
