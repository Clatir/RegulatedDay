/**
 * The window's pieces of 0.22.0 without a DOM: the calendar marks the holidays of Great Britain (A7-18), a copy of a
 * day to a day that already ran warns first (D330).
 */
import { describe, expect, it } from 'vitest'
import { holidayMarks } from '@renderer/features/calendar/dayTypes'
import { copyTargets } from '@renderer/features/today/MoveDialogs'
import { pulseClass } from '@renderer/widget/Bar'
import { DEFAULT_MACHINE_PREFS, machinePrefsFrom } from '@shared/machine'

describe('pulsowanie paska przy 5 i 0 min (D225)', () => {
  it('domyślnie wyłączone, ustawienie tego komputera', () => {
    expect(DEFAULT_MACHINE_PREFS.barPulse).toBe(false)
    expect(machinePrefsFrom({ barPulse: true }).barPulse).toBe(true)
    expect(machinePrefsFrom({ barPulse: 'tak' }).barPulse).toBe(false)
  })

  it('tylko pasek pulpitu, przy 5 i 0 min, każdy krok swoją klasą; nie w trybie ciszy', () => {
    expect(pulseClass('five', true, 'desktop', false)).toBe('rd-bar-pulse-five')
    expect(pulseClass('zero', true, 'desktop', false)).toBe('rd-bar-pulse-zero')
    expect(pulseClass('warm', true, 'desktop', false)).toBeNull()
    expect(pulseClass('five', false, 'desktop', false)).toBeNull()
    expect(pulseClass('five', true, 'panel', false)).toBeNull()
    expect(pulseClass('five', true, 'main', false)).toBeNull()
    expect(pulseClass('zero', true, 'desktop', true)).toBeNull()
  })
})

describe('kopia dnia na dzień, który już trwał (D330)', () => {
  it('dziś i dni minione to dni, które trwały; dzień kopiowany nigdy nie jest celem', () => {
    const sel = new Set(['2026-10-30', '2026-10-27', '2026-10-28', '2026-10-29'])
    expect(copyTargets(sel, '2026-10-29', '2026-10-28')).toEqual({ targets: ['2026-10-27', '2026-10-28', '2026-10-30'], began: ['2026-10-27', '2026-10-28'], ahead: ['2026-10-30'] })
  })

  it('same dni po dziś – bez ostrzeżenia', () => {
    expect(copyTargets(new Set(['2026-11-02', '2026-11-01']), '2026-10-28', '2026-10-28').began).toEqual([])
  })
})

describe('święta w kalendarzu (D295, A7-18)', () => {
  it('święto Wielkiej Brytanii ma swoje oznaczenie i nazwę w podpowiedzi', () => {
    const summer = holidayMarks('2027-08-30')
    expect(summer.marks).toEqual(['święto UK'])
    expect(summer.names.join(' ')).toMatch(/bank holiday/i)
  })

  it('skrócona sesja w Londynie, gdy żaden rynek kraju nie jest zamknięty; zwykły dzień bez oznaczeń', () => {
    expect(holidayMarks('2026-12-24').marks).toContain('skrócona sesja UK')
    expect(holidayMarks('2027-09-15')).toEqual({ marks: [], names: [] })
  })

  it('dzień świąt kilku krajów naraz – każde oznaczenie, nazwy bez powtórzeń', () => {
    const christmas = holidayMarks('2026-12-25')
    expect(christmas.marks).toEqual(['święto', 'święto USA', 'święto UK'])
    expect(new Set(christmas.names).size).toBe(christmas.names.length)
  })
})
