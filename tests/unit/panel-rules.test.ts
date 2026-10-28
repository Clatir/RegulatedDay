/**
 * The icon's panel and the bar's drag (fixes of 0.18.0 without a window): a panel kept on top never closes by losing the
 * focus (A4-08), a drag whose end never came holds the bar's layout long enough for a hand choosing its place (A4-12).
 */
import { describe, expect, it, vi } from 'vitest'
import { DRAG_HOLD_MS, dragHolds } from '@shared/placement'

vi.mock('electron', () => ({ BrowserWindow: class {}, screen: {} }))

const { closesOnBlur, PANEL_GRACE_MS } = await import('../../src/main/windows/iconPanel')

describe('panel ikony przy utracie fokusu', () => {
  it('bez pomocnika zamyka się po 500 ms; „na wierzchu” z panelem – nigdy (A4-08)', () => {
    expect(closesOnBlur({ helperRunning: false, stayOnTop: false, sinceOpenMs: PANEL_GRACE_MS + 1 })).toBe(true)
    expect(closesOnBlur({ helperRunning: false, stayOnTop: false, sinceOpenMs: PANEL_GRACE_MS })).toBe(false)
    expect(closesOnBlur({ helperRunning: false, stayOnTop: true, sinceOpenMs: 60_000 })).toBe(false)
    // With the helper the change of the foreground window decides.
    expect(closesOnBlur({ helperRunning: true, stayOnTop: false, sinceOpenMs: 60_000 })).toBe(false)
  })
})

describe('przeciąganie paska bez końca', () => {
  it('trzyma układ paska co najmniej minutę od ostatniego ruchu, potem puszcza (A4-12)', () => {
    expect(dragHolds(0, 60_000)).toBe(true)
    expect(dragHolds(0, DRAG_HOLD_MS - 1)).toBe(true)
    expect(dragHolds(0, DRAG_HOLD_MS)).toBe(false)
  })
})
