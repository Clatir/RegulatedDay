/**
 * The window „Do skrzynki” (D385, D402): one small field over every window – only on your shortcut (Win+Alt+N by
 * default, changed or switched off in the settings of this computer), an exception of D229 like „Zawsze na wierzchu”
 * (D291). It never comes up by itself: the one way up is `raise`, called only by the global shortcut registered here
 * (scripts/check-code.mjs checks this file – show, focus and „on top” only in `raise`, `raise` only from the shortcut's
 * callback). Enter saves the task into „Skrzynka” and hides it, Esc hides it; losing the focus hides it too – its text
 * stays for the next time (the window's own state). Hidden, it is no longer on top. Never destroyed while the app runs.
 */
import { BrowserWindow, globalShortcut, screen } from 'electron'
import { CH, type QuickShortcut } from '@shared/api'
import type { MachinePrefs } from '@shared/machine'
import { PALETTE } from '@shared/theme'

/** The shortcut this computer's settings ask for: its keys, null – switched off. */
export const shortcutOf = (p: Pick<MachinePrefs, 'quickOn' | 'quickKey'>): string | null => (p.quickOn ? p.quickKey : null)

/**
 * A change of the settings that concerns the shortcut (its keys or its switch) – also the same keys typed again: it is
 * registered again then, one Windows refused before too (T759).
 */
export const touchesShortcut = (patch: unknown): boolean => !!patch && typeof patch === 'object' && ('quickKey' in patch || 'quickOn' in patch)

/** A shortcut Windows refused (another program holds it) is tried again this often while the app runs (T759). */
export const QUICK_RETRY_MS = 60_000

/** Its size (DIP, before the interface's scale) and its place: the upper third of the monitor with the cursor. */
export const QUICK_SIZE = { width: 440, height: 92 } as const

export interface QuickDeps {
  /** The interface's scale (90–150 %). */
  zoom: () => number
  /** Out of recordings and screen sharing (this computer's setting, on by default). */
  hideFromCapture: () => boolean
  /** The shortcut's state changed (the settings say it). */
  changed: (s: QuickShortcut) => void
  log: (msg: string) => void
  /** Electron's global shortcuts (a fake in the tests). */
  shortcuts?: Pick<typeof globalShortcut, 'register' | 'unregister'>
}

export class QuickWindow {
  private readonly win: BrowserWindow
  private key: string | null = null
  private registered = false
  private state: QuickShortcut['state'] = 'off'
  /** The last refusal's words (an exception of `register`): said once, not at every retry. */
  private lastError: string | null = null
  /** Destroyed (the quit): nothing is registered again. */
  private destroyed = false
  /** The app quits: the window may close for real. */
  quitting = false
  /** Called when something outside closes the hidden window (an installer's taskkill): the app quits. */
  onExternalClose: (() => void) | null = null

  constructor(
    preload: string,
    load: (win: BrowserWindow) => Promise<void>,
    private readonly d: QuickDeps
  ) {
    this.win = new BrowserWindow({
      show: false,
      frame: false,
      // No taskbar button, no place in Alt+Tab; it takes the keys while it is shown.
      type: 'toolbar',
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      thickFrame: false,
      width: QUICK_SIZE.width,
      height: QUICK_SIZE.height,
      backgroundColor: PALETTE.surface,
      title: 'Regulated Day – do skrzynki',
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: false,
        additionalArguments: ['--rd-view=quick']
      }
    })
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.win.on('page-title-updated', (e) => e.preventDefault())
    this.win.on('blur', () => this.close('utrata fokusu'))
    this.win.on('close', (e) => {
      if (this.quitting) return
      e.preventDefault()
      // Open, its close is yours (Alt+F4): it only hides. Hidden, nobody could close it – one from outside ends the app.
      const open = this.isOpen
      this.close(open ? 'Alt+F4' : 'zamknięcie okna')
      if (!open) this.onExternalClose?.()
    })
    void load(this.win)
  }

  private get shortcuts(): Pick<typeof globalShortcut, 'register' | 'unregister'> {
    return this.d.shortcuts ?? globalShortcut
  }

  /** False once the window is destroyed too (at the quit). */
  get isOpen(): boolean {
    return !this.win.isDestroyed() && this.win.isVisible()
  }

  get webContents(): Electron.WebContents | null {
    return this.win.isDestroyed() ? null : this.win.webContents
  }

  /** The shortcut now, for the settings. */
  get shortcut(): QuickShortcut {
    return { key: this.key, state: this.state }
  }

  /**
   * This computer's shortcut (null – off), registered again only when it changes (or when Windows refused it before):
   * Windows refusing it (another program holds it) – `taken` (D402: „Skrót zajęty przez inny program”).
   */
  setShortcut(key: string | null): QuickShortcut {
    if (this.destroyed || (key === this.key && this.state !== 'taken')) return this.shortcut
    const was = `${this.key}|${this.state}`
    this.stop()
    this.key = key
    if (!key) this.state = 'off'
    else {
      let ok = false
      let error: string | null = null
      try {
        ok = this.shortcuts.register(key, () => this.raise())
      } catch (e) {
        error = `skrót ${key}: ${e instanceof Error ? e.message : String(e)}`
      }
      if (error && error !== this.lastError) this.d.log(error)
      this.lastError = error
      this.registered = ok
      this.state = ok ? 'on' : 'taken'
    }
    // Said once per change: a retry that finds it still taken writes no line and tells no window (T759).
    if (was === `${this.key}|${this.state}`) return this.shortcut
    this.d.log(this.state === 'on' ? `skrót szybkiego zapisu: ${key}` : this.state === 'taken' ? `skrót szybkiego zapisu ${key} zajęty przez inny program` : 'skrót szybkiego zapisu wyłączony')
    this.d.changed(this.shortcut)
    return this.shortcut
  }

  /**
   * A shortcut Windows refused (`taken`) registered again – the other program may have let it go (every
   * `QUICK_RETRY_MS`, when the settings ask for its state, T759); one that works or is off – nothing changes.
   */
  retry(): QuickShortcut {
    return this.state === 'taken' ? this.setShortcut(this.key) : this.shortcut
  }

  /** The shortcut given back to Windows (the quit, a change of it). */
  stop(): void {
    if (this.registered && this.key) this.shortcuts.unregister(this.key)
    this.registered = false
  }

  /**
   * Your shortcut pressed (the only caller – the global shortcut's callback): over every window with the focus, in the
   * upper third of the monitor with the cursor, its field taking the keys. Windows lets the app that got the shortcut
   * take the foreground.
   */
  private raise(): void {
    if (this.win.isDestroyed()) return
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const z = this.d.zoom()
    const width = Math.min(Math.round(QUICK_SIZE.width * z), area.width - 16)
    const height = Math.round(QUICK_SIZE.height * z)
    this.win.setBounds({ x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + area.height / 3 - height / 2), width, height })
    this.win.setContentProtection(this.d.hideFromCapture())
    this.win.setAlwaysOnTop(true, 'floating')
    this.win.show()
    this.win.focus()
    this.win.webContents.send(CH.onQuickShown)
    this.d.log('okienko „Do skrzynki” otwarte skrótem')
  }

  /** Hidden – and no longer on top (Esc, saved, the focus gone). */
  close(why: string): void {
    if (!this.isOpen) return
    this.win.setAlwaysOnTop(false)
    this.win.hide()
    this.d.log(`okienko „Do skrzynki” zamknięte: ${why}`)
  }

  destroy(): void {
    this.stop()
    this.destroyed = true
    if (!this.win.isDestroyed()) this.win.destroy()
  }
}
