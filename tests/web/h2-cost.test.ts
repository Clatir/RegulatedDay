/**
 * D339 (1.0.4): the cost of a start in the block's panel says the same as the bar's – one function in `shared`, and the
 * panel no longer words it by itself; D344: „Wersja aplikacji” in the settings is „<numer> · zainstalowana”.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { costText } from '@shared/costText'

describe('koszt startu (D339)', () => {
  it('„przedłużenie · −N min puli”, „przekroczenie”, przy pustej puli „pora snu +N min”', () => {
    expect(costText('Start', { minutes: 31, overrun: false, bedtime: false })).toBe('Start: przedłużenie · −31 min puli')
    expect(costText('Przedłuż +15', { minutes: 15, overrun: true, bedtime: false })).toBe('Przedłuż +15: przekroczenie · −15 min puli')
    expect(costText('Start', { minutes: 20, overrun: false, bedtime: true })).toBe('Start: przedłużenie · pora snu +20 min')
  })

  it('panel bloku i pasek używają tej funkcji (nie własnego tekstu)', () => {
    const page = readFileSync('src/renderer/features/today/TodayPage.tsx', 'utf8')
    const bar = readFileSync('src/main/widget.ts', 'utf8')
    expect(page).toContain('costText(')
    expect(page).not.toContain('z puli projektów')
    expect(bar).toContain("from '@shared/costText'")
    expect(bar).not.toMatch(/const costText/)
  })
})

describe('wersja w Ustawieniach (D344)', () => {
  it('„<numer> · zainstalowana”: numer z tego samego źródła co „Wersja” w Aktualizacjach', async () => {
    const { appVersionText } = await import('@renderer/features/settings/SettingsPage')
    expect(appVersionText({ version: '1.0.4', identity: 'production' })).toBe('1.0.4 · zainstalowana')
    expect(appVersionText({ version: '1.0.4', identity: 'test' })).toBe('1.0.4 · testowa (Regulated Day Test)')
    expect(appVersionText({ version: '1.0.4', identity: 'development' })).toBe('1.0.4 · deweloperska (Regulated Day Dev)')
    expect(appVersionText(null)).toBe('')
    const page = readFileSync('src/renderer/features/settings/SettingsPage.tsx', 'utf8')
    expect(page).toContain('{info?.version ??')
    expect(page).toContain('appVersionText(info)')
  })
})
