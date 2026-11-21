/**
 * The icon's panel tells its page every opening with the line a click opened it for, and whether it was hidden before
 * (`reopened`, C8): only a new opening folds what stayed unfolded – a notification's click or a test asking it again while
 * it is open never folds what you have unfolded or typed now, and the panel keeps knowing it is unfolded (its 60 s do not
 * run then). Electron faked, fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sent: Array<[string, unknown]> = []
vi.mock('electron', () => {
  class BrowserWindow {
    visible = false
    webContents = { setWindowOpenHandler() {}, on() {}, send: (ch: string, payload: unknown) => void sent.push([ch, payload]) }
    on() {}
    isDestroyed() {
      return false
    }
    isVisible() {
      return this.visible
    }
    getBounds() {
      return { x: 1000, y: 600, width: 480, height: 300 }
    }
    setBounds() {}
    setContentProtection() {}
    setAlwaysOnTop() {}
    show() {
      this.visible = true
    }
    focus() {}
    hide() {
      this.visible = false
    }
  }
  // The cursor outside the panel: its 60 s untouched run unless something is unfolded.
  return { BrowserWindow, screen: { getCursorScreenPoint: () => ({ x: 10, y: 10 }) } }
})

const { IconPanel, PANEL_IDLE_MS } = await import('../../src/main/windows/iconPanel')

let panel: InstanceType<typeof IconPanel> | null = null
beforeEach(() => {
  vi.useFakeTimers()
  sent.length = 0
  panel = new IconPanel('', async () => undefined, { place: () => ({ x: 1000, y: 600, width: 480, height: 300 }), helperRunning: () => true, hideFromCapture: () => true, log: () => undefined })
})
afterEach(() => {
  // Closed: its timer of 60 s goes with it.
  panel?.close('koniec testu')
  panel = null
  vi.useRealTimers()
})

describe('otwarcie panelu ikony mówi stronie, czy był schowany (C8)', () => {
  it('schowany – nowe otwarcie; otwarty – to samo okno, nic się nie zwija; po schowaniu – znowu nowe', () => {
    panel!.open(null)
    panel!.open({ line: 'next:2026-11-21:b1:0', day: '2026-11-21' })
    panel!.close('Esc')
    panel!.open(null)
    expect(sent).toEqual([
      ['rd:panelTarget', { target: null, reopened: true }],
      ['rd:panelTarget', { target: { line: 'next:2026-11-21:b1:0', day: '2026-11-21' }, reopened: false }],
      ['rd:panelTarget', { target: null, reopened: true }]
    ])
  })

  it('poproszony przy otwartym z rozwiniętym „Przedłuż” – dalej wie, że jest rozwinięty: 60 s go nie zamyka; nowe otwarcie zaczyna od zwiniętego', () => {
    panel!.open(null)
    panel!.layout(300, 1, true)
    panel!.open({ line: 'next:2026-11-21:b1:0', day: '2026-11-21' })
    vi.advanceTimersByTime(PANEL_IDLE_MS + 5_000)
    expect(panel!.isOpen).toBe(true)
    // Hidden and opened anew: the page folds, the panel counts its 60 s again.
    panel!.close('Esc')
    panel!.open(null)
    vi.advanceTimersByTime(PANEL_IDLE_MS + 5_000)
    expect(panel!.isOpen).toBe(false)
  })
})
