/**
 * The window of sound is hidden and nobody can close it: a WM_CLOSE to it comes from outside – taskkill without /F
 * sends it to one window of the app only (the topmost), and when nothing is shown that is this window (E4a.13, T396).
 * The app ends then; it never goes on without its sound. At the app's quit the window closes for real.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => {
  class BrowserWindow {
    handlers = new Map<string, (e: { preventDefault: () => void }) => void>()
    webContents = { setWindowOpenHandler: () => undefined, on: () => undefined, send: () => undefined }
    on(name: string, fn: (e: { preventDefault: () => void }) => void) {
      this.handlers.set(name, fn)
    }
    isDestroyed() {
      return false
    }
    destroy() {}
  }
  return { BrowserWindow }
})

const { SoundWindow } = await import('../../src/main/windows/soundWindow')

function closeOf(sound: InstanceType<typeof SoundWindow>): { prevented: boolean } {
  const win = (sound as unknown as { win: { handlers: Map<string, (e: { preventDefault: () => void }) => void> } }).win
  const handler = win.handlers.get('close')
  expect(handler).toBeDefined()
  const r = { prevented: false }
  handler!({ preventDefault: () => void (r.prevented = true) })
  return r
}

describe('okno dźwięku a zamknięcie z zewnątrz', () => {
  it('zamknięte z zewnątrz, gdy aplikacja działa: zostaje i aplikacja kończy pracę', () => {
    const sound = new SoundWindow('', async () => undefined)
    const outside = vi.fn()
    sound.onExternalClose = outside
    expect(closeOf(sound).prevented).toBe(true)
    expect(outside).toHaveBeenCalledTimes(1)
  })

  it('przy wyjściu aplikacji zamyka się naprawdę, bez ponownego „kończę pracę”', () => {
    const sound = new SoundWindow('', async () => undefined)
    const outside = vi.fn()
    sound.onExternalClose = outside
    sound.quitting = true
    expect(closeOf(sound).prevented).toBe(false)
    expect(outside).not.toHaveBeenCalled()
  })
})
