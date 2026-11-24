// @vitest-environment jsdom
/**
 * N20 (T2560–T2573): the tile of the block at whose time a pool first goes below the reserve has a ring in the pool's colour and the hint
 * „Tu głowa schodzi poniżej rezerwy (28 → 19)” – on the axis of „Dziś” (`dayAxis` + `Timeline`) and in the columns of „3 dni” and „Tydzień”
 * (`DayGrid`). Only that tile; a day without a descent – none. The hint has a slot for an action (N3).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import type { EnergyTrack } from '@shared/engine/energyTrack'
import type { HorizonBlock, HorizonDay } from '@shared/engine/week'
import { rdFrom } from '@shared/model/rd'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { POOL_COLOR } from '@renderer/features/plan/energyDraw'
import { hintAbove, hintLeft, reserveCauseText } from '@renderer/features/plan/ReserveCauseHint'
import { Timeline } from '@renderer/features/plan/Timeline'
import { DayGrid } from '@renderer/features/week/DayGrid'
import { THREE_DAYS_PPM, WEEK_PPM } from '@renderer/features/week/weekLayout'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'
import { block, Scenario } from '../unit/engine/dsl'

const TODAY = '2026-11-18'
let root: Root | null = null
let host: HTMLElement | null = null
let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterAll(() => removeEscape?.())
beforeEach(() => {
  useData.setState({ view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView })
  useUi.setState({ page: 'week', day: null, toasts: [] })
  Element.prototype.scrollIntoView = () => undefined
})
afterEach(() => {
  for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const) Reflect.deleteProperty(Element.prototype, name)
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.restoreAllMocks()
  useData.setState({ view: null })
})
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
async function mount(node: ReturnType<typeof createElement>): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
}
/** The pointer over / off an element (React's `onMouseEnter` comes from `mouseover` / `mouseout`). */
const over = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })))
const out = (el: Element, to: Element = document.body) => act(() => void el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: to })))

/** The ring layer of a tile (N20). */
const ring = (tile: Element) => tile.querySelector<HTMLElement>('[data-testid="reserve-ring"]')
const h = (hh: number, mm = 0) => hh * 60 + mm
/** A track: the head follows the points (straight lines), the other pools stand at 90; a sample every 10 minutes from 06:00 to 20:00. */
function track(head: Array<[number, number]>, reserve = 20): EnergyTrack {
  const at = (t: number): number => {
    if (t <= head[0]![0]) return head[0]![1]
    for (let k = 1; k < head.length; k++) {
      const [t0, v0] = head[k - 1]!
      const [t1, v1] = head[k]!
      if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0)
    }
    return head.at(-1)![1]
  }
  const samples: EnergyTrack['samples'] = []
  for (let t = h(6); t <= h(20); t += 10) samples.push({ at: t, head: at(t), emotions: 90, senses: 90, body: 90 })
  return { samples, reserve }
}

describe('oś „Dziś” – dayAxis i Timeline', () => {
  const names = { rd: rdFrom({}), settings: undefined, routines: [], requests: [] } as unknown as Parameters<typeof dayAxis>[1]
  /** The axis of a day with two blocks: 09:00 (light) and 14:00 (heavy on the head, `heavy`); the check-in at 07:30. */
  function axisOf(heavy: number, o: { noClock?: boolean; today?: string } = {}) {
    const heavyB = { ...block({ id: 'b', cat: 'analiza', at: '14:00', min: 120, origin: 'user' }), costs: { head: heavy, emotions: 0, senses: 0, body: 0 } }
    const plan = [block({ id: 'a', cat: 'analiza', at: '09:00', min: 60, origin: 'user' }), heavyB]
    const s = new Scenario({ date: TODAY, plan, settings: { transitionBufferMin: 0 } })
    s.checkin('07:30', { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] })
    const ctx = s.contextAt(s.at('08:00'))
    const state = computeDay(ctx)
    const model = { date: TODAY, ctx, state, energy: computeEnergy(ctx, state, { moduleOn: true }) } as unknown as DayModel
    return dayAxis(model, { ...names, settings: s.settings }, o.noClock ? null : s.at('08:00'), o.today ?? TODAY)
  }

  it('dzień z zejściem w bloku 14:00 – obwódka i podpowiedź tylko na nim', async () => {
    const axis = axisOf(40)
    const causes = axis.items.filter((i) => i.reserve)
    expect(causes.map((i) => i.id)).toEqual(['b'])
    const cause = causes[0]!.reserve!
    expect(cause.drops).toHaveLength(1)
    expect(cause.drops[0]!.pool).toBe('head')
    expect(cause.drops[0]!.from).toBeGreaterThan(20)
    expect(cause.drops[0]!.to).toBeLessThan(20)
    await mount(createElement(Timeline, { items: axis.items, markers: axis.markers, energy: axis.energy, selected: null, onSelect: () => undefined, from: axis.from, to: axis.to }))
    expect(q('block-b')!.getAttribute('data-reserve-cause')).toBe('head')
    expect(ring(q('block-b')!)!.style.boxShadow).toBe(`inset 0 0 0 2px ${POOL_COLOR.head}`)
    // The tile's own outline and shadow are never the ring's (the focus ring, the selection and a drag's shadow stay).
    expect(q('block-b')!.style.outline).toBe('')
    expect(q('block-b')!.style.boxShadow).toBe('')
    expect(q('block-a')!.getAttribute('data-reserve-cause')).toBeNull()
    expect(ring(q('block-a')!)).toBeNull()
    // The hint opens over the tile that is the cause only.
    expect(q('reserve-cause-b')).toBeNull()
    over(q('block-a')!)
    expect(q('reserve-cause-a')).toBeNull()
    over(q('block-b')!)
    expect(q('reserve-cause-b')!.querySelector('[data-testid="reserve-cause-text"]')!.textContent).toBe(`Tu głowa schodzi poniżej rezerwy (${cause.drops[0]!.from} → ${cause.drops[0]!.to})`)
    expect(q('reserve-cause-b')!.getAttribute('data-pool')).toBe('head')
  })

  it('dzień miniony otwarty w „Dziś” (bez zegara): niezaczęty blok nie jest przyczyną – jak „Tydzień” (`missed`); dzień bieżący bez zegara – jest', () => {
    expect(axisOf(40, { noClock: true, today: '2026-11-19' }).items.some((i) => i.reserve)).toBe(false)
    expect(axisOf(40, { noClock: true }).items.filter((i) => i.reserve).map((i) => i.id)).toEqual(['b'])
  })

  it('dzień bez zejścia – żadnej obwódki', async () => {
    const axis = axisOf(2)
    expect(axis.items.some((i) => i.reserve)).toBe(false)
    await mount(createElement(Timeline, { items: axis.items, markers: axis.markers, energy: axis.energy, selected: null, onSelect: () => undefined, from: axis.from, to: axis.to }))
    expect(host!.querySelector('[data-reserve-cause]')).toBeNull()
    over(q('block-b')!)
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
  })
})

describe('Timeline – podpowiedź i miejsce na akcję', () => {
  const item = (id: string, startMin: number, reserve?: { drops: Array<{ pool: 'head' | 'emotions' | 'senses' | 'body'; from: number; to: number }> }) => ({
    id,
    startMin,
    endMin: startMin + 60,
    title: id,
    marks: [],
    color: '#79AFAB',
    categoryId: 'inne',
    background: false,
    ...(reserve ? { reserve } : {})
  })

  it('pierwsza pula nadaje kolor obwódce; podpowiedź wymienia obie pule; `reserveAction` stoi pod słowami', async () => {
    const two = item('x', h(14), {
      drops: [
        { pool: 'emotions', from: 40, to: 18 },
        { pool: 'senses', from: 35, to: 29 }
      ]
    })
    const action = vi.fn((id: string) => createElement('button', { 'data-testid': `act-${id}` }, 'Wstaw regenerację tutaj'))
    await mount(createElement(Timeline, { items: [two, item('y', h(10))], markers: [], selected: null, onSelect: () => undefined, from: 360, to: 1320, reserveAction: action }))
    const tile = q('block-x')!
    // jsdom normalises the colour to rgb(): compare through an element of the same colour.
    const probe = document.createElement('i')
    probe.style.boxShadow = `inset 0 0 0 2px ${POOL_COLOR.emotions}`
    expect(ring(tile)!.style.boxShadow).toBe(probe.style.boxShadow)
    over(tile)
    expect(q('reserve-cause-x')!.getAttribute('data-pool')).toBe('emotions')
    expect(q('reserve-cause-text')!.textContent).toBe('Tu emocje schodzą poniżej rezerwy (40 → 18) · bodźce schodzą poniżej rezerwy (35 → 29)')
    expect(q('act-x')!.closest('[role="tooltip"]')).toBe(q('reserve-cause-x'))
  })

  it('wskaźnik schodzi z kafelka – podpowiedź znika po krótkiej zwłoce na dojście do okna; wskaźnik na oknie ją trzyma', async () => {
    vi.useFakeTimers()
    try {
      await mount(createElement(Timeline, { items: [item('x', h(14), { drops: [{ pool: 'head', from: 28, to: 19 }] })], markers: [], selected: null, onSelect: () => undefined, from: 360, to: 1320 }))
      over(q('block-x')!)
      expect(q('reserve-cause-x')).not.toBeNull()
      out(q('block-x')!)
      // The pointer reaches the window within the grace: it stays.
      over(q('reserve-cause-x')!)
      act(() => void vi.advanceTimersByTime(1000))
      expect(q('reserve-cause-x')).not.toBeNull()
      out(q('reserve-cause-x')!)
      act(() => void vi.advanceTimersByTime(1000))
      expect(q('reserve-cause-x')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fokus przechodzi z kafelka na przycisk w okienku (Tab) – podpowiedź zostaje; fokus poza okienkiem ją zamyka', async () => {
    vi.useFakeTimers()
    try {
      const action = (id: string) => createElement('button', { 'data-testid': `act-${id}` }, 'Wstaw regenerację tutaj')
      await mount(createElement(Timeline, { items: [item('x', h(14), { drops: [{ pool: 'head', from: 28, to: 19 }] })], markers: [], selected: null, onSelect: () => undefined, from: 360, to: 1320, reserveAction: action }))
      const tile = q('block-x')!
      act(() => tile.focus())
      expect(q('reserve-cause-x')).not.toBeNull()
      act(() => q('act-x')!.focus())
      act(() => void vi.advanceTimersByTime(1000))
      expect(q('reserve-cause-x')).not.toBeNull()
      // The pointer going off the tile does not close it while the focus is in the window.
      out(tile)
      act(() => void vi.advanceTimersByTime(1000))
      expect(q('reserve-cause-x')).not.toBeNull()
      act(() => q('act-x')!.blur())
      act(() => void vi.advanceTimersByTime(1000))
      expect(q('reserve-cause-x')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('okienko nie wychodzi poza prawą krawędź (T2570) i zamyka się przy przewinięciu', async () => {
    await mount(createElement(Timeline, { items: [item('x', h(14), { drops: [{ pool: 'head', from: 28, to: 19 }] })], markers: [], selected: null, onSelect: () => undefined, from: 360, to: 1320 }))
    const tile = q('block-x')!
    const at = { left: 1000, right: 1100, top: 300, bottom: 360, width: 100, height: 60, x: 1000, y: 300, toJSON: () => ({}) } as DOMRect
    vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue(at)
    over(tile)
    // jsdom has no layout: the window is taken as its widest (18 rem = 288 px), the viewport is 1024 px wide.
    expect(q('reserve-cause-x')!.style.left).toBe(`${window.innerWidth - 288 - 4}px`)
    act(() => void document.dispatchEvent(new Event('scroll')))
    expect(q('reserve-cause-x')).toBeNull()
  })

  it('hintLeft: tak jak kafelek, byle w oknie – od 4 px do szerokość okna − szerokość − 4', () => {
    expect(hintLeft(100, 288, 1024)).toBe(100)
    expect(hintLeft(900, 288, 1024)).toBe(732)
    expect(hintLeft(-30, 288, 1024)).toBe(4)
  })

  it('klawiatura (T2569): Tab z kafelka wchodzi do okienka, Shift+Tab z pierwszego wraca, Tab z ostatniego i Esc wracają i zamykają; bez elementu w okienku Tab idzie jak dotąd', async () => {
    const action = (id: string) => createElement('button', { 'data-testid': `act-${id}` }, 'Wstaw regenerację tutaj')
    const cause = { drops: [{ pool: 'head' as const, from: 28, to: 19 }] }
    const key = (target: Element, k: string, shiftKey = false) => {
      const e = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })
      act(() => void target.dispatchEvent(e))
      return e
    }
    await mount(createElement(Timeline, { items: [item('x', h(14), cause)], markers: [], selected: null, onSelect: () => undefined, from: 360, to: 1320, reserveAction: action }))
    const tile = q('block-x')!
    act(() => tile.focus())
    expect(q('reserve-cause-x')).not.toBeNull()
    // Tab on the tile: the focus goes into the window (the portal is outside the order of Tab).
    expect(key(tile, 'Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(q('act-x'))
    // Shift+Tab from its first element: back to the tile, the hint stays.
    expect(key(q('act-x')!, 'Tab', true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(tile)
    expect(q('reserve-cause-x')).not.toBeNull()
    // Tab from its last: back to the tile, the hint closed and not opened again by the focus; the next Tab goes on as always.
    key(tile, 'Tab')
    expect(key(q('act-x')!, 'Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(tile)
    expect(q('reserve-cause-x')).toBeNull()
    expect(key(tile, 'Tab').defaultPrevented).toBe(false)
    // Esc in the window: back to the tile and closed.
    act(() => tile.blur())
    act(() => tile.focus())
    key(tile, 'Tab')
    key(q('act-x')!, 'Escape')
    expect(document.activeElement).toBe(tile)
    expect(q('reserve-cause-x')).toBeNull()
    // Leaving the tile lets its hint open again.
    act(() => tile.blur())
    act(() => tile.focus())
    expect(q('reserve-cause-x')).not.toBeNull()
  })

  it('klawiatura: bez elementu w okienku Tab na kafelku nie jest przechwytywany', async () => {
    await mount(createElement(Timeline, { items: [item('x', h(14), { drops: [{ pool: 'head', from: 28, to: 19 }] })], markers: [], selected: null, onSelect: () => undefined, from: 360, to: 1320 }))
    const tile = q('block-x')!
    act(() => tile.focus())
    expect(q('reserve-cause-x')).not.toBeNull()
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    act(() => void tile.dispatchEvent(e))
    expect(e.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(tile)
  })

  it('kafelek traci przyczynę przy otwartej podpowiedzi (przeliczenie, edycja) – podpowiedź się zamyka i nie wraca sama, gdy przyczyna wróci', async () => {
    const cause = { drops: [{ pool: 'head' as const, from: 28, to: 19 }] }
    const draw = (reserve: typeof cause | undefined) => act(async () => root!.render(createElement(Timeline, { items: [item('x', h(14), reserve)], markers: [], selected: null, onSelect: () => undefined, from: 360, to: 1320 })))
    await mount(createElement(Timeline, { items: [item('x', h(14), cause)], markers: [], selected: null, onSelect: () => undefined, from: 360, to: 1320 }))
    over(q('block-x')!)
    expect(q('reserve-cause-x')).not.toBeNull()
    await draw(undefined)
    expect(q('reserve-cause-x')).toBeNull()
    await draw(cause)
    expect(q('reserve-cause-x')).toBeNull()
    // The pointer comes again: it opens as ever.
    out(q('block-x')!)
    over(q('block-x')!)
    expect(q('reserve-cause-x')).not.toBeNull()
  })

  it('okienko stoi nad kafelkiem, gdy się tam mieści (góra kafelka dalej od góry okna niż wysokość okienka), inaczej pod nim', async () => {
    expect(hintAbove(100, 80)).toBe(true)
    expect(hintAbove(84, 80)).toBe(false)
    expect(hintAbove(60, 80)).toBe(false)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80)
    await mount(createElement(Timeline, { items: [item('x', h(14), { drops: [{ pool: 'head', from: 28, to: 19 }] })], markers: [], selected: null, onSelect: () => undefined, from: 360, to: 1320 }))
    const tile = q('block-x')!
    const rectAt = (top: number) => ({ left: 100, right: 200, top, bottom: top + 60, width: 100, height: 60, x: 100, y: top, toJSON: () => ({}) }) as DOMRect
    const spy = vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue(rectAt(70))
    over(tile)
    expect(q('reserve-cause-x')!.style.top).toBe('132px')
    out(tile)
    act(() => void document.dispatchEvent(new Event('scroll')))
    spy.mockReturnValue(rectAt(300))
    over(tile)
    expect(q('reserve-cause-x')!.style.bottom).toBe(`${window.innerHeight - 300 + 2}px`)
  })

  it('słowa: jedna pula, liczba mnoga dla emocji i bodźców', () => {
    expect(reserveCauseText({ drops: [{ pool: 'head', from: 28, to: 19 }] })).toBe('Tu głowa schodzi poniżej rezerwy (28 → 19)')
    expect(reserveCauseText({ drops: [{ pool: 'body', from: 30, to: 10 }] })).toBe('Tu ciało schodzi poniżej rezerwy (30 → 10)')
    expect(reserveCauseText({ drops: [{ pool: 'senses', from: 30, to: 10 }] })).toBe('Tu bodźce schodzą poniżej rezerwy (30 → 10)')
    // T2571: the forecast runs the block elsewhere than its tile stands.
    expect(reserveCauseText({ drops: [{ pool: 'head', from: 28, to: 19, runs: { startMin: h(17), endMin: h(18, 30), forecast: true } }] })).toBe('Tu głowa schodzi poniżej rezerwy (28 → 19) · w prognozie 17:00–18:30')
    // T2573: a run of the log away from the tile (a swap that began the block at another hour); two pools of one run – the place once, at the end.
    expect(reserveCauseText({ drops: [{ pool: 'head', from: 28, to: 19, runs: { startMin: h(10), endMin: h(10, 20), forecast: false } }] })).toBe('Tu głowa schodzi poniżej rezerwy (28 → 19) · biegł 10:00–10:20')
    const run = { startMin: h(17), endMin: h(18, 30), forecast: true }
    expect(reserveCauseText({ drops: [{ pool: 'head', from: 28, to: 19, runs: run }, { pool: 'senses', from: 35, to: 29, runs: run }] })).toBe('Tu głowa schodzi poniżej rezerwy (28 → 19) · bodźce schodzą poniżej rezerwy (35 → 29) · w prognozie 17:00–18:30')
    expect(reserveCauseText({ drops: [{ pool: 'head', from: 28, to: 19, runs: run }, { pool: 'senses', from: 35, to: 29 }] })).toBe('Tu głowa schodzi poniżej rezerwy (28 → 19) · w prognozie 17:00–18:30 · bodźce schodzą poniżej rezerwy (35 → 29)')
  })
})

describe('„Tydzień” i „3 dni” – DayGrid', () => {
  const named = { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
  const hb = (id: string, startMin: number, endMin: number, o: Partial<HorizonBlock> = {}): HorizonBlock => ({ id, named, categoryId: 'inne', startMin, endMin, state: 'planned', outsidePlan: false, background: false, ...o })
  const day = (date: string, blocks: HorizonBlock[], energy: EnergyTrack | null): HorizonDay => ({
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
    energy,
    budget: null
  })
  const blocks = () => [hb('a', h(9), h(10)), hb('b', h(14), h(15, 30)), hb('c', h(16), h(17))]
  // The head: 60 at 09:00, 28 at 14:00 (the start of „b”), 10 at 15:30 – below 20 from about 15:05, inside „b”.
  const falling = () => track([[h(9), 60], [h(14), 28], [h(15, 30), 10]])
  const calm = () => track([[h(9), 60], [h(15), 40]])
  const grid = (list: HorizonDay[], ppm: number) => createElement(DayGrid, { days: list, from: 360, to: 1320, ppm, mode: ppm === WEEK_PPM ? 'week' : '3days', openCard: null, onCardOpened: () => undefined })

  for (const [name, ppm] of [['Tydzień', WEEK_PPM], ['3 dni', THREE_DAYS_PPM]] as const) {
    it(`${name}: dzień z zejściem w bloku 14:00 – obwódka tylko na nim, dzień bez zejścia – żadnej`, async () => {
      const d1 = '2026-11-19'
      const d2 = '2026-11-20'
      await mount(grid([day(d1, blocks(), falling()), day(d2, blocks(), calm())], ppm))
      expect(q(`week-block-${d1}-b`)!.getAttribute('data-reserve-cause')).toBe('head')
      expect(ring(q(`week-block-${d1}-b`)!)).not.toBeNull()
      expect(ring(q(`week-block-${d1}-a`)!)).toBeNull()
      expect(q(`week-block-${d1}-a`)!.getAttribute('data-reserve-cause')).toBeNull()
      expect(q(`week-block-${d1}-c`)!.getAttribute('data-reserve-cause')).toBeNull()
      expect(host!.querySelectorAll(`[data-testid^="week-block-${d2}-"][data-reserve-cause]`)).toHaveLength(0)
      over(q(`week-block-${d1}-b`)!)
      expect(q('reserve-cause-b')!.querySelector('[data-testid="reserve-cause-text"]')!.textContent).toMatch(/^Tu głowa schodzi poniżej rezerwy \(28 → \d+\)$/)
      over(q(`week-block-${d1}-a`)!)
      expect(q('reserve-cause-a')).toBeNull()
    })
  }

  it('`reserveAction` strony: element akcji stoi w podpowiedzi właściwego kafelka (z dniem kolumny), nigdzie indziej', async () => {
    const d1 = '2026-11-19'
    const d2 = '2026-11-20'
    const action = vi.fn((id: string, _cause: unknown, date: string) => createElement('button', { 'data-testid': `act-${date}-${id}` }, 'Wstaw regenerację tutaj'))
    await mount(createElement(DayGrid, { days: [day(d1, blocks(), falling()), day(d2, blocks(), calm())], from: 360, to: 1320, ppm: WEEK_PPM, mode: 'week', openCard: null, onCardOpened: () => undefined, reserveAction: action }))
    expect(q(`act-${d1}-b`)).toBeNull()
    over(q(`week-block-${d1}-b`)!)
    expect(q(`act-${d1}-b`)!.closest('[role="tooltip"]')).toBe(q('reserve-cause-b'))
    expect(action).toHaveBeenCalledTimes(1)
    expect(action.mock.calls[0]![0]).toBe('b')
    expect(action.mock.calls[0]![2]).toBe(d1)
    // A tile that is not a cause has no hint, so no action.
    over(q(`week-block-${d2}-b`)!)
    expect(q(`act-${d2}-b`)).toBeNull()
  })

  it('filtr kalendarzy: przyczyną jest blok ukrytego kalendarza – żaden widoczny kafelek nie ma obwódki; widoczny – ma', async () => {
    const d1 = '2026-11-19'
    // „h” (of the unchecked calendar) began later than „b” and stands in the same minutes: it is the cause – the visible „b” is not.
    const whole = day(d1, [...blocks(), hb('h', h(14, 10), h(15, 30))], falling())
    const seen = day(d1, whole.blocks.filter((b) => b.id !== 'h'), falling())
    await mount(createElement(DayGrid, { days: [seen], allDays: [whole], from: 360, to: 1320, ppm: WEEK_PPM, mode: 'week', openCard: null, onCardOpened: () => undefined }))
    expect(q(`week-block-${d1}-a`)).not.toBeNull()
    expect(q(`week-block-${d1}-b`)).not.toBeNull()
    expect(q(`week-block-${d1}-h`)).toBeNull()
    expect(host!.querySelector('[data-reserve-cause]')).toBeNull()
    act(() => root?.unmount())
    host?.remove()
    await mount(createElement(DayGrid, { days: [whole], allDays: [whole], from: 360, to: 1320, ppm: WEEK_PPM, mode: 'week', openCard: null, onCardOpened: () => undefined }))
    expect(q(`week-block-${d1}-h`)!.getAttribute('data-reserve-cause')).toBe('head')
    expect(q(`week-block-${d1}-b`)!.getAttribute('data-reserve-cause')).toBeNull()
  })

  for (const ctrl of [false, true]) {
    it(`przeciąganie bloku${ctrl ? ' z Ctrl (kopia)' : ''} nad kafelkiem przyczyny – jego podpowiedź się nie otwiera; po puszczeniu – otwiera`, async () => {
      for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const) Object.defineProperty(Element.prototype, name, { value: name === 'hasPointerCapture' ? () => false : () => undefined, configurable: true, writable: true })
      const d1 = '2026-11-19'
      const move = (target: EventTarget, type: string, x: number, y: number, buttons = 1) => {
        const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons, ctrlKey: ctrl })
        Object.defineProperty(e, 'pointerId', { value: 1 })
        act(() => void target.dispatchEvent(e))
      }
      await mount(grid([day(d1, [hb('a', h(9), h(10), { movable: true }), hb('b', h(14), h(15, 30))], falling())], WEEK_PPM))
      const a = q(`week-block-${d1}-a`)!
      const b = q(`week-block-${d1}-b`)!
      move(a, 'pointerdown', 100, 100)
      move(window, 'pointermove', 100, 160)
      over(b)
      expect(q('reserve-cause-b')).toBeNull()
      out(b)
      move(window, 'pointerup', 100, 160, 0)
      over(b)
      expect(q('reserve-cause-b')).not.toBeNull()
    })
  }

  it('blok biegnie w prognozie później niż stoi jego kafelek (pod stałą sesją): obwódka na kafelku z planowanym miejscem, podpowiedź mówi, gdzie biegnie; bez miejsc z prognozy zejście wypada w przerwie', async () => {
    const d1 = '2026-11-19'
    const late = track([[h(16), 60], [h(17), 30], [h(17, 30), 10]])
    const forecast = { ...late, runs: [{ id: 'h2', startMin: h(17), endMin: h(18, 30), background: false, forecast: true }] }
    const list = (energy: EnergyTrack) => [day(d1, [hb('a', h(9), h(10)), hb('h2', h(13), h(14, 30))], energy)]
    await mount(grid(list(forecast), WEEK_PPM))
    expect(q(`week-block-${d1}-h2`)!.getAttribute('data-reserve-cause')).toBe('head')
    expect(q(`week-block-${d1}-a`)!.getAttribute('data-reserve-cause')).toBeNull()
    over(q(`week-block-${d1}-h2`)!)
    expect(q('reserve-cause-text')!.textContent).toMatch(/^Tu głowa schodzi poniżej rezerwy \(\d+ → \d+\) · w prognozie 17:00–18:30$/)
    act(() => root?.unmount())
    host?.remove()
    await mount(grid(list(late), WEEK_PPM))
    expect(host!.querySelector('[data-reserve-cause]')).toBeNull()
  })

  it('blok odwołany nie jest przyczyną; dzień bez krzywej – żadnej obwódki', async () => {
    const d1 = '2026-11-19'
    await mount(grid([day(d1, [hb('a', h(9), h(10)), hb('b', h(14), h(15, 30), { state: 'cancelled' })], falling())], WEEK_PPM))
    expect(host!.querySelector('[data-reserve-cause]')).toBeNull()
    act(() => root?.unmount())
    host?.remove()
    await mount(grid([day(d1, blocks(), null)], WEEK_PPM))
    expect(host!.querySelector('[data-reserve-cause]')).toBeNull()
  })
})
