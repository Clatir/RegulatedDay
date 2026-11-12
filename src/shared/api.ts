/**
 * The contract between the main process and the windows (preload `window.rd`). Every channel name lives here; the
 * main process answers `invoke` channels and pushes the `on*` events.
 */
import type { CalibrationPeriod, CostProposal, FeltCounts, ReviewPrompt, TimeProposal } from './engine/calibration'
import type { Celebration, GameView } from './engine/progress'
import type { SideB } from './engine/sideB'
import type { StatsPeriod, StatsResult } from './engine/stats'
import type { GoalsView } from './engine/goals'
import type { WeekView } from './engine/week'
import type { GoalsPatch } from './model/goals'
import type { RitualValue, RitualView } from './engine/ritual'
import type { CloseHow } from './model/events'
import type { DayTypeId } from './model/settings'
import type { ZjazdDay, ZjazdWarning } from './import/zjazdy'
import type { SeriesRule, SpecialDays } from './model/series'
import type { SeriesPatch } from './engine/series'
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
  openLink: 'rd:openLink',
  setNightInstall: 'rd:setNightInstall',
  timer: 'rd:timer',
  answer: 'rd:answer',
  seen: 'rd:seen',
  ritual: 'rd:ritual',
  ritualAnswer: 'rd:ritualAnswer',
  closeDay: 'rd:closeDay',
  unclosedDays: 'rd:unclosedDays',
  computerList: 'rd:computerList',
  exportCsv: 'rd:exportCsv',
  backups: 'rd:backups',
  backupContents: 'rd:backupContents',
  restoreRecords: 'rd:restoreRecords',
  restoreWhole: 'rd:restoreWhole',
  moveTo: 'rd:moveTo',
  game: 'rd:game',
  celebrated: 'rd:celebrated',
  sideB: 'rd:sideB',
  calibration: 'rd:calibration',
  zjazdyRead: 'rd:zjazdyRead',
  zjazdySave: 'rd:zjazdySave',
  zjazdyUndo: 'rd:zjazdyUndo',
  weekView: 'rd:weekView',
  goals: 'rd:goals',
  setGoals: 'rd:setGoals',
  stats: 'rd:stats',
  planPushed: 'rd:planPushed',
  planArranged: 'rd:planArranged',
  searchDays: 'rd:searchDays',
  seriesCreate: 'rd:seriesCreate',
  seriesChange: 'rd:seriesChange',
  seriesRemove: 'rd:seriesRemove',
  seriesEnd: 'rd:seriesEnd',
  seriesAnswer: 'rd:seriesAnswer',
  seriesUndo: 'rd:seriesUndo'
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
  | 'variants'
  | 'routine'
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
  /** The series (D381, series/<id>.json) – all of them, also the ended and removed ones. */
  series: RawRecord[]
  /**
   * The own types of the days the counts of the series read (date → type, from the days' files): the window counts the
   * series' last days from them as the main process does (`seriesPlans`).
   */
  seriesDays: Record<string, string>
  /**
   * Computers that have written a presence (for „komputer nagrywający”), this one first; another one still present carries
   * the version of its app (D388: the warning under a long note).
   */
  computers: Array<{ id: string; name: string; appVersion?: string }>
  /** Own changes not yet in the folder (events and edits waiting for it, A3-07). */
  unsynced: number
  /** The data folder is not there now (its changes wait in the journal and the queue). */
  away: boolean
  /**
   * The backups (A3-06): this computer's last try failed (why), the newest daily backup of the folder, and none for 3 days
   * or more (the window warns then).
   */
  backup: { failed: string | null; lastOk: string | null; stale: boolean }
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

/**
 * A computer of the folder in the settings (A3-13): this one first, the others by their presence – when this computer last
 * saw its file change (its own clock, null for itself), its state, whether it is forgotten, its „last presence”.
 */
export interface ComputerRow {
  id: string
  name: string
  self: boolean
  seenAt: number | null
  state: string
  forgotten: boolean
  lastPresence: number | null
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
  /**
   * conflict – a field changed here and elsewhere; removed – the record was removed elsewhere; changed – you removed it
   * here while it changed elsewhere (A3-09); broken – the file is broken.
   */
  kind: 'conflict' | 'removed' | 'changed' | 'broken'
  /** When you made your change, and when the file was changed elsewhere (null: unknown) – „Przyjmij nowsze” compares them. */
  at: number
  theirsAt: number | null
  fields: Array<{ path: string[]; mine: unknown; theirs: unknown }>
}

/** One block of a day file for the global search (Ctrl K, T651): named like everywhere (never by id), with its note. */
export interface SearchBlock {
  date: string
  id: string
  title: string
  note: string
}

/** The blocks of every day file of the data folder; `complete` false: some file could not be read now (never taken for none). */
export interface SearchCorpus {
  blocks: SearchBlock[]
  complete: boolean
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
  /**
   * Not complete only because the data folder is away, the day as last read here (logs and file known): your changes of
   * it wait for the folder like the bar's clicks (E8b.1) – `dayUsable`.
   */
  away: boolean
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
  /** A removal: the record as you saw it when you removed it (A3-09). */
  base?: unknown
}

export type EditOutcome = { status: 'applied' | 'conflict' | 'removedElsewhere' | 'changedElsewhere' | 'broken' | 'waiting'; why?: string }

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

/**
 * A click of the timer (`a`: start, startNew, pause, next, extend, workEnd, finish, cancel, park, confirm, resize –
 * engine/timer.ts). `resize` (D365): the end of a running block dragged on the axis – `block`, `to` (ms of the new end),
 * `confirm` (the second call, „Potwierdź”, when the first returned a cost).
 */
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
  /** „Pracowałem do teraz”: the time to explain it answers. */
  explain?: string
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
  /** A routine ticked off (`routineDone`, D328): its version and the steps done. */
  version?: 'normal' | 'worse'
  steps?: string[]
}

/** What a click did: nothing (why), or a cost waiting for the second click within 10 s. */
export interface TimerResult {
  ok: boolean
  why: string | null
  confirm: { block: string; minutes: number; overrun: boolean; bedtime: boolean; moveToNow?: boolean } | null
  /** Why it did nothing, when the caller must tell it from other refusals (D336): never read from `why`. */
  code?: 'alreadyOver' | 'notBegun'
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

/** A day of the schedule read from a PDF of „zjazdy” (D357) with what „Zapisz” would do to it. */
export interface ZjazdPreviewDay extends ZjazdDay {
  /** Not saved: the day has begun (today) or is gone – its plan stays; null – it will be saved. */
  skip: 'today' | 'past' | null
  /** An import of this date before is replaced by this one. */
  replaces: boolean
  /** The type the day's file gives it now (null: its weekday's) – the import makes it this day's „zjazd”. */
  ownType: DayTypeId | null
  /** The day's file cannot be read now (OneDrive still fetching it): „Zapisz” leaves the day out. */
  unreadable: boolean
}

/** The preview of „Wczytaj PDF zjazdów”: nothing of it is saved until „Zapisz”. */
export interface ZjazdPreview {
  /** The name of the file (without its folder). */
  file: string
  /** The logical today the skips are counted from. */
  today: string
  days: ZjazdPreviewDay[]
  /** Lines of the PDF that could not be read, hours turned round, overlaps – each with its message. */
  warnings: ZjazdWarning[]
}

/** A PDF read: its preview, or why it could not be read (not a PDF, with a password, no text, no dates). */
export type ZjazdyRead = { ok: true; preview: ZjazdPreview } | { ok: false; error: string }

/**
 * Why a day was left as it is: it has begun, it is gone, it is not a day that can be saved, its file cannot be read now,
 * its file is broken (the queue never writes over it), its file was changed after the import („Cofnij” never writes over
 * a change made since).
 */
export type ZjazdSkipReason = 'today' | 'past' | 'invalid' | 'unreadable' | 'broken' | 'changed'

/** What „Cofnij” of one save takes back for a day: its file before that save (null: there was none) and after it. */
export interface ZjazdUndoDay {
  date: string
  before: RawRecord | null
  after: RawRecord
}

export interface ZjazdSaveResult {
  /** Days this save changed – written, or waiting for the data folder (written on its return). */
  saved: string[]
  /** Days already as this save would make them: nothing written (also nothing to take back). */
  unchanged: string[]
  /** Days whose edit met a change made on another computer meanwhile: a question at the top of the window. */
  questions: string[]
  /** Days left as they are, each with its reason and a text for it. */
  skipped: Array<{ date: string; reason: ZjazdSkipReason; text: string }>
  /** The outcomes of the edits (for `editNotice`). */
  outcomes: EditOutcome[]
  /**
   * „Cofnij” of this save: every day in `saved` with its file before and after it, and every day of `questions` saved in
   * part (a field met a change elsewhere – the rest is written) with its file as this computer sees it; empty after a
   * „Cofnij” itself.
   */
  undo: ZjazdUndoDay[]
}

/**
 * What a change of a series applies to (D381): „Tylko to” – this occurrence; „To i następne” – this one and the ones after
 * it (the series splits); „Cała seria” – from today (today's occurrence while it has not begun).
 */
export type SeriesScope = 'only' | 'following' | 'all'

/** A series by its record (the list in „Szablony”), or by one of its occurrences – a block of a day. */
export type SeriesTarget = { seriesId: string } | { date: string; blockId: string }

/** A new series from a block of a day (the field „Powtarzaj”): the block becomes its first occurrence. */
export interface SeriesCreate {
  date: string
  blockId: string
  rule: SeriesRule
  /** „W dni szczególne” (D382) – default „pytaj”. */
  special?: SpecialDays
  /** Its end: the last day, the number of occurrences (both may be set – whichever comes first); none – never. */
  until?: string | null
  count?: number | null
}

/** A change of a series (or of one occurrence – „Tylko to”: only `block`). */
export type { SeriesPatch }

/** A file a change of a series wrote, before and after it (null: none) – for its „Cofnij”. */
export interface SeriesUndoFile {
  rel: string
  before: RawRecord | null
  after: RawRecord | null
}

/** What a change of a series did. */
export interface SeriesResult {
  /** Saved: every file written or waiting for the data folder (as `isSaved`); nothing to write is saved too. */
  ok: boolean
  /** Why nothing was written (shown to you), null when it was. */
  error: string | null
  code: 'kind' | 'series' | 'requests' | 'noStart' | 'ended' | 'notFound' | 'begun' | 'invalid' | null
  /** The series the change made or changed (a new one with „Powtarzaj”), null – none. */
  seriesId: string | null
  /** The outcomes of the edits (for `editNotice`): a question means part of it waits for your answer. */
  outcomes: EditOutcome[]
  /** „Cofnij” of this change (`seriesUndo`); empty after a „Cofnij” itself. */
  undo: SeriesUndoFile[]
}

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
  /**
   * Blocks pushed apart (D367), already saved by the window as the one edit `entry` of the day's file (`made` – the file
   * it created, else null): the bar keeps „Przesunięto N bloków · Cofnij” – its „Cofnij” takes that edit back – and the
   * push checks the marker of variants of today.  false (D400: a „Dodaj” of the week, whose one „Cofnij” is the window's):
   * only the marker's trigger, no line of the bar.
   */
  planPushed(day: string, count: number, entry: EditEntry, made: RawRecord | null, line?: boolean): Promise<void>
  /**
   * „Ułóż pod energię” (D369) applied in the morning plan, already saved by the window as the one edit `entry` of today's
   * file (`made` – the file it created, else null): the bar keeps „Przestawiono: <label> · Cofnij” as after a variant (D313).
   */
  planArranged(day: string, label: string, entry: EditEntry, made: RawRecord | null): Promise<void>
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
  /** A link of a note (D388, T663): opens in the default browser only when it is http or https – the main process checks it again. */
  openLink(url: string): Promise<void>
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
  /** The computers of the folder for the settings (A3-13, „Zapomnij komputer”): this one first. */
  computerList(): Promise<ComputerRow[]>
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
  /** The statistics of the frozen days of a period (D358): energy, estimates, requests by person, boundaries. */
  stats(period: StatsPeriod): Promise<StatsResult>
  /** The blocks of all days with files, past and coming, for the global search (Ctrl K); read when the palette opens. */
  searchDays(): Promise<SearchCorpus>
  /**
   * The week of a date (D356, „Tydzień”): its seven days from Monday on one axis – each with its type, blocks (the plan;
   * days gone by – as it was), boundary and regeneration against the minimum; only a view.
   */
  weekView(date: string): Promise<WeekView>
  /** A month's goals ('RRRR-MM', D356): as rd.json holds them, the month before's, the progress „x z y” so far. */
  goals(month: string): Promise<GoalsView>
  /**
   * A change of a month's goals (D356): a whole number per area in its range (`goalRange`), null – no goal; `skipped` – the
   * morning's step „Cele na <miesiąc>” skipped. Fields of rd.json through the queue, as `edit`; a value out of range is
   * refused (an error with why).
   */
  setGoals(month: string, patch: GoalsPatch): Promise<EditOutcome[]>
  /** The window of sound: a tone to play (5 min, 0 min). */
  onSound(cb: (s: { kind: 'five' | 'zero'; volume: number }) => void): () => void
  /**
   * „Wczytaj PDF zjazdów” (D357): a PDF picked in a window of Windows read into a preview – nothing is saved; null – no
   * file picked.
   */
  zjazdyRead(): Promise<ZjazdyRead | null>
  /** The days of the preview, as you corrected them, saved into their files – only days to come (D357). */
  zjazdySave(days: ZjazdDay[]): Promise<ZjazdSaveResult>
  /**
   * „Cofnij” of one save of the import (its toast, with that save's `undo`): every day to come back as before that save
   * (an import it replaced too) – only a day whose file still stands as the save left it (else `changed`); one edit of
   * the queue.
   */
  zjazdyUndo(undo: ZjazdUndoDay[]): Promise<ZjazdSaveResult>
  /**
   * A new series from a block of a day (D381, the field „Powtarzaj”, D401: a block of yours, flexible or fixed – not a
   * session, a lecture, a class of a „zjazd”, a block of requests): the series' record and the day's file as one edit. The
   * block becomes the first occurrence when the rule falls on its day; a day gone by keeps it – the series starts today.
   */
  seriesCreate(input: SeriesCreate): Promise<SeriesResult>
  /** A change of a series by its scope (the dialog „Tylko to · To i następne · Cała seria”; the list: `all`). */
  seriesChange(target: SeriesTarget, scope: SeriesScope, patch: SeriesPatch): Promise<SeriesResult>
  /** A removal by its scope; „To i następne” and „Cała seria” also take the occurrences changed on their days from today on. */
  seriesRemove(target: SeriesTarget, scope: SeriesScope): Promise<SeriesResult>
  /** The series ends on `last` (at least yesterday; today's occurrence stays when it has begun). */
  seriesEnd(seriesId: string, last: string): Promise<SeriesResult>
  /** The morning's answer about an occurrence on a special day (D382): `keep` – „zostaw”, else „odwołaj”. */
  seriesAnswer(date: string, blockId: string, keep: boolean): Promise<SeriesResult>
  /** „Cofnij” of one change of a series: each file back as before it, only while it stands as the change left it. */
  seriesUndo(undo: SeriesUndoFile[]): Promise<SeriesResult>
}
