/**
 * The window „Do skrzynki” (D385, D402) with Electron faked: hidden at the start and never shown by anything but the
 * shortcut's callback – then over the other windows with the focus; hidden (Esc, saved, the focus gone) it is no longer on
 * top. The shortcut: registered once, again on a change, off – given back; refused by Windows – „zajęty”.
 */
import { describe, expect, it, vi } from 'vitest'

const calls: string[] = []
vi.mock('electron', () => {
  class BrowserWindow {
    handlers = new Map<string, (e?: { preventDefault: () => void }) => void>()
    visible = false
    onTop = false
    webContents = { setWindowOpenHandler: () => undefined, send: (ch: string) => calls.push(`send ${ch}`) }
    on(name: string, fn: (e?: { preventDefault: () => void }) => void) {
      this.handlers.set(name, fn)
    }
    isDestroyed() {
      return false
    }
    isVisible() {
      return this.visible
    }
    setBounds() {}
    setContentProtection() {}
    setAlwaysOnTop(on: boolean) {
      this.onTop = on
      calls.push(`onTop ${on}`)
    }
    show() {
      this.visible = true
      calls.push('show')
    }
    focus() {
      calls.push('focus')
    }
    hide() {
      this.visible = false
      calls.push('hide')
    }
    destroy() {}
  }
  const screen = { getCursorScreenPoint: () => ({ x: 10, y: 10 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) }
  return { BrowserWindow, screen, globalShortcut: { register: () => true, unregister: () => undefined } }
})

const { QuickWindow } = await import('../../src/main/windows/quickWindow')

function make(o: { refuse?: string[] } = {}) {
  calls.length = 0
  const pressed = new Map<string, () => void>()
  const unregistered: string[] = []
  const states: string[] = []
  const shortcuts = {
    register: (key: string, cb: () => void) => {
      if (o.refuse?.includes(key)) return false
      pressed.set(key, cb)
      return true
    },
    unregister: (key: string) => void (unregistered.push(key), pressed.delete(key))
  }
  const q = new QuickWindow('', async () => undefined, { zoom: () => 1, hideFromCapture: () => true, changed: (s) => states.push(`${s.key}:${s.state}`), log: () => undefined, shortcuts: shortcuts as never })
  const win = (q as unknown as { win: { visible: boolean; onTop: boolean; handlers: Map<string, () => void> } }).win
  return { q, win, pressed, unregistered, states }
}

describe('okienko „Do skrzynki”', () => {
  it('ukryte od startu; tylko skrót pokazuje je na wierzchu z fokusem; ukryte – już nie na wierzchu', () => {
    const { q, win, pressed } = make()
    expect([win.visible, win.onTop, q.isOpen]).toEqual([false, false, false])
    q.setShortcut('Ctrl+Alt+N')
    expect(win.visible).toBe(false)
    pressed.get('Ctrl+Alt+N')!()
    expect([win.visible, win.onTop]).toEqual([true, true])
    expect(calls).toEqual(['onTop true', 'show', 'focus', 'send rd:onQuickShown'])
    q.close('Esc')
    expect([win.visible, win.onTop]).toEqual([false, false])
    // The focus gone: hidden as well.
    pressed.get('Ctrl+Alt+N')!()
    win.handlers.get('blur')!()
    expect([win.visible, win.onTop]).toEqual([false, false])
  })

  it('skrót: zmiana rejestruje nowy i oddaje stary; wyłączony – oddany; zajęty przez inny program – stan „taken”', () => {
    const { q, pressed, unregistered, states } = make({ refuse: ['Ctrl+Alt+K'] })
    expect(q.setShortcut('Ctrl+Alt+N')).toEqual({ key: 'Ctrl+Alt+N', state: 'on' })
    // The same again: nothing registered twice.
    q.setShortcut('Ctrl+Alt+N')
    expect(states).toEqual(['Ctrl+Alt+N:on'])
    expect(q.setShortcut('Ctrl+Alt+K')).toEqual({ key: 'Ctrl+Alt+K', state: 'taken' })
    expect(unregistered).toEqual(['Ctrl+Alt+N'])
    expect([...pressed.keys()]).toEqual([])
    expect(q.setShortcut(null)).toEqual({ key: null, state: 'off' })
    // Never registered (taken): nothing to give back.
    expect(unregistered).toEqual(['Ctrl+Alt+N'])
    q.setShortcut('Ctrl+Alt+N')
    q.destroy()
    expect(unregistered).toEqual(['Ctrl+Alt+N', 'Ctrl+Alt+N'])
  })
})
