// @vitest-environment jsdom
/**
 * The small window „Nowy blok” of „Tydzień” left by a click outside (D461, T1049): nothing is lost in silence. A click that needs
 * today's exchange keeps the window (and the dialog in it) – it does not reach what it would start below (another window, a day, a
 * screen); one while today is still counted waits for it and then saves; today never counted – after a while a toast says so and the
 * window stays.
 */
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { proposeExchange, type ExchangeProposal } from '@shared/engine/exchange'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { EXCHANGE_UNASKED_TEXT, NewBlockPopover, TODAY_WAIT_MS, TODAY_UNCOUNTED_TEXT } from '@renderer/features/week/NewBlockPopover'
import { addWeekBlocks } from '@renderer/features/week/weekActions'
import { installEscape } from '@renderer/lib/escape'
import { useDay, type DayModel } from '@renderer/store/day'
import { closeToast, navigate, openDay, openPick, openRitual, useUi } from '@renderer/store/ui'

vi.mock('@renderer/features/week/weekActions', async (orig) => ({ ...(await orig<typeof import('@renderer/features/week/weekActions')>()), addWeekBlocks: vi.fn(async () => ({ saved: ['2026-11-18'], failed: [], pending: [], unknown: false, push: null })) }))
vi.mock('@renderer/store/day', async (orig) => ({ ...(await orig<typeof import('@renderer/store/day')>()), useDay: vi.fn(() => null) }))
vi.mock('@shared/engine/exchange', async (orig) => ({ ...(await orig<typeof import('@shared/engine/exchange')>()), proposeExchange: vi.fn() }))
vi.mock('@renderer/features/today/ExchangeDialog', () => ({ ExchangeDialog: () => createElement('div', { role: 'dialog', 'data-testid': 'exchange' }) }))

const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
const TODAY = '2026-11-18'
const model = { date: TODAY, ctx: {}, state: {}, data: { dayFile: null } } as unknown as DayModel
const needed = { needed: true, candidates: [], preselected: [], beyondMin: 30, overBudgetMin: 0, overrun: false } as unknown as ExchangeProposal

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  Element.prototype.scrollIntoView ??= () => undefined
})
let root: Root | null = null
let host: HTMLElement | null = null
let grid: HTMLElement | null = null
const below = vi.fn()
beforeEach(() => {
  vi.mocked(useDay).mockReturnValue(null)
  vi.mocked(proposeExchange).mockReturnValue({ ...needed, needed: false })
  // What a click outside would start below the window (another window on the grid, a day, a screen).
  grid = document.createElement('div')
  grid.addEventListener('pointerdown', below)
  grid.addEventListener('click', below)
  document.body.append(grid)
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  grid?.remove()
  root = null
  host = null
  for (const t of useUi.getState().toasts) closeToast(t.id)
  vi.mocked(addWeekBlocks).mockClear()
  below.mockClear()
  vi.useRealTimers()
})

const props = (onClose: () => void, over: { dragged?: boolean; dates?: string[] } = {}) => ({ dates: [TODAY], startMin: 9 * 60, durationMin: 60, today: TODAY, namesOf: () => names, place: { left: 0, top: 0 }, dragged: true, onClose, onDates: () => undefined, onMore: () => undefined, ...over })
const mount = async (over: { dragged?: boolean } = {}) => {
  const onClose = vi.fn()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(NewBlockPopover, props(onClose, over))))
  return {
    onClose,
    /** Today counted again (the day's model comes or changes): the window renders anew. */
    recount: async () => act(async () => root!.render(createElement(NewBlockPopover, props(onClose, over))))
  }
}
/** A press and its click on the grid, outside the window (a click of the pointer: `detail` 1 – a keyboard's click, 0, is never held). */
const clickOutside = async () => {
  await act(async () => void grid!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })))
  await act(async () => void grid!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
}
const click = async (el: Element | null) => act(async () => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
const shown = (id: string) => document.querySelector(`[data-testid="${id}"]`) != null

describe('okienko „Nowy blok”: klik poza nim nic nie gubi (D461, T1049)', () => {
  it('klik, który wymaga wymiany: okienko zostaje z oknem wymiany, klik nie dochodzi do siatki, nic nie zapisane', async () => {
    vi.mocked(useDay).mockReturnValue(model)
    vi.mocked(proposeExchange).mockReturnValue(needed)
    const { onClose } = await mount()
    await clickOutside()
    expect(shown('exchange')).toBe(true)
    expect(shown('week-new')).toBe(true)
    expect(below).not.toHaveBeenCalled()
    expect(addWeekBlocks).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('klik w czasie liczenia dzisiejszego dnia: zatrzymany, a zapis idzie, gdy dzień się policzy', async () => {
    const { onClose, recount } = await mount()
    await clickOutside()
    expect(below).not.toHaveBeenCalled()
    expect(addWeekBlocks).not.toHaveBeenCalled()
    vi.mocked(useDay).mockReturnValue(model)
    await recount()
    await act(async () => undefined)
    expect(addWeekBlocks).toHaveBeenCalledTimes(1)
    expect(vi.mocked(addWeekBlocks).mock.calls[0]![0].map((e) => e.date)).toEqual([TODAY])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('dzień, który się nie liczy: po czasie oczekiwania dymek mówi, że nic nie zapisano; okienko zostaje', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { onClose } = await mount()
    await clickOutside()
    await act(async () => void vi.advanceTimersByTime(TODAY_WAIT_MS))
    expect(useUi.getState().toasts.map((t) => [t.text, t.kind])).toEqual([[TODAY_UNCOUNTED_TEXT, 'error']])
    expect(addWeekBlocks).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(shown('week-new')).toBe(true)
    // The day counted later: the leave given up does not save by itself.
    vi.useRealTimers()
  })

  it('opis okienka: zapis Enter w „Nazwie” (nie w każdym polu) albo klik poza nim', () => {
    const src = readFileSync('src/renderer/features/week/NewBlockPopover.tsx', 'utf8')
    expect(src).toContain('by Enter in „Nazwa”')
    expect(src).not.toMatch(/by Enter in\s*\n?\s*\*?\s*a field/)
  })
})

/** A name typed into the field and committed (blur): the window is touched, as by a typed name before Ctrl 1. */
const typeName = async (text: string) => {
  const input = document.querySelector<HTMLInputElement>('[data-testid="week-new-name"]')!
  await act(async () => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('okienko „Nowy blok”: zmiana ekranu albo dnia zapisuje je jak klik poza nim (szkice, UX2 A4)', () => {
  const leaves: Array<[string, () => void]> = [
    ['navigate (Ctrl 1…9, menu)', () => navigate('today')],
    ['openDay (klik dnia w Kalendarzu)', () => openDay('2026-11-19')],
    ['openPick (Enter w Ctrl K)', () => openPick({ page: 'routines' }, { kind: 'routine', id: 'r1' } as never)],
    ['openRitual (pasek)', () => openRitual()]
  ]
  for (const [name, leave] of leaves) {
    it(`${name}: tknięte okienko zapisuje się tą samą drogą (addWeekBlocks) z wpisaną nazwą, nietknięte zamyka się bez zapisu`, async () => {
      vi.mocked(useDay).mockReturnValue(model)
      // Touched: a name typed (the commit is made by the change of view, like for any active field).
      const { onClose } = await mount({ dragged: false })
      await typeName('Z klawiatury')
      await act(async () => void leave())
      await act(async () => undefined)
      expect(addWeekBlocks).toHaveBeenCalledTimes(1)
      expect(vi.mocked(addWeekBlocks).mock.calls[0]![0].map((e) => [e.date, e.block.name])).toEqual([[TODAY, 'Z klawiatury']])
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it(`${name}: nietknięte okienko z gołego kliknięcia siatki zamyka się, nic nie zapisuje`, async () => {
      vi.mocked(useDay).mockReturnValue(model)
      const { onClose } = await mount({ dragged: false })
      await act(async () => void leave())
      expect(addWeekBlocks).not.toHaveBeenCalled()
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  }

  it('wymiana dzisiejszego bloku nie ma kogo zapytać (okno odchodzi z ekranem): nic nie zapisane, dymek to mówi', async () => {
    vi.mocked(useDay).mockReturnValue(model)
    vi.mocked(proposeExchange).mockReturnValue(needed)
    await mount()
    await act(async () => void navigate('today'))
    expect(addWeekBlocks).not.toHaveBeenCalled()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual([EXCHANGE_UNASKED_TEXT])
  })

  it('dzień jeszcze nie policzony: dymek jak przy kliknięciu poza oknem, nic nie zapisane', async () => {
    const { onClose } = await mount()
    await act(async () => void navigate('today'))
    expect(addWeekBlocks).not.toHaveBeenCalled()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual([TODAY_UNCOUNTED_TEXT])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('„Więcej” otwiera dzień sam (szkic idzie do „Dziś”): to nie jest opuszczenie okienka, nic się nie zapisuje', async () => {
    vi.mocked(useDay).mockReturnValue(model)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onMore = vi.fn(() => openDay(TODAY))
    await act(async () => root!.render(createElement(NewBlockPopover, { ...props(vi.fn()), onMore })))
    await click(document.querySelector('[data-testid="week-new-more"]'))
    expect(onMore).toHaveBeenCalledTimes(1)
    expect(addWeekBlocks).not.toHaveBeenCalled()
  })

  it('okienko zdjęte z ekranu nie zostaje w nasłuchu: późniejsza zmiana ekranu go nie woła', async () => {
    vi.mocked(useDay).mockReturnValue(model)
    await mount()
    act(() => root?.unmount())
    root = null
    await act(async () => void navigate('today'))
    expect(addWeekBlocks).not.toHaveBeenCalled()
  })
})
