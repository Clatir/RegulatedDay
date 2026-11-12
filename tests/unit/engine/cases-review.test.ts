/**
 * „Sprawy” after the review of L2 (T759–T762): a block parked or cancelled before its start is no longer „zaplanowane”
 * (D402) – the sprawa is back on its list; the days read for „zaplanowane” are only those of sprawy not done, from two weeks
 * back; the morning's step plans what `scheduledOf` says is not planned (a sprawa whose block is gone is offered and
 * planned) and says what it left out; its task blocks are `caseBlock`'s.
 */
import { describe, expect, it } from 'vitest'
import { caseBlock, caseItems, goneBlocks, morningCases, morningPlan, scheduledDays, scheduledOf, SCHEDULED_LOOKBACK_DAYS } from '@shared/engine/cases'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { dayFileFrom } from '@shared/model/plan'
import { newRequest, newTask, requestFrom, type RequestRecord } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { block, Scenario } from './dsl'

const TODAY = '2026-11-12'
const at = (date: string, hh = 12) => placeLogical(date, hh * 60)
const rec = (raw: Record<string, unknown>): RequestRecord => requestFrom(raw)!
const rules = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]))
const b1 = { id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'user', task: 't1' }
const fileWith = (blocks: unknown[]) => dayFileFrom({ schema: 1, date: TODAY, blocks }, TODAY)
const planned = (p: Record<string, unknown> = {}) => rec({ ...newTask('t1', at(TODAY), TODAY, { title: 'x', list: 'today' })!, day: TODAY, block: 'b1', state: 'planned', ...p })

describe('zaplanowane a blok zaparkowany albo odwołany przed startem (D402)', () => {
  it('blok odwołany albo zaparkowany w logu dnia – sprawa nie jest zaplanowana, wraca na swoją listę', () => {
    const s = new Scenario({ date: TODAY, plan: [block({ id: 'b1', cat: 'inne', at: '10:00', min: 30, origin: 'user' }), block({ id: 'b2', cat: 'inne', at: '11:00', min: 30, origin: 'user' })] })
    s.raw({ k: 'block.park', block: 'b1', at: s.at('09:00'), rule: 'exchange' }, '09:00')
    s.raw({ k: 'block.cancel', block: 'b2', at: s.at('09:05'), rule: 'click' }, '09:05')
    const gone = goneBlocks(TODAY, s.events)
    expect([...gone].sort()).toEqual(['b1', 'b2'])
    expect(scheduledOf(planned(), () => fileWith([b1]), () => gone)).toBeNull()
    // Without the log of the day: as the file says.
    expect(scheduledOf(planned(), () => fileWith([b1]))).toMatchObject({ block: 'b1', known: true })
    const items = caseItems([planned()], TODAY, () => fileWith([b1]), () => gone)
    expect(items[0]).toMatchObject({ list: 'today', scheduled: null })
    expect(morningCases(items).tasks.map((x) => x.record.id)).toEqual(['t1'])
  })

  it('blok zaczęty przed zaparkowaniem nie jest „odwołany przed startem”; cofnięte zaparkowanie – blok znów jest', () => {
    const s = new Scenario({ date: TODAY, plan: [block({ id: 'b1', cat: 'inne', at: '10:00', min: 30, origin: 'user' })] })
    s.raw({ k: 'block.park', block: 'b1', at: s.at('09:00'), rule: 'exchange' }, '09:00')
    const park = s.events.at(-1)!
    s.raw({ k: 'undo', target: park.id, at: s.at('09:01') }, '09:01')
    expect([...goneBlocks(TODAY, s.events)]).toEqual([])
  })
})

describe('dni czytane dla „zaplanowane” (useCases)', () => {
  it('bez spraw zrobionych i bez dni starszych niż dwa tygodnie', () => {
    const old = addDays(TODAY, -(SCHEDULED_LOOKBACK_DAYS + 1))
    const edge = addDays(TODAY, -SCHEDULED_LOOKBACK_DAYS)
    const list = [planned({ day: TODAY }), planned({ id: 'd', day: '2026-11-11', state: 'done', list: 'done' }), planned({ id: 'o', day: old }), planned({ id: 'e', day: edge }), planned({ id: 'f', day: '2026-11-20' })]
    expect(scheduledDays(list, TODAY)).toEqual([edge, TODAY, '2026-11-20'])
  })
})

describe('krok próśb w planie porannym – to samo „zaplanowane” co w ofercie (T752)', () => {
  it('sprawa, której blok zniknął z pliku, jest oferowana i planowana; zaplanowana albo zrobiona w międzyczasie – pominięta z nazwą', () => {
    const stale = planned()
    const offered = morningCases(caseItems([stale], TODAY, () => fileWith([])))
    expect(offered.tasks.map((x) => x.record.id)).toEqual(['t1'])
    const raw = { ...newTask('t1', at(TODAY), TODAY, { title: 'x', list: 'today' })!, day: TODAY, block: 'b1', state: 'planned' }
    const out = morningPlan({ date: TODAY, dayFile: { schema: 1, date: TODAY, blocks: [] }, requests: [], tasks: [raw], startMin: 600, rules, at: at(TODAY, 8) })
    expect(out.blocks.map((b) => b.task)).toEqual(['t1'])
    expect(out.skipped).toEqual([])
    // Its block in the file still (planned): left out, said by id.
    const still = morningPlan({ date: TODAY, dayFile: { schema: 1, date: TODAY, blocks: [b1] }, requests: [], tasks: [raw], startMin: 600, rules, at: at(TODAY, 8) })
    expect([still.blocks, still.skipped]).toEqual([[], ['t1']])
    // Parked in the day's log: not planned – planned again.
    const gone = morningPlan({ date: TODAY, dayFile: { schema: 1, date: TODAY, blocks: [b1] }, requests: [], tasks: [raw], startMin: 600, rules, at: at(TODAY, 8), goneOf: () => new Set(['b1']) })
    expect(gone.blocks).toHaveLength(1)
    const done = morningPlan({ date: TODAY, dayFile: null, requests: [{ ...newRequest('r1', 1, { person: null, estimateMin: null, note: '' }), state: 'done', list: 'done' }], tasks: [], startMin: 600, rules, at: at(TODAY, 8) })
    expect(done.skipped).toEqual(['r1'])
  })

  it('blok zadania z planu porannego to blok `caseBlock` (kategoria usunięta – „Inne”)', () => {
    const raw = newTask('t2', at(TODAY), TODAY, { title: 'y', list: 'today', categoryId: 'nieistniejaca', estimateMin: 45 })!
    const out = morningPlan({ date: TODAY, dayFile: null, requests: [], tasks: [raw], startMin: 600, rules, at: at(TODAY, 8) })
    const { id, ...made } = out.blocks[0]!
    const { id: _id, ...expected } = caseBlock(rec(raw), 600, rules)
    expect(made).toEqual(expected)
    expect(made).toMatchObject({ categoryId: 'inne', durationMin: 45, task: 't2' })
    expect(id).not.toBe(_id)
  })
})
