/**
 * The desktop bar's „×” (D559, T1975): hidden until „Pokaż pasek pulpitu” in the icon's menu, with Shift the app ends –
 * only from the bar's own window; another window changes nothing.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, shell: {} }))

const { barCloseOf } = await import('../../src/main/windows/desktopBar')

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
