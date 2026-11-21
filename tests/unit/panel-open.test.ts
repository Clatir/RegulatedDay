/**
 * The icon's panel tells its page every opening with the line a click opened it for, and whether it was hidden before
 * (`reopened`, C8): only a new opening folds what stayed unfolded – a notification's click or a test asking it again while
 * it is open never folds what you have unfolded or typed now (Electron faked).
 */
import { describe, expect, it, vi } from 'vitest'

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
  return { BrowserWindow, screen: { getCursorScreenPoint: () => ({ x: 10, y: 10 }) } }
})

const { IconPanel } = await import('../../src/main/windows/iconPanel')

describe('otwarcie panelu ikony mówi stronie, czy był schowany (C8)', () => {
  it('schowany – nowe otwarcie; otwarty – to samo okno, nic się nie zwija; po schowaniu – znowu nowe', () => {
    sent.length = 0
    const panel = new IconPanel('', async () => undefined, { place: () => ({ x: 0, y: 0, width: 480, height: 300 }), helperRunning: () => true, hideFromCapture: () => true, log: () => undefined })
    panel.open(null)
    panel.open({ line: 'next:2026-11-21:b1:0', day: '2026-11-21' })
    panel.close('Esc')
    panel.open(null)
    expect(sent).toEqual([
      ['rd:panelTarget', { target: null, reopened: true }],
      ['rd:panelTarget', { target: { line: 'next:2026-11-21:b1:0', day: '2026-11-21' }, reopened: false }],
      ['rd:panelTarget', { target: null, reopened: true }]
    ])
  })
})
