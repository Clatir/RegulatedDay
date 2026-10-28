/**
 * The contract between the main process and the windows (preload `window.rd`). Every channel name lives here; the
 * main process answers `invoke` channels and pushes the `on*` events.
 */
import type { CalibrationPeriod, CostProposal, FeltCounts, ReviewPrompt, TimeProposal } from './engine/calibration'
import type { Celebration, GameView } from './engine/progress'
import type { SideB } from './engine/sideB'
import type { RitualValue, RitualView } from './engine/ritual'
import type { CloseHow } from './model/events'
import type { IdentityKind } from './identity'
import type { Rect } from './bounds'
import type { BarSpot, MachinePrefs } from './machine'
import type { WidgetView } from './widget'
import type { UpdateView } from './updateView'

export const CH = {
  appInfo: 'rd:appInfo',
  prefs: 'rd:prefs',
  setPrefs: 'rd:setPrefs',
  onPrefs: 'rd:onPrefs',
  autostart: 'rd:autostart',
  setAutostart: 'rd:setAutostart',
  openLogs: 'rd:openLogs',
  widget: 'rd:widget',
  onWidget: 'rd:onWidget',
  widgetAction: 'rd:widgetAction',
  barLayout: 'rd:barLayout',
  barDrag: 'rd:barDrag',
  barScreens: 'rd:barScreens',
  placeBar: 'rd:placeBar',
  panelTouch: 'rd:panelTouch',
  panelClose: 'rd:panelClose',
  barAction: 'rd:barAction',
  update: 'rd:update',
  onUpdate: 'rd:onUpdate',
  updateAction: 'rd:updateAction',
  onNavigate: 'rd:onNavigate',
  showMain: 'rd:showMain',
  copyText: 'rd:copyText',
  dataView: 'rd:dataView',
  onData: 'rd:onData',
  dayData: 'rd:dayData',
  dayFiles: 'rd:dayFiles',
  edit: 'rd:edit',
  logEvents: 'rd:logEvents',
  resolve: 'rd:resolve',
  monthEvents: 'rd:monthEvents',
  requestCounters: 'rd:requestCounters',
  historyList: 'rd:historyList',
  historyVersions: 'rd:historyVersions',
  historyRestore: 'rd:historyRestore',
  folderDefault: 'rd:folderDefault',
  folderPick: 'rd:folderPick',
  folderProbe: 'rd:folderProbe',
  wizardFinish: 'rd:wizardFinish',
  pinFolder: 'rd:pinFolder',
  openSystemSettings: 'rd:openSystemSettings',
  openDataFolder: 'rd:openDataFolder',
  setNightInstall: 'rd:setNightInstall',
  timer: 'rd:timer',
  answer: 'rd:answer',
  seen: 'rd:seen',
  ritual: 'rd:ritual',
  ritualAnswer: 'rd:ritualAnswer',
  closeDay: 'rd:closeDay',
  unclosedDays: 'rd:unclosedDays',
  exportCsv: 'rd:exportCsv',
  backups: 'rd:backups',
  backupContents: 'rd:backupContents',
  restoreRecords: 'rd:restoreRecords',
  restoreWhole: 'rd:restoreWhole',
  moveTo: 'rd:moveTo',
  game: 'rd:game',
  celebrated: 'rd:celebrated',
  sideB: 'rd:sideB',
  calibration: 'rd:calibration'
} as const

/** The game for the window (D322): its view and the full-screen celebrations not shown on this computer yet. */
export interface GameScreen extends GameView {
  due: Celebration[]
}

/**
 * The calibration for the window (spec „Kalibracja”): its period, the review's proposals, the felt cost gathered, where
 * the review waits today and its state in rd.json (D119).
 */
export interface CalibrationScreen {
  period: CalibrationPeriod | null
  time: TimeProposal[]
  costs: CostProposal[]
  felt: FeltCounts
  prompt: ReviewPrompt
  deferrals: number
  reviewed: string | null
  /** The proposals approved so far (`proposalKey`): shown as done, never offered again. */
  applied: string[]
}

/** A day the morning shows to close: your presence that day, and its ritual (the effect of „Jak zapisano”, its rows). */
export interface UnclosedDay {
  date: string
  presence: boolean
  /** Closed already – shown for what came after its close (one line of information). */
  closed: boolean
  ritual: RitualView
}

/** Requests counted from the logs of the days (T479): today, this week, per person in the week („?” – no person). */
export interface RequestCounters {
  today: { count: number; minutes: number }
  week: { count: number; minutes: number }
  byPerson: Record<string, { count: number; minutes: number }>
  /** Every log of the week was read (false: the numbers may be short now). */
  complete: boolean
}

/** A backup of the folder (D321): daily or weekly, its file, size and time. */
export interface BackupItem {
  kind: 'daily' | 'weekly'
  name: string
  path: string
  bytes: number
  mtimeMs: number
}

/** A record of a backup as the window lists it: its kind, a day's date, the name it has in the interface. */
export interface BackupRecord {
  rel: string
  kind: string
  date: string | null
  name: string | null
  /** A request's person (its id – the window names it) and when it was added: requests with one note told apart. */
  person: string | null
  at: number | null
}

/** Which window a renderer is (the preload reads it from its arguments); `sound` – the hidden window of sound. */
export type ViewKind = 'main' | 'bar' | 'panel' | 'sound'

export interface HelperStatus {
  /** running – answering; starting – (re)starting after a crash; unavailable – 3 crashes in 10 min; missing – no program. */
  state: 'running' | 'starting' | 'unavailable' | 'missing' | 'off'
  /** Why it is not running, in the interface's words. */
  note: string | null
}

export interface AppInfo {
  version: string
  electron: string
  identity: IdentityKind
  name: string
  userData: string
  computerId: string
  helper: HelperStatus
  platform: string
  /** „Automatyczna instalacja aktualizacji w nocy” on this computer (on by default). */
  nightInstall: boolean
}

/** The real state of „Uruchamiaj z Windows” (spec „Instalacja”): also off in Task Manager. */
export interface AutostartState {
  /** This identity may have a Run entry at all (production; the test identity only in CI). */
  supported: boolean
  /** The switch in the app (what was set here). */
  switchedOn: boolean
  /** Windows will start the app at login: the entry is there and not off in Task Manager. */
  willStart: boolean
  /** The entry is there but switched off in Task Manager (StartupApproved). */
  disabledInTaskManager: boolean
}

/** What the desktop bar's renderer says it needs: its content's height and what is unfolded. */
export interface BarLayout {
  /** The content's height in CSS px (the main process multiplies by the zoom). */
  height: number
  /** A group, the variants or „Przedłuż” is unfolded: the panel's 60 s do not run, the bar grows within the work area. */
  unfolded: boolean
}

export type WidgetAction =
  | 'next'
  | 'pause'
  | 'extend'
  | 'endWork'
  | 'cutOff'
  | 'back'
  | 'finished'
  | 'water'
  | 'fewer'
  | 'better'
  | 'start'
  | 'bgEnd'
  | 'bgExtend'
  | 'undo'
  | 'signal'
  | 'relative'
  | 'confirm'
  | 'line'
  | 'openMain'
  | 'request'
  | 'requestEnd'
  | 'doneNow'
  | 'urgent'
  | 'variants'
  | 'barClick'
  | 'extendStep'

/** The bar's own actions: laid again („Pokaż pasek”), put in a corner (the wizard), the icon's panel opened (tests). */
export type BarActionId = 'placeBar' | 'corner' | 'openPanel'

export type UpdateAction = 'check' | 'installNow' | 'retry' | 'download' | 'dismissNotes'

/** A record as stored (JSON, unknown fields kept): the window edits it field by field. */
export type RawRecord = Record<string, unknown>

/**
 * The data folder as the main window sees it: its records with this computer's queued edits laid over them (your change
 * shows at once, also while the folder is away), the questions the queue left, who leads.
 */
export interface DataView {
  /** none – no folder chosen on this computer (the wizard); opening; open; failed – it did not open (why in `error`). */
  status: 'none' | 'opening' | 'open' | 'failed'
  folder: string | null
  error: string | null
  computer: string
  computerName: string
  /** rd.json (null: none yet – the defaults). */
  rd: RawRecord | null
  templates: RawRecord[]
  lectures: RawRecord[]
  requests: RawRecord[]
  routines: RawRecord[]
  /** Computers that have written a presence (for „komputer nagrywający”), this one first. */
  computers: Array<{ id: string; name: string }>
  /** Own changes not yet in the folder (events and edits). */
  unsynced: number
  questions: EditQuestion[]
  /** Records that cannot be read now or are broken (never written over). */
  problems: string[]
  leader: string | null
  /** The logical day now (by the main process's clock). */
  today: string
  /** In the calibration period (spec „Kalibracja”): reactions of energy only inform, without variants. */
  calibration: boolean
  /** The marker „przeniesiono do …” of the open folder (another computer restored a whole backup, D321), or null. */
  moved: MovedTo | null
  /** A whole backup restored here into a folder that did not open: this computer stayed in its folder („Spróbuj ponownie”). */
  pendingMove: { to: string; error: string } | null
}

/** Where the data of a folder moved: the new folder (as found from this computer), when and by which computer. */
export interface MovedTo {
  to: string
  at: number
  by: string
}

/** A question of the queue (spec „pola zmienione po obu stronach dają zwykłe pytanie”). */
export interface EditQuestion {
  id: string
  rel: string
  /** conflict – a field changed here and elsewhere; removed – the record was removed elsewhere; broken – the file is broken. */
  kind: 'conflict' | 'removed' | 'broken'
  /** When you made your change, and when the file was changed elsewhere (null: unknown) – „Przyjmij nowsze” compares them. */
  at: number
  theirsAt: number | null
  fields: Array<{ path: string[]; mine: unknown; theirs: unknown }>
}

/** A day for the main window: its file, the next day's (its wake sets the bedtime) and the log of every computer. */
export interface DayData {
  date: string
  dayFile: RawRecord | null
  nextFile: RawRecord | null
  /** The previous day's file (blocks moved „z wczoraj”). */
  prevFile: RawRecord | null
  events: unknown[]
  /** Every log of the day was read (false: unknown – never shown as an empty day). */
  complete: boolean
  /** The day's file is there but cannot be read now: its own changes are not shown, and the day is not edited. */
  unknown: boolean
}

export interface FieldEditIn {
  path: string[]
  base: unknown
  value: unknown
}

/** An edit of one record: fields with the values they had when you changed them; a new record; a removal. */
export interface EditEntry {
  rel: string
  edits: FieldEditIn[]
  create?: boolean
  remove?: boolean
}

export type EditOutcome = { status: 'applied' | 'conflict' | 'removedElsewhere' | 'broken' | 'waiting'; why?: string }

/**
 * A record chosen from a backup: what the queue did with it, `behindQuestion` – it waits for your answer to an earlier
 * question about the file, `same` – it already was as in the backup.
 */
export type RestoreOutcome = { rel: string; status: EditOutcome['status'] | 'behindQuestion' | 'same' }

/** An action of the main window written to the day's log (spec: facts you set live only in the log). */
export interface EventIn {
  k: string
  day: string
  [field: string]: unknown
}

/** A click of the timer (`a`: start, startNew, pause, next, extend, workEnd, finish, cancel, park, confirm – engine/timer.ts). */
export interface TimerIn {
  a: string
  day?: string
  block?: string
  minutes?: number
  done?: boolean
  confirm?: boolean
  /** Only judged (its cost or refusal), never written. */
  probe?: boolean
  categoryId?: string
  durationMin?: number
  variantId?: string | null
  /** „Cofnij”: the automatic action's event id. */
  target?: string
  /** An answer to a proposal of the bar (`mark`). */
  question?: string
  answer?: string
  /** Requests (`requestNow`, `requestEnd`, `requestAfter`): its id, the person, urgent with an estimate, after the fact [from, to). */
  request?: string
  person?: string | null
  urgent?: boolean
  estimateMin?: number | null
  from?: number
  to?: number
}

/** What a click did: nothing (why), or a cost waiting for the second click within 10 s. */
export interface TimerResult {
  ok: boolean
  why: string | null
  confirm: { block: string; minutes: number; overrun: boolean; bedtime: boolean } | null
}

export interface FolderProbe {
  path: string
  exists: boolean
  /** No entries at all (or the folder is not there yet). */
  empty: boolean
  /** rd.json is there: this app's data – the next computer joins it. */
  hasData: boolean
  /** rd.json is there but cannot be read now (OneDrive still fetching it): never taken as missing. */
  unreadable: string | null
  entries: number
  /** Inside a OneDrive folder of this user (the pinning applies). */
  inOneDrive: boolean
}

export interface WizardFinish {
  folder: string
  /** The first computer writes the shared data; the next one only joins. */
  first: boolean
  /** The shared records the first computer creates (rel → content). */
  records: Array<{ rel: string; value: RawRecord }>
  /** This computer's settings. */
  prefs: Record<string, unknown>
  autostart: boolean | null
  /** „Zawsze przechowuj na tym urządzeniu” for the folder (in OneDrive only). */
  pin: boolean
}

export interface HistoryRecord {
  kind: string
  id: string
  rel: string | null
  versions: number
  /** The newest version's time (ms UTC). */
  last: number
  /** The record is there now (false: removed – „Przywróć”). */
  exists: boolean
}

export interface HistoryVersion {
  file: string
  savedAt: number
  savedBy: string
  reason: string
  record: unknown
}

/** The monitors as Windows lays them out (DIP) and the desktop bar on them (D304). */
export interface BarScreens {
  displays: Array<{ id: number; label: string; bounds: Rect; workArea: Rect; primary: boolean }>
  /** The folded bar's rectangle, its monitor, and its place there (null: a place of your own, dragged). */
  bar: { bounds: Rect; display: number; spot: BarSpot | null }
}

/** Windows' settings the wizard opens with one button: priority notifications (D233), the icons beside the clock (D229). */
export type SystemSettingsPage = 'notifications' | 'taskbar'

export interface RdApi {
  view: ViewKind
  appInfo(): Promise<AppInfo>
  prefs(): Promise<MachinePrefs>
  setPrefs(patch: Partial<MachinePrefs>): Promise<MachinePrefs>
  onPrefs(cb: (prefs: MachinePrefs) => void): () => void
  autostart(): Promise<AutostartState>
  setAutostart(on: boolean): Promise<AutostartState>
  openLogs(): Promise<void>
  widget(): Promise<WidgetView>
  onWidget(cb: (view: WidgetView) => void): () => void
  widgetAction(action: WidgetAction, arg?: string): Promise<void>
  barLayout(layout: BarLayout): void
  /** The desktop bar dragged by its handle (D303): the main process follows the cursor between start and end. */
  barDrag(phase: 'start' | 'move' | 'end', why?: 'up' | 'cancel' | 'lost'): void
  /** The monitors and where the desktop bar stands (D304): for the settings' mock-up. */
  barScreens(): Promise<BarScreens>
  /** The desktop bar to a place on a monitor (by its id), from the settings' mock-up. */
  placeBar(display: number, spot: BarSpot): Promise<BarScreens>
  panelTouch(): void
  panelClose(): void
  barAction(action: BarActionId, arg?: string): Promise<void>
  update(): Promise<UpdateView>
  onUpdate(cb: (view: UpdateView) => void): () => void
  updateAction(action: UpdateAction): Promise<UpdateView>
  onNavigate(cb: (page: string) => void): () => void
  showMain(page?: string): void
  copyText(text: string): Promise<void>
  /** The icon's panel: the line a click opened it for (a notification). */
  onPanelTarget(cb: (target: { line: string | null; day: string | null } | null) => void): () => void
  /** The desktop bar: which way it unfolds (up, or down when it stands at the top). */
  onBarGrows(cb: (dir: 'up' | 'down') => void): () => void
  dataView(): Promise<DataView>
  /** Something in the data changed (a check of the folder, an edit, another computer's file). */
  onData(cb: () => void): () => void
  dayData(date: string): Promise<DayData>
  /** The files of several days (the calendar's month), null where a day has none; a day whose file cannot be read now is left out. */
  dayFiles(dates: string[]): Promise<Record<string, RawRecord | null>>
  edit(entries: EditEntry[]): Promise<EditOutcome[]>
  logEvents(events: EventIn[]): Promise<void>
  resolve(id: string, choice: 'mine' | 'theirs'): Promise<void>
  /** The events of every day of a month (kinds asked) – e.g. the exceptions of the boundary this month. */
  monthEvents(month: string, kinds: string[]): Promise<unknown[]>
  requestCounters(): Promise<RequestCounters>
  historyList(): Promise<HistoryRecord[]>
  historyVersions(kind: string, id: string): Promise<HistoryVersion[]>
  historyRestore(kind: string, id: string, file: string): Promise<EditOutcome[]>
  folderDefault(): Promise<string>
  folderPick(current: string | null): Promise<string | null>
  folderProbe(path: string): Promise<FolderProbe>
  wizardFinish(w: WizardFinish): Promise<{ ok: boolean; error: string | null }>
  pinFolder(): Promise<{ ok: boolean; error: string | null }>
  openSystemSettings(page: SystemSettingsPage): Promise<void>
  openDataFolder(): Promise<void>
  setNightInstall(on: boolean): Promise<AppInfo>
  /** A click of the timer (written by the main process; the same click twice does nothing the second time). */
  timer(click: TimerIn): Promise<TimerResult>
  /** Your answer to a question of the timer. */
  answer(id: string, answer: string, value?: number | null): Promise<TimerResult>
  /** Questions this window showed (seen only in the main window in the foreground with presence, D231). */
  seen(ids: string[]): void
  /** A day's closing ritual (D318): its rows by time, what each ✓ changes, the felt cost, how it was closed. */
  ritual(day: string): Promise<RitualView>
  /** An answer to a row of a day's ritual (`value`: an instant, a person, a stretch; `item`: a block of the summary row). */
  ritualAnswer(day: string, row: string, choice: string, value?: RitualValue, item?: string | null): Promise<TimerResult>
  /** Closing a day: the ritual, or the morning's „Jak zapisano”, „Wolne”, „Nie pamiętam”. */
  closeDay(day: string, how: CloseHow): Promise<TimerResult>
  /** The days the morning shows to close (D318, spec „Rano aplikacja pokazuje wszystkie niezamknięte dni naraz”). */
  unclosedDays(): Promise<UnclosedDay[]>
  /** The CSV export of [from, to] (D300, D321): a folder picked in a window of Windows; null – none picked. */
  exportCsv(from: string, to: string): Promise<{ dir: string; files: number } | null>
  /** The backups of the folder, newest first (D321). */
  backups(): Promise<BackupItem[]>
  /** The records of a backup to take back one by one. */
  backupContents(path: string): Promise<BackupRecord[]>
  /** Chosen records of a backup taken back into the folder (each your edit: the history keeps what was). */
  restoreRecords(path: string, rels: string[]): Promise<RestoreOutcome[]>
  /**
   * The whole backup into a new, empty folder picked in a window of Windows; this computer then works in it. `restored`
   * without `ok`: the copy is in `to`, but that folder did not open – this computer stays in its folder (`moveTo(to)`
   * tries again). null – no folder picked.
   */
  restoreWhole(path: string): Promise<{ ok: boolean; restored: boolean; to: string | null; error: string | null } | null>
  /** This computer to the folder the data moved to (the banner's „Przejdź”); not opened – it stays in its folder. */
  moveTo(dir: string): Promise<{ ok: boolean; error: string | null }>
  /** The game (D322): streak, notes, room, cassettes, celebrations due; null – no game yet. */
  game(): Promise<GameScreen | null>
  /** Celebrations shown (or let go) in the main window – never again on this computer. */
  celebrated(keys: string[]): Promise<void>
  /** „Strona B tygodnia” of the week that ended (Monday's morning plan). */
  sideB(): Promise<SideB>
  /** The calibration: period, proposals of the review, felt cost, where the review waits. */
  calibration(): Promise<CalibrationScreen>
  /** The window of sound: a tone to play (5 min, 0 min). */
  onSound(cb: (s: { kind: 'five' | 'zero'; volume: number }) => void): () => void
}
