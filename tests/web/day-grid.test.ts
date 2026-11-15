// @vitest-environment jsdom
/**
 * The columns of „Tydzień” and „3 dni” (SNT1, D417, D422): a block that may be moved is dragged to another hour or another day –
 * the place it would take is shown while it is held (a day gone by refused), the drop is `moveWeekBlock` with the 5-minute hour
 * of the column under the pointer and the line „Cofnij” it leaves; Esc and a refused place change nothing; a click without
 * movement opens the day as before; a block that may not be moved has no grip. The energy's strip at the left edge (D500), the
 * blocks right of it, fainter with the caption „przyjęte” for the assumed check-in; its hover and its legend.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import { DayGrid } from '@renderer/features/week/DayGrid'
import { POOL_COLOR } from '@renderer/features/plan/energyDraw'
import { ASSUMED_FACTOR, EnergyStripLegend, hoverPlace, STRIP_OPACITY, STRIP_WIDTH } from '@renderer/features/week/EnergyStrip'
import { THREE_DAYS_PPM, WEEK_PPM } from '@renderer/features/week/weekLayout'
import { copyDayBlock, moveWeekBlock } from '@renderer/features/week/weekMove'
import { installEscape, onEscapeLayer } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { useWeekPush } from '@renderer/store/weekPush'

vi.mock('@renderer/features/week/weekMove', async (orig) => ({ ...(await orig<typeof import('@renderer/features/week/weekMove')>()), moveWeekBlock: vi.fn(), copyDayBlock: vi.fn() }))

const TODAY = '2026-11-18'
const DATES = ['2026-11-17', TODAY, '2026-11-19']
// Columns as the screen would give them: 96 px wide, 4 px apart, their top at y = 100 (jsdom has no layout).
const COL_TOP = 100
const colLeft = (i: number) => 60 + i * 100
const named = { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
const block = (id: string, startMin: number, endMin: number, o: Partial<HorizonBlock> = {}): HorizonBlock => ({ id, named, categoryId: 'inne', startMin, endMin, state: 'planned', outsidePlan: false, background: false, ...o })
const day = (date: string, blocks: HorizonBlock[], o: Partial<HorizonDay> = {}): HorizonDay => ({
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
  budget: null,
  ...o
})
// The block „a” of today, 10:00–11:00, may be moved; „f” (a lecture) of tomorrow may not; „p” of yesterday is not movable either.
const days = (o: { energyTomorrow?: HorizonDay['energy'] } = {}): HorizonDay[] => [day(DATES[0]!, [block('p', 540, 600)]), day(TODAY, [block('a', 600, 660, { movable: true })]), day(DATES[2]!, [block('f', 840, 900, { fixed: true })], { energy: o.energyTomorrow ?? null })]

let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterAll(() => removeEscape?.())
let root: Root | null = null
let host: HTMLElement | null = null
let ppm = WEEK_PPM
/** The top of the grid's body on the screen (the page scrolled: it moves, the columns follow it). */
let bodyTop = COL_TOP
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

beforeEach(() => {
  bodyTop = COL_TOP
  vi.mocked(moveWeekBlock).mockReset()
  useData.setState({ view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView })
  useUi.setState({ page: 'week', day: null, toasts: [] })
  Element.prototype.scrollIntoView = () => undefined
  // The columns and the block „a” have the places the test says; the rest has none (jsdom).
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const id = this.getAttribute('data-testid') ?? ''
    if (id === 'week-body') return rect(60, bodyTop, 400, 2000)
    const col = DATES.findIndex((d) => id === `week-col-${d}`)
    if (col >= 0) return rect(colLeft(col), bodyTop, 96, 2000)
    const m = /^week-block-(\d{4}-\d{2}-\d{2})-a$/.exec(id)
    if (m) return rect(colLeft(DATES.indexOf(m[1]!)), bodyTop + (600 - 360) * ppm, 96, 60 * ppm)
    return rect(0, 0, 0, 0)
  })
})
/** The pointer capture jsdom lacks, stubbed for one test and taken off again in `afterEach` (T1295). */
const capture = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const
function stubPointerCapture(): void {
  for (const name of capture) Object.defineProperty(Element.prototype, name, { value: name === 'hasPointerCapture' ? () => false : () => undefined, configurable: true, writable: true })
}
/** The width of the window as the page's content sees it (without a scrollbar); jsdom has none. */
function stubClientWidth(width: number): void {
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(width)
}
afterEach(() => {
  for (const name of capture) Reflect.deleteProperty(Element.prototype, name)
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.restoreAllMocks()
  useData.setState({ view: null })
  useWeekPush.setState({ line: null })
  useUi.setState({ page: 'week', day: null })
})

const grid = (list: HorizonDay[], scale: number) => createElement(DayGrid, { days: list, from: 360, to: 1320, ppm: scale, mode: scale === WEEK_PPM ? 'week' : '3days', openCard: null, onCardOpened: () => undefined })
async function mount(list: HorizonDay[], scale = WEEK_PPM): Promise<void> {
  ppm = scale
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(grid(list, scale)))
}
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
/** A pointer event of the left button (jsdom has no PointerEvent: a mouse event with the pointer's id). */
function pointer(target: EventTarget, type: string, x: number, y: number, buttons = 1): void {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  act(() => void target.dispatchEvent(e))
}
const blockA = () => q(`week-block-${TODAY}-a`)!

describe('przeciąganie bloku między kolumnami (D417)', () => {
  it('blok do przeniesienia ma chwyt, pozostałe – nie', async () => {
    await mount(days())
    expect(blockA().getAttribute('data-movable')).toBe('true')
    expect(q(`week-block-${DATES[2]}-f`)!.getAttribute('data-movable')).toBeNull()
    expect(q(`week-block-${DATES[0]}-p`)!.getAttribute('data-movable')).toBeNull()
  })

  it('w trakcie widać miejsce, które zająłby blok; puszczenie na jutrze przenosi go o godzinie z kolumny (krok 5 min) i pokazuje linię „Cofnij”', async () => {
    vi.mocked(moveWeekBlock).mockResolvedValue({ status: 'saved', push: { days: [], move: { blockId: 'a', name: 'Inne obowiązki', from: TODAY, to: DATES[2]! } }, pushed: 0 })
    await mount(days())
    // Grasped 8 px under the block's top; dropped where its top would be at 12:00 of tomorrow's column.
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    const band = q('week-drop')!
    expect(band.getAttribute('data-start')).toBe('720')
    expect(band.getAttribute('data-end')).toBe('780')
    expect(band.getAttribute('data-denied')).toBeNull()
    expect(band.textContent).toBe('12:00–13:00')
    expect(q('week-grid')!.getAttribute('data-dragging')).toBe('true')
    pointer(window, 'pointerup', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8, 0)
    expect(moveWeekBlock).toHaveBeenCalledTimes(1)
    // With the names of the source day (D424: a begun block anchored to it is named in the line).
    expect(moveWeekBlock).toHaveBeenCalledWith({ blockId: 'a', name: 'Inne obowiązki', names: expect.objectContaining({ settings: expect.anything() }), from: TODAY, to: DATES[2], startMin: 720 })
    await act(async () => undefined)
    expect(useWeekPush.getState().line?.push.move?.to).toBe(DATES[2])
    // The band is gone once it is saved; the drag is over.
    expect(q('week-drop')).toBeNull()
    expect(q('week-grid')!.getAttribute('data-dragging')).toBeNull()
  })

  it('po przeciągnięciu klik w blok nie otwiera dnia; zwykły klik – otwiera', async () => {
    vi.mocked(moveWeekBlock).mockResolvedValue({ status: 'saved', push: null, pushed: 0 })
    await mount(days())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    pointer(window, 'pointerup', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8, 0)
    act(() => blockA().click())
    expect(useUi.getState().page).toBe('week')
    await act(async () => undefined)
    // The click that follows a drop is over by the next turn of the loop.
    await new Promise((r) => setTimeout(r, 5))
    // A click with no movement (and a drag under 4 px) is a click: the day opens, nothing is moved.
    vi.mocked(moveWeekBlock).mockClear()
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(1) + 22, COL_TOP + 240 * WEEK_PPM + 9)
    pointer(window, 'pointerup', colLeft(1) + 22, COL_TOP + 240 * WEEK_PPM + 9, 0)
    act(() => blockA().click())
    expect(moveWeekBlock).not.toHaveBeenCalled()
    expect(useUi.getState().page).toBe('today')
    expect(useUi.getState().day).toBe(TODAY)
  })

  it('w tej samej kolumnie: nowa godzina z krokiem 5 min; to samo miejsce – nic nie jest zapisywane', async () => {
    vi.mocked(moveWeekBlock).mockResolvedValue({ status: 'saved', push: null, pushed: 0 })
    await mount(days())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    // 33 px are 41 minutes: 10:41 snaps to 10:40.
    pointer(window, 'pointermove', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8 + 33)
    expect(q('week-drop')!.getAttribute('data-start')).toBe('640')
    pointer(window, 'pointerup', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8 + 33, 0)
    expect(moveWeekBlock).toHaveBeenCalledWith({ blockId: 'a', name: 'Inne obowiązki', names: expect.objectContaining({ settings: expect.anything() }), from: TODAY, to: TODAY, startMin: 640 })
    await act(async () => undefined)
    vi.mocked(moveWeekBlock).mockClear()
    // Out and back to where it stood (the 4 px passed, the minute the same): nothing to write.
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8 + 30)
    pointer(window, 'pointermove', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8 + 1)
    pointer(window, 'pointerup', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8 + 1, 0)
    expect(moveWeekBlock).not.toHaveBeenCalled()
  })

  it('nad dniem minionym miejsce jest odrzucone i puszczenie nic nie zapisuje', async () => {
    await mount(days())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(0) + 20, COL_TOP + 300 * WEEK_PPM + 8)
    const band = q('week-drop')!
    expect(band.getAttribute('data-denied')).toBe('true')
    expect(band.textContent).toContain('dzień minął')
    expect(q('week-grid')!.className).toContain('cursor-not-allowed')
    pointer(window, 'pointerup', colLeft(0) + 20, COL_TOP + 300 * WEEK_PPM + 8, 0)
    expect(moveWeekBlock).not.toHaveBeenCalled()
    expect(q('week-drop')).toBeNull()
  })

  it('Esc w trakcie przeciągania wycisza klik także wtedy, gdy przycisk puszczony jest dużo później', async () => {
    await mount(days())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })))
    await new Promise((r) => setTimeout(r, 30))
    pointer(window, 'pointerup', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8, 0)
    act(() => blockA().click())
    expect(useUi.getState().page).toBe('week')
    expect(moveWeekBlock).not.toHaveBeenCalled()
    // Only that click: the next one is a click again.
    act(() => blockA().click())
    expect(useUi.getState().page).toBe('today')
  })

  it('Esc przeciągania nie zamyka przy okazji warstwy pod nim; Esc bez przeciągania – zamyka', async () => {
    const closed = vi.fn()
    const off = onEscapeLayer(closed)
    await mount(days())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    act(() => void window.dispatchEvent(esc))
    expect(esc.defaultPrevented).toBe(true)
    expect(q('week-drop')).toBeNull()
    expect(closed).not.toHaveBeenCalled()
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })))
    expect(closed).toHaveBeenCalledTimes(1)
    off()
  })

  it('pasmo upuszczenia ma długość chwyconego bloku, także gdy widok odświeżył się bez niego w trakcie', async () => {
    const long = (): HorizonDay[] => [day(DATES[0]!, []), day(TODAY, [block('a', 600, 690, { movable: true })]), day(DATES[2]!, [])]
    await mount(long())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    expect(Number(q('week-drop')!.getAttribute('data-end')) - Number(q('week-drop')!.getAttribute('data-start'))).toBe(90)
    // The view is read again (the block is gone from it – e.g. moved by another computer): the held block keeps its length.
    await act(async () => root!.render(grid([day(DATES[0]!, []), day(TODAY, []), day(DATES[2]!, [])], WEEK_PPM)))
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 400 * WEEK_PPM + 8)
    expect(Number(q('week-drop')!.getAttribute('data-end')) - Number(q('week-drop')!.getAttribute('data-start'))).toBe(90)
  })

  it('w trakcie przeciągania kolumn nie szuka się od nowa, a przewinięcie strony przesuwa miejsce', async () => {
    await mount(days())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    const search = vi.spyOn(Element.prototype, 'querySelector')
    for (const dy of [361, 362, 364, 365]) pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + dy * WEEK_PPM + 8)
    expect(search.mock.calls.filter(([sel]) => String(sel).includes('week-col-'))).toHaveLength(0)
    expect(q('week-drop')!.getAttribute('data-start')).toBe('725')
    // The page scrolled 40 px while the block was held: the same pointer is 50 minutes lower in the column.
    bodyTop = COL_TOP - 40
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 364 * WEEK_PPM + 8)
    expect(q('week-drop')!.getAttribute('data-start')).toBe('775')
    search.mockRestore()
  })

  it('Esc w trakcie przeciągania odwołuje je', async () => {
    await mount(days())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    expect(q('week-drop')).not.toBeNull()
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(q('week-drop')).toBeNull()
    pointer(window, 'pointerup', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8, 0)
    expect(moveWeekBlock).not.toHaveBeenCalled()
  })

  it('pusty przycisk myszy w ruchu (puszczenie poza oknem) kończy przeciąganie bez zapisu', async () => {
    await mount(days())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 25, COL_TOP + 360 * WEEK_PPM + 8, 0)
    expect(q('week-drop')).toBeNull()
    expect(moveWeekBlock).not.toHaveBeenCalled()
  })

  it('odmowa przy zapisie (dzień minął w międzyczasie) – komunikat, nie linia', async () => {
    vi.mocked(moveWeekBlock).mockResolvedValue({ status: 'refused', push: null, pushed: 0 })
    await mount(days())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    pointer(window, 'pointerup', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8, 0)
    await act(async () => undefined)
    expect(useWeekPush.getState().line).toBeNull()
    expect(useUi.getState().toasts.at(-1)?.text).toBe('Dni minionych nie zmieniasz przeciąganiem.')
  })

  it('„3 dni” w większej skali: ta sama godzina z innej wysokości', async () => {
    vi.mocked(moveWeekBlock).mockResolvedValue({ status: 'saved', push: null, pushed: 0 })
    await mount(days(), THREE_DAYS_PPM)
    expect(q('week-grid')!.getAttribute('data-mode')).toBe('3days')
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * THREE_DAYS_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * THREE_DAYS_PPM + 8)
    pointer(window, 'pointerup', colLeft(2) + 20, COL_TOP + 360 * THREE_DAYS_PPM + 8, 0)
    expect(moveWeekBlock).toHaveBeenCalledWith(expect.objectContaining({ to: DATES[2], startMin: 720 }))
    await act(async () => undefined)
  })
})

describe('kopia Ctrl + przeciągnięciem (D513) i klawisze w trakcie', () => {
  const key = (type: 'keydown' | 'keyup', k: string, ctrlKey = false) => act(() => void window.dispatchEvent(new KeyboardEvent(type, { key: k, ctrlKey, bubbles: true, cancelable: true })))
  /** As `pointer`, with Ctrl held. */
  function pointerCtrl(target: EventTarget, type: string, x: number, y: number, buttons = 1): void {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons, ctrlKey: true })
    Object.defineProperty(e, 'pointerId', { value: 1 })
    act(() => void target.dispatchEvent(e))
  }

  it('Ctrl wciśnięty w trakcie: siatka mówi „kopia”, oryginał nieprzyciemniony; puszczenie z Ctrl – kopia o godzinie pod wskaźnikiem, nie przeniesienie', async () => {
    vi.mocked(copyDayBlock).mockResolvedValue('saved')
    await mount(days())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    expect(q('week-grid')!.getAttribute('data-copying')).toBeNull()
    key('keydown', 'Control', true)
    expect(q('week-grid')!.getAttribute('data-copying')).toBe('true')
    expect(blockA().className).not.toContain('opacity-40')
    pointerCtrl(window, 'pointerup', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8, 0)
    await act(async () => undefined)
    expect(moveWeekBlock).not.toHaveBeenCalled()
    expect(copyDayBlock).toHaveBeenCalledWith({ blockId: 'a', name: 'Inne obowiązki', from: TODAY, to: DATES[2], startMin: 720 })
  })

  it('puszczenie Esc (keyup) w trakcie przeciągania nic nie przerywa – Esc działa tylko przy wciśnięciu', async () => {
    vi.mocked(moveWeekBlock).mockResolvedValue({ status: 'saved', push: null, pushed: 0 })
    await mount(days())
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    key('keyup', 'Escape')
    expect(q('week-grid')!.getAttribute('data-dragging')).toBe('true')
    pointer(window, 'pointerup', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8, 0)
    expect(moveWeekBlock).toHaveBeenCalledTimes(1)
  })
})

describe('pasek energii przy lewej krawędzi kolumny (D500, D422)', () => {
  // 06:00 bodźce 99 (the weakest – a tie would be głowa); 10:00 bodźce 40 (uwaga at the reserve 30); 15:00 bodźce 20 (below the reserve).
  const track = (assumed?: true) => ({ samples: [{ at: 360, head: 100, emotions: 100, senses: 99 }, { at: 600, head: 80, emotions: 90, senses: 40 }, { at: 900, head: 50, emotions: 60, senses: 20 }], reserve: 30, ...(assumed ? { assumed } : {}) })
  const rects = (date: string) => [...q(`week-energy-${date}`)!.querySelectorAll('rect')]
  it('dzień ze znaną energią: wąski pasek przy lewej krawędzi w kolorze najsłabszej puli, w trzech odcieniach', async () => {
    const list = days()
    list[1] = { ...list[1]!, energy: track() }
    await mount(list)
    const svg = q(`week-energy-${TODAY}`)!
    expect(svg.getAttribute('width')).toBe(String(STRIP_WIDTH))
    expect(svg.getAttribute('data-assumed')).toBeNull()
    expect(q(`week-energy-assumed-${TODAY}`)).toBeNull()
    const r = rects(TODAY)
    expect(r.map((x) => x.getAttribute('data-state'))).toEqual(['ok', 'watch', 'low'])
    expect(new Set(r.map((x) => x.getAttribute('data-pool')))).toEqual(new Set(['senses']))
    expect(r.map((x) => x.getAttribute('fill'))).toEqual(Array(3).fill(POOL_COLOR.senses))
    expect(r.map((x) => Number(x.getAttribute('opacity')))).toEqual([STRIP_OPACITY.ok, STRIP_OPACITY.watch, STRIP_OPACITY.low])
    // From the first sample to the last, touching.
    expect(r[0]!.getAttribute('data-from')).toBe('360')
    expect(r.at(-1)!.getAttribute('data-to')).toBe('900')
  })
  it('nic pod blokami: bloki stoją na prawo od paska; dzień bez energii – od krawędzi', async () => {
    const list = days()
    list[1] = { ...list[1]!, energy: track() }
    await mount(list)
    expect(q(`week-blocks-${TODAY}`)!.style.left).toBe(`${STRIP_WIDTH + 1}px`)
    expect(q(`week-blocks-${TODAY}`)!.contains(blockA())).toBe(true)
    expect(q(`week-energy-hit-${TODAY}`)!.style.width).toBe(`${STRIP_WIDTH + 1}px`)
    expect(q(`week-blocks-${DATES[0]}`)!.style.left).toBe('0px')
  })
  it('dzień przyszły (przyjęte 100/100/100): pasek jaśniejszy, z podpisem „przyjęte”', async () => {
    await mount(days({ energyTomorrow: track(true) }))
    const svg = q(`week-energy-${DATES[2]}`)!
    expect(svg.getAttribute('data-assumed')).toBe('true')
    expect(Number(rects(DATES[2]!)[0]!.getAttribute('opacity'))).toBeCloseTo(STRIP_OPACITY.ok * ASSUMED_FACTOR, 9)
    expect(q(`week-energy-assumed-${DATES[2]}`)!.textContent).toBe('przyjęte')
  })
  it('bez energii (przed check-inem, dzień minął bez check-inu, moduł wyłączony) – nic nie jest rysowane', async () => {
    await mount(days())
    expect(host!.querySelectorAll('[data-testid^="week-energy-"]')).toHaveLength(0)
  })
  it('odcinek leży tam, gdzie godzina na osi tej skali', async () => {
    const list = days()
    list[1] = { ...list[1]!, energy: track() }
    await mount(list, THREE_DAYS_PPM)
    // 06:00 is the top of the axis; the run from 06:00 starts at 0, the last ends at 15:00 – 540 minutes, 1.2 px each.
    const r = rects(TODAY)
    expect(r[0]!.getAttribute('y')).toBe('0')
    expect(Number(r.at(-1)!.getAttribute('y')) + Number(r.at(-1)!.getAttribute('height'))).toBeCloseTo(540 * THREE_DAYS_PPM, 6)
  })
  it('najechanie na pasek: godzina i trzy wartości', async () => {
    stubClientWidth(1000)
    const list = days()
    list[1] = { ...list[1]!, energy: track() }
    await mount(list)
    const hit = q(`week-energy-hit-${TODAY}`)!
    // The hit area is at the column's top (y = 100); 10:00 is 240 minutes under 06:00.
    vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(function (this: Element) {
      return rect(colLeft(1), COL_TOP, STRIP_WIDTH + 1, 2000)
    })
    act(() => void hit.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: colLeft(1) + 2, clientY: COL_TOP + 240 * WEEK_PPM })))
    const hover = document.querySelector<HTMLElement>(`[data-testid="week-energy-hover-${TODAY}"]`)!
    expect(hover.textContent).toBe('10:00 · głowa 80 · emocje 90 · bodźce 40')
    // Whole: out of the column, which clips what leaves it (T1287) – on the page, right of the strip, at the sample's height.
    expect(q(`week-col-${TODAY}`)!.contains(hover)).toBe(false)
    expect(hover.className).toContain('fixed')
    expect(hover.style.left).toBe(`${colLeft(1) + STRIP_WIDTH + 1 + 3}px`)
    expect(hover.style.top).toBe(`${COL_TOP + 240 * WEEK_PPM}px`)
    act(() => void hit.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
    expect(document.querySelector(`[data-testid="week-energy-hover-${TODAY}"]`)).toBeNull()
  })
  it('podpowiedź przy prawej krawędzi okna staje na lewo od paska', () => {
    expect(hoverPlace({ left: 100, right: 106 }, 50, 1000)).toEqual({ top: 50, left: 109 })
    expect(hoverPlace({ left: 900, right: 906 }, 50, 1000)).toEqual({ top: 50, right: 103 })
  })
  it('podpowiedź nie wychodzi za lewą krawędź okna: gdy nie mieści się po żadnej stronie paska, stoi od 4 px (T1292)', () => {
    expect(hoverPlace({ left: 100, right: 106 }, 50, 200)).toEqual({ top: 50, left: 4 })
    expect(hoverPlace({ left: 267, right: 273 }, 50, 400)).toEqual({ top: 50, right: 136 })
    expect(hoverPlace({ left: 266, right: 272 }, 50, 400)).toEqual({ top: 50, left: 4 })
  })
  /** The strip's hit area at `left`, `top` – what the hover reads when it is placed. */
  const hitAt = (left: number, top: number) => vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(function (this: Element) { return rect(left, top, STRIP_WIDTH + 1, 2000) })
  const hoverOf = () => document.querySelector<HTMLElement>(`[data-testid="week-energy-hover-${TODAY}"]`)
  const hoverOn = async (energy: HorizonDay['energy']) => {
    const list = days()
    list[1] = { ...list[1]!, energy }
    await mount(list)
    hitAt(colLeft(1), COL_TOP)
    act(() => void q(`week-energy-hit-${TODAY}`)!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: colLeft(1) + 2, clientY: COL_TOP + 240 * WEEK_PPM })))
    return list
  }
  it('szerokość okna to szerokość treści bez paska przewijania, nie `innerWidth` (T1292)', async () => {
    stubClientWidth(900)
    const list = days()
    list[1] = { ...list[1]!, energy: track() }
    await mount(list)
    hitAt(700, COL_TOP)
    act(() => void q(`week-energy-hit-${TODAY}`)!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 702, clientY: COL_TOP + 240 * WEEK_PPM })))
    // 706 + 3 + 260 > 900: left of the strip (innerWidth 1024 in jsdom would put it right).
    expect(hoverOf()!.style.right).toBe('203px')
    expect(hoverOf()!.style.left).toBe('')
  })
  it('podpowiedź podąża za paskiem: przewinięcie i zmiana rozmiaru okna przeliczają jej miejsce (T1292)', async () => {
    stubClientWidth(1000)
    await hoverOn(track())
    expect(hoverOf()!.style.top).toBe(`${COL_TOP + 240 * WEEK_PPM}px`)
    // The grid scrolls 50 px up: the sample (and the strip) is 50 px higher.
    hitAt(colLeft(1), COL_TOP - 50)
    act(() => void document.dispatchEvent(new Event('scroll')))
    expect(hoverOf()!.style.top).toBe(`${COL_TOP - 50 + 240 * WEEK_PPM}px`)
    // The column moves 40 px right (the window was resized).
    hitAt(colLeft(1) + 40, COL_TOP - 50)
    act(() => void window.dispatchEvent(new Event('resize')))
    expect(hoverOf()!.style.left).toBe(`${colLeft(1) + 40 + STRIP_WIDTH + 1 + 3}px`)
  })
  it('po przeliczeniu prognozy przy stojącym kursorze podpowiedź ma nowe liczby (T1291)', async () => {
    stubClientWidth(1000)
    const list = await hoverOn(track())
    expect(hoverOf()!.textContent).toBe('10:00 · głowa 80 · emocje 90 · bodźce 40')
    const again = [...list]
    again[1] = { ...list[1]!, energy: { ...track(), samples: [{ at: 360, head: 100, emotions: 100, senses: 99 }, { at: 600, head: 70, emotions: 85, senses: 35 }, { at: 900, head: 50, emotions: 60, senses: 20 }] } }
    await act(async () => root!.render(grid(again, WEEK_PPM)))
    expect(hoverOf()!.textContent).toBe('10:00 · głowa 70 · emocje 85 · bodźce 35')
  })
  it('dzień traci energię i ją odzyskuje: po drodze nie wraca duch podpowiedzi (T1292)', async () => {
    stubClientWidth(1000)
    const list = await hoverOn(track())
    expect(hoverOf()).not.toBeNull()
    const none = [...list]
    none[1] = { ...list[1]!, energy: null }
    await act(async () => root!.render(grid(none, WEEK_PPM)))
    expect(hoverOf()).toBeNull()
    await act(async () => root!.render(grid(list, WEEK_PPM)))
    expect(q(`week-energy-${TODAY}`)).not.toBeNull()
    expect(hoverOf()).toBeNull()
  })
  it('jedna próbka (nic do narysowania): bez paska, bloki od krawędzi kolumny (T1286)', async () => {
    const list = days()
    list[1] = { ...list[1]!, energy: { samples: [{ at: 600, head: 80, emotions: 90, senses: 40 }], reserve: 30 } }
    await mount(list)
    expect(q(`week-energy-${TODAY}`)).toBeNull()
    expect(q(`week-blocks-${TODAY}`)!.style.left).toBe('0px')
  })
  it('miejsce przeciąganego bloku stoi tam, gdzie bloki – na prawo od paska (T1288)', async () => {
    await mount(days({ energyTomorrow: track(true) }))
    pointer(blockA(), 'pointerdown', colLeft(1) + 20, COL_TOP + 240 * WEEK_PPM + 8)
    pointer(window, 'pointermove', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8)
    expect(q(`week-blocks-${DATES[2]}`)!.contains(q('week-drop'))).toBe(true)
    pointer(window, 'pointerup', colLeft(2) + 20, COL_TOP + 360 * WEEK_PPM + 8, 0)
    await act(async () => undefined)
  })
  it('zakres nowego bloku też stoi na prawo od paska (T1288)', async () => {
    // jsdom has no pointer capture (the column takes the pointer once the drag begins).
    stubPointerCapture()
    await mount(days({ energyTomorrow: track(true) }))
    const col = q(`week-col-${DATES[2]}`)!
    pointer(col, 'pointerdown', colLeft(2) + 40, COL_TOP + 600 * WEEK_PPM)
    pointer(col, 'pointermove', colLeft(2) + 40, COL_TOP + 660 * WEEK_PPM)
    expect(q('week-range')).not.toBeNull()
    expect(q(`week-blocks-${DATES[2]}`)!.contains(q('week-range'))).toBe(true)
    pointer(col, 'pointerup', colLeft(2) + 40, COL_TOP + 660 * WEEK_PPM, 0)
  })
})

describe('legenda paska energii (D500)', () => {
  it('„energia 0–100”, pule i nazwy odcieni', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(EnergyStripLegend)))
    const text = q('week-energy-legend')!.textContent!
    expect(text).toContain('energia 0–100')
    expect(text).toContain('najsłabsza pula')
    expect(text).toContain('G głowa')
    expect(q('week-energy-legend-ok')!.textContent).toBe('dobrze')
    expect(q('week-energy-legend-watch')!.textContent).toBe('uwaga (mniej niż 15 nad rezerwą)')
    expect(q('week-energy-legend-low')!.textContent).toBe('poniżej rezerwy')
  })
})
