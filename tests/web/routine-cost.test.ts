// @vitest-environment jsdom
/**
 * D512: the own cost of a routine in „Rutyny” – the same label and window as the cost of a tile (D501, `TileCost`): three numbers in the
 * colours of the pools, [−] and [+] of −5…5, and the button that gives the routine's cost up („jak podkategoria”). A change writes `costs`
 * over the routine's record as it is when its turn comes (fields this version does not know stay).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, RawRecord } from '@shared/api'
import { planBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import type { Routine } from '@shared/model/routines'
import { installEscape } from '@renderer/lib/escape'
import { RoutinesPage } from '@renderer/features/routines/RoutinesPage'
import { tryUpdateRecord, useData } from '@renderer/store/data'
import { Scenario } from '../unit/engine/dsl'

/** The records as the folder has them; a change is applied to them as the queue would. */
const records = new Map<string, RawRecord>()
vi.mock('@renderer/store/data', async (orig) => ({
  ...(await orig<typeof import('@renderer/store/data')>()),
  tryUpdateRecord: vi.fn(async (rel: string, fn: (raw: RawRecord) => RawRecord | null) => {
    const before = records.get(rel)
    if (!before) return []
    const after = fn({ ...before })
    if (after) records.set(rel, after)
    return [{ status: 'applied' }]
  })
}))

let root: Root | null = null
let host: HTMLElement | null = null
let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterAll(() => removeEscape?.())
beforeEach(() => {
  vi.mocked(tryUpdateRecord).mockClear()
  // Today's log without blocks: a change of the cost reaches no begun block.
  ;(window as unknown as { rd: unknown }).rd = {
    dayData: vi.fn(async (date: string) => ({ date, dayFile: null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false })),
    logEvents: vi.fn(async () => undefined),
    dataView: vi.fn(async () => {
      throw new Error('no view in the test')
    })
  }
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  records.clear()
})

const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (el: Element | null) => act(async () => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))

async function open(r: Routine & { future?: unknown }) {
  records.set('routines/r1.json', { schema: 1, ...r })
  useData.setState({ routines: [r], rd: rdFrom({}), view: { today: '2026-11-18', computers: [] } as unknown as DataView })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(RoutinesPage)))
  await click(q('routine-item'))
}

const routine = (costs: Routine['costs']): Routine => ({ id: 'r1', name: 'Poranna', normal: [{ id: 's1', name: 'Woda', min: 5 }], worse: [], archived: false, costs })

describe('koszt rutyny w „Rutynach” (D512)', () => {
  it('rutyna bez kosztu: napis mówi koszt kategorii rutyn i „jak podkategoria”; [+] zapisuje własny koszt rutyny, inne pola pliku zostają', async () => {
    await open({ ...routine(null), future: { kept: true } })
    const label = q('routine-cost')!
    expect(label.textContent).toBe('1 · 0 · 1')
    expect(label.getAttribute('data-own')).toBeNull()
    expect(q('routine-cost-from')!.textContent).toBe('jak podkategoria')
    await click(label)
    expect(q('cost-pop')).not.toBeNull()
    await click(q('cost-pop-head-plus'))
    expect(tryUpdateRecord).toHaveBeenCalledTimes(1)
    expect(vi.mocked(tryUpdateRecord).mock.calls[0]![0]).toBe('routines/r1.json')
    expect(records.get('routines/r1.json')).toMatchObject({ costs: { head: 2, emotions: 0, senses: 1 }, future: { kept: true }, name: 'Poranna' })
  })

  it('rutyna z kosztem: napis mówi jej koszt (własny); przycisk okienka wraca do „jak podkategoria” (costs: null)', async () => {
    await open(routine({ head: -2, emotions: 3, senses: 0 }))
    const label = q('routine-cost')!
    expect(label.textContent).toBe('−2 · 3 · 0')
    expect(label.getAttribute('data-own')).toBe('true')
    expect(q('routine-cost-from')!.textContent).toBe('własny koszt rutyny')
    await click(label)
    await click(q('cost-pop-reset'))
    expect(records.get('routines/r1.json')!.costs).toBeNull()
  })

  it('zaczęty dziś blok tej rutyny liczy nowy koszt od tej chwili: po zapisie rekordu – block.routineCost dla każdego zaczętego, nieskończonego (D514, T1395)', async () => {
    const today = '2026-11-18'
    const plan = [
      planBlock({ id: 'run', categoryId: 'rutyny', routine: 'r1', startMin: 8 * 60, durationMin: 60, origin: 'user' }),
      planBlock({ id: 'done', categoryId: 'rutyny', routine: 'r1', startMin: 7 * 60, durationMin: 30, origin: 'user' }),
      planBlock({ id: 'later', categoryId: 'rutyny', routine: 'r1', startMin: 20 * 60, durationMin: 30, origin: 'user' }),
      planBlock({ id: 'else', categoryId: 'rutyny', routine: 'r2', startMin: 8 * 60, durationMin: 30, origin: 'user' })
    ]
    const events = new Scenario({ date: today, plan }).ran('done', '07:00', '07:30').start('run', '08:00').start('else', '08:00').events
    const logEvents = vi.fn(async () => undefined)
    ;(window as unknown as { rd: unknown }).rd = {
      dayData: vi.fn(async (date: string) => ({ date, dayFile: date === today ? { schema: 1, date, blocks: plan } : null, nextFile: null, prevFile: null, events: date === today ? events : [], complete: true, unknown: false, away: false })),
      logEvents,
      dataView: vi.fn(async () => {
        throw new Error('no view in the test')
      })
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(new Scenario({ date: today, plan }).at('08:30')))
    try {
      await open(routine(null))
      await click(q('routine-cost'))
      await click(q('cost-pop-head-plus'))
      await act(async () => undefined)
      expect(records.get('routines/r1.json')!.costs).toEqual({ head: 2, emotions: 0, senses: 1 })
      expect(logEvents).toHaveBeenCalledTimes(1)
      expect(logEvents.mock.calls[0]).toEqual([[{ k: 'block.routineCost', day: today, block: 'run', costs: { head: 2, emotions: 0, senses: 1 } }]])
      // „Jak podkategoria”: the begun block goes back to its category's cost from now on too.
      await click(q('cost-pop-reset'))
      await act(async () => undefined)
      expect(logEvents.mock.calls[1]).toEqual([[{ k: 'block.routineCost', day: today, block: 'run', costs: null }]])
    } finally {
      vi.useRealTimers()
    }
  })

  it('[−] przy −5 jest wyłączony – koszt zostaje w zakresie', async () => {
    await open(routine({ head: -5, emotions: 0, senses: 0 }))
    await click(q('routine-cost'))
    expect((q('cost-pop-head-minus') as HTMLButtonElement).disabled).toBe(true)
  })
})
