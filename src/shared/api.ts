/**
 * The contract between the main process and the windows (preload `window.rd`). Every channel name lives here; the
 * main process answers `invoke` channels and pushes the `on*` events.
 */
import type { IdentityKind } from './identity'
import type { MachinePrefs } from './machine'
import type { TrialState, WidgetView } from './widget'
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
  panelTouch: 'rd:panelTouch',
  panelClose: 'rd:panelClose',
  trial: 'rd:trial',
  setTrial: 'rd:setTrial',
  trialAction: 'rd:trialAction',
  trialLog: 'rd:trialLog',
  onTrialLog: 'rd:onTrialLog',
  update: 'rd:update',
  onUpdate: 'rd:onUpdate',
  updateAction: 'rd:updateAction',
  onNavigate: 'rd:onNavigate',
  showMain: 'rd:showMain',
  copyText: 'rd:copyText',
  dataView: 'rd:dataView',
  onData: 'rd:onData',
  dayData: 'rd:dayData',
  edit: 'rd:edit',
  logEvents: 'rd:logEvents',
  resolve: 'rd:resolve',
  monthEvents: 'rd:monthEvents',
  historyList: 'rd:historyList',
  historyVersions: 'rd:historyVersions',
  historyRestore: 'rd:historyRestore',
  folderDefault: 'rd:folderDefault',
  folderPick: 'rd:folderPick',
  folderProbe: 'rd:folderProbe',
  wizardFinish: 'rd:wizardFinish',
  pinFolder: 'rd:pinFolder',
  openSystemSettings: 'rd:openSystemSettings',
  openDataFolder: 'rd:openDataFolder'
} as const

/** Which window a renderer is (the preload reads it from its arguments). */
export type ViewKind = 'main' | 'bar' | 'panel'

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

export type WidgetAction = 'next' | 'pause' | 'extend' | 'endWork' | 'cutOff' | 'finished' | 'water' | 'request' | 'doneNow' | 'urgent' | 'variants' | 'barClick'

export type TrialAction =
  | 'notifyIn10s'
  | 'showBar'
  | 'hideBar'
  | 'placeBar'
  | 'openPanel'
  | 'nextDisplay'
  | 'corner'
  | 'powerDisplay'
  | 'powerSystem'
  | 'powerOff'
  | 'clearLog'

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
}

/** A question of the queue (spec „pola zmienione po obu stronach dają zwykłe pytanie”). */
export interface EditQuestion {
  id: string
  rel: string
  /** conflict – a field changed here and elsewhere; removed – the record was removed elsewhere; broken – the file is broken. */
  kind: 'conflict' | 'removed' | 'broken'
  at: number
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

/** An action of the main window written to the day's log (spec: facts you set live only in the log). */
export interface EventIn {
  k: string
  day: string
  [field: string]: unknown
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
  panelTouch(): void
  panelClose(): void
  trial(): Promise<TrialState>
  setTrial(patch: Partial<TrialState>): Promise<TrialState>
  trialAction(action: TrialAction, arg?: string): Promise<void>
  trialLog(): Promise<string[]>
  onTrialLog(cb: (line: string) => void): () => void
  update(): Promise<UpdateView>
  onUpdate(cb: (view: UpdateView) => void): () => void
  updateAction(action: UpdateAction): Promise<UpdateView>
  onNavigate(cb: (page: string) => void): () => void
  showMain(page?: string): void
  copyText(text: string): Promise<void>
  /** The icon's panel: the line a click opened it for (a notification, the trial). */
  onPanelTarget(cb: (target: { line: string | null; day: string | null } | null) => void): () => void
  /** The desktop bar: which way it unfolds (up, or down when it stands at the top). */
  onBarGrows(cb: (dir: 'up' | 'down') => void): () => void
  dataView(): Promise<DataView>
  /** Something in the data changed (a check of the folder, an edit, another computer's file). */
  onData(cb: () => void): () => void
  dayData(date: string): Promise<DayData>
  edit(entries: EditEntry[]): Promise<EditOutcome[]>
  logEvents(events: EventIn[]): Promise<void>
  resolve(id: string, choice: 'mine' | 'theirs'): Promise<void>
  /** The events of every day of a month (kinds asked) – e.g. the exceptions of the boundary this month. */
  monthEvents(month: string, kinds: string[]): Promise<unknown[]>
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
}
