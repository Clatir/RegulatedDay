// @vitest-environment jsdom
/**
 * Energia na żywo w oknie (N19, D593, D594, T2581): podpis „najniższa energia 52 → 44 (G)” z próbnego policzenia dnia stoi przy blokiem trzymanym
 * na osi („Dziś”) – w trakcie przeciągania, zanim go puścisz – i przy krawędzi zmienianej długości, z dopiskiem „przyjęte” dla dnia bez własnego
 * check-inu; bez zmiany najniższej nie ma podpisu; Esc odwołuje przeciągnięcie i nic nie zapisuje (podpis znika z nim); okienko kosztu na kafelku mówi to
 * samo o liczbie, którą pokazuje, a jeszcze nie zapisało (także o tej z kółka myszy).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { costTrial, type TrialDay } from '@shared/engine/trialEnergy'
import type { TileCost } from '@shared/model/blockCosts'
import type { Answer } from '@shared/model/events'
import type { Pool } from '@shared/model/categories'
import type { PlanBlock } from '@shared/model/plan'
import { Timeline, type TimelineItem, type TimelineTrial } from '@renderer/features/plan/Timeline'
import { trialText } from '@renderer/features/plan/TrialCaption'
import { changeTrial, TRIAL_DELAY_MS } from '@renderer/features/plan/trialEnergy'
import { dragChange } from '@renderer/features/today/dayPush'
import { installEscape } from '@renderer/lib/escape'
import { resetWheel } from '@renderer/lib/wheel'
import { block, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-28'
const ZERO: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const PLAN = [flex('drogi', '08:00', 120, { categoryId: 'analiza' }), flex('regen', '10:00', 120, { categoryId: 'regeneracja', fixed: true }), flex('praca', '14:00', 120, { categoryId: 'analiza' })]

/** The day as the window counts it: with its check-in (energy known), or without (the assumed one – D593). */
function counted(o: { checkin?: boolean } = {}): TrialDay {
  const s = new Scenario({ date: DATE, plan: PLAN, wake: '06:30', settings: { transitionBufferMin: 0 } }).observe('06:30', null)
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
function pointer(target: EventTarget, type: string, y: number, buttons = 1): void {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 50, clientY: y, button: 0, buttons })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  act(() => void target.dispatchEvent(e))
}
const escape = () => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
/** Minutes to pixels of the axis (`PPM` 1.1). */
const px = (minutes: number) => Math.round(minutes * 1.1)

function mount(day: TrialDay, o: { onMove?: () => void; onResize?: () => false; items?: TimelineItem[]; onCosts?: () => Promise<boolean> } = {}) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() =>
    root!.render(
      createElement(Timeline, {
        items: o.items ?? PLAN.map((b) => item(b)),
        markers: [],
        selected: null,
        onSelect: () => undefined,
        onMove: o.onMove ?? (() => undefined),
        onResize: o.onResize ?? (() => false),
        onCosts: o.onCosts,
        energyTrial: trialOf(day),
        from: 360,
        to: 1320
      })
    )
  )
}
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

