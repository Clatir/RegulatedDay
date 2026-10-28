// adapted from FI src/main/index.ts @ de81f2b
/**
 * The main process: loaded by start.ts once the identity of this run is fixed. It owns the windows (main, icon panel,
 * desktop bar), the tray icon, the helper, updates, the life marker and, from E1 on, the timer and the
 * deadlines (spec „Baza kodu i technika”: the timer, the deadlines and the widget's writes belong to the main process).
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { hostname, release } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, Menu, app, clipboard, crashReporter, dialog, ipcMain, net, powerMonitor, powerSaveBlocker, screen, session, shell, utilityProcess, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import {
  CH,
  type AppInfo,
  type BarLayout,
  type BarScreens,
  type EditEntry,
  type EventIn,
  type SystemSettingsPage,
  type TimerIn,
  type BarActionId,
  type UpdateAction,
  type ViewKind,
  type WidgetAction,
  type WizardFinish
} from '@shared/api'
import type { RitualValue } from '@shared/engine/ritual'
import type { CloseHow } from '@shared/model/events'
import type { BarSpot, MachinePrefs } from '@shared/machine'
import { quitNotice } from '@shared/sync/syncLines'
import { MAX_STEPS, ROUTINE_VERSIONS } from '@shared/model/routines'
import { BAR_SPOTS, patchMachinePrefs } from '@shared/machine'
import { displayAt, type Rect } from '@shared/bounds'
import { barRect, barWidth, draggedBounds, dragHolds, panelDisplay, panelRect, placementAfterDrag, spotPlacement } from '@shared/placement'
import { urlFromArgv, type PanelTarget } from '@shared/protocol'
import { compareVersions } from '@shared/update'
import { systemSettingsUrl } from '@shared/systemSettings'
import type { UpdateView } from '@shared/updateView'
import { BAR_NOTE_FAILED, BAR_NOTE_HELPER, type WidgetView } from '@shared/widget'
import { identity } from './identity'
import { flushLog, initLog, log } from './log'
import { ConfigStore, computerId, presenceWindowsId, renewComputerId, windowsMachineId } from './config'
import { Autostart, HIDDEN_ARG } from './autostart'
import { AppTray } from './tray'
import { displays, primaryDisplay } from './displays'
import { createMainWindow, revealMainWindow } from './windows/mainWindow'
import { DesktopBar } from './windows/desktopBar'
import { IconPanel } from './windows/iconPanel'
import { HelperClient, type HelperMessage } from './helper/client'
import { helperProgram } from './helper/program'
import { notify } from './notify'
import { runStartup, type Banner, type StartupResult } from './update/startup'
import { cleanUpdateFolders, emptyPlanAtStart, fsDeps, manifestOf, planBlocking, writeLaunched, writePlan } from './update/files'
import { UpdateController } from './update/controller'
import { guardMode, startDetached } from './update/install'
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
import { WorkerHost, type WorkerChild } from './worker/host'

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
/** Windows' own id of this computer (its presence names it, A3-05). */
let thisWindowsId: string | null = null
/**
 * The data folder at work: the one the wizard chose on this computer (config.json), or RD_DATA_DIR (tests and the
 * developer's version), which wins.
 */
let hub: DataHub | null = null
let dataClosing = false
/** The version that ran on this computer before this start (read before it is overwritten): a backup after an update. */
let lastRunVersion: string | null = null
const data = (): DataService | null => hub?.service ?? null
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
  // Every 10 s while the folder's computer is unsettled (a start, a wake), else every 5 min (spec, A3-14).
  unsettled: () => {
    const f = hub?.service?.folder
    return !!f && !f.settle.settled(f.clock.now())
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
 * The widget's engine (E4b): the engine's view once a data folder is open (one neutral line while none is, D327), the
 * bar's clicks as actions of the timer, the notifications of the leader.
 */
const widget = new WidgetEngine({
  folder: () => hub?.service?.folder ?? null,
  folderStatus: () => (hub?.status === 'opening' ? 'opening' : hub?.status === 'failed' ? 'failed' : 'none'),
  timer: (click) => (hub ? hub.timer(click) : Promise.resolve({ ok: false, why: 'folder danych nie jest otwarty', confirm: null })),
  edit: (entries) => (hub ? hub.edit(entries) : Promise.reject(new Error('folder danych nie jest otwarty'))),
  answer: (id, a, value) => (hub ? hub.answer(id, a, value) : Promise.resolve({ ok: false, why: 'folder danych nie jest otwarty', confirm: null })),
  seen: (ids, how) => hub?.seen(ids, how) ?? Promise.resolve(0),
  clickedApp: () => hub?.clickedApp(),
  modePrefs: () => ({ sessionMode: prefs().sessionMode, classMode: prefs().classMode }),
  notices: () => prefs().notices,
  notify: (n, onFailed) => notify(n, log, onFailed),
  notificationsTaken: async () => {
    if (!helper?.running) return true
    const s = await helper.request('notificationState', {}, 3000).catch(() => null)
    return typeof s?.state !== 'string' || s.state === 'accepts' || s.state === 'unknown'
  },
  present: () => powerMonitor.getSystemIdleTime() < 120 && powerMonitor.getSystemIdleState(120) !== 'locked',
  showMain: (page) => showMainWindow(page),
  emit: (view) => showWidget(view),
  log,
  batterySaver: () => batterySaverOn && inOneDriveNow(),
  backup: () => hub?.service?.backup ?? null
})

function widgetView(): WidgetView {
  const view = widget.current()
  const barNote = !prefs().desktopBar || view.hidden ? null : barProblem === 'failed' ? BAR_NOTE_FAILED : barProblem === 'helper' ? BAR_NOTE_HELPER : null
  return { ...view, barNote }
}

/**
 * The battery saver on a battery (spec „Oszczędzanie baterii może wstrzymać OneDrive”): asked of the helper every 5 min –
 * into this computer's presence too (its power) – and shown only for a data folder in OneDrive.
 */
let batterySaverOn = false
async function refreshPower(): Promise<void> {
  const caps = helper?.running ? await helper.request('powerState', {}, 3000).catch(() => null) : null
  const battery = typeof caps?.onMains === 'boolean' ? !caps.onMains : powerMonitor.isOnBatteryPower()
  batterySaverOn = battery && caps?.batterySaver === true
  hub?.service?.folder.presence.update({ power: { source: battery ? 'battery' : 'ac', saver: caps?.batterySaver === true } })
}
const inOneDriveNow = () => {
  const dir = dataFolderNow()
  return !!dir && DataHub.inOneDrive(dir)
}
setInterval(() => void refreshPower(), 5 * 60_000).unref?.()

/** The block and the step of the warning last shown (a tone plays when the step of the same block turns to 5 or 0 min). */
let lastWarn: { block: string; warn: string } | null = null

function showWidget(view: WidgetView): void {
  tray?.set({ color: view.iconColor, dot: view.dot, drop: view.drop }, view.tooltip)
  broadcast(CH.onWidget, widgetView())
  layoutBar()
  const tone = toneOnChange(lastWarn, view)
  lastWarn = tone.next
  // One computer plays (A8-04): the one with the latest presence among those awake, never the recording one.
  const folder = hub?.service?.folder
  if (tone.play && prefs().sound && (!folder || folder.soundHere(view.recorders))) sound?.play(tone.play, prefs().soundVolume)
  // The open icon's panel shows the questions: they count as seen (spec D231).
  if (panel?.isOpen) {
    const ids = widget.shownQuestions()
    if (ids.length) void hub?.seen(ids, 'panel').catch(() => undefined)
  }
  sightNotification()
}

/** The line of a notification clicked, waiting to be shown by the bar (its sighting). */
let notificationSighting: { line: string; until: number } | null = null

function sightNotification(): void {
  const n = notificationSighting
  if (!n) return
  if (Date.now() > n.until) {
    notificationSighting = null
    return
  }
  const ids = hub?.service ? widget.notificationSighting(n.line) : []
  if (!ids.length) return
  notificationSighting = null
  void hub?.seen(ids, 'notification').catch(() => undefined)
}

/** A window on full screen covers the bar's monitor (the helper's event): a bar „na wierzchu” hides over it (D291). */
let fullscreenNow = false
/** The desktop bar is „na wierzchu” now. */
let barTop = false

/**
 * The desktop bar being dragged by its handle (D303): the cursor and the bar where the drag began, whether it moved, and
 * the last message – a drag whose end never came (the bar's view reloaded) holds the layout at most `DRAG_HOLD_MS`. Its
 * end („up”, „cancel”, „lost”) ends it; the limit is only the fallback (`dragHolds`, A4-12).
 */
let barDrag: { cursor: { x: number; y: number }; bounds: Rect; moved: boolean; last: number; moves: number } | null = null
/** The desktop bar unfolds upwards where it stands now (its folded part is then the bottom of the window). */
let barGrowsUp = true

/** The folded desktop bar's height at the interface's scale (DIP). */
const barFolded = (): number => Math.ceil(barFoldedHeight * prefs().zoom)

/** The monitors and the desktop bar on them (D304: the settings' mock-up). */
function barScreens(): BarScreens {
  const all = displays()
  const primary = primaryDisplay()
  const r = barRect(prefs().barPlacement, all, primary, prefs().zoom, barFolded())
  return { displays: all.map((d) => ({ id: d.id, label: d.label, bounds: d.bounds, workArea: d.workArea, primary: d.id === primary.id })), bar: { bounds: r.bounds, display: r.display.id, spot: r.spot } }
}

/** The main window is in front (focused and shown): it has the same bar at its top. */
const mainInFront = (): boolean => !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused()

/**
 * The settings and the widget want the desktop bar shown now; „na wierzchu” it hides over a full screen and while the
 * main window is in front (D291, D302).
 */
const barWanted = (): boolean => prefs().desktopBar && !widgetView().hidden && !(prefs().onTop !== 'off' && (fullscreenNow || mainInFront()))

/**
 * The desktop bar as the settings, the widget and the helper allow: laid under the windows before it shows – or, with
 * „Zawsze na wierzchu” chosen on this computer (D291), above them, still without activation, hidden over a full screen.
 */
function layoutBar(): void {
  // Destroyed at the quit: the helper's last status and events come after the windows. Dragged now: it follows the cursor.
  if (!bar?.alive) return
  if (barDrag && dragHolds(barDrag.last, Date.now())) return
  barDrag = null
  // „Na wierzchu”: the helper watches the bar's monitor for a full screen (and says it at once); else nothing to watch.
  if (prefs().onTop !== 'off') helper?.send('fullscreen.watch', { hwnd: bar.hwnd })
  else {
    helper?.send('fullscreen.unwatch')
    fullscreenNow = false
  }
  if (!barWanted()) {
    barProblem = null
    bar.apply({ visible: false })
    helper?.send('bar.unwatch')
    return
  }
  const primary = primaryDisplay()
  const zoom = prefs().zoom
  const r = barRect(prefs().barPlacement, displays(), primary, zoom, barFolded(), Math.ceil(barLayoutNow.height * zoom))
  barGrowsUp = r.growsUp
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

/** A window on full screen over the bar's monitor or not (the helper watches it for a bar „na wierzchu”, D291). */
function onFullscreen(full: boolean): void {
  if (fullscreenNow === full) return
  fullscreenNow = full
  if (prefs().onTop !== 'off') layoutBar()
}

let lastBarState = ''
const helperKindsLogged = new Set<string>(['hello'])
function onHelperEvent(m: HelperMessage): void {
  if (m.type === 'bar') {
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
    panel?.foreground(hwnd, m.shell === true)
  } else if (m.type === 'fullscreen') {
    // Over the bar's monitor: a full screen entered or left (also in place – a film in a browser – or on another monitor).
    log('info', `monitor paska: ${m.fullscreen === true ? 'pełny ekran' : 'bez pełnego ekranu'}`)
    onFullscreen(m.fullscreen === true)
  } else if (m.type === 'shell') {
    log('info', 'Eksplorator uruchomiony ponownie – ikona ustawiona jeszcze raz')
    tray?.refresh()
    layoutBar()
  } else if (m.type === 'power') {
    // The helper answers every request of power (each check of the folder) with its state: only the system's own events.
    if (m.event !== 'requests') log('info', `zasilanie: ${String(m.event)}${m.value !== undefined ? ` = ${String(m.value)}` : ''}`)
  } else if (m.type === 'session' || m.type === 'display') {
    log('info', `${m.type === 'session' ? 'sesja' : 'ekrany'}: ${String(m.event ?? 'zmiana')}`)
  } else {
    // Another message of the helper: once per kind (the log never fills with a repeated one).
    const kind = String(m.type)
    if (!helperKindsLogged.has(kind)) {
      helperKindsLogged.add(kind)
      log('info', `pomocnik: ${JSON.stringify(m).slice(0, 300)}`)
    }
  }
}

const TIMER_ACTIONS = new Set(['start', 'startNew', 'pause', 'next', 'extend', 'workEnd', 'finish', 'cancel', 'park', 'confirm', 'undo', 'undoApproval', 'cutOff', 'back', 'fewer', 'better', 'drink', 'restart', 'mark', 'requestNow', 'requestEnd', 'requestAfter', 'routineDone', 'routineUndo'])

/** A value of a ritual's answer from a window: an instant, a person (≤ 64 characters), a stretch [from, to) – else none. */
function ritualValue(v: unknown): RitualValue {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.length <= 64) return v
  if (v && typeof v === 'object') {
    const s = v as { from?: unknown; to?: unknown }
    if (typeof s.from === 'number' && typeof s.to === 'number' && Number.isFinite(s.from) && Number.isFinite(s.to)) return { from: s.from, to: s.to }
  }
  return null
}

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
    answer: str(c.answer),
    request: str(c.request),
    person: str(c.person) ?? null,
    urgent: c.urgent === true,
    estimateMin: num(c.estimateMin) ?? null,
    from: num(c.from),
    to: num(c.to),
    // A routine ticked off in „Dziś” (D328): its version and at most 40 step ids.
    version: ROUTINE_VERSIONS.find((v) => v === c.version),
    steps: Array.isArray(c.steps) ? c.steps.map(str).filter((s): s is string => !!s).slice(0, MAX_STEPS) : undefined
  }
}

/** The data folder of this computer: RD_DATA_DIR (tests, the developer), else the wizard's choice; none – the wizard. */
const dataFolderNow = (): string | null => process.env.RD_DATA_DIR || config.get().dataFolder

/** The helper process for the heavy work of the data folder (T190): made at its first task, stopped at the quit. */
const worker = new WorkerHost({
  fork: () => utilityProcess.fork(join(__dirname, 'worker.js'), [], { serviceName: 'Regulated Day – zadania w tle', stdio: 'ignore' }) as unknown as WorkerChild,
  log: (level, msg) => log(level, msg)
})

function createHub(): DataHub {
  return new DataHub({
    userData,
    computer: () => thisComputer,
    computerName: hostname(),
    windowsId: () => thisWindowsId,
    appVersion: app.getVersion(),
    runId,
    holidays: marketDay,
    idleSeconds: () => powerMonitor.getSystemIdleTime(),
    appFocused: () => (!!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) || (!!panel?.isOpen && !!panel.webContents?.isFocused()),
    oneDriveRunning: () => oneDrive.running,
    oneDriveProcess: () => oneDrive.processRunning,
    onPower: (need) => power.want(need),
    versions: () => readVersions(userData),
    log,
    writeGuardPlan: identity.updates && process.env.RD_TEST_KEEP_PLAN !== '1',
    extraBackupDir: () => prefs().backupDir,
    previousVersion: () => config.get().updates.dataVersion ?? lastRunVersion,
    dataOpened: (version) => {
      const u = config.get().updates
      if (u.dataVersion !== version && !config.loadFailed) void config.update({ updates: { ...u, dataVersion: version } }).catch(() => undefined)
    },
    worker,
    // The ritual's screens are here: its first day comes from rd.json, written once by the leader (D320, T504).
    ritualScreens: true,
    // The game's screens (T509): its first day from rd.json, written once by the leader.
    gameScreens: true,
    // RD_DATA_DIR wins at every start (tests, the developer): another folder only for this run, config.json untouched.
    onFolder: (dir) =>
      process.env.RD_DATA_DIR
        ? log('warn', `folder danych ustawiony zmienną RD_DATA_DIR – ${dir} tylko do końca tego uruchomienia`)
        : void config.update({ dataFolder: dir }).catch((e) => log('error', 'nowy folder danych nie zapisał się w ustawieniach', e)),
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
  revealMainWindow(mainWindow)
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

function trayMenu(): MenuItemConstructorOptions[] {
  const ready = updates?.updater?.readyRelease
  return [
    { label: 'Otwórz Regulated Day', click: () => showMainWindow() },
    ...(ready ? [{ label: `Zainstaluj teraz (${ready.version})`, click: () => void updates?.action('installNow') }] : []),
    { type: 'separator' },
    { label: 'Zakończ', click: () => quitApp() }
  ]
}

// ------------------------------------------------------------------ the bar's actions

/** The desktop bar laid again (its „Pokaż pasek”), put in a corner (the wizard), the icon's panel opened (tests). */
async function barAction(action: BarActionId, arg?: string): Promise<void> {
  if (action === 'placeBar') {
    barProblem = null
    helper?.send('bar.retry')
    layoutBar()
  } else if (action === 'corner') {
    const all = displays()
    const current = bar?.currentBounds
    const now = (current ? displayAt(all, (d) => d.workArea, { x: current.x + current.width / 2, y: current.y + current.height / 2 }) : null) ?? primaryDisplay()
    const spot = BAR_SPOTS.includes(arg as BarSpot) ? (arg as BarSpot) : 'bottom-left'
    await setPrefs({ barPlacement: spotPlacement(now, spot, { width: barWidth(now.workArea, prefs().zoom), height: barFolded() }) })
  } else if (action === 'openPanel') {
    openPanel({ line: null, day: null })
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
  // D303: the desktop bar dragged by its handle – it follows the cursor's way (past 4 px: a click on the handle moves
  // nothing); where it is let go, it stays – at the cursor of that moment, also when the last frame's move never came.
  ipcMain.on(CH.barDrag, (e, phase: unknown, why: unknown) => {
    if (viewOf(e.sender) !== 'bar' || !bar?.alive) return
    if (phase === 'start') {
      const from = bar.currentBounds
      const cursor = screen.getCursorScreenPoint()
      barDrag = from ? { cursor, bounds: from, moved: false, last: Date.now(), moves: 0 } : null
      // The trace of a drag (E4b.12: on a real mouse the bar never moved) – its start, and at its end what came.
      log('info', `pasek: chwycony za uchwyt – pasek ${from ? `${from.x},${from.y}` : 'bez miejsca'}, kursor ${cursor.x},${cursor.y}, na wierzchu: ${prefs().onTop}`)
      return
    }
    if (!barDrag || (phase !== 'move' && phase !== 'end')) return
    const drag = barDrag
    const to = screen.getCursorScreenPoint()
    drag.moved ||= Math.hypot(to.x - drag.cursor.x, to.y - drag.cursor.y) >= 4
    drag.last = Date.now()
    if (phase === 'move') drag.moves++
    const at = drag.moved ? draggedBounds(drag.bounds, drag.cursor, to, displays()) : null
    if (at) bar.apply({ bounds: at })
    if (phase === 'end') {
      barDrag = null
      log('info', `pasek: puszczony (${typeof why === 'string' ? why : '?'}) po ${drag.moves} ruchach, kursor ${to.x},${to.y}${at ? ` – pasek ${at.x},${at.y}` : ' – bez przesunięcia'}`)
      if (at) void setPrefs({ barPlacement: placementAfterDrag(at, displays(), barFolded(), barGrowsUp) })
      else layoutBar()
    }
  })
  handle(CH.barScreens, () => barScreens())
  handle(CH.placeBar, async (_e, id: unknown, spot: unknown) => {
    const d = displays().find((x) => x.id === id)
    if (!d || !BAR_SPOTS.includes(spot as BarSpot)) return barScreens()
    await setPrefs({ barPlacement: spotPlacement(d, spot as BarSpot, { width: barWidth(d.workArea, prefs().zoom), height: barFolded() }) })
    return barScreens()
  })
  ipcMain.on(CH.panelTouch, (_e, unfolded?: boolean) => panel?.touch(typeof unfolded === 'boolean' ? unfolded : undefined))
  ipcMain.on(CH.panelClose, () => panel?.close('Esc'))
  ipcMain.on(CH.showMain, (_e, page?: string) => {
    panel?.close('otwarcie okna głównego')
    showMainWindow(typeof page === 'string' ? page : undefined)
  })
  handle(CH.barAction, (_e, action: BarActionId, arg?: string) => barAction(action, typeof arg === 'string' ? arg.slice(0, 40) : undefined))
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
  handle(CH.requestCounters, () => needHub().requestCounters())
  handle(CH.timer, (_e, click: TimerIn) => needHub().timer(timerIn(click)))
  // The closing ritual (D318): a day's rows, an answer to one, the close; the morning's days to close.
  handle(CH.ritual, (_e, day: unknown) => needHub().ritual(String(day)))
  handle(CH.ritualAnswer, (_e, day: unknown, row: unknown, choice: unknown, value: unknown, item: unknown) => needHub().ritualAnswer(String(day), String(row), String(choice), ritualValue(value), typeof item === 'string' ? item : null))
  handle(CH.closeDay, (_e, day: unknown, how: unknown) => needHub().closeDay(String(day), String(how) as CloseHow))
  handle(CH.unclosedDays, () => needHub().unclosedDays())
  handle(CH.computerList, () => needHub().computerList())
  // A folder picked in a window of Windows over the window that asked (the wizard's data folder, „Dane” in the settings).
  const pickDir = async (e: Electron.IpcMainInvokeEvent, title: string, defaultPath?: string): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = { title, defaultPath, properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  }
  // A question in a window of Windows over the main window: the first button does it, „Anuluj” (and Esc) does not.
  const confirm = async (e: Electron.IpcMainInvokeEvent, message: string, detail: string, ok: string): Promise<boolean> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = { type: 'warning' as const, message, detail, buttons: [ok, 'Anuluj'], defaultId: 1, cancelId: 1, noLink: true }
    const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    return r.response === 0
  }
  handle(CH.exportCsv, async (e, from: unknown, to: unknown) => {
    const dir = await pickDir(e, 'Folder na eksport CSV')
    if (!dir) return null
    // The files of an earlier export there are replaced only when you say so (D323).
    const there = await DataHub.csvFilesIn(dir)
    if (there.length && !(await confirm(e, 'W tym folderze są już pliki eksportu', `${there.join(', ')} – zastąpić je nowym eksportem?`, 'Zastąp'))) return null
    const files = await needHub().exportCsv(String(from), String(to), dir)
    return { dir, files: files.length }
  })
  handle(CH.backups, () => needHub().backups())
  handle(CH.backupContents, (_e, path: unknown) => needHub().backupContents(String(path)))
  handle(CH.restoreRecords, (_e, path: unknown, rels: unknown) => needHub().restoreRecords(String(path), Array.isArray(rels) ? rels.map(String) : []))
  handle(CH.restoreWhole, async (e, path: unknown) => {
    const dir = await pickDir(e, 'Pusty folder na przywróconą kopię')
    if (!dir) return null
    // A folder the other computers will not see: said first, restored only when you say so (D323).
    if (!DataHub.inOneDrive(dir) && !(await confirm(e, 'Ten folder nie leży w OneDrive', 'Inne komputery go nie zobaczą – zostaną przy obecnym folderze. Przywrócić mimo to?', 'Przywróć'))) return null
    try {
      const r = await needHub().restoreWhole(String(path), dir)
      return { ok: r.ok, restored: true, to: r.to, error: r.error }
    } catch (err) {
      return { ok: false, restored: false, to: null, error: err instanceof Error ? err.message : String(err) }
    }
  })
  handle(CH.moveTo, (_e, dir: unknown) => needHub().moveTo(String(dir)))
  handle(CH.game, () => needHub().game())
  handle(CH.celebrated, (_e, keys: unknown) => needHub().celebrated(Array.isArray(keys) ? keys.map(String) : []))
  handle(CH.sideB, () => needHub().sideB())
  handle(CH.calibration, () => needHub().calibration())
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
  handle(CH.folderPick, (e, current: string | null) => pickDir(e, 'Folder danych Regulated Day', typeof current === 'string' ? current : undefined))
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
    if (process.platform === 'win32') await shell.openExternal(systemSettingsUrl(page === 'taskbar' ? 'taskbar' : 'notifications', release()))
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
    // A notification's click is a sighting of its line (a question, the reserve's message – D241) once the bar shows it –
    // also when the click started the app and the folder opens only now (within 10 min).
    notificationSighting = target.line ? { line: target.line, until: Date.now() + 10 * 60_000 } : null
    sightNotification()
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
      let child: ReturnType<typeof spawn>
      try {
        child = spawn(guardExe(dir), ['--task', join(dir, 'task.json'), '--hidden'], { cwd: dir, detached: true, stdio: 'ignore' })
      } catch (e) {
        // Node throws at once for some failures (a file that is no program): no guard, never the end of the start.
        log('error', 'strażnik nie wystartował', e)
        return null
      }
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
  // The files of the installation after the lock: one that fails (held, gone) is logged – the start goes on (A5-11).
  const step = <T,>(what: string, fn: () => T, fallback: T): T => {
    try {
      return fn()
    } catch (e) {
      log('error', `start: ${what} nie powiódł się – idę dalej`, e)
      return fallback
    }
  }
  let banner: Banner | null = startup.kind === 'normal' ? step('stan zadania instalacji', () => startup.afterLock?.() ?? startup.banner, startup.banner) : null
  if (startup.kind === 'normal' && startup.confirmed) {
    const confirmed = startup.confirmed
    // Logged only when written: the owner reads the file, not the log.
    if (step('zapis „uruchomiono wersję”', () => (writeLaunched(userData, confirmed.version, confirmed.attemptId), true), false)) log('info', `uruchomiono wersję ${confirmed.version} (próba ${confirmed.attemptId})`)
  }
  if (identity.updates) {
    step('sprzątanie folderów aktualizacji', () => cleanUpdateFolders(updateDir, app.getVersion(), (m) => log('info', m)), undefined)
    // The first start of a new version: its version and Electron's against the manifest; a mismatch repairs like an
    // interrupted installation (the guard).
    const m = manifestOf(updateDir, app.getVersion())
    if (m && (m.version !== app.getVersion() || m.electron !== process.versions.electron)) {
      log('warn', `wersja niezgodna z manifestem (${m.version}/${m.electron}) – strażnik naprawia instalację`)
      // A guard that cannot start (a broken file, an antivirus) is logged – never the end of the start (A5-11).
      const dir = join(updateDir, app.getVersion())
      startDetached(guardExe(dir), ['--task', join(dir, 'task.json'), '--hidden'], dir, 'strażnik naprawy', (level, msg) => log(level, msg))
    }
  }
  // Windows' id of this computer is read beside the rest of the start (a slow reg.exe never holds it back).
  const windowsIdRead = windowsMachineId()
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
      if (c.updates.lastRunVersion !== app.getVersion()) void config.update({ updates: { ...c.updates, lastRunVersion: app.getVersion(), dataVersion: c.updates.dataVersion ?? c.updates.lastRunVersion } }).catch(() => undefined)
      for (const w of appWindows()) w.setZoomFactor(c.prefs.zoom)
      broadcast(CH.onPrefs, c.prefs)
      layoutBar()
    })
  }
  try {
    thisWindowsId = await windowsIdRead
    let id = await computerId(userData, config.get().computerId, thisWindowsId)
    // A profile copied before 0.17.0 has no Windows id of its own: the folder's presence of this id tells whose it is.
    const dir = dataFolderNow()
    if (!id.copiedFrom && thisWindowsId && dir) {
      const other = await presenceWindowsId(dir, id.id)
      if (other && other !== thisWindowsId) id = await renewComputerId(userData, thisWindowsId, id.id)
    }
    thisComputer = id.id
    if (id.copiedFrom) {
      // The app data came from another computer: its folders' state (journal, queue) is that computer's – set aside;
      // when it cannot be, no folder opens this session (never its queue written as this computer's).
      log('warn', `dane aplikacji skopiowane z innego komputera (${id.copiedFrom}) – nowy identyfikator ${id.id}`)
      const aside = join(userData, `folders-${id.copiedFrom}-${Date.now()}`)
      await rename(join(userData, 'folders'), aside).catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return
        log('error', `stan folderów innego komputera nie został odłożony (${aside}) – folder danych otworzy się po ponownym uruchomieniu`, e)
        thisComputer = ''
      })
    } else if (id.created) log('info', `nowy identyfikator komputera ${id.id}`)
    if (thisComputer && config.get().computerId !== id.id && !config.loadFailed) await config.update({ computerId: id.id })
  } catch (e) {
    log('error', 'identyfikator komputera nieczytelny', e)
  }
  hub = createHub()
  // E2E: the helper process answers from the built app (its script in app.asar, T190).
  if (process.env.RD_E2E_WORKER === '1') {
    worker.run({ kind: 'ping' }).then(
      (r) => log('info', `proces pomocniczy: ${r}`),
      (e) => log('error', 'proces pomocniczy nie odpowiada', e)
    )
  }
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
    if (s.state === 'running') {
      helper?.send('foreground.watch')
      oneDrive.start()
      // The helper (re)started: it gets the state of the sleep block at once (T301).
      void data()?.tick()
    } else {
      // Nobody watches the full screen now: the bar is not kept hidden by a state that can no longer change.
      fullscreenNow = false
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
    sessionOrClass: () => planBlocking(userData),
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
    ready: () => updates?.automaticReady() ?? null,
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
        helperRunning: !!helper?.running,
        modernStandby: caps?.modernStandby === true
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
  // The local plan of sessions and classes for the guard: the data folder writes it every hour. Only a computer without
  // a folder gets an empty one here – the last real plan is never written over before the folder opens (A5-02).
  // RD_TEST_KEEP_PLAN=1 (CI): the plan a test wrote for the guard stays.
  if (identity.updates && process.env.RD_TEST_KEEP_PLAN !== '1' && emptyPlanAtStart({ dataFolder: dataFolderNow(), configUnreadable: config.loadFailed != null })) {
    try {
      writePlan(userData, [])
    } catch (e) {
      log('warn', 'plan strażnika nie zapisany', e)
    }
  }

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
  // D302: a bar „na wierzchu” steps aside while the main window – with the same bar at its top – is in front; under the
  // windows nothing changes. Closed only at the quit: the bar is going too.
  const mainMoved = () => {
    if (!quitting && prefs().onTop !== 'off') layoutBar()
  }
  mainWindow.on('closed', () => {
    mainWindow = null
    mainMoved()
  })
  mainWindow.on('focus', mainMoved)
  mainWindow.on('blur', mainMoved)
  mainWindow.on('hide', mainMoved)
  mainWindow.on('minimize', mainMoved)
  mainWindow.on('query-session-end', () => onSystemEnd(false))
  mainWindow.on('session-end', () => onSystemEnd(true))

  bar = new DesktopBar(preload, loadView)
  bar.onExternalClose = quitApp
  bar.onSystemEnd(onSystemEnd)
  panel = new IconPanel(preload, loadView, {
    place: (height, cursor) => {
      const all = displays()
      const icon = tray?.bounds() ?? null
      // The display the panel opens on – the same one its rectangle is put on (an icon under the arrow: the cursor's).
      const wa = panelDisplay(icon, cursor, all).workArea
      const width = Math.floor(Math.min(480 * prefs().zoom, wa.width - 16))
      return panelRect(icon, cursor, all, { width, height: Math.min(height, wa.height) })
    },
    helperRunning: () => !!helper?.running,
    hideFromCapture: () => prefs().hideFromCapture,
    stayOnTop: () => prefs().onTop === 'barPanel',
    log: (m) => log('info', `panel: ${m}`)
  })
  panel.onExternalClose = quitApp
  panel.onSystemEnd(onSystemEnd)

  sound = new SoundWindow(preload, loadView)
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
  // The version before this one stays the folder's until the backup before the update is there (A3-17).
  if (config.get().updates.lastRunVersion !== app.getVersion() && !config.loadFailed) {
    const u = config.get().updates
    void config.update({ updates: { ...u, lastRunVersion: app.getVersion(), dataVersion: u.dataVersion ?? u.lastRunVersion } })
  }
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
    // A folder that is not there: the app does not wait for it – it says what will be written on its return (spec
    // „N zmian zapisze się po powrocie folderu … nic nie udaje sukcesu”, A3-07).
    // Whether the folder is there is looked at now (the last check may be 15 s old).
    const f = hub.service?.folder
    const dir = dataFolderNow()
    const say = f && dir ? quitNotice(f.unsynced, existsSync(dir)) : null
    if (say) notify({ id: `unsynced:${Date.now()}`, title: 'Folder danych niedostępny', body: say, line: null, day: null }, log)
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
  worker.stop()
  if (!sessionEnding) life.close('quit')
  log('info', 'koniec pracy')
  flushLog()
})

process.on('uncaughtException', (e) => log('error', 'nieobsłużony wyjątek w procesie głównym', e))
process.on('unhandledRejection', (reason) => log('error', 'nieobsłużone odrzucenie w procesie głównym', reason))
app.on('render-process-gone', (_e, contents, details) => {
  log('error', `okno przestało działać (${viewOf(contents)}): ${details.reason}, kod ${details.exitCode}`)
  // The bar's drag ends with its view: the layout is free again.
  if (viewOf(contents) === 'bar') barDrag = null
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
