// @vitest-environment jsdom
/**
 * D501: the cost per hour on a block's tile of „Dziś” – the three numbers in the colours of the pools (the block's own, else its variant's,
 * else its category's), and the small window of the tile: [−] and [+] of the three pools between −5 and 5, „Jak kategoria (3·1·1)”. A
 * click on the label neither drags the block nor selects it; Esc and a press elsewhere close the window; a tile that may not be changed
 * only tells. The axis items (`dayAxis`) carry the cost and whether it may be changed.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import type { TileCost } from '@shared/model/blockCosts'
import { rdFrom } from '@shared/model/rd'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { Timeline, type TimelineItem } from '@renderer/features/plan/Timeline'
import { installEscape } from '@renderer/lib/escape'
import type { DayModel } from '@renderer/store/day'
import { block, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-21'

function axis(s: Scenario, now: string | null, today: string | null = DATE) {
  const ctx = s.contextAt(s.at(now ?? '04:00'))
  const state = computeDay(ctx)
  const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
  const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
  return new Map(dayAxis(model, names, now ? s.at(now) : null, today).items.map((i) => [i.id, i]))
}

describe('koszt na kafelku osi (D501)', () => {
  const plan = [
    block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }),
    { ...block({ id: 'own', cat: 'analiza', at: '10:00', min: 60 }), costs: { head: 5, emotions: 0, senses: -1 } },
    block({ id: 'reg', cat: 'regeneracja', variant: 'cisza', at: '12:00', min: 30 }),
    block({ id: 'sleep', cat: 'regeneracja', variant: 'drzemka', at: '13:00', min: 30 }),
    block({ id: 'early', cat: 'analiza', at: '06:00', min: 30, fixed: true })
  ]

  it('koszt kategorii, własny koszt bloku wygrywa, regeneracja ma wartości ujemne (wariant przed kategorią)', () => {
    const m = axis(new Scenario({ date: DATE, plan }), null)
    expect(m.get('a')!.cost).toEqual({ costs: { head: 3, emotions: 1, senses: 1 }, base: { head: 3, emotions: 1, senses: 1 }, own: false, edit: true })
    expect(m.get('own')!.cost).toEqual({ costs: { head: 5, emotions: 0, senses: -1 }, base: { head: 3, emotions: 1, senses: 1 }, own: true, edit: true })
    expect(m.get('reg')!.cost!.costs).toEqual({ head: -1, emotions: -2, senses: -3 })
    expect(m.get('sleep')!.cost!.costs).toEqual({ head: -3, emotions: -1, senses: -2 })
  })

  it('osie Szablonów i kreatora (bez dnia okna) nie mają kosztu', () => {
    const m = axis(new Scenario({ date: DATE, plan }), null, null)
    expect(m.get('a')!.cost).toBeUndefined()
  })

  it('zaczęty blok, dzień minionych i blok poza planem – koszt jest, okienka nie ma; blok, który jeszcze nie ruszył – ma', () => {
    const s = new Scenario({ date: DATE, plan }).start('a', '08:00').start('loose', '09:00', { cat: 'analiza' })
    const today = axis(s, '09:30')
    expect(today.get('a')!.cost!.edit).toBe(false)
    expect(today.get('loose')!.cost).toMatchObject({ edit: false, costs: { head: 3, emotions: 1, senses: 1 } })
    expect(today.get('own')!.cost!.edit).toBe(true)
    // A day gone by: nothing is changed there.
    expect(axis(new Scenario({ date: DATE, plan }), null, '2026-10-22').get('own')!.cost!.edit).toBe(false)
    // A fixed block whose time has passed unbegun: dimmed, nothing to change.
    expect(axis(new Scenario({ date: DATE, plan }), '11:00').get('early')!.cost!.edit).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------------

let root: Root | null = null
let host: HTMLElement | null = null
let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterAll(() => removeEscape?.())
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
})

const cost = (costs: TileCost['costs'], o: Partial<TileCost> = {}): TileCost => ({ costs, base: { head: 3, emotions: 1, senses: 1 }, own: false, edit: true, ...o })
const item = (id: string, startMin: number, endMin: number, c: TileCost | undefined, o: Partial<TimelineItem> = {}): TimelineItem => ({ id, startMin, endMin, title: `Blok ${id}`, marks: [], color: '#F2B66D', categoryId: 'analiza', background: false, movable: true, ...(c ? { cost: c } : {}), ...o })

async function mount(items: TimelineItem[], props: Partial<Parameters<typeof Timeline>[0]> = {}) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const onSelect = vi.fn()
  const onMove = vi.fn()
  const onCosts = vi.fn()
  await act(async () => root!.render(createElement(Timeline, { items, markers: [], selected: null, onSelect, onMove, onCosts, from: 6 * 60, to: 22 * 60, ...props })))
  return { onSelect, onMove, onCosts }
}
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
/** A pointer event of the left button (jsdom has no PointerEvent: a mouse event with the pointer's id). */
function pointer(target: EventTarget, type: string, x: number, y: number, buttons = 1): void {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  act(() => void target.dispatchEvent(e))
}
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))

describe('napis kosztu na kafelku', () => {
  it('„3 · 1 · 1” w kolorach pul: głowa, emocje, bodźce', async () => {
    await mount([item('a', 600, 660, cost({ head: 3, emotions: 1, senses: 1 }))])
    const label = q('block-a-cost')!
    expect(label.textContent).toBe('3 · 1 · 1')
    const colours = [...label.querySelectorAll<HTMLElement>('span > span:last-child')].map((s) => s.style.color)
    expect(colours).toEqual(['rgb(242, 182, 109)', 'rgb(212, 154, 151)', 'rgb(121, 175, 171)'])
  })

  it('regeneracja – prawdziwy minus (U+2212)', async () => {
    await mount([item('r', 600, 660, cost({ head: -1, emotions: -2, senses: -3 }))])
    expect(q('block-r-cost')!.textContent).toBe('−1 · −2 · −3')
    expect(q('block-r-cost')!.textContent).toContain('−')
  })

  it('własny koszt jest oznaczony, koszt kategorii – nie; kafelek bez kosztu (Szablony) – bez napisu', async () => {
    await mount([item('own', 600, 660, cost({ head: 5, emotions: 0, senses: -1 }, { own: true })), item('a', 700, 760, cost({ head: 3, emotions: 1, senses: 1 })), item('t', 800, 860, undefined)])
    expect(q('block-own-cost')!.getAttribute('data-own')).toBe('true')
    expect(q('block-a-cost')!.getAttribute('data-own')).toBeNull()
    expect(q('block-t-cost')).toBeNull()
  })

  it('miejsce napisu: w rogu na wysokim kafelku, na końcu wiersza nazwy na niskim, po najechaniu na niskim obok innego', async () => {
    await mount([
      item('tall', 600, 660, cost({ head: 3, emotions: 1, senses: 1 })),
      item('low', 700, 720, cost({ head: 3, emotions: 1, senses: 1 })),
      item('x', 800, 830, cost({ head: 3, emotions: 1, senses: 1 })),
      item('y', 800, 830, cost({ head: 1, emotions: 1, senses: 1 }))
    ])
    expect(q('block-tall-cost')!.getAttribute('data-place')).toBe('corner')
    expect(q('block-low-cost')!.getAttribute('data-place')).toBe('row')
    expect(q('block-x-cost')!.getAttribute('data-place')).toBe('hover')
    expect(q('block-x-cost')!.className).toContain('group-hover:')
    // At the end of the name's row, after the name.
    const row = q('block-low-cost')!.parentElement!
    expect(row.lastElementChild).toBe(q('block-low-cost'))
    expect(row.textContent).toContain('Blok low')
  })
})

describe('okienko kosztu bloku', () => {
  const open = async (c = cost({ head: 3, emotions: 1, senses: 1 }), props: Partial<Parameters<typeof Timeline>[0]> = {}) => {
    const spies = await mount([item('a', 600, 660, c)], props)
    click(q('block-a-cost')!)
    return spies
  }

  it('klik w napis otwiera okienko z trzema wierszami i przyciskiem „Jak kategoria (3·1·1)” – nie otwiera panelu bloku', async () => {
    const { onSelect } = await open()
    expect(q('cost-pop')).not.toBeNull()
    expect(q('cost-pop')!.textContent).toContain('głowa')
    expect(q('cost-pop')!.textContent).toContain('emocje')
    expect(q('cost-pop')!.textContent).toContain('bodźce')
    expect(q('cost-pop-head-value')!.textContent).toBe('3')
    expect(q('cost-pop-reset')!.textContent).toBe('Jak kategoria (3·1·1)')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('[+] i [−] zapisują własny koszt całego bloku (nowe trzy liczby)', async () => {
    const { onCosts } = await open()
    click(q('cost-pop-head-plus')!)
    expect(onCosts).toHaveBeenLastCalledWith('a', { head: 4, emotions: 1, senses: 1 })
    expect(q('cost-pop-head-value')!.textContent).toBe('4')
    click(q('cost-pop-senses-minus')!)
    // Over what the window shows now: the clicks that follow each other do not undo one another.
    expect(onCosts).toHaveBeenLastCalledWith('a', { head: 4, emotions: 1, senses: 0 })
  })

  it('[+] przy 5 i [−] przy −5 nic nie zmieniają ani nie zapisują', async () => {
    const { onCosts } = await open(cost({ head: 5, emotions: -5, senses: 0 }, { own: true }))
    click(q('cost-pop-head-plus')!)
    click(q('cost-pop-emotions-minus')!)
    expect(onCosts).not.toHaveBeenCalled()
    expect(q('cost-pop-head-value')!.textContent).toBe('5')
    expect(q('cost-pop-emotions-value')!.textContent).toBe('−5')
  })

  it('„Jak kategoria” ustawia costs: null; bez własnego kosztu nic nie zapisuje', async () => {
    const { onCosts } = await open(cost({ head: 5, emotions: 0, senses: -1 }, { own: true }))
    click(q('cost-pop-reset')!)
    expect(onCosts).toHaveBeenCalledTimes(1)
    expect(onCosts).toHaveBeenCalledWith('a', null)
    expect(q('cost-pop-head-value')!.textContent).toBe('3')
    click(q('cost-pop-reset')!)
    expect(onCosts).toHaveBeenCalledTimes(1)
  })

  it('odmówiony zapis przywraca liczby z kafelka', async () => {
    const refuse = vi.fn().mockResolvedValue(false)
    await mount([item('a', 600, 660, cost({ head: 3, emotions: 1, senses: 1 }))], { onCosts: refuse })
    click(q('block-a-cost')!)
    click(q('cost-pop-head-plus')!)
    expect(q('cost-pop-head-value')!.textContent).toBe('4')
    await act(async () => undefined)
    expect(q('cost-pop-head-value')!.textContent).toBe('3')
  })

  it('klik w okienku nie wybiera bloku ani nie zaczyna przeciągania', async () => {
    const { onSelect, onMove } = await open()
    const plus = q('cost-pop-head-plus')!
    pointer(plus, 'pointerdown', 100, 200)
    pointer(window, 'pointermove', 100, 260)
    pointer(plus, 'pointerup', 100, 260, 0)
    click(plus)
    expect(onMove).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('wciśnięcie na napisie nie zaczyna przeciągania bloku, a klik go nie wybiera', async () => {
    const { onSelect, onMove } = await mount([item('a', 600, 660, cost({ head: 3, emotions: 1, senses: 1 }))])
    const label = q('block-a-cost')!
    pointer(label, 'pointerdown', 100, 200)
    pointer(window, 'pointermove', 100, 300)
    pointer(label, 'pointerup', 100, 300, 0)
    click(label)
    expect(onMove).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    expect(q('block-a')!.getAttribute('data-movable')).toBe('true')
    expect(q('cost-pop')).not.toBeNull()
  })

  it('Esc zamyka okienko', async () => {
    await open()
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(q('cost-pop')).toBeNull()
  })

  it('klik poza okienkiem zamyka je; ponowny klik w napis też', async () => {
    await open()
    pointer(document.body, 'pointerdown', 5, 5)
    expect(q('cost-pop')).toBeNull()
    click(q('block-a-cost')!)
    expect(q('cost-pop')).not.toBeNull()
    pointer(q('block-a-cost')!, 'pointerdown', 5, 5)
    click(q('block-a-cost')!)
    expect(q('cost-pop')).toBeNull()
  })

  it('kafelek, którego nie wolno zmieniać, pokazuje napis, ale bez okienka', async () => {
    const { onSelect } = await mount([item('a', 600, 660, cost({ head: 3, emotions: 1, senses: 1 }, { edit: false }))])
    expect(q('block-a-cost')!.textContent).toBe('3 · 1 · 1')
    expect(q('block-a-cost')!.getAttribute('data-editable')).toBeNull()
    click(q('block-a-cost')!)
    expect(q('cost-pop')).toBeNull()
    // The click is the tile's, as before.
    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('bez onCosts (Szablony, kreator) napis tylko mówi', async () => {
    await mount([item('a', 600, 660, cost({ head: 3, emotions: 1, senses: 1 }))], { onCosts: undefined })
    click(q('block-a-cost')!)
    expect(q('cost-pop')).toBeNull()
  })

  it('okienko stoi nad stroną (portal), nie w kafelku, który przycina', async () => {
    await open()
    expect(q('block-a')!.contains(q('cost-pop'))).toBe(false)
    expect(q('cost-pop')!.className).toContain('fixed')
  })
})
