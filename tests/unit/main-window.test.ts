/**
 * The main window's place (A4-02, the review of 0.18.0): a window kept maximized for its first showing (a start of
 * Windows in the tray) and never shown is saved as maximized when the app quits – the next opening is maximized again.
 */
import { describe, expect, it, vi } from 'vitest'
import type { WindowPlace } from '@shared/config'

const display = { id: 1, label: 'Dell', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1, size: { width: 1920, height: 1080 } }

vi.mock('electron', () => {
  class BrowserWindow {
    handlers = new Map<string, (e: { preventDefault: () => void }) => void>()
    maximized = false
    visible = false
    webContents = { setWindowOpenHandler: () => undefined, on: () => undefined }
    constructor(public o: { x: number; y: number; width: number; height: number }) {}
    on(name: string, fn: (e: { preventDefault: () => void }) => void) {
      this.handlers.set(name, fn)
    }
    setBounds() {}
    getNormalBounds() {
      return { x: this.o.x, y: this.o.y, width: this.o.width, height: this.o.height }
    }
    isMaximized() {
      return this.maximized
    }
    isVisible() {
      return this.visible
    }
    maximize() {
      this.maximized = true
      this.visible = true
    }
    show() {
      this.visible = true
    }
    hide() {
      this.visible = false
    }
  }
  return { BrowserWindow, screen: { getPrimaryDisplay: () => display, getAllDisplays: () => [display] } }
})

const { createMainWindow, revealMainWindow } = await import('../../src/main/windows/mainWindow')

function windowWith(saved: WindowPlace, quitting: boolean) {
  const places: WindowPlace[] = []
  const win = createMainWindow({ preload: '', title: 'Regulated Day', saved, load: async () => undefined, savePlace: (p) => void places.push(p), quitting: () => quitting, externalClose: () => undefined, log: () => undefined })
  const close = () => (win as unknown as { handlers: Map<string, (e: { preventDefault: () => void }) => void> }).handlers.get('close')!({ preventDefault: () => undefined })
  return { win, places, close }
}

describe('miejsce okna głównego przy starcie w zasobniku', () => {
  it('zmaksymalizowane, nigdy niepokazane: wyjście zapisuje je jako zmaksymalizowane', () => {
    const { places, close } = windowWith({ x: 100, y: 100, width: 1200, height: 800, maximized: true }, true)
    close()
    expect(places.at(-1)).toMatchObject({ maximized: true, width: 1200 })
  })

  it('pokazane i przywrócone do zwykłego rozmiaru: zapisuje się bez maksymalizacji', () => {
    const { win, places, close } = windowWith({ x: 100, y: 100, width: 1200, height: 800, maximized: true }, true)
    revealMainWindow(win)
    ;(win as unknown as { maximized: boolean }).maximized = false
    close()
    expect(places.at(-1)).toMatchObject({ maximized: false })
  })
})
