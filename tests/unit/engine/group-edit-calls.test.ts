/**
 * Zmiany grupowe (D528) – ile liczenia kosztuje działanie: `judgeGroup` liczy zmiany kosztów zaczętych bloków raz na wywołanie;
 * „Odwołaj” / „Zaparkuj” dokładają zdarzenia wcześniejszych bloków do faktów dnia, bez liczenia całego dnia od nowa; odmowa timera mówi
 * swój powód.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { costChangesOf } from '@shared/engine/costChange'
import { computeDay } from '@shared/engine/day'
import { groupLogDrafts, judgeGroup } from '@shared/engine/groupEdit'
import { ALREADY_OVER, timerAction } from '@shared/engine/timer'
import type { PlanBlock } from '@shared/model/plan'
import { block, Scenario } from './dsl'

// Pass-through spies: how many times the day is counted, the costs' changes are folded, the timer judges.
vi.mock('@shared/engine/day', async (orig) => {
  const m = await orig<typeof import('@shared/engine/day')>()
  return { ...m, computeDay: vi.fn(m.computeDay) }
})
vi.mock('@shared/engine/costChange', async (orig) => {
  const m = await orig<typeof import('@shared/engine/costChange')>()
  return { ...m, costChangesOf: vi.fn(m.costChangesOf) }
})
vi.mock('@shared/engine/timer', async (orig) => {
  const m = await orig<typeof import('@shared/engine/timer')>()
  return { ...m, timerAction: vi.fn(m.timerAction) }
})
afterEach(() => vi.clearAllMocks())

const DATE = '2026-10-28'
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const scenario = (plan: PlanBlock[]) => new Scenario({ date: DATE, plan, wake: '06:30', settings: { transitionBufferMin: 0 } }).observe('06:30', null)
const dayAt = (s: Scenario, now: string) => {
  const ctx = s.contextAt(s.at(now))
  return { ctx, state: computeDay(ctx) }
}

describe('judgeGroup – raz na wywołanie', () => {
  it('koszt trzech zaczętych bloków: zmiany kosztów zwinięte raz, nie raz na blok', () => {
    const plan = [flex('a', '07:00', 120), flex('b', '07:00', 120, { background: true }), flex('c', '07:00', 120, { background: true })]
    const s = scenario(plan).start('a', '07:00').start('b', '07:00', { bg: true }).start('c', '07:00', { bg: true })
    const d = dayAt(s, '07:30')
    vi.mocked(costChangesOf).mockClear()
    const j = judgeGroup(d, ['a', 'b', 'c'], { k: 'cost', costs: { head: 1, emotions: 1, senses: 1, body: 1 } }, DATE)
    expect(j.take).toEqual(['a', 'b', 'c'])
    expect(costChangesOf).toHaveBeenCalledTimes(1)
  })
})

describe('groupLogDrafts – zdarzenia wcześniejszych w faktach dnia, bez liczenia dnia od nowa', () => {
  it('zaparkuj trzy, odwołaj dwa elastyczne i dwa stałe bloki pracy – ani razu cały dzień', () => {
    const plan = [flex('a', '10:00', 30), flex('b', '11:00', 30), flex('c', '12:00', 30), flex('f', '14:00', 60, { fixed: true }), flex('g', '16:00', 60, { fixed: true })]
    const d = dayAt(scenario(plan), '08:00')
    const at = scenario(plan).at('08:00')
    vi.mocked(computeDay).mockClear()
    expect(groupLogDrafts(d.ctx, d.state, 'park', ['a', 'b', 'c'], at).taken).toEqual(['a', 'b', 'c'])
    expect(groupLogDrafts(d.ctx, d.state, 'cancel', ['a', 'b'], at).taken).toEqual(['a', 'b'])
    // A fixed block of work: the next one may be the last one left (D216) – the facts with the first cancel say so.
    expect(groupLogDrafts(d.ctx, d.state, 'cancel', ['f', 'g'], at).taken).toEqual(['f', 'g'])
    expect(computeDay).not.toHaveBeenCalled()
  })

  it('odmowa timera z prawdziwym powodem: „skończony”, inna – „odmowa”', () => {
    const plan = [flex('a', '10:00', 30), flex('b', '11:00', 30)]
    const d = dayAt(scenario(plan), '08:00')
    const at = scenario(plan).at('08:00')
    vi.mocked(timerAction).mockReturnValueOnce({ ok: false, why: ALREADY_OVER, confirm: null }).mockReturnValueOnce({ ok: false, why: 'coś innego', confirm: null })
    expect(groupLogDrafts(d.ctx, d.state, 'park', ['a', 'b'], at).skipped).toEqual([
      { id: 'a', why: 'skończony' },
      { id: 'b', why: 'odmowa' }
    ])
  })
})
