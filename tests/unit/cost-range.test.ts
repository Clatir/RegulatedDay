/**
 * D501 (review 1.24-B): the range of a pool's cost has one source – the schema's `RANGES.cost`. The step of the tile's window, the field
 * of a block read from its file (`costsFrom`), the log's `energy.cost` and the calibration's proposal all follow it (here narrowed to −3…3).
 */
import { describe, expect, it, vi } from 'vitest'
import { COST_MAX, COST_MIN, costStep } from '@shared/model/blockCosts'
import { parseEvent } from '@shared/model/events'
import { planBlockFrom } from '@shared/model/plan'

vi.mock('@shared/model/settings', async (orig) => {
  const m = await orig<typeof import('@shared/model/settings')>()
  return { ...m, RANGES: { ...m.RANGES, cost: [-3, 3] as const } }
})

describe('zakres kosztu z RANGES.cost', () => {
  it('krok okienka, pole bloku z pliku i zdarzenie energy.cost czytają ten sam zakres', () => {
    expect([COST_MIN, COST_MAX]).toEqual([-3, 3])
    expect(costStep({ head: 3, emotions: -3, senses: 0 }, 'head', 1).head).toBe(3)
    expect(costStep({ head: 3, emotions: -3, senses: 0 }, 'emotions', -1).emotions).toBe(-3)
    const raw = (costs: unknown) => planBlockFrom({ id: 'a', categoryId: 'analiza', startMin: 600, durationMin: 60, costs })!.costs
    expect(raw({ head: 3, emotions: -3, senses: 0 })).toEqual({ head: 3, emotions: -3, senses: 0 })
    expect(raw({ head: 4, emotions: 0, senses: 0 })).toBeNull()
    const line = (costs: unknown) => JSON.stringify({ id: 'x', c: 'pca', n: 1, t: 1, l: 1, v: 13, day: '2026-10-21', dom: 'energy', k: 'energy.cost', block: 'a', at: 1, costs })
    expect(parseEvent(line({ head: 3, emotions: 0, senses: 0 }))).toMatchObject({ ok: true })
    expect(parseEvent(line({ head: 4, emotions: 0, senses: 0 }))).toEqual({ ok: false, why: 'pole costs' })
  })
})
