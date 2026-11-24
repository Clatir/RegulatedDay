// @vitest-environment jsdom
/**
 * „Skopiuj tydzień do…” (N16, D634): the window of days in whole weeks (a click – the week of the day, Ctrl+click – one week more or less, the
 * week copied from never chosen, the quick picks of the next weeks) and the button in the heading of „Tydzień” – its menu „Następny tydzień” ·
 * „2 następne tygodnie” · „4 następne tygodnie” · „Wybierz tygodnie…” goes through the flow: the question of collisions only when a day asks it.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { weekDays } from '@renderer/features/calendar/dayQuick'
import { useWeekCopyFlow, WeekCopyButton, WeeksDialog } from '@renderer/features/week/WeekCopyFlow'
import { installEscape } from '@renderer/lib/escape'
import { useUi } from '@renderer/store/ui'
import { addDays } from '@shared/time/zone'

const flow = vi.hoisted(() => ({ asked: [] as string[], calls: [] as Array<{ dates: string[]; weeks: string[]; mode: string }> }))
vi.mock('@renderer/features/week/weekCopy', async (orig) => ({
  ...(await orig<typeof import('@renderer/features/week/weekCopy')>()),
  askedCopyDays: vi.fn(async () => ({ asked: flow.asked, days: 14, copyable: 3 })),
  copyToWeeks: vi.fn(async (from: { dates: string[] }, weeks: string[], mode: string) => {
    flow.calls.push({ dates: [...from.dates], weeks: [...weeks], mode })
    return true
  })
}))

const TODAY = '2026-11-24'
const WEEK = '2026-11-30'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  Element.prototype.scrollIntoView = () => undefined
})
let root: Root | null = null
let host: HTMLElement | null = null
beforeEach(() => {
  flow.asked = []
  flow.calls = []
  useUi.setState({ toasts: [] })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  document.body.innerHTML = ''
})
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
async function mount(node: ReturnType<typeof createElement>) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
}
const selectedDays = () => [...document.body.querySelectorAll<HTMLElement>('[data-testid^="day-"][aria-pressed="true"]')].map((b) => b.dataset.testid!.slice(4))
/** Text typed into a field (React's change event: the native value setter, then `input`). */
async function type(el: HTMLElement, text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    set.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
/** A press and a release on a day of the month (a click of the grid), with Ctrl or not. */
async function press(date: string, ctrlKey = false) {
  const el = q(`day-${date}`)!
  await act(async () => void el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey })))
  await act(async () => void el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, ctrlKey })))
}

describe('okno tygodni', () => {
  const picked: string[][] = []
  const dialog = () => createElement(WeeksDialog, { week: WEEK, today: TODAY, busy: false, title: 'Skopiuj', onClose: () => undefined, onPick: (w: string[]) => void picked.push(w) })
  beforeEach(() => void (picked.length = 0))

  it('klik dnia zaznacza jego tydzień, Ctrl+klik dokłada i zdejmuje tydzień; „Skopiuj” daje poniedziałki', async () => {
    await mount(dialog())
    // The month shown first is the one of the next week (December).
    await press('2026-12-09')
    expect(selectedDays()).toEqual(weekDays('2026-12-07'))
    expect(q('week-copy-weeks-count')!.textContent).toBe('Wybrane: 1 tydzień (7 dni)')
    await press('2026-12-16', true)
    expect(selectedDays()).toEqual([...weekDays('2026-12-07'), ...weekDays('2026-12-14')])
    await press('2026-12-10', true)
    expect(selectedDays()).toEqual(weekDays('2026-12-14'))
    await act(async () => q('week-copy-weeks-ok')!.click())
    expect(picked).toEqual([['2026-12-14']])
  })

  it('tydzień, z którego kopiuję, nigdy nie jest celem; szybki wybór „2 następne tygodnie”', async () => {
    await mount(dialog())
    await press('2026-12-02')
    expect(selectedDays()).toEqual([])
    await act(async () => q('week-copy-weeks-next-2')!.click())
    expect(selectedDays()).toEqual([...weekDays('2026-12-07'), ...weekDays('2026-12-14')])
  })
})

describe('poprawki po przeglądzie r1', () => {
  it('zakres dłuższy niż 52 tygodnie – komunikat w tygodniach (pola „Od” / „Do”)', async () => {
    await mount(createElement(WeeksDialog, { week: WEEK, today: TODAY, busy: false, title: 'Skopiuj', onClose: () => undefined, onPick: () => undefined }))
    // 07.12.2026–06.12.2027 is 365 days – in whole weeks 53 of them.
    await type(q('week-copy-weeks-from')!, '07.12.2026')
    await type(q('week-copy-weeks-to')!, '06.12.2027')
    expect(q('week-copy-weeks-count')!.textContent).toBe('Zakres dłuższy niż 52 tygodnie – wybierz krótszy.')
  })

  it('zaznaczenie z dwóch tygodni: dzień źródła w późniejszym tygodniu oznaczony „źródło”', async () => {
    await mount(createElement(WeeksDialog, { week: WEEK, sources: ['2026-12-06', '2026-12-07'], today: TODAY, busy: false, title: 'Skopiuj', onClose: () => undefined, onPick: () => undefined }))
    expect(q('day-2026-12-07')!.textContent).toContain('źródło')
    expect(q('day-2026-12-06')!.textContent).toContain('ten tydzień')
  })

  it('więcej niż 52 tygodnie naraz – „Najwyżej 52 tygodnie naraz.”', async () => {
    let start: ((from: { dates: string[] }, weeks: string[]) => Promise<unknown>) | null = null
    const Harness = () => {
      const flow = useWeekCopyFlow()
      start = flow.start
      return null
    }
    await mount(createElement(Harness))
    const weeks = Array.from({ length: 53 }, (_, i) => addDays('2026-12-07', 7 * i))
    await act(async () => void (await start!({ dates: weekDays(WEEK) }, weeks)))
    expect(useUi.getState().toasts.map((t) => t.text)).toContain('Najwyżej 52 tygodnie naraz.')
    expect(flow.calls).toEqual([])
  })
})

describe('przycisk „Skopiuj tydzień do…”', () => {
  it('„2 następne tygodnie” bez kolizji – kopia od razu, bez pytania', async () => {
    await mount(createElement(WeekCopyButton, { week: WEEK, today: TODAY }))
    await act(async () => q('week-copy')!.click())
    expect(q('week-copy-next-1')!.textContent).toContain('Następny tydzień')
    await act(async () => q('week-copy-next-2')!.click())
    expect(flow.calls).toEqual([{ dates: weekDays(WEEK), weeks: ['2026-12-07', '2026-12-14'], mode: 'fill' }])
    expect(q('week-copy-mode')).toBeNull()
  })

  it('kolizja – jedno pytanie; „Nadpisz plan” kopiuje z nadpisaniem', async () => {
    flow.asked = ['2026-12-07']
    await mount(createElement(WeekCopyButton, { week: WEEK, today: TODAY }))
    await act(async () => q('week-copy')!.click())
    await act(async () => q('week-copy-next-1')!.click())
    expect(q('week-copy-mode')!.textContent).toContain('07.12.2026')
    expect(flow.calls).toEqual([])
    await act(async () => q('week-copy-overwrite')!.click())
    expect(flow.calls).toEqual([{ dates: weekDays(WEEK), weeks: ['2026-12-07'], mode: 'overwrite' }])
    expect(q('week-copy-mode')).toBeNull()
  })
})
