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
  copyText: 'rd:copyText'
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
}
