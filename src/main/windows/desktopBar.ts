/**
 * The desktop bar (spec „Widget”, D229): a tool window without activation, without a taskbar button or a place in
 * Alt+Tab, with an opaque background, lying under every other window – seen only where nothing covers it. The helper
 * lays it right above the desktop (Progman / WorkerW) before it is shown and keeps checking the order of the windows;
 * without its confirmation the bar stays hidden.
 *
 * The app changes this window through one function only – `apply` – which knows showInactive, hide, setBounds and
 * setContentProtection. Nothing here ever calls focus, blur, setFocusable, moveTop, moveAbove, show, restore,
 * setAlwaysOnTop or setParentWindow: each of them raises the window or activates another (scripts/check-code.mjs checks
 * this file). It is never destroyed, only hidden.
 */
import { BrowserWindow } from 'electron'
import type { Rect } from '@shared/bounds'
import { PALETTE } from '@shared/theme'

export interface BarApply {
  visible?: boolean
  bounds?: Rect
  contentProtection?: boolean
}

export class DesktopBar {
  private readonly win: BrowserWindow
  private visible = false
  private bounds: Rect | null = null

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
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
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

  /** The end of the Windows session, in this window too (spec: the record goes out from every window). */
  onSystemEnd(cb: () => void): void {
    this.win.on('query-session-end', cb)
    this.win.on('session-end', cb)
  }

  /** The bar's window handle (the helper lays and checks it). */
  get hwnd(): string {
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
