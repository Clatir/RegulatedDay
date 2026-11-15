/**
 * D501 (review 1.24-B): the cost of a minute is `own ?? base` – a block with its own cost never asks its category's (`costsOf`) in the
 * minute loops of the energy, nor builds anything for it; the base is the one helper of the tile and the engine (`baseCosts`).
 */
import { describe, expect, it, vi } from 'vitest'
import * as categories from '@shared/model/categories'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { Scenario, block } from './dsl'

vi.mock('@shared/model/categories', async (orig) => {
  const m = await orig<typeof import('@shared/model/categories')>()
  return { ...m, costsOf: vi.fn(m.costsOf) }
})

describe('koszt minuty: skrót własnego kosztu', () => {
  it('blok z własnym kosztem – ani jednego costsOf w pętlach energii', () => {
    const own = { head: 2, emotions: 2, senses: 2, body: 2 }
    const plan = [{ ...block({ id: 'a', cat: 'analiza', at: '09:00', min: 120 }), costs: own }, { ...block({ id: 'later', cat: 'analiza', at: '20:00', min: 30, fixed: true }), costs: own }]
    const s = new Scenario({ date: '2026-10-21', plan, settings: { transitionBufferMin: 0 } }).checkin('08:00', { head: [1, 1], emotions: [1, 1], senses: [1, 1], body: [1, 1] }).start('a', '09:00')
    const ctx = s.contextAt(s.at('10:00'))
    const day = computeDay(ctx)
    const spy = vi.mocked(categories.costsOf)
    spy.mockClear()
    const e = computeEnergy(ctx, day)
    expect(spy).not.toHaveBeenCalled()
    expect(e.now).toEqual({ head: 65 - 6, emotions: 65 - 6, senses: 65 - 6, body: 65 - 6 })
  })
})
