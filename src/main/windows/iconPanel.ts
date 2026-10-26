/**
 * The icon's panel (spec „Widget”): opened by a click of the icon or of a notification, by the icon (or the cursor),
 * always inside the work area. It closes when the window in the foreground changes – also a click elsewhere – except to
 * the shell's windows (the taskbar, the hidden icons' arrow, the notifications) and except the first 500 ms after it
 * opened; when the icon is clicked while it is open; on Esc; after 60 s untouched, counted only while the cursor is
 * outside it and nothing is unfolded. Losing the focus alone closes it only while the helper does not run. It never
 * opens by itself, and a click of the icon right after such a closing does not open it again. Never destroyed.
 */
import { BrowserWindow, screen } from 'electron'
import type { Rect } from '@shared/bounds'
import type { PanelTarget } from '@shared/protocol'
import { PALETTE } from '@shared/theme'

export const PANEL_GRACE_MS = 500
export const PANEL_IDLE_MS = 60_000
/** A click of the icon this soon after the panel closed itself does not reopen it (the click that closed it). */
export const REOPEN_BLOCK_MS = 500

export interface PanelDeps {
  /** The rectangle to open at for a content height (CSS px). */
  place: (height: number) => Rect
  helperRunning: () => boolean
  /** Out of recordings and screen sharing (this computer's setting, on by default). */
  hideFromCapture: () => boolean
  log: (msg: string) => void
}

export class IconPanel {
  private readonly win: BrowserWindow
  private openedAt = 0
  private closedAt = 0
  private touchedAt = 0
  private unfolded = false
  private contentHeight = 320
  private idleTimer: NodeJS.Timeout | null = null
  quitting = false
  onExternalClose: (() => void) | null = null

  constructor(
    preload: string,
    load: (win: BrowserWindow) => Promise<void>,
    private readonly d: PanelDeps
  ) {
    this.win = new BrowserWindow({
      show: false,
      frame: false,
      type: 'toolbar',
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      thickFrame: false,
      backgroundColor: PALETTE.surface,
      title: 'Regulated Day – panel',
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: false,
        additionalArguments: ['--rd-view=panel']
      }
    })
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.win.on('page-title-updated', (e) => e.preventDefault())
    this.win.on('blur', () => {
      // Only without the helper: with it, the change of the foreground window decides (a notification's click may
      // leave the panel without the focus at all).
      if (!this.d.helperRunning() && Date.now() - this.openedAt > PANEL_GRACE_MS) this.close('utrata fokusu')
    })
    this.win.on('close', (e) => {
      if (!this.quitting) {
        e.preventDefault()
        this.close('zamknięcie okna')
        this.onExternalClose?.()
      }
    })
    void load(this.win)
  }

  /** The end of the Windows session, in this window too. */
  onSystemEnd(cb: () => void): void {
    this.win.on('query-session-end', cb)
    this.win.on('session-end', cb)
  }

  get isOpen(): boolean {
    return this.win.isVisible()
  }

  get hwnd(): string {
    const buf = this.win.getNativeWindowHandle()
    return buf.length >= 8 ? buf.readBigUInt64LE(0).toString() : String(buf.readUInt32LE(0))
  }

  /** null once the window is destroyed (at the quit; the helper's last status comes after it). */
  get webContents(): Electron.WebContents | null {
    return this.win.isDestroyed() ? null : this.win.webContents
  }

  get bounds(): Rect {
    return this.win.getBounds()
  }

  /** A click of the icon: open, or close when open – but not right after the panel closed itself. */
  toggle(target: PanelTarget | null = null): void {
    if (this.isOpen) return this.close('kliknięcie ikony')
    if (Date.now() - this.closedAt < REOPEN_BLOCK_MS) return
    this.open(target)
  }

  open(target: PanelTarget | null = null): void {
    if (this.win.isDestroyed()) return
    const r = this.d.place(this.contentHeight)
    this.win.setBounds(r)
    this.win.setContentProtection(this.d.hideFromCapture())
    this.openedAt = Date.now()
    this.touchedAt = this.openedAt
    this.unfolded = false
    this.win.webContents.send('rd:panelTarget', target)
    // Opened by your click: shown on top with the focus (an exception of D229); Windows may refuse the focus after a
    // notification's click – the panel is there anyway, and the foreground's change still closes it.
    this.win.show()
    this.win.focus()
    this.armIdle()
    this.d.log(`panel otwarty${target?.line ? ` (linia ${target.line})` : ''}`)
  }

  close(why: string): void {
    if (!this.isOpen) return
    this.win.hide()
    this.closedAt = Date.now()
    if (this.idleTimer) clearInterval(this.idleTimer)
    this.idleTimer = null
    this.d.log(`panel zamknięty: ${why}`)
  }

  /** The window in the foreground changed (the helper's event). */
  foreground(hwnd: string, shell: boolean): void {
    if (!this.isOpen || hwnd === this.hwnd || shell) return
    if (Date.now() - this.openedAt <= PANEL_GRACE_MS) return
    this.close('zmiana okna na pierwszym planie')
  }

  /** A move or a key in the panel; `unfolded`: variants or „Przedłuż” are open. */
  touch(unfolded?: boolean): void {
    this.touchedAt = Date.now()
    if (unfolded !== undefined) this.unfolded = unfolded
  }

  /** The content's height changed (CSS px): the panel keeps its place by the icon. */
  layout(height: number, zoom: number, unfolded: boolean): void {
    this.contentHeight = Math.ceil(height * zoom)
    this.unfolded = unfolded
    if (this.isOpen) this.win.setBounds(this.d.place(this.contentHeight))
  }

  private armIdle(): void {
    if (this.idleTimer) clearInterval(this.idleTimer)
    this.idleTimer = setInterval(() => {
      if (!this.isOpen) return
      const c = screen.getCursorScreenPoint()
      const b = this.win.getBounds()
      const inside = c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height
      if (inside || this.unfolded) {
        this.touchedAt = Date.now()
        return
      }
      if (Date.now() - this.touchedAt >= PANEL_IDLE_MS) this.close('60 s bez dotknięcia')
    }, 1000)
    this.idleTimer.unref?.()
  }
}
