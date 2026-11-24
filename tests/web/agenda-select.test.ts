// @vitest-environment jsdom
/**
 * Selecting many blocks in „Agenda” (N18, D596): Ctrl+click selects a block without opening it (a plain click opens it, as before), Shift+click the
 * range in the order of the list (the day, then the hour), Ctrl+A all the blocks of the days shown, Esc clears; the ring of every selected block, the
 * line „Zaznaczone: N · …” over the list (no energy – the list counts none, T954), the right button / Shift+F10 opens „Zmień N bloków” (a selected
 * block – the whole selection, another – only it), Del for two or more; another period starts with nothing selected. The change goes to the line of „week”.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { daysViewOf, type HorizonBlock, type HorizonDay } from '@shared/engine/week'
import { groupCount } from '@shared/groupText'
import { rdFrom } from '@shared/model/rd'
import { addDays } from '@shared/time/zone'
import { DeleteDialog } from '@renderer/components/DeleteDialog'
import { installDeleteKey } from '@renderer/lib/deleteKey'
import { installEscape } from '@renderer/lib/escape'
import { WeekPage } from '@renderer/features/week/WeekPage'
import { useData } from '@renderer/store/data'
import { useDaysView, useWeekView } from '@renderer/store/horizon'
import { NO_MEMORY, useUi } from '@renderer/store/ui'

const { runs } = vi.hoisted(() => ({ runs: [] as Array<{ view: string; ids: readonly string[]; action: unknown }> }))
vi.mock('@renderer/features/plan/groupRun', async (orig) => ({
  ...(await orig<typeof import('@renderer/features/plan/groupRun')>()),
  runBlockGroup: vi.fn(async (view: string, ids: readonly string[], action: unknown) => void runs.push({ view, ids: [...ids], action }))
}))
vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))

const TODAY = '2026-11-18'
const [D1, D2] = [addDays(TODAY, 1), addDays(TODAY, 2)]
const COST = { costs: { head: 2, emotions: 0, senses: 0, body: 0 }, base: { head: 2, emotions: 0, senses: 0, body: 0 }, own: false, edit: true }
const named = { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
// The list counts no costs (`energy: false`, T954): its blocks carry none – the line says no energy even for blocks that had one.
const block = (id: string, startMin: number, o: Partial<HorizonBlock> = {}): HorizonBlock => ({ id, named, categoryId: 'inne', startMin, endMin: startMin + 60, state: 'planned', outsidePlan: false, background: false, movable: true, ...o })
const day = (date: string, blocks: HorizonBlock[]): HorizonDay => ({
  date,
  when: date < TODAY ? 'past' : date === TODAY ? 'today' : 'future',
  read: 'full',
  dayType: null,
  templateId: null,
  frozen: false,
  blocks,
  wakeMin: null,
  bedtimeMin: null,
  boundary: null,
  extensionMin: 0,
  regen: null,
  studyMin: 0,
  sessions: { clean: 0, extended: 0, outsidePlan: 0 },
  energy: null,
  budget: null
})
/** Today: a1 (9:00), a2 (11:00); tomorrow: b1 (8:00); the day after: c1 (9:00), c2 (10:00) – five blocks of an hour. A parked block of tomorrow is not on the list. */
const blocksOf = (date: string): HorizonBlock[] =>
  date === TODAY ? [block('a1', 540, { cost: COST }), block('a2', 660)] : date === D1 ? [block('b1', 480), block('bp', 500, { state: 'parked' })] : date === D2 ? [block('c1', 540), block('c2', 600)] : []

let root: Root | null = null
let host: HTMLElement | null = null
let offEsc: () => void
let offDel: () => void

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = () => undefined
})
beforeEach(() => {
  localStorage.clear()
  offEsc = installEscape()
  offDel = installDeleteKey()
  runs.length = 0
  useData.setState({ rd: rdFrom({ schema: 1 }), view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView, allDay: [] })
  useUi.setState({ page: 'week', day: null, pick: null, toasts: [], from: null, memory: NO_MEMORY })
  vi.mocked(useWeekView).mockReturnValue({ view: null, failed: false })
  vi.mocked(useDaysView).mockImplementation((dates) => ({ view: daysViewOf(dates, TODAY, dates.map((d) => day(d, blocksOf(d)))), failed: false }))
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  offEsc()
  offDel()
  useData.setState({ view: null, allDay: [], rd: rdFrom(undefined) })
})

async function mount(): Promise<void> {
  localStorage.setItem('rd.weekMode', 'agenda')
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement('div', null, createElement(WeekPage), createElement(DeleteDialog))))
}
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const row = (date: string, id: string) => q(`agenda-block-${date}-${id}`)!
const act2 = (fn: () => void) => act(async () => void fn())
const click = (el: Element, init: MouseEventInit = {}) => act2(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, ...init })))
const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  act(() => void target.dispatchEvent(ev))
  return ev
}
const rightClick = (el: Element) => act2(() => void el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 150, clientY: 150 })))
const marked = () => [...document.body.querySelectorAll('[data-testid^="agenda-block-"][data-marked="true"]')].map((e) => e.getAttribute('data-testid')!.slice('agenda-block-'.length).replace(/^(\d{4}-\d\d-\d\d)-/, '$1|'))
const K = (date: string, id: string) => `${date}|${id}`

describe('„Agenda”: Ctrl+klik, Shift+klik, Ctrl+A, Esc (D596)', () => {
  it('Ctrl+klik zaznacza blok bez otwierania; zwykły klik otwiera blok w jego dniu jak dotąd i nie rusza zaznaczenia', async () => {
    await mount()
    expect(row(TODAY, 'a1')).not.toBeNull()
    await click(row(TODAY, 'a1'), { ctrlKey: true })
    expect(marked()).toEqual([K(TODAY, 'a1')])
    expect(useUi.getState().pick).toBeNull()
    expect(row(TODAY, 'a1').className).toContain('ring-lamp')
    await click(row(D2, 'c1'))
    expect(useUi.getState().pick).toMatchObject({ kind: 'block', id: 'c1', date: D2 })
    expect(marked()).toEqual([K(TODAY, 'a1')])
  })

  it('Shift+klik: zakres w kolejności listy (dzień, potem godzina), zdjęty z planu blok jej nie ma; napis bez energii', async () => {
    await mount()
    expect(q(`agenda-block-${D1}-bp`)).toBeNull()
    await click(row(TODAY, 'a2'), { ctrlKey: true })
    await click(row(D2, 'c1'), { shiftKey: true })
    expect(marked()).toEqual([K(TODAY, 'a2'), K(D1, 'b1'), K(D2, 'c1')])
    // Three blocks of an hour; a1 has a cost but is not selected, and the list shows no energy anyway.
    expect(q('agenda-selection')!.textContent).toBe('Zaznaczone: 3 · 3 h')
    // Another end from the same anchor replaces the range.
    await click(row(D1, 'b1'), { shiftKey: true })
    expect(marked()).toEqual([K(TODAY, 'a2'), K(D1, 'b1')])
  })

  it('Ctrl+A zaznacza wszystkie bloki pokazanych dni, Esc czyści', async () => {
    await mount()
    key(document.body, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(marked()).toEqual([K(TODAY, 'a1'), K(TODAY, 'a2'), K(D1, 'b1'), K(D2, 'c1'), K(D2, 'c2')])
    expect(q('agenda-selection')!.textContent).toBe('Zaznaczone: 5 · 5 h')
    key(document.body, 'Escape')
    expect(marked()).toEqual([])
    expect(q('agenda-selection')).toBeNull()
  })

  it('Shift+strzałki idą po blokach listy', async () => {
    await mount()
    await click(row(TODAY, 'a2'), { ctrlKey: true })
    row(TODAY, 'a2').focus()
    key(row(TODAY, 'a2'), 'ArrowDown', { shiftKey: true })
    key(row(TODAY, 'a2'), 'ArrowDown', { shiftKey: true })
    expect(marked()).toEqual([K(TODAY, 'a2'), K(D1, 'b1'), K(D2, 'c1')])
  })

  it('inny okres („Następne 7 dni”) zaczyna bez zaznaczenia', async () => {
    await mount()
    key(document.body, 'a', { ctrlKey: true, code: 'KeyA' })
    expect(marked()).toHaveLength(5)
    await click(q('agenda-next')!)
    expect(marked()).toEqual([])
    expect(q('agenda-selection')).toBeNull()
  })
})

describe('„Agenda”: menu prawego przycisku i Del (D596)', () => {
  const pick = (id: string) => act2(() => void q(id)!.click())

  it('prawy przycisk na zaznaczonym – „Zmień N bloków” dla całego zaznaczenia, na niezaznaczonym – tylko ten blok', async () => {
    await mount()
    await click(row(TODAY, 'a1'), { ctrlKey: true })
    await click(row(D2, 'c2'), { ctrlKey: true })
    await rightClick(row(D2, 'c2'))
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 2 bloki')
    key(document.body, 'Escape')
    await rightClick(row(D1, 'b1'))
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 1 blok')
    expect(marked()).toEqual([K(D1, 'b1')])
  })

  it('Shift+F10; pick idzie do `runBlockGroup` w widoku „week” z kluczami date|id w kolejności listy (jedna linia, jedno „Cofnij”)', async () => {
    await mount()
    await click(row(D2, 'c1'), { ctrlKey: true })
    await click(row(TODAY, 'a2'), { ctrlKey: true })
    await click(row(D1, 'b1'), { ctrlKey: true })
    row(D1, 'b1').focus()
    key(row(D1, 'b1'), 'F10', { shiftKey: true })
    expect(q('block-menu')!.getAttribute('aria-label')).toBe('Zmień 3 bloki')
    await pick('block-menu-remove')
    expect(runs).toEqual([{ view: 'week', ids: [K(TODAY, 'a2'), K(D1, 'b1'), K(D2, 'c1')], action: { kind: 'remove' } }])
  })

  it('N18, T2614: „Koszt…” w menu Agendy jest wyłączony z powodem (lista nie liczy kosztów – okno pokazałoby fałszywe zera)', async () => {
    await mount()
    await click(row(TODAY, 'a1'), { ctrlKey: true })
    await click(row(D1, 'b1'), { ctrlKey: true })
    await rightClick(row(D1, 'b1'))
    expect(q('block-menu-cost')!.getAttribute('aria-disabled')).toBe('true')
    expect(q('block-menu-cost')!.getAttribute('title')).toBe('Koszt zmienisz w „Tygodniu”, „3 dniach” albo w „Dziś”')
    // Other entries stay on.
    expect(q('block-menu-category')!.getAttribute('aria-disabled')).not.toBe('true')
  })

  it('Del przy zaznaczeniu ≥ 2: jedno pytanie „Usunąć N bloków?”, `remove` dla wszystkich', async () => {
    await mount()
    await click(row(TODAY, 'a1'), { ctrlKey: true })
    await click(row(D1, 'b1'), { ctrlKey: true })
    await click(row(D2, 'c2'), { ctrlKey: true })
    key(document.body, 'Delete')
    expect(q('delete-ask')!.textContent).toContain(`Usunąć ${groupCount(3, 'block')}?`)
    await click(q('delete-ask-yes')!)
    expect(runs).toEqual([{ view: 'week', ids: [K(TODAY, 'a1'), K(D1, 'b1'), K(D2, 'c2')], action: { kind: 'remove' } }])
  })
})
