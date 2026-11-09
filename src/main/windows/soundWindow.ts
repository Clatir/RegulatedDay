/**
 * The window of sound (spec „Widget”): hidden, never shown – it only plays the bar's quiet tones at 5 and 0 min when the
 * sound is on (off by default). No block of autoplay (also after a reload without a click), no throttling in the
 * background. Never destroyed while the app runs: nobody can close it, so a close is one from outside – taskkill without
 * /F sends its WM_CLOSE to one window of the app only, this one when nothing is shown – and the app ends (T396, E4a.13).
 */
import { BrowserWindow } from 'electron'

export class SoundWindow {
  private readonly win: BrowserWindow
  /** The app quits: the window may close for real. */
  quitting = false
  /** Called when something outside closes the window (an installer's taskkill): the app quits. */
  onExternalClose: (() => void) | null = null

  constructor(preload: string, load: (win: BrowserWindow) => Promise<void>) {
    this.win = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      focusable: false,
      title: 'Regulated Day – dźwięk',
      webPreferences: {
        preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
        additionalArguments: ['--rd-view=sound']
      }
    })
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    // Its own title, as every window (not the page's „Regulated Day”): a list of the app's windows tells it apart.
    this.win.on('page-title-updated', (e) => e.preventDefault())
    this.win.on('close', (e) => {
      if (this.quitting) return
      e.preventDefault()
      this.onExternalClose?.()
    })
    void load(this.win)
  }

  play(kind: 'five' | 'zero', volume: number): void {
    if (!this.win.isDestroyed()) this.win.webContents.send('rd:sound', { kind, volume })
  }

  destroy(): void {
    if (!this.win.isDestroyed()) this.win.destroy()
  }
}
