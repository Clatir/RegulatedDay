/**
 * „Sprawy” in the window after the review of L2 (T761): a sprawa planned again is planned once – its old block (not
 * begun) neither stays nor comes back through the blocks the drop pushes apart, and it is not pushed by the drop; an old
 * block moved to a third day is taken out there; the morning's step says how many blocks it made and which chosen ones it
 * left out, and plans a sprawa whose block is gone (the same rule as its offer).
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { computeDay } from '@shared/engine/day'
import { paths } from '@shared/data/paths'
import { dayFileFrom, planBlock, type PlanBlock } from '@shared/model/plan'
import { newTask, requestFrom } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'
import { planningOf } from '@renderer/features/cases/planOnAxis'
import { planCase, planMorning } from '@renderer/store/cases'
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

// Days far ahead of the real clock: never „begun” by the default of `planCase` (a day gone by is taken for begun).
const D1 = '2099-03-02'
const D2 = '2099-03-03'
const D3 = '2099-03-04'
const old = { id: 'old', categoryId: 'inne', startMin: 14 * 60, durationMin: 30, origin: 'user' as const, task: 't1' }
const planned = (day: string) => ({ ...newTask('t1', placeLogical(D1, 600), D1, { title: 'Zadzwonić', list: 'week' })!, day, block: 'old', state: 'planned' })

function stub(records: RawRecord[], days: Record<string, RawRecord | null>, gone: Record<string, string[]> = {}) {
  const sent: EditEntry[][] = []
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: records, routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const files = (dates: string[]) => Object.fromEntries(dates.filter((d) => d in days).map((d) => [d, days[d] ?? null]))
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => files(dates),
    caseDays: async (dates) => ({ files: files(dates), gone: Object.fromEntries(dates.filter((d) => d in days).map((d) => [d, gone[d] ?? []])), begun: Object.fromEntries(dates.filter((d) => d in days).map((d) => [d, []])) }),
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view()
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: view(), requests: records.map((r) => requestFrom(r)!) })
  return { sent }
}

const blocksAfter = (r: { undo: Array<{ rel: string; after: RawRecord | null }> }, date: string) => dayFileFrom(r.undo.find((u) => u.rel === paths.day(date))?.after, date).blocks

describe('ponowne zaplanowanie sprawy (T761)', () => {
  it('blok 14:00 niezaczęty, zaplanowane ponownie na 13:45: jeden blok zadania – stary nie wraca przez rozsuwane', async () => {
    const { sent } = stub([planned(D1)], { [D1]: { schema: 1, date: D1, blocks: [old] } })
    // The drop pushed the old block (it stood after the new one) – as the window counted it before the fix.
    const r = await planCase('t1', D1, lm('13:45'), { push: { blocks: [{ block: planBlock({ ...old, startMin: lm('14:00') }), startMin: lm('14:15') }], planOf: (file: { blocks: PlanBlock[] }) => file.blocks } })
    expect(r.saved).toBe(true)
    expect(sent).toHaveLength(1)
    expect(blocksAfter(r, D1).filter((b) => b.task === 't1').map((b) => [b.id, b.startMin])).toEqual([[r.block!.id, lm('13:45')]])
  })

  it('stary blok przeniesiony na trzeci dzień: wychodzi z tamtego dnia w tej samej edycji', async () => {
    const days = { [D1]: { schema: 1, date: D1, blocks: [], movedTo: { old: D3 } }, [D2]: null, [D3]: { schema: 1, date: D3, blocks: [{ ...old, movedFrom: D1 }] } }
    const { sent } = stub([planned(D1)], days)
    const r = await planCase('t1', D2, lm('10:00'))
    expect(r.saved).toBe(true)
    expect(sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(D2), paths.day(D3), paths.record('request', 't1')].sort())
    expect(blocksAfter(r, D3)).toEqual([])
    expect(blocksAfter(r, D2).map((b) => b.task)).toEqual(['t1'])
  })

  it('okno: rozsuwanie liczone bez starego bloku tej sprawy – nie przesuwa go i nie przesuwa tego, co zderzało się tylko z nim', () => {
    const plan = [planBlock({ ...block({ id: 'old', cat: 'inne', at: '14:00', min: 30, origin: 'user' }), task: 't1' }), block({ id: 'c', cat: 'inne', at: '14:30', min: 30, origin: 'user' })]
    const s = new Scenario({ date: D1, plan }).observe('07:00', null)
    const ctx = s.contextAt(s.at('08:00'))
    const model = { date: D1, ctx, state: computeDay(ctx), data: { dayFile: null } } as unknown as DayModel
    const p = planningOf(model, D1, requestFrom(planned(D1))!, lm('13:45'))
    expect(p.pushed.map((x) => x.block.id)).toEqual([])
  })
})

describe('plan poranny mówi, co zrobił (T761)', () => {
  it('ile bloków powstało i które wybrane pominął; zaplanowane w międzyczasie – nic nie zapisane', async () => {
    const t = { ...newTask('t1', placeLogical(D1, 600), D1, { title: 'x', list: 'today' })!, day: D1, block: 'old', state: 'planned' }
    const { sent } = stub([t], { [D1]: { schema: 1, date: D1, blocks: [old] } })
    const r = await planMorning(D1, null, { requests: [], tasks: ['t1'] }, lm('10:00'))
    expect(r).toMatchObject({ saved: true, made: 0, skipped: ['t1'] })
    expect(sent).toEqual([])
  })

  it('sprawa z blokiem, którego nie ma już w pliku (T752), albo zaparkowanym w logu – zaplanowana', async () => {
    const t = { ...newTask('t1', placeLogical(D1, 600), D1, { title: 'x', list: 'today' })!, day: D1, block: 'old', state: 'planned' }
    stub([t], { [D1]: { schema: 1, date: D1, blocks: [] } })
    expect(await planMorning(D1, null, { requests: [], tasks: ['t1'] }, lm('10:00'))).toMatchObject({ saved: true, made: 1, skipped: [] })
    stub([t], { [D1]: { schema: 1, date: D1, blocks: [old] } }, { [D1]: ['old'] })
    expect(await planMorning(D1, null, { requests: [], tasks: ['t1'] }, lm('10:00'))).toMatchObject({ saved: true, made: 1, skipped: [] })
  })
})
