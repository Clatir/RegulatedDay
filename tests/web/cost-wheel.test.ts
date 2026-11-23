// @vitest-environment jsdom
/**
 * N8 (T2550, D590): the mouse wheel over a cost field – the pool's number in the tile's window and in the group's („Koszt…”), the fields
 * of a cost in Settings and in the windows of ✎ / „+ Nowa…” (`CostNumbers`): ±1, with Shift ±10, in −100…100. The field shows its own
 * number while the wheel turns and saves it ONCE per gesture (400 ms after the last turn, at once on leaving the field and on
 * unmount); the page does not scroll over the field, a page scroll in progress wins; a notch of a mouse is one step (Chromium's
 * `wheelDelta` 120), a touchpad sums pixels to 100.
 */
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TileCost } from '@shared/model/blockCosts'
import type { Costs } from '@shared/model/categories'
import { GroupCostDialog } from '@renderer/features/plan/BlockGroupMenu'
import { CostInput } from '@renderer/features/plan/CostInput'
import { CostFields } from '@renderer/features/plan/NewThingDialogs'
import { Timeline, type TimelineItem } from '@renderer/features/plan/Timeline'
import { CostNumbers } from '@renderer/features/settings/categoryFields'
import { WHEEL_COMMIT_MS, WHEEL_SHOWN_MS } from '@renderer/features/settings/SettingNumber'
import { installEscape } from '@renderer/lib/escape'
import { resetWheel, WHEEL_NOTCH_PX, WHEEL_SCROLL_LATCH_MS, WHEEL_SUM_RESET_MS } from '@renderer/lib/wheel'
import { useData } from '@renderer/store/data'

let root: Root | null = null
let host: HTMLElement | null = null
let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  useData.setState({ view: null })
  removeEscape?.()
  removeEscape = null
  vi.useRealTimers()
  resetWheel()
})

const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const val = (id: string) => (q(id) as HTMLInputElement).value
const render = (el: ReturnType<typeof createElement>) => {
  // A new tree: what the wheel did on the one before does not count as a page scroll beside it.
  resetWheel()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(el))
}
const unmount = () => {
  act(() => root!.unmount())
  host!.remove()
  root = null
}
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
/** The quiet that ends a gesture: the number is saved. */
const settle = () => advance(WHEEL_COMMIT_MS)
const settleAsync = () => act(async () => void vi.advanceTimersByTime(WHEEL_COMMIT_MS))

interface Turn {
  deltaY?: number
  deltaX?: number
  deltaMode?: number
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  /** Chromium's `wheelDeltaY` (and `wheelDelta`) / `wheelDeltaX`: a multiple of 120 for a mouse. */
  wd?: number
  wdx?: number
}
/** One turn of the wheel over `el`. Returns the event (`defaultPrevented` – the page did not scroll). */
function wheel(el: Element, { wd, wdx, ...init }: Turn = {}): WheelEvent {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 0, deltaX: 0, ...init })
  if (wd !== undefined) {
    Object.defineProperty(e, 'wheelDeltaY', { value: wd })
    Object.defineProperty(e, 'wheelDelta', { value: wd })
  }
  if (wdx !== undefined) Object.defineProperty(e, 'wheelDeltaX', { value: wdx })
  act(() => void el.dispatchEvent(e))
  return e
}
/** A notch of a mouse as Chromium on Windows sends it: with Shift the wheel is horizontal (`deltaY` 0, `deltaX` set). */
const up = (el: Element, shift = false) => (shift ? wheel(el, { deltaX: -100, wdx: 120, shiftKey: true }) : wheel(el, { deltaY: -100, wd: 120 }))
const down = (el: Element, shift = false) => (shift ? wheel(el, { deltaX: 100, wdx: -120, shiftKey: true }) : wheel(el, { deltaY: 100, wd: -120 }))

describe('kółko nad polem kosztu – CostInput (okno grupowe, okienko kafelka): jeden zapis na gest', () => {
  const mountFixed = (value: number) => {
    const onCommit = vi.fn()
    render(createElement(CostInput, { wheel: 'gesture', pool: 'head', value, onCommit, testId: 'f' }))
    return onCommit
  }

  it('trzy obroty z Shift w górę z 0: pole pokazuje 30, jeden zapis 30 po 400 ms ciszy', () => {
    const onCommit = mountFixed(0)
    for (let i = 0; i < 3; i++) up(q('f')!, true)
    expect(val('f')).toBe('30')
    expect(onCommit).not.toHaveBeenCalled()
    advance(WHEEL_COMMIT_MS - 1)
    expect(onCommit).not.toHaveBeenCalled()
    advance(1)
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([30])
  })

  it('każdy obrót odnawia czekanie: zapis dopiero 400 ms po ostatnim', () => {
    const onCommit = mountFixed(0)
    up(q('f')!)
    advance(300)
    up(q('f')!)
    advance(300)
    expect(onCommit).not.toHaveBeenCalled()
    advance(100)
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([2])
  })

  it('Shift w Chromium na Windows (deltaY 0, deltaX z wheelDeltaX): trzy w górę i jeden w dół = 20', () => {
    const onCommit = mountFixed(0)
    for (let i = 0; i < 3; i++) up(q('f')!, true)
    down(q('f')!, true)
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([20])
  })

  it('bez Shift ±1; góra i dół w jednym geście wracają do zapisanej – bez zapisu', () => {
    const onCommit = mountFixed(3)
    up(q('f')!)
    expect(val('f')).toBe('4')
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([4])
    onCommit.mockClear()
    // Another gesture from the shown 4 (the value did not come back): 4 → 5 → 4 – equal to the saved one in the props (3)? No: 4 is not 3.
    down(q('f')!)
    up(q('f')!)
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([4])
  })

  it('góra i dół w jednym geście do zapisanej wartości – bez zapisu, pole pokazuje zapisaną', () => {
    const onCommit = mountFixed(3)
    up(q('f')!)
    down(q('f')!)
    settle()
    expect(onCommit).not.toHaveBeenCalled()
    expect(val('f')).toBe('3')
  })

  it('nad polem strona się nie przewija (`defaultPrevented`), także na brzegu', () => {
    mountFixed(100)
    expect(up(q('f')!).defaultPrevented).toBe(true)
    expect(down(q('f')!).defaultPrevented).toBe(true)
  })

  it('brzeg: 100 nie rośnie, −100 nie maleje – bez zapisu; Shift przycina (95 → 100, −95 → −100)', () => {
    const top = mountFixed(100)
    up(q('f')!)
    up(q('f')!, true)
    settle()
    expect(top).not.toHaveBeenCalled()
    expect(val('f')).toBe('100')
    unmount()
    const low = mountFixed(-100)
    down(q('f')!)
    down(q('f')!, true)
    settle()
    expect(low).not.toHaveBeenCalled()
    unmount()
    const near = mountFixed(95)
    up(q('f')!, true)
    up(q('f')!, true)
    expect(val('f')).toBe('100')
    settle()
    expect(near.mock.calls.map((c) => c[0])).toEqual([100])
  })

  it('Ustawienia, zapis asynchroniczny: góra, dół, dół od 0 = jeden zapis −1; kolejny obrót przed echem liczy od pokazanej (−2)', () => {
    const onCommit = vi.fn()
    function Harness() {
      const [value, setValue] = useState(0)
      return createElement(CostInput, { wheel: 'gesture',
        pool: 'head',
        value,
        testId: 'f',
        onCommit: (v: number) => {
          onCommit(v)
          setTimeout(() => setValue(v), 100)
        }
      })
    }
    render(createElement(Harness))
    up(q('f')!)
    down(q('f')!)
    down(q('f')!)
    expect(val('f')).toBe('-1')
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([-1])
    // The save has not come back yet: the number shown is −1, the next turn goes from it.
    down(q('f')!)
    expect(val('f')).toBe('-2')
    advance(100)
    // The echo of the first save (−1) while the second gesture is on: it stands.
    expect(val('f')).toBe('-2')
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([-1, -2])
    advance(100)
    expect(val('f')).toBe('-2')
  })

  it('[−] w trakcie gestu (wartość z zewnątrz): liczba własna znika, nieodesłany obrót przepada, następny liczy od nowej wartości', () => {
    const onCommit = vi.fn()
    let set: (n: number) => void = () => undefined
    function Harness() {
      const [value, setValue] = useState(5)
      set = setValue
      return createElement(CostInput, { wheel: 'gesture', pool: 'head', value, onCommit, testId: 'f' })
    }
    render(createElement(Harness))
    up(q('f')!)
    expect(val('f')).toBe('6')
    act(() => set(9))
    expect(val('f')).toBe('9')
    settle()
    expect(onCommit).not.toHaveBeenCalled()
    up(q('f')!)
    expect(val('f')).toBe('10')
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([10])
  })

  it('odmowa (wartość bez zmiany): zapis poszedł, a po 5 s pole pokazuje zapisaną wartość', () => {
    const onCommit = mountFixed(5)
    up(q('f')!)
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([6])
    advance(WHEEL_SHOWN_MS - 1)
    expect(val('f')).toBe('6')
    advance(1)
    expect(val('f')).toBe('5')
    // A turn after it counts from the saved 5.
    up(q('f')!)
    expect(val('f')).toBe('6')
  })

  it('zanik liczby po 5 s od zapisu biegnie tylko, gdy nic nie czeka: obroty w 4800 i 4950 ms po zapisie – pole nie wraca do zapisanej, zapis po ciszy', () => {
    const onCommit = mountFixed(3)
    up(q('f')!)
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([4])
    advance(4800)
    up(q('f')!)
    advance(150)
    up(q('f')!)
    // t = 4950 ms after the save; 5000 ms comes in the middle of the gesture – it must not take the number away.
    advance(50)
    expect(val('f')).toBe('6')
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([4, 6])
    advance(WHEEL_SHOWN_MS)
    expect(val('f')).toBe('3')
  })

  it('zapis trwa 2 s: obrót po 1,6 s od zapisu liczy od pokazanej liczby (4), nie od wartości (1)', () => {
    const onCommit = mountFixed(1)
    for (let i = 0; i < 3; i++) up(q('f')!)
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([4])
    advance(1600)
    expect(val('f')).toBe('4')
    up(q('f')!)
    expect(val('f')).toBe('5')
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([4, 5])
  })

  it('wyjście z pola w trakcie gestu zapisuje od razu (blur)', () => {
    const onCommit = mountFixed(3)
    const input = q('f') as HTMLInputElement
    act(() => input.focus())
    up(input)
    expect(onCommit).not.toHaveBeenCalled()
    act(() => input.blur())
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([4])
    settle()
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('zniknięcie pola (unmount) w trakcie gestu zapisuje, jeśli był obrót; bez obrotu – nic', () => {
    const onCommit = mountFixed(3)
    up(q('f')!)
    up(q('f')!)
    unmount()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([5])
    const none = mountFixed(3)
    unmount()
    expect(none).not.toHaveBeenCalled()
  })

  it('wpisany tekst: kółko porzuca szkic, wyjście zapisuje liczbę z kółka', () => {
    const onCommit = vi.fn()
    render(createElement(CostInput, { wheel: 'gesture', pool: 'head', value: 3, onCommit, testId: 'f' }))
    const input = q('f') as HTMLInputElement
    act(() => {
      input.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '40')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(input.value).toBe('40')
    up(input)
    expect(input.value).toBe('4')
    act(() => input.blur())
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([4])
  })

  it('wpisany tekst odrzucony (500): kółko zdejmuje komunikat i liczy od zapisanej wartości', () => {
    const onCommit = vi.fn()
    render(createElement(CostInput, { wheel: 'gesture', pool: 'head', value: 3, onCommit, testId: 'f' }))
    const input = q('f') as HTMLInputElement
    act(() => {
      input.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '500')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.blur()
    })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    up(input)
    expect(input.getAttribute('aria-invalid')).toBe('false')
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([4])
  })

  it('kółko poza polem nic nie zmienia i nie jest przechwytywane', () => {
    const onCommit = vi.fn()
    render(createElement('div', { 'data-testid': 'around' }, createElement(CostInput, { wheel: 'gesture', pool: 'head', value: 3, onCommit, testId: 'f' })))
    expect(up(q('around')!).defaultPrevented).toBe(false)
    settle()
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('kółko nad polem kosztu – tryb „step” w formularzach z lokalnym stanem (T2551)', () => {
  it('CostInput step: każdy obrót od razu `onCommit`, liczony od pokazanej (wartość z props stoi): z Shift 10, 20, 30 – bez czekania', () => {
    const onCommit = vi.fn()
    render(createElement(CostInput, { wheel: 'step', pool: 'head', value: 0, onCommit, testId: 'f' }))
    for (let i = 0; i < 3; i++) up(q('f')!, true)
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([10, 20, 30])
    expect(val('f')).toBe('30')
    // Nothing more comes with the quiet.
    settle()
    expect(onCommit).toHaveBeenCalledTimes(3)
  })

  it('okno grupowe „Koszt…”: trzy obroty z Shift i natychmiast „Zastosuj” – `onApply` dostaje 30', () => {
    const onApply = vi.fn()
    render(createElement(GroupCostDialog, { n: 2, initial: { head: 0, emotions: 1, senses: 1, body: 0 }, onClose: () => undefined, onApply }))
    for (let i = 0; i < 3; i++) up(q('group-cost-head-value')!, true)
    click(q('group-cost-apply')!)
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith({ head: 30, emotions: 1, senses: 1, body: 0 })
  })

  it('okno grupowe: [−] / [+] i pole widzą liczbę z kółka od razu', () => {
    render(createElement(GroupCostDialog, { n: 2, initial: { head: 0, emotions: 1, senses: 1, body: 0 }, onClose: () => undefined, onApply: vi.fn() }))
    up(q('group-cost-head-value')!, true)
    expect(val('group-cost-head-value')).toBe('10')
    click(q('group-cost-head-plus')!)
    expect(val('group-cost-head-value')).toBe('11')
    down(q('group-cost-head-value')!)
    expect(val('group-cost-head-value')).toBe('10')
  })

  it('`CostFields` („Nowy wariant / podkategoria”, ✎): obrót i od razu odczyt formularza ma nową liczbę', () => {
    let form: Costs = { head: 1, emotions: 1, senses: 1, body: 0 }
    function Harness() {
      const [costs, setCosts] = useState<Costs>(form)
      form = costs
      return createElement(CostFields, { costs, onChange: (c: Partial<Costs>) => setCosts((now) => ({ ...now, ...c })) })
    }
    render(createElement(Harness))
    for (let i = 0; i < 3; i++) up(q('new-cost-body')!, true)
    expect(form).toEqual({ head: 1, emotions: 1, senses: 1, body: 30 })
    expect(val('new-cost-body')).toBe('30')
  })
})

describe('kółko nad polem kosztu – przewijanie strony ma pierwszeństwo (D590)', () => {
  const mountAround = (value = 0) => {
    const onCommit = vi.fn()
    render(createElement('div', null, createElement('p', { 'data-testid': 'beside' }, 'tekst'), createElement(CostInput, { wheel: 'gesture', pool: 'head', value, onCommit, testId: 'f' })))
    return onCommit
  }

  it('pięć zdarzeń co 100 ms nad polem po kółku poza nim (strona się nie rusza): do 400 ms od tamtego – strona, potem pole', () => {
    const onCommit = mountAround()
    wheel(q('beside')!, { deltaY: 100 })
    const prevented: boolean[] = []
    for (let i = 0; i < 5; i++) {
      advance(100)
      prevented.push(up(q('f')!).defaultPrevented)
    }
    // At 100, 200, 300 ms the page's; at 400 and 500 ms the field's (the wait is not renewed by the events over the field).
    expect(prevented).toEqual([false, false, false, true, true])
    expect(val('f')).toBe('2')
    settle()
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([2])
  })

  it('kółko poza polem ≥ 400 ms temu nie przeszkadza', () => {
    const onCommit = mountAround()
    wheel(q('beside')!, { deltaY: 100 })
    advance(WHEEL_SCROLL_LATCH_MS)
    expect(up(q('f')!).defaultPrevented).toBe(true)
    settle()
    expect(onCommit).toHaveBeenLastCalledWith(1)
  })

  it('kółko nad innym polem też jest „poza tym polem”', () => {
    const onCommit = vi.fn()
    render(createElement('div', null, createElement(CostInput, { wheel: 'gesture', pool: 'head', value: 0, onCommit, testId: 'a' }), createElement(CostInput, { wheel: 'gesture', pool: 'senses', value: 0, onCommit, testId: 'b' })))
    up(q('a')!)
    advance(100)
    expect(up(q('b')!).defaultPrevented).toBe(false)
    expect(val('b')).toBe('0')
  })
})

describe('kółko nad polem kosztu – mysz (wheelDelta 120) i touchpad (suma pikseli)', () => {
  const mountFixed = () => {
    const onCommit = vi.fn()
    render(createElement(CostInput, { wheel: 'gesture', pool: 'head', value: 0, onCommit, testId: 'f' }))
    return onCommit
  }

  it('ząbek myszy to jeden krok bez względu na skalowanie ekranu: wheelDelta 120 przy deltaY 100 / 67 / 50 / 33 / 150', () => {
    for (const px of [100, 67, 50, 33, 150]) {
      mountFixed()
      wheel(q('f')!, { deltaY: -px, wd: 120 })
      expect(val('f')).toBe('1')
      unmount()
    }
  })

  it('wheelDelta 240 (dwa ząbki w jednym zdarzeniu) = dwa kroki; z Shift (wheelDeltaX) 20', () => {
    mountFixed()
    wheel(q('f')!, { deltaY: -200, wd: 240 })
    expect(val('f')).toBe('2')
    wheel(q('f')!, { deltaX: -200, wdx: 240, shiftKey: true })
    expect(val('f')).toBe('22')
  })

  it('touchpad (wheelDelta nie jest wielokrotnością 120): suma do 100 px – 30 × 3 = 90 jeszcze nic, 30 × 4 – jeden krok; 15 × 80 px = 12 kroków', () => {
    mountFixed()
    for (let i = 0; i < 3; i++) expect(wheel(q('f')!, { deltaY: -30, wd: 7 }).defaultPrevented).toBe(true)
    expect(val('f')).toBe('0')
    wheel(q('f')!, { deltaY: -30, wd: 7 })
    expect(val('f')).toBe('1')
    unmount()
    mountFixed()
    for (let i = 0; i < 15; i++) wheel(q('f')!, { deltaY: -80, wd: 7 })
    expect(val('f')).toBe('12')
  })

  it('bez wheelDelta (inna przeglądarka): 100 px = jeden krok', () => {
    mountFixed()
    wheel(q('f')!, { deltaY: -WHEEL_NOTCH_PX })
    expect(val('f')).toBe('1')
  })

  it('suma touchpada zeruje się po zmianie kierunku i po 400 ms ciszy', () => {
    mountFixed()
    for (const d of [-30, -30, 30, 30, 30]) wheel(q('f')!, { deltaY: d, wd: 7 })
    expect(val('f')).toBe('0')
    wheel(q('f')!, { deltaY: 30, wd: 7 })
    expect(val('f')).toBe('-1')
    for (let i = 0; i < 3; i++) wheel(q('f')!, { deltaY: -30, wd: 7 })
    advance(WHEEL_SUM_RESET_MS)
    wheel(q('f')!, { deltaY: -30, wd: 7 })
    expect(val('f')).toBe('-1')
  })

  it('deltaMode linie / strony – jeden krok na zdarzenie, bez względu na wielkość delty', () => {
    mountFixed()
    wheel(q('f')!, { deltaY: -3, deltaMode: 1 })
    wheel(q('f')!, { deltaY: -1, deltaMode: 2 })
    expect(val('f')).toBe('2')
  })

  it('poziome przewijanie bez Shift i z Shift na touchpadzie (bez wheelDeltaX) idzie do strony', () => {
    mountFixed()
    expect(wheel(q('f')!, { deltaX: -100, wdx: 120 }).defaultPrevented).toBe(false)
    expect(wheel(q('f')!, { deltaX: -100, shiftKey: true }).defaultPrevented).toBe(false)
    expect(wheel(q('f')!, { deltaX: -100, wdx: 7, shiftKey: true }).defaultPrevented).toBe(false)
    expect(val('f')).toBe('0')
  })

  it('Ctrl / Meta + kółko: powiększenie zostaje – bez preventDefault i kroku', () => {
    mountFixed()
    expect(wheel(q('f')!, { deltaY: -100, wd: 120, ctrlKey: true }).defaultPrevented).toBe(false)
    expect(wheel(q('f')!, { deltaY: -100, wd: 120, metaKey: true }).defaultPrevented).toBe(false)
    expect(val('f')).toBe('0')
  })
})

describe('kółko nad polem kosztu – CostNumbers (Ustawienia, ✎, „+ Nowa…”)', () => {
  it('Ustawienia (zapis asynchroniczny, wartość stoi): trzy obroty z Shift nad „ciałem” = jeden zapis 30; inne pule nietknięte', () => {
    const onCommit = vi.fn()
    const costs: Costs = { head: 1, emotions: 1, senses: 1, body: 0 }
    render(createElement(CostNumbers, { wheel: 'gesture', costs, onCommit, label: (p: string) => `Koszt: ${p}`, named: true, testId: (p: keyof Costs) => `n-${p}` }))
    for (let i = 0; i < 3; i++) expect(up(q('n-body')!, true).defaultPrevented).toBe(true)
    expect(val('n-body')).toBe('30')
    settle()
    expect(onCommit.mock.calls).toEqual([['body', 30]])
    up(q('n-head')!)
    settle()
    expect(onCommit).toHaveBeenLastCalledWith('head', 2)
  })

  it('brzeg 100: bodźce nie rosną', () => {
    const onCommit = vi.fn()
    render(createElement(CostNumbers, { wheel: 'gesture', costs: { head: 1, emotions: 1, senses: 100, body: 0 }, onCommit, label: (p: string) => p, testId: (p: keyof Costs) => `n-${p}` }))
    up(q('n-senses')!)
    up(q('n-senses')!, true)
    settle()
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('kółko nad polem w okienku kosztu kafelka (TileCost)', () => {
  const cost = (costs: Costs): TileCost => ({ costs, base: { head: 3, emotions: 1, senses: 1, body: 0 }, own: false, edit: true })
  const item = (c: TileCost): TimelineItem => ({ id: 'a', startMin: 600, endMin: 660, title: 'Blok a', marks: [], color: '#F2B66D', categoryId: 'analiza', background: false, movable: true, cost: c })
  const open = (onCosts = vi.fn(async (_id: string, _costs: unknown, _ask: unknown) => true)) => {
    removeEscape = installEscape()
    render(createElement(Timeline, { items: [item(cost({ head: 3, emotions: 1, senses: 1, body: 0 }))], markers: [], selected: null, onSelect: vi.fn(), onMove: vi.fn(), onCosts, from: 6 * 60, to: 22 * 60 }))
    click(q('block-a-cost')!)
    return onCosts
  }

  it('obrót w górę nad polem głowy = ten sam zapis co „+” (jeden zamiar z końcową liczbą); strona się nie przewija', async () => {
    const wheelCosts = open()
    expect(up(q('cost-pop-head-value')!).defaultPrevented).toBe(true)
    expect(wheelCosts).not.toHaveBeenCalled()
    await settleAsync()
    expect(wheelCosts).toHaveBeenCalledTimes(1)
    expect(wheelCosts).toHaveBeenCalledWith('a', { head: 4, emotions: 1, senses: 1, body: 0 }, expect.anything())
    expect(val('cost-pop-head-value')).toBe('4')
    expect(q('cost-pop')).not.toBeNull()
    unmount()
    const plusCosts = open()
    click(q('cost-pop-head-plus')!)
    await act(async () => undefined)
    expect(plusCosts.mock.calls[0]).toEqual(wheelCosts.mock.calls[0])
  })

  it('trzy obroty z Shift dają +30 (3 → 33) w jednym zapisie; w dół z Shift cofa do 23', async () => {
    const onCosts = open()
    for (let i = 0; i < 3; i++) up(q('cost-pop-head-value')!, true)
    await settleAsync()
    expect(onCosts.mock.calls.map((c) => (c[1] as Costs).head)).toEqual([33])
    expect(val('cost-pop-head-value')).toBe('33')
    down(q('cost-pop-head-value')!, true)
    await settleAsync()
    expect(onCosts.mock.calls.map((c) => (c[1] as Costs).head)).toEqual([33, 23])
    expect(val('cost-pop-head-value')).toBe('23')
  })

  it('odmowa zapisu (3 → 4, zapisane zostaje 3): pole pokazuje 4 do 5 s, potem 3; następny obrót daje 4, nie 5', async () => {
    const onCosts = open(vi.fn(async (_id: string, _costs: unknown, _ask: unknown) => false))
    up(q('cost-pop-head-value')!)
    await settleAsync()
    expect(onCosts).toHaveBeenCalledTimes(1)
    expect(val('cost-pop-head-value')).toBe('4')
    await act(async () => void vi.advanceTimersByTime(WHEEL_SHOWN_MS))
    expect(val('cost-pop-head-value')).toBe('3')
    up(q('cost-pop-head-value')!)
    expect(val('cost-pop-head-value')).toBe('4')
    await settleAsync()
    expect(onCosts.mock.calls.map((c) => (c[1] as Costs).head)).toEqual([4, 4])
  })

  it('okienko zamknięte w trakcie gestu (Esc) i tak zapisuje liczbę z kółka', async () => {
    const onCosts = open()
    up(q('cost-pop-head-value')!)
    up(q('cost-pop-head-value')!)
    expect(onCosts).not.toHaveBeenCalled()
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    await act(async () => undefined)
    expect(q('cost-pop')).toBeNull()
    expect(onCosts.mock.calls.map((c) => (c[1] as Costs).head)).toEqual([5])
  })

  it('na brzegu 100 nie rośnie – bez zapisu', async () => {
    const onCosts = open()
    for (let i = 0; i < 4; i++) up(q('cost-pop-senses-value')!, true)
    await settleAsync()
    expect(val('cost-pop-senses-value')).toBe('41')
    expect(onCosts).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 7; i++) up(q('cost-pop-senses-value')!, true)
    await settleAsync()
    expect(val('cost-pop-senses-value')).toBe('100')
    expect(onCosts).toHaveBeenCalledTimes(2)
    up(q('cost-pop-senses-value')!)
    up(q('cost-pop-senses-value')!, true)
    await settleAsync()
    expect(onCosts).toHaveBeenCalledTimes(2)
    expect(onCosts.mock.calls.at(-1)![1] as Costs).toMatchObject({ senses: 100 })
  })
})
