/**
 * „Sprawy” in the window after the second review of L2 (T764, T765): a push the drop counted is written only for blocks
 * still in the day after the change – a block of several requests that only lost this one moves with the push, one gone
 * from the file is never written back – and the bar's „Przesunięto N bloków” counts what was written; the morning's step
 * takes the old block of a sprawa it plans again (parked) out of its day; a day of the chain of „przenieś” that cannot be
 * read now does not stop the planning.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { dayPlan } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { paths } from '@shared/data/paths'
import { dayFileFrom, planBlock } from '@shared/model/plan'
import { newRequest, newTask, requestFrom } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'
import { planningOf, planOnAxis } from '@renderer/features/cases/planOnAxis'
import { DAY_UNREADABLE, planCase, planMorning } from '@renderer/store/cases'
import { useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'
import { block, lm, Scenario } from '../unit/engine/dsl'

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

// Days far ahead of the real clock: never „begun” by the default of `planCase`.
const D1 = '2099-03-02'
const D2 = '2099-03-03'

function stub(records: RawRecord[], days: Record<string, RawRecord | null>, gone: Record<string, string[]> = {}) {
  const sent: EditEntry[][] = []
  const planPushed = vi.fn(async () => undefined)
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: records, routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const files = (dates: string[]) => Object.fromEntries(dates.filter((d) => d in days).map((d) => [d, days[d] ?? null]))
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => files(dates),
    caseDays: async (dates) => ({ files: files(dates), gone: Object.fromEntries(dates.filter((d) => d in days).map((d) => [d, gone[d] ?? []])), begun: Object.fromEntries(dates.filter((d) => d in days).map((d) => [d, []])) }),
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view(),
    planPushed
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: view(), requests: records.map((r) => requestFrom(r)!) })
  return { sent, planPushed }
}

const blocksAfter = (r: { undo: Array<{ rel: string; after: RawRecord | null }> }, date: string) => dayFileFrom(r.undo.find((u) => u.rel === paths.day(date))?.after, date).blocks

describe('rozsuwanie przy zaplanowaniu sprawy (T764)', () => {
  it('blok dwóch próśb traci tylko tę i zostaje – przesunięty jak policzyło okno (nie nakłada się z nowym)', async () => {
    const reqR = { ...newRequest('r', 1, { person: 'mama', estimateMin: 20, note: '' }), day: D1, block: 'B', state: 'planned' }
    const reqS = { ...newRequest('s', 2, { person: 'tata', estimateMin: 10, note: '' }), day: D1, block: 'B', state: 'planned' }
    const B = { id: 'B', categoryId: 'prosby', startMin: lm('14:00'), durationMin: 30, origin: 'user' as const, requests: ['r', 's'] }
    stub([reqR, reqS], { [D1]: { schema: 1, date: D1, blocks: [B] } })
    // The window counts the day with B (it stays – it only loses „r”): the new block 13:50–14:10 pushes it to 14:10.
    const plan = [planBlock({ ...block({ id: 'B', cat: 'prosby', at: '14:00', min: 30, origin: 'user' }), requests: ['r', 's'] })]
    const s = new Scenario({ date: D1, plan }).observe('07:00', null)
    const ctx = s.contextAt(s.at('08:00'))
    const model = { date: D1, ctx, state: computeDay(ctx), data: { dayFile: { schema: 1, date: D1, blocks: [B] } } } as unknown as DayModel
    const p = planningOf(model, D1, requestFrom(reqR)!, lm('13:50'))
    expect(p.pushed.map((x) => [x.block.id, x.startMin])).toEqual([['B', lm('14:10')]])
    const r = await planCase('r', D1, lm('13:50'), { push: { blocks: p.pushed, planOf: (file) => dayPlan(model.ctx.snapshot, file) } })
    expect(r.saved).toBe(true)
    const after = blocksAfter(r, D1)
    expect(after.find((b) => b.id === 'B')).toMatchObject({ startMin: lm('14:10'), requests: ['s'] })
    expect(r.moved).toBe(1)
  })

  it('blok usunięty z pliku w międzyczasie (inny komputer) nie wraca przez rozsuwane; pasek: bez „Przesunięto”', async () => {
    const t = newTask('t1', placeLogical(D1, 600), D1, { title: 'x', list: 'week' })!
    // The window still shows „c” at 10:30; the file has lost it.
    const { planPushed } = stub([t], { [D1]: { schema: 1, date: D1, blocks: [] } })
    const plan = [block({ id: 'c', cat: 'inne', at: '10:30', min: 30, origin: 'user' })]
    const s = new Scenario({ date: D1, plan }).observe('07:00', null)
    // A block of yours is the file's, never the snapshot's (made from the templates).
    const at = s.contextAt(s.at('08:00'))
    const ctx = { ...at, snapshot: { ...at.snapshot, blocks: [] } }
    const model = { date: D1, ctx, state: computeDay(ctx), data: { dayFile: { schema: 1, date: D1, blocks: [] } } } as unknown as DayModel
    const res = await planOnAxis(model, D1, requestFrom(t)!, 'x', lm('10:15'))
    expect(res.saved).toBe(true)
    expect(blocksAfter(res, D1).map((b) => b.task)).toEqual(['t1'])
    expect(res.moved).toBe(0)
    expect(planPushed).not.toHaveBeenCalled()
  })

  it('blok szablonu (nie w pliku) przesunięty – zapisany z nowym startem; pasek liczy go', async () => {
    const t = newTask('t1', placeLogical(D1, 600), D1, { title: 'x', list: 'week' })!
    const { planPushed } = stub([t], { [D1]: null })
    const plan = [block({ id: 'tpl', cat: 'inne', at: '10:30', min: 30 })]
    const s = new Scenario({ date: D1, plan }).observe('07:00', null)
    const ctx = s.contextAt(s.at('08:00'))
    const model = { date: D1, ctx, state: computeDay(ctx), data: { dayFile: null } } as unknown as DayModel
    const res = await planOnAxis(model, D1, requestFrom(t)!, 'x', lm('10:15'))
    expect(blocksAfter(res, D1).find((b) => b.id === 'tpl')).toMatchObject({ startMin: lm('10:45') })
    expect(res.moved).toBe(1)
    expect(planPushed).toHaveBeenCalledWith(D1, 1, expect.anything(), expect.anything())
  })
})

describe('plan poranny i stary blok (T765)', () => {
  it('sprawa z blokiem zaparkowanym (nadal w pliku) zaplanowana ponownie: stary blok wychodzi z dnia – jeden blok zadania', async () => {
    const old = { id: 'old', categoryId: 'inne', startMin: lm('14:00'), durationMin: 30, origin: 'user', task: 't1' }
    const t = { ...newTask('t1', placeLogical(D1, 600), D1, { title: 'x', list: 'today' })!, day: D1, block: 'old', state: 'planned' }
    stub([t], { [D1]: { schema: 1, date: D1, blocks: [old] } }, { [D1]: ['old'] })
    const r = await planMorning(D1, null, { requests: [], tasks: ['t1'] }, lm('10:00'))
    expect(r).toMatchObject({ saved: true, made: 1 })
    expect(blocksAfter(r, D1).filter((b) => b.task === 't1').map((b) => b.startMin)).toEqual([lm('10:00')])
  })
})

describe('dzień łańcucha „przenieś” nieczytelny (T765, cofnięte przez T769)', () => {
  it('odmowa – stary blok mógłby zostać obok nowego (nigdy cichy duplikat)', async () => {
    const t = { ...newTask('t1', placeLogical(D1, 600), D1, { title: 'x', list: 'week' })!, day: D1, block: 'old', state: 'planned' }
    // D1 not readable now (not in the window's answer), the drop on D2.
    const { sent } = stub([t], { [D2]: null })
    const r = await planCase('t1', D2, lm('10:00'))
    expect(r).toMatchObject({ saved: false, error: DAY_UNREADABLE })
    expect(sent).toEqual([])
  })
})
