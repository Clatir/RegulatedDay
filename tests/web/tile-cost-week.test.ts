// @vitest-environment jsdom
/**
 * D501: the cost per hour on the tiles of „Tydzień” („3·1·1·0”, no spaces) and „3 dni” („3 · 1 · 1 · 0”) – and its small window: a click on the label
 * opens the window for that block alone (it neither opens the day nor starts a drag), [+] / [−] and „Jak kategoria” save the block's own cost
 * of that day (`saveTileCosts` – the path of „Dziś”); a tile that may not be changed only tells.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import type { TileCost } from '@shared/model/blockCosts'
import { DayGrid } from '@renderer/features/week/DayGrid'
import { THREE_DAYS_PPM, WEEK_PPM } from '@renderer/features/week/weekLayout'
import { saveTileCosts } from '@renderer/features/plan/costSave'
import { moveWeekBlock } from '@renderer/features/week/weekMove'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

vi.mock('@renderer/features/week/weekMove', async (orig) => ({ ...(await orig<typeof import('@renderer/features/week/weekMove')>()), moveWeekBlock: vi.fn() }))
vi.mock('@renderer/features/plan/costSave', () => ({ saveTileCosts: vi.fn() }))

const TODAY = '2026-11-18'
const DATES = [TODAY, '2026-11-19']
const named = { categoryId: 'analiza', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
const cost = (head: number, emotions: number, senses: number, body: number, o: Partial<TileCost> = {}): TileCost => ({ costs: { head, emotions, senses, body }, base: { head: 3, emotions: 1, senses: 1, body: 0 }, own: false, edit: true, ...o })
const block = (id: string, startMin: number, endMin: number, o: Partial<HorizonBlock> = {}): HorizonBlock => ({ id, named, categoryId: 'analiza', startMin, endMin, state: 'planned', outsidePlan: false, background: false, ...o })
const day = (date: string, blocks: HorizonBlock[]): HorizonDay => ({
  date,
  when: date === TODAY ? 'today' : 'future',
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

let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterAll(() => removeEscape?.())
let root: Root | null = null
let host: HTMLElement | null = null
beforeEach(() => {
  vi.mocked(moveWeekBlock).mockReset()
  vi.mocked(saveTileCosts).mockReset().mockResolvedValue(true)
  useData.setState({ view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView })
  useUi.setState({ page: 'week', day: null, toasts: [] })
  Element.prototype.scrollIntoView = () => undefined
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  useData.setState({ view: null })
})

async function mount(list: HorizonDay[], scale = WEEK_PPM): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(DayGrid, { days: list, from: 360, to: 1320, ppm: scale, mode: scale === WEEK_PPM ? 'week' : '3days', openCard: null, onCardOpened: () => undefined })))
}
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const labelOf = (date: string, id: string) => q(`week-block-${date}-${id}-cost`)
function pointer(target: EventTarget, type: string, x: number, y: number, buttons = 1): void {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  act(() => void target.dispatchEvent(e))
}
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))

describe('koszt na kafelku „Tygodnia” i „3 dni” (D501)', () => {
  it('„Tydzień”: skrót bez spacji „3·1·1·0”, regeneracja „−1·−2·−3·−1” – zawsze cztery liczby G·E·B·C (D524)', async () => {
    await mount([day(TODAY, [block('a', 600, 660, { cost: cost(3, 1, 1, 0) }), block('r', 720, 780, { cost: cost(-1, -2, -3, -1) })]), day(DATES[1]!, [])])
    expect(labelOf(TODAY, 'a')!.textContent).toBe('3·1·1·0')
    expect(labelOf(TODAY, 'r')!.textContent).toBe('−1·−2·−3·−1')
  })

  it('„3 dni”: pełny napis ze spacjami „3 · 1 · 1 · 0”', async () => {
    await mount([day(TODAY, [block('a', 600, 660, { cost: cost(3, 1, 1, 0) })]), day(DATES[1]!, [])], THREE_DAYS_PPM)
    expect(labelOf(TODAY, 'a')!.textContent).toBe('3 · 1 · 1 · 0')
  })

  it('„3 dni”, kafelek obok innego (napis po najechaniu): skrót bez spacji „1·1·1·1” – więcej miejsca do chwytania (D526)', async () => {
    await mount([day(TODAY, [block('x', 800, 860, { cost: cost(1, 1, 1, 1) }), block('y', 800, 860, { cost: cost(3, 1, 1, 0) }), block('solo', 600, 660, { cost: cost(3, 1, 1, 0) })]), day(DATES[1]!, [])], THREE_DAYS_PPM)
    expect(labelOf(TODAY, 'x')!.getAttribute('data-place')).toBe('hover')
    expect(labelOf(TODAY, 'x')!.textContent).toBe('1·1·1·1')
    expect(labelOf(TODAY, 'solo')!.textContent).toBe('3 · 1 · 1 · 0')
  })

  it('własny koszt bloku jest tym, co mówi napis; blok bez kosztu w danych (np. dawny widok) – bez napisu', async () => {
    await mount([day(TODAY, [block('a', 600, 660, { cost: cost(5, 0, -1, 0, { own: true }) }), block('n', 720, 780)]), day(DATES[1]!, [])])
    expect(labelOf(TODAY, 'a')!.textContent).toBe('5·0·−1·0')
    expect(labelOf(TODAY, 'n')).toBeNull()
  })

  it('miejsce: w rogu na wysokim kafelku, na końcu wiersza nazwy na niskim, po najechaniu obok innego', async () => {
    await mount([day(TODAY, [block('tall', 600, 660, { cost: cost(3, 1, 1, 0) }), block('low', 700, 720, { cost: cost(3, 1, 1, 0) }), block('x', 800, 860, { cost: cost(3, 1, 1, 0) }), block('y', 800, 860, { cost: cost(1, 1, 1, 0) })]), day(DATES[1]!, [])])
    expect(labelOf(TODAY, 'tall')!.getAttribute('data-place')).toBe('corner')
    expect(labelOf(TODAY, 'low')!.getAttribute('data-place')).toBe('row')
    expect(labelOf(TODAY, 'x')!.getAttribute('data-place')).toBe('hover')
  })

  it('klik w napis otwiera okienko – nie otwiera dnia; [+] zapisuje własny koszt bloku tego dnia, „Jak kategoria” – null', async () => {
    await mount([day(TODAY, []), day(DATES[1]!, [block('f', 600, 660, { cost: cost(3, 1, 1, 0, { own: true }) })])])
    click(labelOf(DATES[1]!, 'f')!)
    expect(q('cost-pop')).not.toBeNull()
    expect(useUi.getState().page).toBe('week')
    expect(useUi.getState().day).toBeNull()
    click(q('cost-pop-emotions-plus')!)
    expect(saveTileCosts).toHaveBeenLastCalledWith(expect.objectContaining({ date: DATES[1], blockId: 'f', ofSeries: false }), { head: 3, emotions: 2, senses: 1, body: 0 }, { ask: { scope: null } })
    await act(async () => undefined)
    click(q('cost-pop-reset')!)
    await act(async () => undefined)
    expect(saveTileCosts).toHaveBeenLastCalledWith(expect.objectContaining({ date: DATES[1], blockId: 'f' }), null, expect.anything())
  })

  it('wiersz godzin zostawia miejsce na napis w rogu według trybu: „3 dni” – na napis ze spacjami, „Tydzień” – na skrót', async () => {
    const hours = (date: string, id: string) => q(`week-hours-${date}-${id}`)!.style.paddingRight
    await mount([day(TODAY, [block('a', 600, 660, { cost: cost(-5, -5, -5, -5) })]), day(DATES[1]!, [])], THREE_DAYS_PPM)
    expect(hours(TODAY, 'a')).toBe('108px')
    act(() => root?.unmount())
    await mount([day(TODAY, [block('a', 600, 660, { cost: cost(-5, -5, -5, -5) })]), day(DATES[1]!, [])])
    expect(hours(TODAY, 'a')).toBe('74px')
  })

  it('koszt trzycyfrowy (D568, −100…100) poszerza miejsce wiersza godzin: „3 dni” 156 px, „Tydzień” 120 px; napis ma max-w-full', async () => {
    const hours = (date: string, id: string) => q(`week-hours-${date}-${id}`)!.style.paddingRight
    await mount([day(TODAY, [block('a', 600, 660, { cost: cost(-100, -100, -100, -100) })]), day(DATES[1]!, [])], THREE_DAYS_PPM)
    expect(labelOf(TODAY, 'a')!.textContent).toBe('−100 · −100 · −100 · −100')
    expect(hours(TODAY, 'a')).toBe('156px')
    expect(labelOf(TODAY, 'a')!.className).toContain('max-w-full')
    act(() => root?.unmount())
    await mount([day(TODAY, [block('a', 600, 660, { cost: cost(-100, -100, -100, -100) })]), day(DATES[1]!, [])])
    expect(labelOf(TODAY, 'a')!.textContent).toBe('−100·−100·−100·−100')
    expect(hours(TODAY, 'a')).toBe('120px')
  })

  it('okienko ma czwarte pole – ciało (D524): [+] zapisuje cztery liczby z ciałem', async () => {
    await mount([day(TODAY, []), day(DATES[1]!, [block('f', 600, 660, { cost: cost(3, 1, 1, 0, { own: true }) })])])
    click(labelOf(DATES[1]!, 'f')!)
    expect((q('cost-pop-body-value') as HTMLInputElement).value).toBe('0')
    click(q('cost-pop-body-plus')!)
    expect(saveTileCosts).toHaveBeenLastCalledWith(expect.objectContaining({ date: DATES[1], blockId: 'f' }), { head: 3, emotions: 1, senses: 1, body: 1 }, { ask: { scope: null } })
  })

  it('[+] przy 100 nic nie zmienia', async () => {
    await mount([day(TODAY, [block('a', 600, 660, { cost: cost(100, 1, 1, 0, { own: true }) })]), day(DATES[1]!, [])])
    click(labelOf(TODAY, 'a')!)
    click(q('cost-pop-head-plus')!)
    expect(saveTileCosts).not.toHaveBeenCalled()
  })

  it('wciśnięcie na napisie bloku do przeniesienia nie zaczyna przeciągania', async () => {
    await mount([day(TODAY, [block('a', 600, 660, { movable: true, cost: cost(3, 1, 1, 0) })]), day(DATES[1]!, [])])
    const label = labelOf(TODAY, 'a')!
    pointer(label, 'pointerdown', 100, 200)
    pointer(window, 'pointermove', 300, 300)
    expect(q('week-grid')!.getAttribute('data-dragging')).toBeNull()
    pointer(window, 'pointerup', 300, 300, 0)
    expect(moveWeekBlock).not.toHaveBeenCalled()
  })

  it('Esc zamyka okienko', async () => {
    await mount([day(TODAY, [block('a', 600, 660, { cost: cost(3, 1, 1, 0) })]), day(DATES[1]!, [])])
    click(labelOf(TODAY, 'a')!)
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(q('cost-pop')).toBeNull()
  })

  it('blok, którego nie wolno zmieniać (zaczęty, dzień miniony), pokazuje napis bez okienka', async () => {
    await mount([day(TODAY, [block('a', 600, 660, { state: 'ran', cost: cost(3, 1, 1, 0, { edit: false }) })]), day(DATES[1]!, [])])
    expect(labelOf(TODAY, 'a')!.textContent).toBe('3·1·1·0')
    click(labelOf(TODAY, 'a')!)
    expect(q('cost-pop')).toBeNull()
  })
})
