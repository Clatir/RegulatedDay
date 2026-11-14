// @vitest-environment jsdom
/**
 * U1 (D460) on the screens: the time of a step in the list „Kroki” (a field beside its title, empty allowed), the sum under
 * the heading – „kroki: 45 min z 1 h” with a block's length, „kroki: 45 min” in a task – and the warning when the steps are
 * longer than the block (never a block of the save, D72); the panel's „Rutyna” only points at the routine (D480: its length
 * goes with it, its steps never – a block shows the routine's while it has none of its own, D473).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { planBlock, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import type { Routine } from '@shared/model/routines'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { stepsFrom, type Step } from '@shared/model/steps'
import { BlockEditor } from '@renderer/features/plan/BlockEditor'
import { StepsEditor } from '@renderer/features/steps/StepsEditor'
import { stepsTimeLine } from '@renderer/features/steps/stepsUi'
import { installEscape } from '@renderer/lib/escape'
import { closeToast, useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
})
let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  for (const t of useUi.getState().toasts) closeToast(t.id)
})
const render = async (el: ReturnType<typeof createElement>) => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(el))
  return host
}
const q = (sel: string) => host!.querySelector<HTMLElement>(`[data-testid="${sel}"]`)
const qa = (sel: string) => [...host!.querySelectorAll<HTMLElement>(`[data-testid="${sel}"]`)]
const type = (el: HTMLInputElement, v: string) =>
  act(() => {
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.blur()
  })
const choose = (el: HTMLElement, v: string) =>
  act(() => {
    const s = el as HTMLSelectElement
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(s, v)
    s.dispatchEvent(new Event('change', { bubbles: true }))
  })

const timed = (): Step[] =>
  stepsFrom([
    { id: 's1', title: 'Prysznic', order: 0, min: 10 },
    { id: 's2', title: 'Śniadanie', order: 1, min: 20 },
    { id: 's3', title: 'Kawa', order: 2 },
    { id: 's4', title: 'Leki', order: 3, min: 15 }
  ])

describe('czas kroku w liście „Kroki” (D460)', () => {
  const editor = (o: Partial<Parameters<typeof StepsEditor>[0]> = {}) => {
    const onOp = vi.fn(async (..._a: unknown[]) => true as boolean | 'asked')
    return { onOp, el: createElement(StepsEditor, { steps: timed(), ticks: true, onOp: onOp as never, ...o }) }
  }

  it('pole czasu przy każdym kroku: wpis zapisuje czas, puste – czyści, ta sama wartość – nic; poza zakresem – odmowa', async () => {
    const m = editor()
    await render(m.el)
    const fields = qa('step-min') as HTMLInputElement[]
    expect(fields.map((f) => f.value)).toEqual(['10 min', '20 min', '', '15 min'])
    type(fields[2]!, '5')
    expect(m.onOp).toHaveBeenLastCalledWith({ op: 'min', id: 's3', min: 5 })
    type(fields[0]!, '')
    expect(m.onOp).toHaveBeenLastCalledWith({ op: 'min', id: 's1', min: null })
    m.onOp.mockClear()
    type(fields[1]!, '20')
    type(fields[2]!, '')
    expect(m.onOp).not.toHaveBeenCalled()
    type(fields[1]!, '300')
    expect(m.onOp).not.toHaveBeenCalled()
    expect(fields[1]!.getAttribute('aria-invalid')).toBe('true')
  })

  it('suma pod nagłówkiem: „kroki: 45 min z 1 h”; dłuższa niż blok – ostrzeżenie, nic nie blokuje; bez czasów – nic', async () => {
    await render(editor({ lengthMin: 60 }).el)
    expect(q('steps-time')!.textContent).toBe('kroki: 45 min z 1 h')
    expect(q('steps-over')).toBeNull()
    act(() => root!.unmount())
    host!.remove()
    const m = editor({ lengthMin: 30 })
    await render(m.el)
    expect(q('steps-time')!.textContent).toBe('kroki: 45 min z 30 min')
    expect(q('steps-over')!.textContent).toBe('Kroki trwają o 15 min dłużej niż blok – jego długość się nie zmienia.')
    // Nothing is blocked: a step is still added.
    const add = q('step-add') as HTMLInputElement
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(add, 'Spacer')
      add.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => void add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    expect(m.onOp).toHaveBeenCalledWith(expect.objectContaining({ op: 'add', title: 'Spacer' }))
    act(() => root!.unmount())
    host!.remove()
    await render(editor({ lengthMin: 60, steps: stepsFrom([{ id: 'x', title: 'Kawa', order: 0 }]) }).el)
    expect(q('steps-time')).toBeNull()
  })

  it('zadanie (bez długości bloku): sama suma „kroki: 45 min”, bez ostrzeżenia; lista tylko do odczytu – czas widać, pola nie zmienia', async () => {
    await render(editor({ kind: 'task' }).el)
    expect(q('steps-time')!.textContent).toBe('kroki: 45 min')
    expect(q('steps-over')).toBeNull()
    act(() => root!.unmount())
    host!.remove()
    const m = editor({ readOnly: true, lengthMin: 60 })
    await render(m.el)
    const f = qa('step-min')[0] as HTMLInputElement
    expect(f.value).toBe('10 min')
    expect(f.readOnly).toBe(true)
  })

  it('tekst sumy (czysty): z długością, bez niej, ponad długość', () => {
    expect(stepsTimeLine(timed(), 90)).toEqual({ text: 'kroki: 45 min z 1 h 30 min', warning: null })
    expect(stepsTimeLine(timed(), 40)).toEqual({ text: 'kroki: 45 min z 40 min', warning: 'Kroki trwają o 5 min dłużej niż blok – jego długość się nie zmienia.' })
    expect(stepsTimeLine(timed())).toEqual({ text: 'kroki: 45 min', warning: null })
    expect(stepsTimeLine([])).toBeNull()
  })
})

describe('„Rutyna” w panelu bloku tylko wskazuje rutynę (D480)', () => {
  const poranek: Routine = { id: 'r1', name: 'Poranek', archived: false, worse: [], normal: [
    { id: 'a', name: 'Prysznic', min: 10 },
    { id: 'b', name: 'Śniadanie', min: 20 },
    { id: 'c', name: 'Leki', min: 5 }
  ] }
  const wieczor: Routine = { id: 'r2', name: 'Wieczór', archived: false, worse: [], normal: [{ id: 'd', name: 'Kolacja', min: 30 }] }
  const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [poranek, wieczor], requests: [] }
  const mount = async (block: PlanBlock) => {
    const onChange = vi.fn((_p: Partial<PlanBlock>) => undefined as void)
    await render(createElement(BlockEditor, { block, plan: [], names, computers: [], onChange, onClose: () => undefined }))
    return onChange
  }
  const rutyna = (o: Partial<PlanBlock> = {}) => planBlock({ id: 'b1', categoryId: 'rutyny', startMin: 7 * 60, durationMin: 30, origin: 'user', ...o })

  it('pusty blok, „Poranek” – rutyna i długość z rutyny (35 min), bez kopii kroków (blok pokaże kroki rutyny, D473)', async () => {
    const onChange = await mount(rutyna())
    choose(q('block-routine')!, 'r1')
    expect(onChange.mock.calls[0]![0]).toEqual({ routine: 'r1', durationMin: 35 })
  })

  it('blok z własnymi krokami (też kopią z 1.20–1.21) – lista zostaje; „bez rutyny” – kroki zostają; blok zadania – tak samo', async () => {
    const own = stepsFrom([{ id: 'x', title: 'Podlać kwiaty', order: 0 }])
    let onChange = await mount(rutyna({ routine: 'r1', steps: own }))
    choose(q('block-routine')!, 'r2')
    expect(onChange.mock.calls[0]![0]).toEqual({ routine: 'r2', durationMin: 30 })
    act(() => root!.unmount())
    host!.remove()
    onChange = await mount(rutyna({ routine: 'r1', steps: own }))
    choose(q('block-routine')!, '-')
    expect(onChange.mock.calls[0]![0]).toEqual({ routine: null })
    act(() => root!.unmount())
    host!.remove()
    onChange = await mount(rutyna({ task: 't1' }))
    choose(q('block-routine')!, 'r1')
    expect(onChange.mock.calls[0]![0]).toEqual({ routine: 'r1', durationMin: 35 })
  })
})
