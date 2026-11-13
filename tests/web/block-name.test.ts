// @vitest-environment jsdom
/**
 * The name of a block (D430, uzupełnia D357): the field „Nazwa” on top of the panel, above „Kategoria” – a day's block, a new
 * one (the cursor in it at once), a template's and a series' (the same panel); empty or spaces – named as before. A tile with
 * its own name shows it in the category's place and the category small beside its hours („09:00–09:45 · Analiza”) on the axis
 * of „Dziś” and in the columns of „Tydzień” / „3 dni”; „Agenda” – the name and the category once; the month – the name alone.
 * A block without a name looks as before. D431: the small window „Nowy blok” of „Tydzień” has the field too (the cursor in it,
 * the name in the block it saves and in the one „Więcej” takes to the day); Enter in the name of a new block adds it.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { agendaOf, monthBlockOf } from '@shared/engine/calendarViews'
import { horizonDay } from '@shared/engine/week'
import { BLOCK_NAME_MAX, planBlock, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { BlockEditor } from '@renderer/features/plan/BlockEditor'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { Timeline } from '@renderer/features/plan/Timeline'
import { seriesBlockPatch, touchesSeries } from '@renderer/features/series/seriesForm'
import { agendaRow } from '@renderer/features/week/weekViews'
import { emptyMonthDay, monthCellView } from '@renderer/features/calendar/monthCellView'
import { NewBlockPopover } from '@renderer/features/week/NewBlockPopover'
import { addWeekBlocks } from '@renderer/features/week/weekActions'
import { installEscape } from '@renderer/lib/escape'
import type { DayModel } from '@renderer/store/day'
import { closeToast, useUi } from '@renderer/store/ui'
import { block as dslBlock, Scenario } from '../unit/engine/dsl'

vi.mock('@renderer/features/week/weekActions', async (orig) => ({ ...(await orig<typeof import('@renderer/features/week/weekActions')>()), addWeekBlocks: vi.fn(async () => ({ saved: ['2026-11-18'], failed: [], pending: [], push: null })) }))

const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  // jsdom has no layout: the small window of „Tydzień” brings itself into view.
  Element.prototype.scrollIntoView ??= () => undefined
})
beforeEach(() => {
  ;(window as unknown as { rd: unknown }).rd = { pathForFile: (f: File) => `C:/${f.name}` }
})
let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  for (const t of useUi.getState().toasts) closeToast(t.id)
  vi.mocked(addWeekBlocks).mockClear()
})

async function mount(block: PlanBlock, o: { newBlock?: { add: (name: string | null) => void }; readOnly?: boolean } = {}) {
  const onChange = vi.fn((_p: Partial<PlanBlock>) => undefined)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(BlockEditor, { block, plan: [], names, computers: [], onChange, onClose: () => undefined, ...o })))
  const field = host.querySelector<HTMLInputElement>('[data-testid="block-name"]')!
  return { onChange, field, panel: host.querySelector<HTMLElement>('[data-testid="block-editor"]')! }
}
const type = (el: HTMLInputElement, v: string) =>
  act(() => {
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.blur()
  })
/** Types `v` into the field and presses Enter (the field keeps the focus until then). */
const typeEnter = (el: HTMLInputElement, v: string) =>
  act(() => {
    el.focus()
    if (v) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })

const analiza = planBlock({ id: 'b1', categoryId: 'analiza', startMin: 9 * 60, durationMin: 45, origin: 'user' })

describe('pole „Nazwa” w panelu bloku', () => {
  it('na samej górze, nad „Kategorią”; podpowiedź – nazwa, jaką blok ma bez pola; limit znaków nazwy', async () => {
    const { field, panel } = await mount(analiza)
    expect(field).not.toBeNull()
    expect(field.getAttribute('aria-label')).toBe('Nazwa bloku')
    expect(field.placeholder).toBe('Analiza')
    expect(field.value).toBe('')
    expect(field.maxLength).toBe(BLOCK_NAME_MAX)
    // The first field of the panel, before „Kategoria”.
    const fields = [...panel.querySelectorAll('input, select, textarea')]
    expect(fields[0]).toBe(field)
    const category = panel.querySelector('[data-testid="block-category"]')!
    expect(field.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('wpis zapisuje nazwę (bez spacji na brzegach); nagłówek panelu pokazuje nazwę', async () => {
    const { field, onChange } = await mount(analiza)
    type(field, '  Analiza rynku  ')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ name: 'Analiza rynku' })
    act(() => root!.unmount())
    host!.remove()
    const named = await mount({ ...analiza, name: 'Analiza rynku' })
    expect(named.field.value).toBe('Analiza rynku')
    expect(host!.querySelector('h3')!.textContent).toBe('Analiza rynku')
  })

  it('puste pole albo same spacje – null (blok nazywa się jak dotąd); bez nazwy same spacje – nic do zapisania', async () => {
    const { field, onChange } = await mount({ ...analiza, name: 'Analiza rynku' })
    type(field, '   ')
    expect(onChange).toHaveBeenCalledWith({ name: null })
    act(() => root!.unmount())
    host!.remove()
    const none = await mount(analiza)
    type(none.field, '   ')
    expect(none.onChange).not.toHaveBeenCalled()
  })

  it('nowy blok („+ Blok”): kursor od razu w polu „Nazwa”; panel istniejącego bloku – nie', async () => {
    const fresh = await mount(analiza, { newBlock: { add: () => undefined } })
    expect(document.activeElement).toBe(fresh.field)
    act(() => root!.unmount())
    host!.remove()
    const existing = await mount(analiza)
    expect(document.activeElement).not.toBe(existing.field)
  })

  it('nowy blok: Enter w polu „Nazwa” dodaje blok z wpisaną nazwą (jak „Dodaj”); pusta – bez nazwy (D431)', async () => {
    const add = vi.fn()
    const fresh = await mount(analiza, { newBlock: { add } })
    typeEnter(fresh.field, '  Analiza rynku ')
    expect(fresh.onChange).toHaveBeenCalledWith({ name: 'Analiza rynku' })
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith('Analiza rynku')
    act(() => root!.unmount())
    host!.remove()
    const empty = vi.fn()
    const none = await mount(analiza, { newBlock: { add: empty } })
    typeEnter(none.field, '')
    expect(empty).toHaveBeenCalledWith(null)
  })

  it('istniejący blok: Enter w polu „Nazwa” tylko zatwierdza nazwę (D431)', async () => {
    const { field, onChange } = await mount(analiza)
    typeEnter(field, 'Analiza rynku')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ name: 'Analiza rynku' })
    expect(document.activeElement).not.toBe(field)
  })

  it('zakończona seria (tylko do odczytu): pole nie przyjmuje wpisu', async () => {
    const { field } = await mount({ ...analiza, origin: 'series' }, { readOnly: true })
    expect(field.readOnly).toBe(true)
  })

  it('nazwa należy do pól serii: zmiana w panelu wystąpienia pyta o zakres, a „To i następne” / „Cała seria” niosą ją do serii', () => {
    expect(touchesSeries({ name: 'Angielski' })).toBe(true)
    expect(touchesSeries({ name: null })).toBe(true)
    expect(seriesBlockPatch({ name: 'Angielski', anchor: null })).toEqual({ name: 'Angielski' })
  })
})

/** The text of the tile's line of hours (the axis of „Dziś”). */
function axisLines(items: Parameters<typeof Timeline>[0]['items']): Record<string, string[]> {
  const div = document.createElement('div')
  div.innerHTML = renderToStaticMarkup(createElement(Timeline, { items, markers: [], selected: null, onSelect: () => undefined, from: 6 * 60, to: 22 * 60 }))
  return Object.fromEntries(items.map((i) => [i.id, [...div.querySelector(`[data-testid="block-${i.id}"]`)!.querySelectorAll(':scope > div')].map((d) => d.textContent ?? '')]))
}

describe('kafelek bloku z nazwą', () => {
  const day = '2026-11-18'
  const plan = [
    { ...dslBlock({ id: 'n', cat: 'analiza', at: '09:00', min: 45, origin: 'user' }), name: 'Analiza rynku' },
    dslBlock({ id: 'p', cat: 'analiza', at: '10:00', min: 45, origin: 'user' }),
    // Its name the same words as its category: said once.
    { ...dslBlock({ id: 's', cat: 'analiza', at: '11:00', min: 45, origin: 'user' }), name: 'Analiza' },
    // A variant: the variant's name beside the hours (what the block is called without its own name).
    { ...dslBlock({ id: 'v', cat: 'nauka', variant: 'sluchanie', at: '12:00', min: 45, origin: 'user' }), name: 'Podcast o rynkach' }
  ]

  it('oś „Dziś”: nazwa w miejscu kategorii, kategoria małym drukiem przy godzinach; blok bez nazwy – jak dotąd', () => {
    const s = new Scenario({ date: day, plan }).observe('07:00', null)
    const c = s.contextAt(s.at('08:00'))
    const state = computeDay(c)
    const model = { date: day, ctx: c, state, energy: computeEnergy(c, state) } as unknown as DayModel
    const items = dayAxis(model, { ...names, settings: s.settings }, s.at('08:00')).items
    const by = Object.fromEntries(items.map((i) => [i.id, i]))
    expect(by.n!.title).toBe('Analiza rynku')
    expect(by.n!.kind).toBe('Analiza')
    expect(by.p!.title).toBe('Analiza')
    expect('kind' in by.p!).toBe(false)
    expect('kind' in by.s!).toBe(false)
    expect(by.v!.kind).toBe('Nauka — słuchanie')
    const lines = axisLines(items)
    expect(lines.n![0]).toContain('Analiza rynku')
    expect(lines.n![1]).toBe('09:00–09:45 · Analiza')
    expect(lines.p![1]).toBe('10:00–10:45')
    expect(lines.s![1]).toBe('11:00–11:45')
    expect(lines.v![1]).toBe('12:00–12:45 · Nauka — słuchanie')
  })

  it('oś „Dziś”: oznaczenia idą za kategorią', () => {
    const items = [{ id: 'n', startMin: 9 * 60, endMin: 9 * 60 + 45, title: 'Analiza rynku', kind: 'Analiza', marks: ['biegnie'], color: '#888', categoryId: 'analiza', background: false }]
    expect(axisLines(items).n![1]).toBe('09:00–09:45 · Analiza · biegnie')
  })

  it('„Tydzień” i „3 dni”: blok niesie swoją nazwę; kafelek – nazwa, przy godzinach kategoria; bez nazwy – jak dotąd', async () => {
    const s = new Scenario({ date: day, plan })
    const d = horizonDay(s.contextAt(s.at('08:00')), 'future')
    const by = Object.fromEntries(d.blocks.map((b) => [b.id, b]))
    expect(by.n!.named.name).toBe('Analiza rynku')
    const { BlockBox } = await import('@renderer/features/week/DayGrid')
    const n = { ...names, settings: s.settings }
    const tile = (b: (typeof d.blocks)[number]) => {
      const div = document.createElement('div')
      div.innerHTML = renderToStaticMarkup(createElement(BlockBox, { block: b, lo: 6 * 60, lane: 0, lanes: 1, names: n, brightness: 100, date: day, attach: 0 }))
      return [...div.querySelectorAll('button > span')].map((x) => x.textContent ?? '')
    }
    expect(tile(by.n!)).toEqual(['Analiza rynku', '09:00–09:45 · Analiza'])
    expect(tile(by.p!)).toEqual(['Analiza', '10:00–10:45'])
    expect(tile(by.s!)).toEqual(['Analiza', '11:00–11:45'])
  })

  it('„Agenda”: nazwa, a w linii z długością kategoria – raz', () => {
    const s = new Scenario({ date: day, plan })
    const [a] = agendaOf([horizonDay(s.contextAt(s.at('08:00')), 'future')], [])
    const rows = Object.fromEntries(a!.blocks.map((b) => [b.id, agendaRow(b, { ...names, settings: s.settings })]))
    expect(rows.n).toEqual({ name: 'Analiza rynku', length: '45 min', category: 'Analiza' })
    expect(rows.p).toEqual({ name: 'Analiza', length: '45 min', category: 'Analiza' })
  })

  it('miesiąc: pasek bloku z nazwą – sama nazwa', () => {
    const s = new Scenario({ date: day, plan: [{ ...dslBlock({ id: 'n', cat: 'analiza', at: '09:00', min: 45, fixed: true, origin: 'user' }), name: 'Analiza rynku' }] })
    const h = horizonDay(s.contextAt(s.at('08:00')), 'future')
    const cell = monthCellView({ ...emptyMonthDay(day), read: 'full', dayType: 'zwykly', blocks: h.blocks.map(monthBlockOf) }, [], { ...names, settings: s.settings }, 100)
    expect(cell.bars.map((b) => b.label)).toEqual(['Analiza rynku'])
  })
})

describe('okienko „Nowy blok” w „Tygodniu” (D431)', () => {
  const D = '2026-11-18'
  async function popover(o: { onMore?: (b: PlanBlock) => void } = {}) {
    const onMore = vi.fn(o.onMore ?? (() => undefined))
    const onClose = vi.fn()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () =>
      root!.render(createElement(NewBlockPopover, { dates: [D], startMin: 9 * 60, durationMin: 60, today: '2026-11-13', namesOf: () => names, place: { left: 0, top: 0 }, onClose, onDates: () => undefined, onMore }))
    )
    const small = host.querySelector<HTMLElement>('[data-testid="week-new"]')!
    return { small, onMore, onClose, field: small.querySelector<HTMLInputElement>('[data-testid="week-new-name"]')! }
  }

  it('pole „Nazwa” na górze, nad „Kategorią”, kursor od razu w nim; podpowiedź – nazwa kategorii', async () => {
    const { small, field } = await popover()
    expect(field).not.toBeNull()
    expect(field.getAttribute('aria-label')).toBe('Nazwa bloku')
    expect(field.maxLength).toBe(BLOCK_NAME_MAX)
    expect(field.placeholder).toBe('Inne obowiązki')
    expect([...small.querySelectorAll('input, select, textarea')][0]).toBe(field)
    expect(document.activeElement).toBe(field)
  })

  it('Enter w polu „Nazwa” zapisuje blok z nazwą jak „Dodaj”; „Dodaj” bez nazwy – blok bez nazwy', async () => {
    const { field } = await popover()
    typeEnter(field, 'Analiza rynku')
    await act(async () => undefined)
    expect(addWeekBlocks).toHaveBeenCalledTimes(1)
    const [entries] = vi.mocked(addWeekBlocks).mock.calls[0]!
    expect(entries.map((e) => [e.date, e.block.categoryId, e.block.startMin, e.block.name])).toEqual([[D, 'inne', 9 * 60, 'Analiza rynku']])
    act(() => root!.unmount())
    host!.remove()
    vi.mocked(addWeekBlocks).mockClear()
    const plain = await popover()
    await act(async () => plain.small.querySelector<HTMLElement>('[data-testid="week-new-add"]')!.click())
    expect(vi.mocked(addWeekBlocks).mock.calls[0]![0].map((e) => e.block.name)).toEqual([null])
  })

  it('„Więcej” zabiera nazwę do panelu dnia', async () => {
    const { small, field, onMore } = await popover()
    type(field, 'Analiza rynku')
    await act(async () => small.querySelector<HTMLElement>('[data-testid="week-new-more"]')!.click())
    expect(onMore).toHaveBeenCalledTimes(1)
    expect(onMore.mock.calls[0]![0].name).toBe('Analiza rynku')
    expect(addWeekBlocks).not.toHaveBeenCalled()
  })
})
