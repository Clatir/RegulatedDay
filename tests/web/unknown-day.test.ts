/**
 * D343 (1.0.5, E8b.1): a day that cannot be read now and whose earlier version the app does not know takes no change
 * (there is nothing to lay it on), so the window never promises „nowe zmiany poczekają”: „zmiany tego dnia zapiszesz, gdy
 * da się go odczytać”. A day as last read with the data folder away takes changes – they wait in the queue (`dayUsable`).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dayUsable } from '@renderer/store/day'

describe('dzień bez znanej wersji (D343)', () => {
  it('„Dziś”: „zmiany tego dnia zapiszesz, gdy da się go odczytać”, bez „nowe zmiany poczekają”', () => {
    const page = readFileSync('src/renderer/features/today/TodayPage.tsx', 'utf8')
    expect(page).toContain('zmiany tego dnia zapiszesz, gdy da się go odczytać')
    expect(page).not.toContain('nowe zmiany poczekają')
  })

  it('dzień użyteczny dla zmiany: pełny albo znany przy niedostępnym folderze, nigdy z nieznanym plikiem (E8b.1)', () => {
    expect(dayUsable({ complete: true, unknown: false, away: false })).toBe(true)
    expect(dayUsable({ complete: false, unknown: false, away: true })).toBe(true)
    expect(dayUsable({ complete: false, unknown: false, away: false })).toBe(false)
    expect(dayUsable({ complete: false, unknown: true, away: false })).toBe(false)
    // The window's changes of a day ask the same (the wake of today, „od dziś”, „Wstałeś później?” seen).
    for (const f of ['features/today/dayActions.ts', 'features/settings/settingsStore.ts', 'features/today/TodayPage.tsx']) {
      const text = readFileSync(`src/renderer/${f}`, 'utf8')
      expect(text).toContain('dayUsable(')
      expect(text).not.toMatch(/data\.complete \|\| data\.unknown|data\.unknown \|\| !data\.complete|lateShown && model\.data\.complete/)
    }
  })
})
