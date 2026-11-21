/**
 * The desktop bar's „×” (D559, T1975): hidden until „Pokaż pasek pulpitu” in the icon's menu, with Shift the app ends –
 * only from the bar's own window; another window changes nothing.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, shell: {} }))

const { barBackWithMain, barCloseOf, barFromPanel } = await import('../../src/main/windows/desktopBar')

describe('„×” paska pulpitu', () => {
  it('„×” chowa pasek, z Shift kończy aplikację', () => {
    expect(barCloseOf('x', 'bar')).toMatchObject({ hide: true, quit: false })
    expect(barCloseOf('quit', 'bar')).toMatchObject({ hide: false, quit: true })
  })

  it('inne okno ani nieznane polecenie niczego nie zmienia', () => {
    for (const from of ['main', 'panel', 'quick', 'sound']) {
      expect(barCloseOf('x', from)).toMatchObject({ hide: false, quit: false })
      expect(barCloseOf('quit', from)).toMatchObject({ hide: false, quit: false })
      expect(barCloseOf('x', from).why).toContain('odmowa')
    }
    expect(barCloseOf(undefined, 'bar')).toMatchObject({ hide: false, quit: false })
    expect(barCloseOf('close', 'bar')).toMatchObject({ hide: false, quit: false })
  })
})

describe('pasek schowany „×” wraca z oknem głównym (D560)', () => {
  it('tylko schowany, tylko przy włączonym przełączniku i pasku, nigdy przy wyjściu', () => {
    expect(barBackWithMain(true, true, true, false)).toBe(true)
    expect(barBackWithMain(false, true, true, false)).toBe(false)
    expect(barBackWithMain(true, false, true, false)).toBe(false)
    expect(barBackWithMain(true, true, false, false)).toBe(false)
    expect(barBackWithMain(true, true, true, true)).toBe(false)
  })
})

describe('„▣ Pasek pulpitu: pokaż / schowaj” w stopce panelu (D564 P13)', () => {
  it('„schowaj” – jak „×” paska (do „Pokaż”, ustawień, okna głównego albo restartu); bez włączania czegokolwiek', () => {
    expect(barFromPanel('hideBar', { closed: false, desktopBar: true })).toMatchObject({ closed: true, switchOn: false })
    // Off in the settings: nothing to hide – the state stays as it is.
    expect(barFromPanel('hideBar', { closed: false, desktopBar: false })).toMatchObject({ closed: false, switchOn: false })
  })

  it('„pokaż” – schowany „×” wraca; wyłączony w ustawieniach – włącza go na tym komputerze', () => {
    expect(barFromPanel('showBar', { closed: true, desktopBar: true })).toMatchObject({ closed: false, switchOn: false })
    expect(barFromPanel('showBar', { closed: false, desktopBar: false })).toMatchObject({ closed: false, switchOn: true })
    expect(barFromPanel('showBar', { closed: true, desktopBar: false })).toMatchObject({ closed: false, switchOn: true })
    expect(barFromPanel('showBar', { closed: true, desktopBar: true }).why).toContain('panel')
  })
})

