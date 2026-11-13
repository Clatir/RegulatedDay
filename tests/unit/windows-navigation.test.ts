/**
 * Every window of the app stays on its own page (T663, T755) – the desktop bar, the icon's panel and the window of sound as
 * the main window and „Do skrzynki”: a file or a link dropped on it, a link clicked in it never loads there, no window
 * opens from it (Electron faked).
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = {
      open: undefined as undefined | (() => { action: string }),
      navigate: undefined as undefined | ((e: { preventDefault: () => void }, url: string) => void),
      setWindowOpenHandler(fn: () => { action: string }) {
        this.open = fn
      },
      on(name: string, fn: (e: { preventDefault: () => void }, url: string) => void) {
        if (name === 'will-navigate') this.navigate = fn
      },
      send: () => undefined
    }
    on() {}
    isDestroyed() {
      return false
    }
    isVisible() {
      return false
    }
    destroy() {}
  }
  return { BrowserWindow, screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }) } }
})

const { DesktopBar } = await import('../../src/main/windows/desktopBar')
const { IconPanel } = await import('../../src/main/windows/iconPanel')
const { SoundWindow } = await import('../../src/main/windows/soundWindow')

type Contents = { open?: () => { action: string }; navigate?: (e: { preventDefault: () => void }, url: string) => void }
const contentsOf = (w: unknown): Contents => (w as { win: { webContents: Contents } }).win.webContents

describe('okna paska, panelu i dźwięku nie nawigują i nie otwierają okien', () => {
  const load = async () => undefined
  const windows = {
    'pasek pulpitu': () => new DesktopBar('', load),
    'panel ikony': () => new IconPanel('', load, { place: () => ({ x: 0, y: 0, width: 300, height: 300 }), helperRunning: () => true, hideFromCapture: () => true, log: () => undefined }),
    'okno dźwięku': () => new SoundWindow('', load)
  }
  for (const [name, make] of Object.entries(windows)) {
    it(`${name}: przeciągnięty plik albo link nie wczytuje się w oknie, nowe okno odrzucone`, () => {
      const wc = contentsOf(make())
      expect(wc.navigate, name).toBeDefined()
      for (const url of ['https://example.com/', 'file:///C:/Users/x/plik.pdf']) {
        const e = { preventDefault: vi.fn() }
        wc.navigate!(e, url)
        expect(e.preventDefault, `${name}: ${url}`).toHaveBeenCalled()
      }
      expect(wc.open!()).toEqual({ action: 'deny' })
    })
  }
})

describe('adres serwera deweloperskiego – po pochodzeniu, nie po początku tekstu (przegląd 3)', () => {
  it('tylko ten sam origin wczytuje się w oknie; „localhost:5173@evil”, inny port – zatrzymane', async () => {
    const { keepOnPage } = await import('../../src/main/windows/navigation')
    let navigate: ((e: { preventDefault: () => void }, url: string) => void) | null = null
    keepOnPage({ setWindowOpenHandler: () => undefined, on: ((name: string, fn: typeof navigate) => void (name === 'will-navigate' && (navigate = fn))) as never }, 'http://localhost:5173')
    const stopped = (url: string) => {
      const e = { preventDefault: vi.fn() }
      navigate!(e, url)
      return e.preventDefault.mock.calls.length > 0
    }
    expect(stopped('http://localhost:5173/')).toBe(false)
    expect(stopped('http://localhost:5173/index.html?view=panel')).toBe(false)
    expect(stopped('http://localhost:5173@evil.example/')).toBe(true)
    expect(stopped('http://localhost:51730/')).toBe(true)
    expect(stopped('https://localhost:5173/')).toBe(true)
    expect(stopped('nie adres')).toBe(true)
  })
})
