// @vitest-environment jsdom
/**
 * Energia na żywo w oknie (N19, D593, D594, T2581): podpis „najniższa energia 52 → 44 (G)” z próbnego policzenia dnia stoi przy blokiem trzymanym
 * na osi („Dziś”) – w trakcie przeciągania, zanim go puścisz – i przy krawędzi zmienianej długości, z dopiskiem „przyjęte” dla dnia bez własnego
 * check-inu; bez zmiany najniższej nie ma podpisu; Esc odwołuje przeciągnięcie i nic nie zapisuje (podpis znika z nim); okienko kosztu na kafelku mówi to
 * samo o liczbie, którą pokazuje, a jeszcze nie zapisało (także o tej z kółka myszy).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { costTrial, lowestBefore, type TrialDay } from '@shared/engine/trialEnergy'
import type { TileCost } from '@shared/model/blockCosts'
import type { Answer } from '@shared/model/events'
import type { Pool } from '@shared/model/categories'
import type { PlanBlock } from '@shared/model/plan'
import { Timeline, type TimelineItem, type TimelineTrial } from '@renderer/features/plan/Timeline'
import { TileCost as TileCostView, type CostTrial } from '@renderer/features/plan/TileCost'
import { useData } from '@renderer/store/data'
import { trialText } from '@renderer/features/plan/TrialCaption'
import { changeTrial, TRIAL_DELAY_MS } from '@renderer/features/plan/trialEnergy'
import { dragChange } from '@renderer/features/today/dayPush'
import { installEscape } from '@renderer/lib/escape'
import { resetWheel } from '@renderer/lib/wheel'
import { block, lm, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-28'
const ZERO: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const PLAN = [flex('drogi', '08:00', 120, { categoryId: 'analiza' }), flex('regen', '10:00', 120, { categoryId: 'regeneracja', fixed: true }), flex('praca', '14:00', 120, { categoryId: 'analiza' })]

/** The day as the window counts it: with its check-in (energy known), or without (the assumed one – D593). */
function counted(o: { checkin?: boolean; plan?: PlanBlock[] } = {}): TrialDay {
  const s = new Scenario({ date: DATE, plan: o.plan ?? PLAN, wake: '06:30', settings: { transitionBufferMin: 0 } }).observe('06:30', null)
  const ctx = (o.checkin === false ? s : s.checkin('07:00', ZERO)).contextAt(s.at('07:30'))
  const state = computeDay(ctx)
  return { ctx, state, energy: computeEnergy(ctx, state, { moduleOn: true }) }
}

/** What „Dziś” gives its axis (`TodayPage.trialOfDrag`, the body and the edges of a block of the plan). */
const trialOf = (day: TrialDay): TimelineTrial => ({
  day,
  drag: (d) => ({
    key: `${d.id}|${d.edge ?? ''}|${d.span.startMin}|${d.span.endMin}|${d.copy}`,
    change: () => {
      const c = dragChange(day, d.id, d.span, d.edge, d.shown, true)
      return c ? changeTrial(day, c) : null
    }
  }),
  cost: (at, id, costs) => costTrial(at, id, costs)
})

let root: Root | null = null
let host: HTMLElement | null = null
let removeEscape: (() => void) | null = null
const capture = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.useFakeTimers()
  removeEscape = installEscape()
  for (const name of capture) Object.defineProperty(Element.prototype, name, { value: name === 'hasPointerCapture' ? () => false : () => undefined, configurable: true, writable: true })
})
afterEach(() => {
  for (const name of capture) Reflect.deleteProperty(Element.prototype, name)
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  removeEscape?.()
  vi.useRealTimers()
  resetWheel()
})

const item = (b: PlanBlock, o: Partial<TimelineItem> = {}): TimelineItem => ({ id: b.id, startMin: b.startMin ?? 0, endMin: (b.startMin ?? 0) + b.durationMin, title: b.id, marks: [], color: '#79AFAB', categoryId: b.categoryId, background: false, movable: !b.fixed, ...o })
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
/** A pointer event of the left button (jsdom has no PointerEvent: a mouse event with the pointer's id). */
function pointer(target: EventTarget, type: string, y: number, buttons = 1, ctrlKey = false): void {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 50, clientY: y, button: 0, buttons, ctrlKey })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  act(() => void target.dispatchEvent(e))
}
const escape = () => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
/** Minutes to pixels of the axis (`PPM` 1.1). */
const px = (minutes: number) => Math.round(minutes * 1.1)

interface MountOptions {
  onMove?: () => void
  onResize?: () => false
  items?: TimelineItem[]
  onCosts?: () => Promise<boolean>
  /** The axis' own trial (default: the one of „Dziś”); null – an axis without energy on trial („Szablony”). */
  trial?: TimelineTrial | null
  /** More props of the axis (a copy, a group's drag). */
  extra?: Record<string, unknown>
}
const propsOf = (day: TrialDay, o: MountOptions) => ({
  items: o.items ?? PLAN.map((b) => item(b)),
  markers: [],
  selected: null,
  onSelect: () => undefined,
  onMove: o.onMove ?? (() => undefined),
  onResize: o.onResize ?? (() => false),
  onCosts: o.onCosts,
  ...(o.trial === null ? {} : { energyTrial: o.trial ?? trialOf(day) }),
  ...(o.extra ?? {}),
  from: 360,
  to: 1320
})
function mount(day: TrialDay, o: MountOptions = {}) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(createElement(Timeline, propsOf(day, o))))
}
/** The axis drawn again (the day counted again, the tiles read back). */
const remount = (day: TrialDay, o: MountOptions = {}) => act(() => root!.render(createElement(Timeline, propsOf(day, o))))
const caption = () => q('energy-trial')

describe('N19 – podpis przy przeciąganym bloku „Dziś” (przed puszczeniem)', () => {
  it('drogi blok przeciągnięty przed pracę popołudniową: podpis ze spadkiem i literą puli, zanim go puścisz; po puszczeniu znika', () => {
    const onMove = vi.fn()
    mount(counted(), { onMove })
    const tile = q('block-drogi')!
    pointer(tile, 'pointerdown', 100)
    pointer(tile, 'pointermove', 100 + px(480))
    expect(caption()).toBeNull()
    advance(TRIAL_DELAY_MS)
    const c = caption()!
    expect(c.textContent).toMatch(/^najniższa energia \d+ → \d+ \(G\)$/)
    expect(Number(c.dataset.after)).toBeLessThan(Number(c.dataset.before))
    expect(c.dataset.fresh).toBe('true')
    // Nothing is written by the trial: the drop is the only call that does.
    expect(onMove).not.toHaveBeenCalled()
    pointer(tile, 'pointerup', 100 + px(480), 0)
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(caption()).toBeNull()
  })

  it('Esc w trakcie: podpis znika, puszczenie niczego nie zapisuje', () => {
    const onMove = vi.fn()
    mount(counted(), { onMove })
    const tile = q('block-drogi')!
    pointer(tile, 'pointerdown', 100)
    pointer(tile, 'pointermove', 100 + px(480))
    advance(TRIAL_DELAY_MS)
    expect(caption()).not.toBeNull()
    escape()
    expect(caption()).toBeNull()
    expect(q('energy-trial-box')).toBeNull()
    pointer(tile, 'pointerup', 100 + px(480), 0)
    expect(onMove).not.toHaveBeenCalled()
    // The pointer moving on after Esc brings nothing back.
    pointer(tile, 'pointermove', 100 + px(500))
    advance(TRIAL_DELAY_MS)
    expect(caption()).toBeNull()
  })

  it('powrót na własne miejsce (przeciągnięcie bez zmiany): podpis znika – najniższa ta sama (D594)', () => {
    mount(counted())
    const tile = q('block-drogi')!
    pointer(tile, 'pointerdown', 100)
    pointer(tile, 'pointermove', 100 + px(480))
    advance(TRIAL_DELAY_MS)
    expect(caption()).not.toBeNull()
    pointer(tile, 'pointermove', 100)
    advance(TRIAL_DELAY_MS * 3)
    expect(caption()).toBeNull()
    expect(q('energy-trial-box')).toBeNull()
  })

  it('dzień bez własnego check-inu (dziś przed nim, dzień przyszły): podpis z dopiskiem „przyjęte” (D593)', () => {
    mount(counted({ checkin: false }))
    const tile = q('block-drogi')!
    pointer(tile, 'pointerdown', 100)
    pointer(tile, 'pointermove', 100 + px(480))
    advance(TRIAL_DELAY_MS)
    expect(caption()!.textContent).toMatch(/^najniższa energia \d+ → \d+ \(G\) · przyjęte$/)
  })

  it('kolejny ruch: do policzenia nowego miejsca stoi poprzedni wynik przygaszony; powrót nad to samo miejsce – od razu', () => {
    mount(counted())
    const tile = q('block-drogi')!
    pointer(tile, 'pointerdown', 100)
    pointer(tile, 'pointermove', 100 + px(480))
    advance(TRIAL_DELAY_MS)
    const first = caption()!.textContent
    pointer(tile, 'pointermove', 100 + px(500))
    expect(caption()!.dataset.fresh).toBe('false')
    advance(TRIAL_DELAY_MS)
    expect(caption()!.dataset.fresh).toBe('true')
    pointer(tile, 'pointermove', 100 + px(480))
    expect(caption()!.textContent).toBe(first)
    expect(caption()!.dataset.fresh).toBe('true')
  })
})

describe('N19 – podpis przy zmianie długości krawędzią', () => {
  it('dolna krawędź dłuższego bloku pracy: podpis w podpowiedzi krawędzi (edge-hint), przed puszczeniem; Esc – znika, nic nie zapisane', () => {
    const onResize = vi.fn(() => false as const)
    mount(counted(), { onResize })
    const edge = q('block-praca-edge-end')!
    pointer(edge, 'pointerdown', 100)
    pointer(edge, 'pointermove', 100 + px(120))
    advance(TRIAL_DELAY_MS)
    const hint = q('edge-hint')!
    const c = caption()!
    expect(hint.contains(c)).toBe(true)
    expect(Number(c.dataset.after)).toBeLessThan(Number(c.dataset.before))
    expect(onResize).not.toHaveBeenCalled()
    escape()
    expect(q('edge-hint')).toBeNull()
    expect(caption()).toBeNull()
    pointer(edge, 'pointerup', 100 + px(120), 0)
    expect(onResize).not.toHaveBeenCalled()
  })
})

describe('N19 – oś z energią na żywo rysuje się też na serwerze (renderToString)', () => {
  it('Timeline z energyTrial: bez błędu „Missing getServerSnapshot” (testy rysujące oś tekstem)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const html = renderToString(createElement(Timeline, propsOf(counted(), {})))
      expect(html).toContain('block-drogi')
      expect(error.mock.calls.some((c) => String(c[0]).includes('getServerSnapshot'))).toBe(false)
    } finally {
      error.mockRestore()
    }
  })
})

describe('N19 – tekst podpisu', () => {
  it('„najniższa energia 52 → 44 (G)”; „przyjęte” dla przyjętego; bez zmiany – nic', () => {
    expect(trialText({ before: 52, after: 44, pool: 'head', assumed: false })).toBe('najniższa energia 52 → 44 (G)')
    expect(trialText({ before: 52, after: 44, pool: 'senses', assumed: true })).toBe('najniższa energia 52 → 44 (B) · przyjęte')
    expect(trialText({ before: 52, after: 52, pool: 'body', assumed: false })).toBeNull()
    expect(trialText(null)).toBeNull()
  })
})

describe('N19 – okienko kosztu na kafelku: podpis przed zapisem', () => {
  const cost = (costs: TileCost['costs']): TileCost => ({ costs, base: { head: 3, emotions: 1, senses: 1, body: 0 }, own: false, edit: true })
  const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
  const wheelUp = (el: Element) => {
    const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, deltaX: 0, shiftKey: false })
    Object.defineProperty(e, 'wheelDeltaY', { value: 120 })
    Object.defineProperty(e, 'wheelDelta', { value: 120 })
    act(() => void el.dispatchEvent(e))
  }
  const withCost = () => PLAN.map((b) => item(b, b.id === 'drogi' ? { cost: cost({ head: 3, emotions: 1, senses: 1, body: 0 }) } : {}))

  it('drogi koszt głowy, kliknięty „+” przed zapisem (zapis jeszcze trwa): podpis ze spadkiem; okno zamknięte – nic', () => {
    // A save that does not answer: the window shows the number the tile has not saved.
    const onCosts = vi.fn(() => new Promise<boolean>(() => undefined))
    mount(counted(), { items: withCost(), onCosts })
    click(q('block-drogi-cost')!)
    expect(q('cost-pop-energy')).toBeNull()
    for (let i = 0; i < 20; i++) click(q('cost-pop-head-plus')!)
    advance(TRIAL_DELAY_MS)
    const line = q('cost-pop-energy')!
    expect(line.textContent).toMatch(/^najniższa energia \d+ → \d+ \(G\)$/)
    expect(Number(q('energy-trial')!.dataset.after)).toBeLessThan(Number(q('energy-trial')!.dataset.before))
    escape()
    expect(q('cost-pop')).toBeNull()
    expect(q('cost-pop-energy')).toBeNull()
  })

  it('liczba z kółka myszy, jeszcze niezapisana (400 ms ciszy): podpis ją uwzględnia', () => {
    const onCosts = vi.fn(async () => true)
    mount(counted(), { items: withCost(), onCosts })
    click(q('block-drogi-cost')!)
    for (let i = 0; i < 25; i++) wheelUp(q('cost-pop-head-value')!)
    expect(onCosts).not.toHaveBeenCalled()
    advance(TRIAL_DELAY_MS)
    expect(q('cost-pop-energy')).not.toBeNull()
    expect((q('cost-pop-head-value') as HTMLInputElement).value).toBe('28')
  })

  it('okienko otwarte, nic nie zmienione – bez podpisu', () => {
    mount(counted(), { items: withCost(), onCosts: vi.fn(async () => true) })
    click(q('block-drogi-cost')!)
    advance(TRIAL_DELAY_MS * 3)
    expect(q('cost-pop-energy')).toBeNull()
  })
})


describe('N19 – puszczenie, które nic nie zapisze, nie ma próby (nawet nie budowanej)', () => {
  const own = 480
  const calls = (drag: ReturnType<typeof vi.fn>) => drag.mock.calls.map((c) => c[0] as { span: { startMin: number }; copy: boolean; group: boolean; minutes: number })
  const trialSpy = (day: TrialDay) => {
    const drag = vi.fn((d: Parameters<TimelineTrial['drag']>[0]) => trialOf(day).drag(d))
    return { drag, trial: { ...trialOf(day), drag } satisfies TimelineTrial }
  }

  it('blok z powrotem na własnym miejscu: po powrocie próba nie jest budowana, podpis znika', () => {
    const day = counted()
    const { drag, trial } = trialSpy(day)
    mount(day, { trial })
    const tile = q('block-drogi')!
    pointer(tile, 'pointerdown', 100)
    pointer(tile, 'pointermove', 100 + px(480))
    advance(TRIAL_DELAY_MS)
    expect(caption()).not.toBeNull()
    pointer(tile, 'pointermove', 100)
    advance(TRIAL_DELAY_MS * 3)
    expect(caption()).toBeNull()
    expect(calls(drag).some((c) => c.span.startMin === own)).toBe(false)
  })

  it('kopia (Ctrl) na własnym miejscu: nic się nie zapisze – bez próby', () => {
    const day = counted()
    const { drag, trial } = trialSpy(day)
    mount(day, { trial, extra: { onCopy: () => undefined } })
    const tile = q('block-drogi')!
    pointer(tile, 'pointerdown', 100, 1, true)
    pointer(tile, 'pointermove', 100 + px(480), 1, true)
    advance(TRIAL_DELAY_MS)
    expect(calls(drag).some((c) => c.copy)).toBe(true)
    expect(caption()).not.toBeNull()
    pointer(tile, 'pointermove', 100, 1, true)
    advance(TRIAL_DELAY_MS * 3)
    expect(caption()).toBeNull()
    expect(calls(drag).some((c) => c.copy && c.span.startMin === own)).toBe(false)
  })

  it('grupa przesunięta o 0 minut: bez próby', () => {
    const day = counted()
    const { drag, trial } = trialSpy(day)
    mount(day, { trial, extra: { groupDrag: { has: (id: string) => id === 'drogi' || id === 'praca', preview: () => null, drop: () => undefined } } })
    const tile = q('block-drogi')!
    pointer(tile, 'pointerdown', 100)
    pointer(tile, 'pointermove', 100 + px(60))
    advance(TRIAL_DELAY_MS)
    expect(calls(drag).some((c) => c.group && c.minutes !== 0)).toBe(true)
    pointer(tile, 'pointermove', 100)
    advance(TRIAL_DELAY_MS * 3)
    expect(calls(drag).some((c) => c.group && c.minutes === 0)).toBe(false)
  })
})

describe('N19 – Esc odwołuje pojedyncze przeciągnięcie tylko na osi z energią na żywo', () => {
  it('oś bez energyTrial („Szablony”): Esc nie odwołuje przeciągnięcia bloku – puszczenie zapisuje jak dotąd', () => {
    const onMove = vi.fn()
    mount(counted(), { onMove, trial: null })
    const tile = q('block-drogi')!
    pointer(tile, 'pointerdown', 100)
    pointer(tile, 'pointermove', 100 + px(480))
    escape()
    pointer(tile, 'pointerup', 100 + px(480), 0)
    expect(onMove).toHaveBeenCalledTimes(1)
  })
})

describe('N19 – okienko kosztu: podpis tylko z próby, okno się nie rusza', () => {
  const cost = (costs: TileCost['costs'], own = false): TileCost => ({ costs, base: { head: 3, emotions: 1, senses: 1, body: 0 }, own, edit: true })
  const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
  const items = (c: TileCost) => PLAN.map((b) => item(b, b.id === 'drogi' ? { cost: c } : {}))
  const HEADS = { head: 23, emotions: 1, senses: 1, body: 0 }
  const saved = () => PLAN.map((b) => (b.id === 'drogi' ? { ...b, costs: HEADS } : b))
  /** The plan with own costs of „drogi” (what the tile of the test says) and, if given, of „praca” (the day's minimum another). */
  const SAME = { head: 3, emotions: 1, senses: 1, body: 0 }
  const planWith = (praca?: typeof SAME) => PLAN.map((b) => (b.id === 'drogi' ? { ...b, costs: SAME } : b.id === 'praca' && praca ? { ...b, costs: praca } : b))

  it('po echu zapisu (dzień policzony od nowa z kosztem, kafelek ma zapisane) podpis znika – zmiana jest już w dniu (D594)', async () => {
    const day0 = counted()
    const onCosts = vi.fn(async () => true)
    mount(day0, { items: items(cost({ head: 3, emotions: 1, senses: 1, body: 0 })), onCosts })
    click(q('block-drogi-cost')!)
    expect(q('cost-pop-energy')).toBeNull()
    for (let i = 0; i < 20; i++) click(q('cost-pop-head-plus')!)
    await act(async () => void vi.advanceTimersByTime(TRIAL_DELAY_MS))
    // The trial's own two numbers: before is the day's lowest now, after – with the cost.
    expect(q('energy-trial')!.dataset.before).toBe(String(lowestBefore(day0)!.value))
    expect(Number(q('energy-trial')!.dataset.after)).toBeLessThan(lowestBefore(day0)!.value)
    // The save is read back: the day counted again with the cost, the tile has it.
    remount(counted({ plan: saved() }), { items: items(cost(HEADS, true)), onCosts })
    await act(async () => void vi.advanceTimersByTime(TRIAL_DELAY_MS * 3))
    expect(q('cost-pop')).not.toBeNull()
    expect(q('cost-pop-energy')).toBeNull()
    expect(q('cost-pop-energy-slot')).not.toBeNull()
  })

  it('okno nisko na ekranie (stoi nad etykietą): linia podpisu ma w oknie stałe miejsce – pojawienie się podpisu nie przestawia okna ani nie wypycha go z ekranu', async () => {
    const heightOf = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      // The window's height: its rows and the line of the caption (a place of its own in the window – always there, empty without words).
      return this.dataset.testid === 'cost-pop' ? 200 + (this.querySelector('[data-testid="cost-pop-energy-slot"]') ? 30 : 0) : 0
    })
    const rectOf = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const low = this.getAttribute('data-testid') === 'block-drogi-cost'
      return { left: 300, right: 360, top: low ? 700 : 0, bottom: low ? 714 : 0, width: 60, height: 14, x: 300, y: low ? 700 : 0, toJSON: () => ({}) } as DOMRect
    })
    try {
      mount(counted(), { items: items(cost({ head: 3, emotions: 1, senses: 1, body: 0 })), onCosts: () => new Promise<boolean>(() => undefined) })
      click(q('block-drogi-cost')!)
      const pop = q('cost-pop')!
      const at = pop.style.top
      // Above the label (no room below): the window's top is the label's less the gap less the height WITH the caption's line.
      expect(at).toBe(`${700 - 4 - 230}px`)
      expect(q('cost-pop-energy-slot')!.textContent).toBe('')
      for (let i = 0; i < 20; i++) click(q('cost-pop-head-plus')!)
      await act(async () => void vi.advanceTimersByTime(TRIAL_DELAY_MS))
      const line = q('cost-pop-energy')!
      expect(pop.contains(line)).toBe(true)
      expect(pop.style.top).toBe(at)
    } finally {
      heightOf.mockRestore()
      rectOf.mockRestore()
    }
  })

  it('dzień policzony od nowa w trakcie (dryf: zegar, check-in, log) z innym minimum: kliknięcie bez wpływu na najniższą nie daje podpisu, ze zmianą – podpis z „before” próby, nie z otwarcia', async () => {
    const day0 = counted({ plan: planWith() })
    const onCosts = () => new Promise<boolean>(() => undefined)
    const plain = items(cost(SAME))
    mount(day0, { items: plain, onCosts })
    click(q('block-drogi-cost')!)
    const drifted = counted({ plan: planWith({ head: 12, emotions: 1, senses: 1, body: 0 }) })
    expect(lowestBefore(drifted)!.value).not.toBe(lowestBefore(day0)!.value)
    remount(drifted, { items: plain, onCosts })
    // A click that changes nothing of the lowest (the head is the lowest pool): no line, though the day's minimum is not the one it opened with.
    click(q('cost-pop-emotions-plus')!)
    await act(async () => void vi.advanceTimersByTime(TRIAL_DELAY_MS * 3))
    expect(q('cost-pop-energy')).toBeNull()
    for (let i = 0; i < 20; i++) click(q('cost-pop-head-plus')!)
    await act(async () => void vi.advanceTimersByTime(TRIAL_DELAY_MS))
    expect(q('energy-trial')!.dataset.before).toBe(String(lowestBefore(drifted)!.value))
  })

  it('bez modułu energii (axis bez `cost` w energyTrial): okno nie ma ani linii, ani miejsca na nią', () => {
    const day = counted()
    mount(day, { items: items(cost({ head: 3, emotions: 1, senses: 1, body: 0 })), onCosts: vi.fn(async () => true), trial: { day, drag: trialOf(day).drag } })
    click(q('block-drogi-cost')!)
    expect(q('cost-pop')).not.toBeNull()
    expect(q('cost-pop-energy-slot')).toBeNull()
  })

  it('odczyt dnia, który się nie udał (null), nie wymazuje dobrego dnia: podpis stoi', async () => {
    const day = counted()
    let current: Promise<TrialDay | null> = Promise.resolve(day)
    const trial: CostTrial = { day: () => current, change: (at, costs) => costTrial(at, 'drogi', costs) }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(createElement(TileCostView, { cost: cost({ head: 3, emotions: 1, senses: 1, body: 0 }), id: 'tile:drogi', testId: 'cost-label', trial, onChange: () => new Promise<boolean>(() => undefined) })))
    click(q('cost-label')!)
    await act(async () => undefined)
    for (let i = 0; i < 20; i++) click(q('cost-pop-head-plus')!)
    await act(async () => void vi.advanceTimersByTime(TRIAL_DELAY_MS))
    expect(q('cost-pop-energy')).not.toBeNull()
    // The day is asked again (the data changed) and the read fails.
    current = Promise.resolve(null)
    await act(async () => useData.setState({ stamp: useData.getState().stamp + 1 }))
    await act(async () => void vi.advanceTimersByTime(TRIAL_DELAY_MS * 3))
    expect(q('cost-pop-energy')).not.toBeNull()
  })
})

describe('N19 – upuszczenie na blok (D492) bez zmiany miejsca nadal coś zapisuje – podpis jest', () => {
  const dropOnto = (hint: { same?: boolean }) => {
    const day = counted()
    const drag = vi.fn((d: Parameters<TimelineTrial['drag']>[0]) => trialOf(day).drag(d))
    const trial: TimelineTrial = { ...trialOf(day), drag }
    // Block „praca” is under the pointer, its right part takes the drop; the preview says the dragged block stands where it stands now.
    const under = vi.fn(() => [] as Element[])
    Object.defineProperty(document, 'elementsFromPoint', { value: under, configurable: true, writable: true })
    const parallelPreview = () => ({ text: 'Równolegle z praca', span: { startMin: lm('08:00'), endMin: lm('10:00') }, pushed: null, ...hint })
    mount(day, { trial, extra: { parallelPreview, onParallel: () => false } })
    const target = q('block-praca')!
    under.mockImplementation(() => [target])
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: -100, right: 60, top: 0, bottom: 400, width: 160, height: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    const tile = q('block-drogi')!
    pointer(tile, 'pointerdown', 100)
    pointer(tile, 'pointermove', 100 + px(30))
    advance(TRIAL_DELAY_MS)
    return { drag }
  }
  afterEach(() => Reflect.deleteProperty(document, 'elementsFromPoint'))

  it('blok przeciągnięty na prawą część innego, podgląd: „tu, gdzie stoi” – próba jest budowana (zapis ustawia obok)', () => {
    const { drag } = dropOnto({})
    expect(drag.mock.calls.some((c) => c[0].onto === 'praca')).toBe(true)
  })

  it('na blok własnej grupy (`same`: nic się nie zmieni) – bez próby', () => {
    const { drag } = dropOnto({ same: true })
    expect(drag.mock.calls.some((c) => c[0].onto != null)).toBe(false)
  })
})
