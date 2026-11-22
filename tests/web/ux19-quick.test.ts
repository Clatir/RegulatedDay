// @vitest-environment jsdom
/**
 * UX19 (D565 P28): quick picks of the window of days – „pn–pt” of the month shown and „każdy <dzień>” (every Monday … Sunday of it) – and the goals
 * panel of „Tydzień” that folds (remembered by this computer).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DaysDialog } from '@renderer/features/calendar/DaysDialog'
import { weekdaysOfMonth, workdaysOfMonth } from '@renderer/features/calendar/dayQuick'
import { GoalsPanel } from '@renderer/features/week/GoalsPanel'
import { goalsFolded, rememberGoalsFolded } from '@renderer/features/week/weekViews'
import { useData } from '@renderer/store/data'

vi.mock('@renderer/store/horizon', () => ({ useGoalsView: vi.fn(() => ({ view: null, failed: false })) }))

describe('dni miesiąca do szybkich wyborów', () => {
  it('pn–pt: wszystkie dni robocze miesiąca, tylko tego miesiąca', () => {
    // November 2026 starts on Sunday (1.11) and ends on Monday (30.11).
    const d = workdaysOfMonth('2026-11')
    expect(d[0]).toBe('2026-11-02')
    expect(d.at(-1)).toBe('2026-11-30')
    expect(d).toHaveLength(21)
    expect(d.every((x) => x.startsWith('2026-11-'))).toBe(true)
  })

  it('każdy wtorek, każda niedziela: dni tygodnia 1..7 miesiąca', () => {
    expect(weekdaysOfMonth('2026-11', 2)).toEqual(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24'])
    expect(weekdaysOfMonth('2026-11', 7)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'])
    // February of a leap year.
    expect(weekdaysOfMonth('2028-02', 2)).toHaveLength(5)
  })
})

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  document.body.innerHTML = ''
})
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (el: Element | null) => act(async () => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
async function mount(node: ReturnType<typeof createElement>) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
}
const selectedDays = () => [...document.body.querySelectorAll<HTMLElement>('[data-testid^="day-"][aria-pressed="true"]')].map((b) => b.dataset.testid!.slice(4))

describe('okno dni: szybkie wybory', () => {
  const picked: string[][] = []
  const dialog = () => createElement(DaysDialog, { title: 'Zastosuj', verb: 'Zastosuj', today: '2026-11-21', busy: false, onClose: () => undefined, onPick: (d: string[]) => void picked.push(d), testId: 'days' })
  beforeEach(() => void (picked.length = 0))

  it('„pn–pt tego miesiąca” zaznacza dni robocze pokazanego miesiąca; pola pokazują pierwszy i ostatni', async () => {
    await mount(dialog())
    await click(q('days-quick-workdays'))
    const days = selectedDays()
    expect(days).toHaveLength(21)
    expect(days[0]).toBe('2026-11-02')
    expect((q('days-from') as HTMLInputElement).value).toBe('02.11.2026')
    expect((q('days-to') as HTMLInputElement).value).toBe('30.11.2026')
    await click(q('days-ok'))
    expect(picked[0]).toHaveLength(21)
  })

  it('„każdy <dzień>” zaznacza ten dzień tygodnia w pokazanym miesiącu; po zmianie miesiąca – w nowym', async () => {
    await mount(dialog())
    await click(q('days-quick-weekday-2'))
    expect(selectedDays()).toEqual(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24'])
    await act(async () => void document.body.querySelector<HTMLElement>('[aria-label="Następny miesiąc"]')!.click())
    await click(q('days-quick-weekday-5'))
    expect(selectedDays()).toEqual(['2026-12-04', '2026-12-11', '2026-12-18', '2026-12-25'])
  })

  it('dzień pomijany (`skip`) nie trafia do wyboru', async () => {
    await mount(createElement(DaysDialog, { title: 'Kopia', verb: 'Skopiuj', today: '2026-11-21', busy: false, onClose: () => undefined, onPick: () => undefined, testId: 'days', skip: '2026-11-10' }))
    await click(q('days-quick-weekday-2'))
    expect(q('days-ok')!.textContent).toBe('Skopiuj (3)')
  })
})

describe('panel celów nad „Tygodniem” zwija się', () => {
  beforeEach(() => {
    localStorage.clear()
    useData.setState({ rd: { ...useData.getState().rd, goals: { '2026-11': { study: 10, regen: 5, trading: 3, skipped: false } } } })
  })

  it('zapamiętany stan: domyślnie rozwinięty, zwinięcie zostaje w pamięci tego komputera', () => {
    expect(goalsFolded()).toBe(false)
    rememberGoalsFolded(true)
    expect(goalsFolded()).toBe(true)
    rememberGoalsFolded(false)
    expect(goalsFolded()).toBe(false)
  })

  it('przycisk zwija treść (zostaje tytuł) i rozwija z powrotem; stan trzyma się po ponownym otwarciu', async () => {
    await mount(createElement(GoalsPanel, { month: '2026-11' }))
    const toggle = q('goals-fold')!
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(q('goals-edit')).not.toBeNull()
    await click(toggle)
    expect(q('goals-fold')!.getAttribute('aria-expanded')).toBe('false')
    expect(q('goals-title')).not.toBeNull()
    expect(q('goals-edit')).toBeNull()
    // Opened again – still folded.
    act(() => root!.unmount())
    host!.remove()
    await mount(createElement(GoalsPanel, { month: '2026-11' }))
    expect(q('goals-fold')!.getAttribute('aria-expanded')).toBe('false')
    await click(q('goals-fold'))
    expect(q('goals-edit')).not.toBeNull()
  })
})
