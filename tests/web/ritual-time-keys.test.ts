// @vitest-environment jsdom
/**
 * UX4 (B8): the time of an answer about a day – in the ritual and in the days not closed – follows the convention of the fields
 * (spec „Edycja pól”): Enter commits the text and writes the answer (as „Zapisz”), the first Esc throws the typed text away, the
 * next Esc closes the editor without writing anything; a refused text is never written by Enter.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { UnclosedDay } from '@shared/api'
import type { RitualRow, RitualView } from '@shared/engine/ritual'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { logicalMinuteOf } from '@shared/time/day'
import { DayTime } from '@renderer/features/ritual/dayTime'
import { RitualPanel } from '@renderer/features/ritual/RitualPanel'
import { UnclosedDays } from '@renderer/features/ritual/UnclosedDays'
import type { DayModel } from '@renderer/store/day'
import { installEscape, setWindowEscape } from '@renderer/lib/escape'
import { useUi } from '@renderer/store/ui'

const DAY = '2026-11-13'
const workEnd = { id: 'we', afterClose: false, kind: 'workEnd', end: 780, confirmed: false, explain: { from: 780, asProject: false } } as unknown as RitualRow
const rest = { id: 'rs', afterClose: false, kind: 'rest', from: 1080, to: 1200, marked: [], answered: false } as unknown as RitualRow
const ritualView: RitualView = { rows: [workEnd], effects: {}, asWritten: { changes: [], forecast: false }, closed: null, felt: [] }
const model = { date: DAY, ctx: { date: DAY, plan: [], snapshot: { settings: { sessions: [] }, blocks: [] } }, state: { facts: { blocks: new Map() }, now: 0 } } as unknown as DayModel
const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
const day: UnclosedDay = { date: DAY, presence: true, closed: false, ritual: ritualView }

/** The window's own Esc (it closes the panel / goes to the layers): it must not be reached by an Esc the field takes. */
const windowEscape = vi.fn()
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  setWindowEscape(windowEscape)
})

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  useUi.setState({ toasts: [] })
  windowEscape.mockClear()
})

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))
const mount = async (node: ReturnType<typeof createElement>) => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
  await flush()
}
const input = (sel: string) => host!.querySelector<HTMLInputElement>(sel)!
const type = (el: HTMLInputElement, v: string) =>
  act(() => {
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
const key = (el: HTMLInputElement, k: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })))
/** The key goes where the focus is, as a real one does. */
const keyFocused = (k: string) => key(document.activeElement as HTMLInputElement, k)

const TIME = '[data-testid="ritual-time-workedUntil"]'

/** The editor of „Pracowałem do …” opened in the ritual. */
async function openRitual() {
  const rd = {
    ritual: vi.fn(async () => ritualView),
    casesRitual: vi.fn(async () => ({ back: [], questions: [], someday: null })),
    ritualAnswer: vi.fn(async () => ({ ok: true, why: null, confirm: null }))
  }
  ;(window as unknown as { rd: unknown }).rd = rd
  await mount(createElement(RitualPanel, { model, names }))
  await act(async () => void host!.querySelector<HTMLElement>('[data-testid="ritual-workEnd-workedUntil"]')!.click())
  return rd
}

describe('godzina w rytuale: Enter zapisuje, Esc anuluje', () => {
  it('Enter w polu zapisuje wpisaną godzinę (bez „Zapisz”) i zamyka edytor', async () => {
    const rd = await openRitual()
    await type(input(TIME), '14:20')
    await key(input(TIME), 'Enter')
    await flush()
    expect(rd.ritualAnswer).toHaveBeenCalledTimes(1)
    const [, row, choice, at] = rd.ritualAnswer.mock.calls[0] as unknown as [string, string, string, number]
    expect([row, choice]).toEqual(['we', 'workedUntil'])
    // The typed 14:20 of that day - not the hour the field started from.
    expect(logicalMinuteOf(DAY, at)).toBe(14 * 60 + 20)
    expect(host!.querySelector(TIME)).toBeNull()
  })

  it('Enter bez zmiany zapisuje godzinę, od której pole startowało', async () => {
    const rd = await openRitual()
    await key(input(TIME), 'Enter')
    await flush()
    expect(rd.ritualAnswer).toHaveBeenCalledTimes(1)
  })

  it('tekst odrzucony (25:99): Enter niczego nie zapisuje, edytor stoi, powód jest pod polem', async () => {
    const rd = await openRitual()
    await type(input(TIME), '25:99')
    await key(input(TIME), 'Enter')
    await flush()
    expect(rd.ritualAnswer).not.toHaveBeenCalled()
    expect(host!.querySelector(TIME)).not.toBeNull()
    expect(host!.querySelector('[data-testid="ritual-time-workedUntil-error"]')).not.toBeNull()
  })

  it('pierwszy Esc wyrzuca wpisany tekst (pole wraca do godziny sprzed edycji), drugi zamyka edytor – nic nie zapisano', async () => {
    const rd = await openRitual()
    const before = input(TIME).value
    await type(input(TIME), '14:20')
    await keyFocused('Escape')
    expect(input(TIME).value).toBe(before)
    // The field keeps the focus, so the next Esc comes to it (not to the window).
    expect(document.activeElement).toBe(input(TIME))
    expect(host!.querySelector('[data-testid="ritual-time-save-workedUntil"]')).not.toBeNull()
    await keyFocused('Escape')
    expect(host!.querySelector(TIME)).toBeNull()
    expect(rd.ritualAnswer).not.toHaveBeenCalled()
    expect(windowEscape).not.toHaveBeenCalled()
  })
})

describe('odcinek, który nie był odpoczynkiem: Enter zapisuje z „Od” i z „Do”', () => {
  async function openStretch() {
    const view = { ...ritualView, rows: [rest] }
    const rd = {
      ritual: vi.fn(async () => view),
      casesRitual: vi.fn(async () => ({ back: [], questions: [], someday: null })),
      ritualAnswer: vi.fn(async () => ({ ok: true, why: null, confirm: null }))
    }
    ;(window as unknown as { rd: unknown }).rd = rd
    await mount(createElement(RitualPanel, { model, names }))
    await act(async () => void host!.querySelector<HTMLElement>('[data-testid="ritual-rest-mark"]')!.click())
    return rd
  }
  for (const which of ['Od', 'Do']) {
    it(`Enter w polu „${which}” zapisuje odcinek`, async () => {
      const rd = await openStretch()
      const f = () => input(`input[aria-label="${which}"]`)
      await type(f(), which === 'Od' ? '19:00' : '20:00')
      await key(f(), 'Enter')
      await flush()
      expect(rd.ritualAnswer).toHaveBeenCalledTimes(1)
      expect((rd.ritualAnswer.mock.calls[0] as unknown as unknown[])[2]).toBe('notRest')
    })
  }

  it('Esc, Esc w polu odcinka zamyka edytor bez zapisu', async () => {
    const rd = await openStretch()
    const f = () => input('input[aria-label="Od"]')
    await type(f(), '19:00')
    await keyFocused('Escape')
    expect(document.activeElement).toBe(f())
    await keyFocused('Escape')
    expect(host!.querySelector('input[aria-label="Od"]')).toBeNull()
    expect(rd.ritualAnswer).not.toHaveBeenCalled()
  })
})

describe('godzina w „Niezamkniętych dniach”: Enter zapisuje, Esc anuluje', () => {
  async function openMorning() {
    const rd = {
      unclosedDays: vi.fn(async () => [day]),
      ritualAnswer: vi.fn(async () => ({ ok: true, why: null, confirm: null }))
    }
    ;(window as unknown as { rd: unknown }).rd = rd
    await mount(createElement(UnclosedDays))
    await act(async () => void host!.querySelector<HTMLElement>(`[data-testid="unclosed-workedUntil-${DAY}"]`)!.click())
    return rd
  }
  const FIELD = 'input[aria-label="Pracowałem do …"]'

  it('Enter zapisuje wpisaną godzinę', async () => {
    const rd = await openMorning()
    await type(input(FIELD), '14:20')
    await key(input(FIELD), 'Enter')
    await flush()
    expect(rd.ritualAnswer).toHaveBeenCalledTimes(1)
    expect((rd.ritualAnswer.mock.calls[0] as unknown as unknown[]).slice(0, 3)).toEqual([DAY, 'we', 'workedUntil'])
  })

  it('Esc, Esc: tekst wyrzucony, potem edytor zamknięty bez zapisu', async () => {
    const rd = await openMorning()
    await type(input(FIELD), '14:20')
    await keyFocused('Escape')
    expect(document.activeElement).toBe(input(FIELD))
    await keyFocused('Escape')
    expect(host!.querySelector(FIELD)).toBeNull()
    expect(rd.ritualAnswer).not.toHaveBeenCalled()
    expect(windowEscape).not.toHaveBeenCalled()
  })
})

describe('DayTime', () => {
  it('Enter wywołuje onEnter po przyjęciu tekstu (onTyped pierwsze); Esc z wpisem tylko cofa tekst (przyjęta godzina wraca przez onTyped), Esc bez wpisu – onEscape', async () => {
    const calls: string[] = []
    const props = { date: DAY, value: { min: 600, pick: 'first' as const }, label: 'Do', testId: 'dt', onTyped: () => void calls.push('typed'), onEnter: () => void calls.push('enter'), onEscape: () => void calls.push('esc') }
    await mount(createElement(DayTime, props))
    const f = () => input('[data-testid="dt"]')
    await type(f(), '9:30')
    await keyFocused('Escape')
    expect(document.activeElement).toBe(f())
    expect(calls).toEqual(['typed'])
    await keyFocused('Escape')
    expect(calls).toEqual(['typed', 'esc'])
    await type(f(), '9:30')
    await key(f(), 'Enter')
    expect(calls).toEqual(['typed', 'esc', 'typed', 'enter'])
  })
})
