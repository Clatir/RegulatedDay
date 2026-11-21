/**
 * The desktop bar (spec „Widget”, D229): a tool window without activation, without a taskbar button or a place in
 * Alt+Tab, with an opaque background, lying under every other window – seen only where nothing covers it. The helper
 * lays it right above the desktop (Progman / WorkerW) before it is shown and keeps checking the order of the windows;
 * without its confirmation the bar stays hidden.
 *
 * The app changes this window through one function only – `apply` – which knows showInactive, hide, setBounds,
 * setContentProtection and – only for „Zawsze na wierzchu” you choose on this computer (D291) – setAlwaysOnTop with
 * that choice. Nothing here ever calls focus, blur, setFocusable, moveTop, moveAbove, show, restore or setParentWindow:
 * each of them raises the window or activates another (scripts/check-code.mjs checks this file). It is never destroyed,
 * only hidden.
 */
import { BrowserWindow } from 'electron'
import type { Rect } from '@shared/bounds'
import { PALETTE } from '@shared/theme'
import { keepOnPage } from './navigation'

export interface BarApply {
  visible?: boolean
  bounds?: Rect
  contentProtection?: boolean
  /**
   * „Zawsze na wierzchu” chosen on this computer (D291, changes D229): the bar above the other windows – still without
   * activation, still never focused; off – under them again (the helper lays it before it shows).
   */
  onTop?: boolean
}

/**
 * How the bar's closing asked by a window goes (D559, T1975): „×” (`x`) hides the bar until „Pokaż pasek pulpitu” in the
 * icon's menu or the next start, „×” with Shift (`quit`) ends the app – both only from the bar's own window; another one
 * changes nothing (and the log says so).
 */
export function barCloseOf(how: unknown, from: string): { hide: boolean; quit: boolean; why: string } {
  if (from !== 'bar') return { hide: false, quit: false, why: `× paska – odmowa (okno ${from})` }
  if (how === 'quit') return { hide: false, quit: true, why: '× paska z Shift – wyjście' }
  if (how === 'x') return { hide: true, quit: false, why: '× paska – schowany do „Pokaż pasek pulpitu”' }
  return { hide: false, quit: false, why: '× paska – nieznane polecenie' }
}

/**
 * The panel's „▣ Pasek pulpitu: pokaż / schowaj” (D564 P13): „schowaj” hides the bar as its „×” does (`closed` – until
 * „Pokaż”, the settings, the main window going or the next start); „pokaż” shows it again – one switched off in the
 * settings is switched on on this computer (`switchOn`). Off, there is nothing to hide: the state stays. Only from the
 * panel's own window (`ok`), as „×” only from the bar's; another one changes nothing (and the log says so).
 */
export function barFromPanel(want: 'showBar' | 'hideBar', from: string, s: { closed: boolean; desktopBar: boolean }): { ok: boolean; closed: boolean; switchOn: boolean; why: string } {
  if (from !== 'panel') return { ok: false, closed: s.closed, switchOn: false, why: `pasek pulpitu z panelu – odmowa (okno ${from})` }
  if (want === 'hideBar') return s.desktopBar ? { ok: true, closed: true, switchOn: false, why: 'pasek pulpitu schowany z panelu ikony' } : { ok: true, closed: s.closed, switchOn: false, why: 'pasek pulpitu wyłączony w ustawieniach – nie ma czego chować' }
  return { ok: true, closed: false, switchOn: !s.desktopBar, why: s.desktopBar ? 'pasek pulpitu pokazany z panelu ikony' : 'pasek pulpitu włączony i pokazany z panelu ikony' }
}

/** Why the desktop bar is hidden although it is on: no helper to lay it, or the helper could not lay it under the windows. */
export type BarProblem = 'helper' | 'failed'

/**
 * The desktop bar as the windows hear of it (D270, D564 P13): why it is hidden although it is on (`problem` – the note
 * „Pasek pulpitu ukryty…”), and whether it is on the screen now (`shown` – the panel's „schowaj” only then): wanted by its
 * rules (`barWanted`: on, not hidden by „×” nor by „Odcinam się”, not „na wierzchu” over a full screen or behind the main
 * window in front) and its window really shown – laid under the windows and confirmed by the helper, or on top. Each change
 * of either is told once (`tell` – the view to every window); the same state again tells nothing.
 */
export class BarSeen {
  private now: { shown: boolean; problem: BarProblem | null } = { shown: false, problem: null }

  constructor(private readonly tell: () => void) {}

  get shown(): boolean {
    return this.now.shown
  }

  get problem(): BarProblem | null {
    return this.now.problem
  }

  setProblem(problem: BarProblem | null): void {
    this.set({ ...this.now, problem })
  }

  /** After every change of the bar's window (`layoutBar`, the helper's word): on the screen = wanted and really shown. */
  see(s: { wanted: boolean; visible: boolean }): void {
    this.set({ ...this.now, shown: s.wanted && s.visible })
  }

  private set(next: { shown: boolean; problem: BarProblem | null }): void {
    if (next.shown === this.now.shown && next.problem === this.now.problem) return
    this.now = next
    this.tell()
  }
}

/**
 * The main window minimized or closed into the tray (D560): the bar hidden by its „×” comes back when „Pasek wraca z oknem
 * głównym” is on and the bar itself is on (switched on again, it shows by itself) – never while the app quits.
 */
export const barBackWithMain = (closed: boolean, on: boolean, barOn: boolean, quitting: boolean): boolean => closed && on && barOn && !quitting

export class DesktopBar {
  private readonly win: BrowserWindow
  private visible = false
  private bounds: Rect | null = null
  private top = false

  constructor(preload: string, load: (win: BrowserWindow) => Promise<void>) {
    this.win = new BrowserWindow({
      show: false,
      frame: false,
      // A tool window (WS_EX_TOOLWINDOW) without activation (WS_EX_NOACTIVATE): no taskbar button, no Alt+Tab, a click
      // never activates it.
      type: 'toolbar',
      focusable: false,
      skipTaskbar: true,
      // Maximized, snapped or minimized (Win+M) windows are shown again by Windows with a raise – none of it is possible.
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      thickFrame: false,
      hasShadow: false,
      transparent: false,
      backgroundColor: PALETTE.surface,
      title: 'Regulated Day – pasek',
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: false,
        additionalArguments: ['--rd-view=bar']
      }
    })
    // A file or a link dropped on it never loads in it, no window opens from it (as every window, T755).
    keepOnPage(this.win.webContents)
    this.win.on('page-title-updated', (e) => e.preventDefault())
    this.win.on('close', (e) => {
      // Never destroyed (the app's quit destroys it): a close from outside only hides it.
      if (!this.quitting) {
        e.preventDefault()
        this.apply({ visible: false })
        this.onExternalClose?.()
      }
    })
    void load(this.win)
  }

  /** The app quits: the window may close for real. */
  quitting = false
  /** Called when something outside closes the window (an installer's taskkill): the app quits. */
  onExternalClose: (() => void) | null = null

  /** The end of the Windows session, in this window too (spec: the record goes out from every window); `ending`: it ends. */
  onSystemEnd(cb: (ending: boolean) => void): void {
    this.win.on('query-session-end', () => cb(false))
    this.win.on('session-end', () => cb(true))
  }

  /** False once the window is destroyed (at the quit). */
  get alive(): boolean {
    return !this.win.isDestroyed()
  }

  /** The bar's window handle (the helper lays and checks it). */
  get hwnd(): string {
    if (this.win.isDestroyed()) return '0'
    const buf = this.win.getNativeWindowHandle()
    return buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : String(buf.readUInt32LE(0))
  }

  /** null once the window is destroyed (at the quit; the helper's last status comes after it). */
  get webContents(): Electron.WebContents | null {
    return this.win.isDestroyed() ? null : this.win.webContents
  }

  get isVisible(): boolean {
    return this.visible
  }

  get currentBounds(): Rect | null {
    return this.bounds
  }

  /** The only function that changes the window. */
  apply(change: BarApply): void {
    if (this.win.isDestroyed()) return
    if (change.contentProtection !== undefined) this.win.setContentProtection(change.contentProtection)
    // Only by your choice (D291), and only here: the one place that may raise the bar.
    if (change.onTop !== undefined && change.onTop !== this.top) {
      this.win.setAlwaysOnTop(change.onTop, 'floating')
      this.top = change.onTop
    }
    if (change.bounds) {
      const b = change.bounds
      const same = this.bounds && this.bounds.x === b.x && this.bounds.y === b.y && this.bounds.width === b.width && this.bounds.height === b.height
      if (!same) {
        // Between monitors of a different scale: the position first, then the size (spec „Widget”).
        if (this.bounds && (this.bounds.x !== b.x || this.bounds.y !== b.y)) this.win.setBounds({ x: b.x, y: b.y, width: this.bounds.width, height: this.bounds.height })
        this.win.setBounds(b)
        this.bounds = { ...b }
      }
    }
    if (change.visible === true && !this.visible) {
      this.win.showInactive()
      this.visible = true
    } else if (change.visible === false && this.visible) {
      this.win.hide()
      this.visible = false
    }
  }
}
