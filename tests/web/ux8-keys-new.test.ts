// @vitest-environment jsdom
/**
 * UX8 (D6, D563 P8, P9): the keys of the periods (PgUp, PgDn, Home – never in a field, with a modifier or under a dialog), the day Ctrl+N
 * opens its window on, and the nearest free hour there; the origin of a day of „Dziś” (D2).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { dayWakeMin, freeHourStart, newBlockDay } from '@renderer/features/week/weekNew'
import { onModal } from '@renderer/lib/escape'
import { periodKeyOf, usePeriodKeys } from '@renderer/lib/periodKeys'
import { choose } from '@renderer/features/search/paletteLogic'
import type { SearchRecord } from '@shared/search'
import { NO_MEMORY, navigate, openDay, openPick, setMemory, useUi } from '@renderer/store/ui'

const ev = (code: string, init: KeyboardEventInit = {}, target: EventTarget | null = document.body): Parameters<typeof periodKeyOf>[0] => {
  const e = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...init })
  Object.defineProperty(e, 'target', { value: target })
  return e
}

describe('periodKeyOf', () => {
  it('PgUp – poprzedni okres, PgDn – następny, Home – dziś', () => {
    expect(periodKeyOf(ev('PageUp'))).toBe('prev')
    expect(periodKeyOf(ev('PageDown'))).toBe('next')
    expect(periodKeyOf(ev('Home'))).toBe('today')
    expect(periodKeyOf(ev('ArrowLeft'))).toBeNull()
  })
  it('klawiatura numeryczna bez NumLock (kod Numpad9, klawisz PageUp) to też PgUp; z NumLock to cyfra', () => {
    expect(periodKeyOf(ev('Numpad9', { key: 'PageUp' }))).toBe('prev')
    expect(periodKeyOf(ev('Numpad3', { key: 'PageDown' }))).toBe('next')
    expect(periodKeyOf(ev('Numpad7', { key: 'Home' }))).toBe('today')
    expect(periodKeyOf(ev('Numpad9', { key: '9' }))).toBeNull()
  })
  it('nic w polu, z modyfikatorem ani pod otwartym oknem', () => {
    expect(periodKeyOf(ev('Home', {}, document.createElement('input')))).toBeNull()
    expect(periodKeyOf(ev('PageDown', {}, document.createElement('textarea')))).toBeNull()
    expect(periodKeyOf(ev('PageDown', { ctrlKey: true }))).toBeNull()
    expect(periodKeyOf(ev('PageDown', { shiftKey: true }))).toBeNull()
    expect(periodKeyOf(ev('PageDown', { altKey: true }))).toBeNull()
    const m = onModal()
    expect(periodKeyOf(ev('PageDown'))).toBeNull()
    m.off()
    expect(periodKeyOf(ev('PageDown'))).toBe('next')
  })
})

describe('usePeriodKeys', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null
  beforeAll(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })
  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })
  it('woła ruch okresu i bierze klawisz (preventDefault), wyłączone czeka', async () => {
    const go = { prev: vi.fn(), next: vi.fn(), today: vi.fn() }
    const Probe = ({ on }: { on: boolean }) => (usePeriodKeys(go, on), null)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Probe, { on: true })))
    const press = (code: string) => {
      const e = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(press('PageDown')).toBe(true)
    expect(press('PageUp')).toBe(true)
    expect(press('Home')).toBe(true)
    expect(go.next).toHaveBeenCalledTimes(1)
    expect(go.prev).toHaveBeenCalledTimes(1)
    expect(go.today).toHaveBeenCalledTimes(1)
    await act(async () => root!.render(createElement(Probe, { on: false })))
    expect(press('PageDown')).toBe(false)
    expect(go.next).toHaveBeenCalledTimes(1)
  })
})

describe('Ctrl+N w widokach okresów: dzień i godzina okna (P9)', () => {
  const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']
  it('dziś, gdy jest w widoku; inaczej pierwszy dzień od dziś; widok z samymi minionymi – nic', () => {
    expect(newBlockDay(week, '2026-11-18')).toBe('2026-11-18')
    expect(newBlockDay(week, '2026-11-10')).toBe('2026-11-16')
    expect(newBlockDay(week, '2026-11-23')).toBeNull()
  })
  it('dziś od następnego kwadransa po teraz (nie przed pobudką), omija bloki', () => {
    const where = { isToday: true, nowMin: 10 * 60 + 7, wakeMin: 7 * 60 }
    expect(freeHourStart([], where)).toBe(10 * 60 + 15)
    expect(freeHourStart([{ startMin: 10 * 60, endMin: 11 * 60 + 30 }], where)).toBe(11 * 60 + 30)
    // A gap too short for an hour is passed.
    expect(freeHourStart([{ startMin: 9 * 60, endMin: 10 * 60 + 30 }, { startMin: 11 * 60, endMin: 12 * 60 }], where)).toBe(12 * 60)
    expect(freeHourStart([{ startMin: 10 * 60, endMin: 14 * 60, background: true }], where)).toBe(10 * 60 + 15)
  })
  it('bloki zaparkowane i odwołane nie zajmują miejsca (jak w prognozie „Dziś”)', () => {
    const where = { isToday: true, nowMin: 10 * 60 + 7, wakeMin: 7 * 60 }
    expect(freeHourStart([{ startMin: 10 * 60, endMin: 12 * 60, state: 'parked' }], where)).toBe(10 * 60 + 15)
    expect(freeHourStart([{ startMin: 10 * 60, endMin: 12 * 60, state: 'cancelled' }], where)).toBe(10 * 60 + 15)
    expect(freeHourStart([{ startMin: 10 * 60, endMin: 12 * 60, state: 'planned' }], where)).toBe(12 * 60)
  })
  it('inny dzień – godzinę po pobudce; koniec doby nie wypycha bloku poza nią', () => {
    expect(freeHourStart([], { isToday: false, nowMin: 0, wakeMin: 7 * 60 })).toBe(8 * 60)
    expect(freeHourStart([{ startMin: 8 * 60, endMin: 28 * 60 }], { isToday: false, nowMin: 0, wakeMin: 7 * 60 })).toBe(28 * 60 - 60)
  })
})

describe('pobudka dnia dla okienka (Tydzień i Kalendarz – jedna funkcja)', () => {
  const s = DEFAULT_SETTINGS
  it('własna pobudka dnia wygrywa; bez niej typ dnia z pliku; bez typu (albo nieznany) typ dnia tygodnia', () => {
    expect(dayWakeMin(s, '2026-11-23', { wakeMin: 400, dayType: 'wolne' })).toBe(400)
    expect(dayWakeMin(s, '2026-11-23', { wakeMin: null, dayType: 'wolne' })).toBe(s.dayTypes.wolne.wakeMin)
    // Monday is an ordinary day, the weekend is not.
    expect(dayWakeMin(s, '2026-11-23', { wakeMin: null, dayType: null })).toBe(s.dayTypes[s.weekTypes[0]!].wakeMin)
    expect(dayWakeMin(s, '2026-11-22', { wakeMin: null, dayType: null })).toBe(s.dayTypes[s.weekTypes[6]!].wakeMin)
    expect(dayWakeMin(s, '2026-11-23', { wakeMin: null, dayType: 'nie-ma-takiego' })).toBe(s.dayTypes[s.weekTypes[0]!].wakeMin)
  })
})

describe('skąd otwarty dzień „Dziś” (D2)', () => {
  beforeEach(() => useUi.setState({ page: 'today', day: null, pick: null, from: null, memory: NO_MEMORY }))
  it('z „Tygodnia” i z kalendarza zapamiętuje ekran, w „Dziś” zostaje przez kolejne dni, menu i inne ekrany go zerują', () => {
    useUi.setState({ page: 'week' })
    openDay('2026-11-19')
    expect(useUi.getState().from).toBe('week')
    openDay('2026-11-20')
    expect(useUi.getState().from).toBe('week')
    navigate('today')
    expect(useUi.getState().from).toBeNull()
    useUi.setState({ page: 'calendar' })
    openDay('2026-12-01')
    expect(useUi.getState().from).toBe('calendar')
    useUi.setState({ page: 'week' })
    openPick({ page: 'today', day: '2026-11-19' }, { kind: 'block', id: 'a', date: '2026-11-19' })
    expect(useUi.getState().from).toBe('week')
    useUi.setState({ page: 'history' })
    openDay('2026-11-19')
    expect(useUi.getState().from).toBeNull()
  })
  it('wybór w wyszukiwarce (Ctrl K) z „Tygodnia” nie zostawia „← Tydzień” (blok, „Jutro”, „Wczoraj”, „Nowy blok”)', () => {
    const rec = (r: Partial<SearchRecord>) => r as SearchRecord
    for (const r of [rec({ kind: 'block', id: 'a', date: '2026-11-19' }), rec({ kind: 'command', id: 'tomorrow' }), rec({ kind: 'command', id: 'yesterday' }), rec({ kind: 'command', id: 'newBlock' })]) {
      useUi.setState({ page: 'week', from: null })
      choose(r, '2026-11-18')
      expect(useUi.getState().page).toBe('today')
      expect(useUi.getState().from).toBeNull()
    }
  })
  it('Ctrl K użyty już na „Dziś” otwartym z „Tygodnia” zostawia „← Tydzień” (zeruje tylko skok z innego ekranu)', () => {
    useUi.setState({ page: 'week' })
    openDay('2026-11-19')
    expect(useUi.getState().from).toBe('week')
    choose({ kind: 'command', id: 'tomorrow' } as SearchRecord, '2026-11-18')
    expect(useUi.getState().from).toBe('week')
    choose({ kind: 'block', id: 'a', date: '2026-11-20' } as SearchRecord, '2026-11-18')
    expect(useUi.getState().from).toBe('week')
  })
  it('pamięć okresów: ustawia i zeruje po jednym polu', () => {
    setMemory({ week: '2026-11-23', month: '2026-12' })
    setMemory({ week: null })
    expect(useUi.getState().memory).toEqual({ week: null, anchor: null, agenda: null, month: '2026-12' })
  })
})
