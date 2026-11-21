/**
 * The desktop bar's „×” (D559, T1975): hidden until „Pasek pulpitu” in the icon's menu (D564 P16), the panel, the settings, the
 * main window going or the next start; with Shift the app ends – only from the bar's own window; another window changes nothing.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, shell: {} }))

const { barBackWithMain, barCloseOf, barFromPanel, barWant, switchesBarOn } = await import('../../src/main/windows/desktopBar')

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
    expect(barFromPanel('hideBar', 'panel', { closed: false, desktopBar: true })).toMatchObject({ closed: true, switchOn: false })
    // Off in the settings: nothing to hide – the state stays as it is.
    expect(barFromPanel('hideBar', 'panel', { closed: false, desktopBar: false })).toMatchObject({ closed: false, switchOn: false })
  })

  it('„pokaż” – schowany „×” wraca; wyłączony w ustawieniach – włącza go na tym komputerze', () => {
    expect(barFromPanel('showBar', 'panel', { closed: true, desktopBar: true })).toMatchObject({ closed: false, switchOn: false })
    expect(barFromPanel('showBar', 'panel', { closed: false, desktopBar: false })).toMatchObject({ closed: false, switchOn: true })
    expect(barFromPanel('showBar', 'panel', { closed: true, desktopBar: false })).toMatchObject({ closed: false, switchOn: true })
    expect(barFromPanel('showBar', 'panel', { closed: true, desktopBar: true }).why).toContain('panel')
  })

  it('tylko z okna panelu – inne okno niczego nie zmienia (wpis „odmowa” w logu)', () => {
    for (const from of ['main', 'bar', 'quick', 'sound'])
      for (const want of ['showBar', 'hideBar'] as const) {
        const r = barFromPanel(want, from, { closed: true, desktopBar: false })
        expect(r, `${want} ${from}`).toMatchObject({ ok: false, closed: true, switchOn: false })
        expect(r.why).toContain('odmowa')
      }
    expect(barFromPanel('hideBar', 'panel', { closed: false, desktopBar: true }).ok).toBe(true)
  })
})

describe('„Pasek pulpitu” w menu ikony (D564 P16) – ta sama reguła co stopka panelu', () => {
  it('z ptaszkiem – chowa jak „×”; bez ptaszka – schowany wraca, wyłączony włącza się na tym komputerze', () => {
    expect(barWant('hideBar', { closed: false, desktopBar: true }, 'z menu ikony')).toEqual({ closed: true, switchOn: false, why: 'pasek pulpitu schowany z menu ikony' })
    expect(barWant('showBar', { closed: true, desktopBar: true }, 'z menu ikony')).toEqual({ closed: false, switchOn: false, why: 'pasek pulpitu pokazany z menu ikony' })
    expect(barWant('showBar', { closed: false, desktopBar: false }, 'z menu ikony')).toEqual({ closed: false, switchOn: true, why: 'pasek pulpitu włączony i pokazany z menu ikony' })
    expect(barWant('hideBar', { closed: false, desktopBar: false }, 'z menu ikony')).toMatchObject({ closed: false, switchOn: false })
  })

  it('panel mówi w logu „z panelu ikony” jak przed P16', () => {
    expect(barFromPanel('showBar', 'panel', { closed: false, desktopBar: false }).why).toBe('pasek pulpitu włączony i pokazany z panelu ikony')
    expect(barFromPanel('hideBar', 'panel', { closed: false, desktopBar: true }).why).toBe('pasek pulpitu schowany z panelu ikony')
  })
})

describe('włączenie paska w ustawieniach pokazuje pasek schowany „×” (D564 P16, C3)', () => {
  it('przełącznik „Pasek pulpitu” na „włączony” – także gdy już był włączony', () => {
    expect(switchesBarOn({ desktopBar: true })).toBe(true)
    expect(switchesBarOn({ desktopBar: true, zoom: 1.1 })).toBe(true)
  })

  it('wyłączenie i każda inna zmiana ustawień – pasek zostaje schowany', () => {
    for (const patch of [{ desktopBar: false }, { zoom: 1.1 }, { barBackWithMain: true }, { barPlacement: null }, { desktopBar: 'true' }, null, undefined, 'desktopBar', [true]])
      expect(switchesBarOn(patch), JSON.stringify(patch)).toBe(false)
  })
})
