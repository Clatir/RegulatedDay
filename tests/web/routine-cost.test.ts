// @vitest-environment jsdom
/**
 * D512: the own cost of a routine in „Rutyny” – the same label and window as the cost of a tile (D501, `TileCost`): three numbers in the
 * colours of the pools, [−] and [+] of −100…100, and the button that gives the routine's cost up („jak podkategoria”). A change writes `costs`
 * over the routine's record as it is when its turn comes (fields this version does not know stay).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, RawRecord } from '@shared/api'
import { rdFrom } from '@shared/model/rd'
import type { Routine } from '@shared/model/routines'
import { installEscape } from '@renderer/lib/escape'
import { RoutinesPage } from '@renderer/features/routines/RoutinesPage'
import { tryUpdateRecord, useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'

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
  useUi.setState({ toasts: [] })
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
    expect(label.textContent).toBe('1 · 0 · 1 · 1')
    expect(label.getAttribute('data-own')).toBeNull()
    expect(q('routine-cost-from')!.textContent).toBe('jak podkategoria')
    await click(label)
    expect(q('cost-pop')).not.toBeNull()
    await click(q('cost-pop-head-plus'))
    expect(tryUpdateRecord).toHaveBeenCalledTimes(1)
    expect(vi.mocked(tryUpdateRecord).mock.calls[0]![0]).toBe('routines/r1.json')
    expect(records.get('routines/r1.json')).toMatchObject({ costs: { head: 2, emotions: 0, senses: 1, body: 1 }, future: { kept: true }, name: 'Poranna' })
  })

  it('rutyna z kosztem: napis mówi jej koszt (własny); przycisk okienka wraca do „jak podkategoria” (costs: null)', async () => {
    await open(routine({ head: -2, emotions: 3, senses: 0, body: 0 }))
    const label = q('routine-cost')!
    expect(label.textContent).toBe('−2 · 3 · 0 · 0')
    expect(label.getAttribute('data-own')).toBe('true')
    expect(q('routine-cost-from')!.textContent).toBe('własny koszt rutyny')
    await click(label)
    await click(q('cost-pop-reset'))
    expect(records.get('routines/r1.json')!.costs).toBeNull()
  })

  it('zapis kosztu to sam rekord: okno nie czyta dnia i nie pisze zdarzeń – zaczęty blok dostaje nowy koszt z `routine.cost` procesu głównego (D514, T1430)', async () => {
    await open(routine(null))
    await click(q('routine-cost'))
    await click(q('cost-pop-head-plus'))
    await click(q('cost-pop-head-plus'))
    await act(async () => undefined)
    expect(records.get('routines/r1.json')!.costs).toEqual({ head: 3, emotions: 0, senses: 1, body: 1 })
    expect(tryUpdateRecord).toHaveBeenCalledTimes(2)
    const rd = window.rd as unknown as { dayData: ReturnType<typeof vi.fn>; logEvents: ReturnType<typeof vi.fn> }
    expect(rd.dayData).not.toHaveBeenCalled()
    expect(rd.logEvents).not.toHaveBeenCalled()
  })

  it('dzień nieczytelny nie ma znaczenia dla zapisu kosztu – bez komunikatu o zaczętym bloku (dawne T1399)', async () => {
    const rd = window.rd as unknown as { dayData: ReturnType<typeof vi.fn> }
    rd.dayData.mockRejectedValue(new Error('log nieczytelny'))
    await open(routine(null))
    await click(q('routine-cost'))
    await click(q('cost-pop-head-plus'))
    await act(async () => undefined)
    expect(records.get('routines/r1.json')!.costs).toEqual({ head: 2, emotions: 0, senses: 1, body: 1 })
    expect(useUi.getState().toasts).toEqual([])
  })

  it('[−] przy −100 jest wyłączony – koszt zostaje w zakresie', async () => {
    await open(routine({ head: -100, emotions: 0, senses: 0, body: 0 }))
    await click(q('routine-cost'))
    expect((q('cost-pop-head-minus') as HTMLButtonElement).disabled).toBe(true)
  })
})
