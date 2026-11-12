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

const { QuickWindow, shortcutOf, touchesShortcut } = await import('../../src/main/windows/quickWindow')

function make(o: { refuse?: string[]; throws?: string[]; logs?: string[]; registered?: string[] } = {}) {
  calls.length = 0
  const pressed = new Map<string, () => void>()
  const unregistered: string[] = []
  const states: string[] = []
  const shortcuts = {
    register: (key: string, cb: () => void) => {
      o.registered?.push(key)
      if (o.throws?.includes(key)) throw new Error('nie można zarejestrować')
      if (o.refuse?.includes(key)) return false
      pressed.set(key, cb)
      return true
    },
    unregister: (key: string) => void (unregistered.push(key), pressed.delete(key))
  }
  const q = new QuickWindow('', async () => undefined, { zoom: () => 1, hideFromCapture: () => true, changed: (s) => states.push(`${s.key}:${s.state}`), log: (m) => void o.logs?.push(m), shortcuts: shortcuts as never })
  const win = (q as unknown as { win: { visible: boolean; onTop: boolean; handlers: Map<string, () => void> } }).win
  return { q, win, pressed, unregistered, states }
}

describe('okienko „Do skrzynki”', () => {
  it('ukryte od startu; tylko skrót pokazuje je na wierzchu z fokusem; ukryte – już nie na wierzchu', () => {
    const { q, win, pressed } = make()
    expect([win.visible, win.onTop, q.isOpen]).toEqual([false, false, false])
    q.setShortcut('Super+Alt+N')
    expect(win.visible).toBe(false)
    pressed.get('Super+Alt+N')!()
    expect([win.visible, win.onTop]).toEqual([true, true])
    expect(calls).toEqual(['onTop true', 'show', 'focus', 'send rd:onQuickShown'])
    q.close('Esc')
    expect([win.visible, win.onTop]).toEqual([false, false])
    // The focus gone: hidden as well.
    pressed.get('Super+Alt+N')!()
    win.handlers.get('blur')!()
    expect([win.visible, win.onTop]).toEqual([false, false])
  })

  it('skrót: zmiana rejestruje nowy i oddaje stary; wyłączony – oddany; zajęty przez inny program – stan „taken”', () => {
    const { q, pressed, unregistered, states } = make({ refuse: ['Super+Alt+K'] })
    expect(q.setShortcut('Super+Alt+N')).toEqual({ key: 'Super+Alt+N', state: 'on' })
    // The same again: nothing registered twice.
    q.setShortcut('Super+Alt+N')
    expect(states).toEqual(['Super+Alt+N:on'])
    expect(q.setShortcut('Super+Alt+K')).toEqual({ key: 'Super+Alt+K', state: 'taken' })
    expect(unregistered).toEqual(['Super+Alt+N'])
    expect([...pressed.keys()]).toEqual([])
    expect(q.setShortcut(null)).toEqual({ key: null, state: 'off' })
    // Never registered (taken): nothing to give back.
    expect(unregistered).toEqual(['Super+Alt+N'])
    q.setShortcut('Super+Alt+N')
    q.destroy()
    expect(unregistered).toEqual(['Super+Alt+N', 'Super+Alt+N'])
  })
})

describe('skrót zajęty – ponawianie (T759)', () => {
  it('zajęty: retry() rejestruje ponownie, gdy inny program go zwolnił; włączony – retry() niczego nie rusza', () => {
    const refuse = ['Super+Alt+N']
    const { q, pressed, states } = make({ refuse })
    expect(q.setShortcut('Super+Alt+N').state).toBe('taken')
    expect(q.retry().state).toBe('taken')
    refuse.length = 0
    expect(q.retry()).toEqual({ key: 'Super+Alt+N', state: 'on' })
    expect([...pressed.keys()]).toEqual(['Super+Alt+N'])
    expect(q.retry().state).toBe('on')
    // Still taken on a retry: nothing said again (no line every minute).
    expect(states).toEqual(['Super+Alt+N:taken', 'Super+Alt+N:on'])
  })

  it('zmiana ustawień: skrót z przełącznika i klucza; ponownie wpisany ten sam klucz albo przełącznik – ponowienie', () => {
    expect(shortcutOf({ quickOn: true, quickKey: 'Super+Alt+F11' })).toBe('Super+Alt+F11')
    expect(shortcutOf({ quickOn: false, quickKey: 'Super+Alt+F11' })).toBeNull()
    expect(touchesShortcut({ quickKey: 'Super+Alt+N' })).toBe(true)
    expect(touchesShortcut({ quickOn: true })).toBe(true)
    expect(touchesShortcut({ zoom: 1.1 })).toBe(false)
    expect(touchesShortcut(null)).toBe(false)
  })
})

describe('ponawianie bez szumu i nic po zamknięciu (T767)', () => {
  it('odmowa z wyjątkiem: jedna linia logu, nie przy każdym ponowieniu', () => {
    const logs: string[] = []
    const { q } = make({ throws: ['Super+Alt+N'], logs })
    q.setShortcut('Super+Alt+N')
    q.retry()
    q.retry()
    expect(logs.filter((l) => l.includes('nie można zarejestrować'))).toHaveLength(1)
    expect(logs.filter((l) => l.includes('zajęty'))).toHaveLength(1)
  })

  it('po destroy() ponowienie niczego nie rejestruje', () => {
    const registered: string[] = []
    const { q } = make({ refuse: ['Super+Alt+N'], registered })
    q.setShortcut('Super+Alt+N')
    q.destroy()
    q.retry()
    q.setShortcut('Super+Alt+K')
    expect(registered).toEqual(['Super+Alt+N'])
  })
})
