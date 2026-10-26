/**
 * The window of sound (spec „Widget”): hidden, never shown – it only plays the bar's quiet tones at 5 and 0 min when the
 * sound is on (off by default). No block of autoplay (also after a reload without a click), no throttling in the
 * background. Never destroyed while the app runs.
 */
import { BrowserWindow } from 'electron'

export class SoundWindow {
  private readonly win: BrowserWindow

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
    void load(this.win)
  }

  play(kind: 'five' | 'zero', volume: number): void {
    if (!this.win.isDestroyed()) this.win.webContents.send('rd:sound', { kind, volume })
  }

  destroy(): void {
    if (!this.win.isDestroyed()) this.win.destroy()
  }
}
