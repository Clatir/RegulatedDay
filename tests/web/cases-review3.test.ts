/**
 * „Sprawy” in the window after the third review of L2 (T769, T770): the old block of a sprawa dropped on another day is
 * judged by that day's log (parked today, not begun – taken out); a day the old block stands on that cannot be read now
 * refuses the planning (never a silent second block); „Przesunięto N bloków” counts only starts that changed; a pushed
 * block is written only while the day's plan after the change has it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { dayPlan } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { paths } from '@shared/data/paths'
import { dayFileFrom, planBlock } from '@shared/model/plan'
import { newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf, placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { planOnAxis } from '@renderer/features/cases/planOnAxis'
import { DAY_UNREADABLE, planCase } from '@renderer/store/cases'
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

const TODAY = logicalDayOf(Date.now())
const TOMORROW = addDays(TODAY, 1)
const D1 = '2099-03-02'
const old = { id: 'old', categoryId: 'inne', startMin: lm('14:00'), durationMin: 30, origin: 'user' as const, task: 't1' }
const planned = (day: string) => ({ ...newTask('t1', placeLogical(day, 600), day, { title: 'x', list: 'week' })!, day, block: 'old', state: 'planned' })

function stub(records: RawRecord[], days: Record<string, RawRecord | null>, o: { gone?: Record<string, string[]>; begun?: Record<string, string[]>; incomplete?: string[] } = {}) {
  const sent: EditEntry[][] = []
  const planPushed = vi.fn(async () => undefined)
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: records, routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const files = (dates: string[]) => Object.fromEntries(dates.filter((d) => d in days).map((d) => [d, days[d] ?? null]))
  const known = (dates: string[], of: Record<string, string[]> | undefined) => Object.fromEntries(dates.filter((d) => d in days && !o.incomplete?.includes(d)).map((d) => [d, of?.[d] ?? []]))
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => files(dates),
    caseDays: async (dates) => ({ files: files(dates), gone: known(dates, o.gone), begun: known(dates, o.begun) }),
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view(),
    planPushed
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: view(), requests: records.map((r) => requestFrom(r)!) })
  return { sent, planPushed }
}

const blocksAfter = (r: { undo: Array<{ rel: string; after: RawRecord | null }> }, date: string) => dayFileFrom(r.undo.find((u) => u.rel === paths.day(date))?.after, date).blocks
/** The plan of the model's day with a file (as `planOnAxis` gives it to `planCase`). */
const dayPlanOf = (model: DayModel, file: ReturnType<typeof dayFileFrom>) => dayPlan(model.ctx.snapshot, file)

function modelOf(date: string, plan = [] as ReturnType<typeof block>[], file: RawRecord | null = null): DayModel {
  const s = new Scenario({ date, plan }).observe('07:00', null)
  const ctx = s.contextAt(s.at('08:00'))
  return { date, ctx, state: computeDay(ctx), data: { dayFile: file } } as unknown as DayModel
}

describe('stary blok na innym dniu – według logu tamtego dnia (T769)', () => {
  it('zaparkowany dziś, niezaczęty, upuszczony na jutro: dzisiejszy blok wychodzi – zadanie raz', async () => {
    stub([planned(TODAY)], { [TODAY]: { schema: 1, date: TODAY, blocks: [old] }, [TOMORROW]: null }, { gone: { [TODAY]: ['old'] } })
    const res = await planOnAxis(modelOf(TOMORROW), TODAY, requestFrom(planned(TODAY))!, 'x', lm('10:00'))
    expect(res.saved).toBe(true)
    expect(res.undo.map((u) => u.rel)).toContain(paths.day(TODAY))
    expect(blocksAfter(res, TODAY)).toEqual([])
    expect(blocksAfter(res, TOMORROW).map((b) => b.task)).toEqual(['t1'])
  })

  it('zaczęty dziś według logu: zostaje (przebiegł)', async () => {
    stub([planned(TODAY)], { [TODAY]: { schema: 1, date: TODAY, blocks: [old] }, [TOMORROW]: null }, { begun: { [TODAY]: ['old'] } })
    const res = await planOnAxis(modelOf(TOMORROW), TODAY, requestFrom(planned(TODAY))!, 'x', lm('10:00'))
    expect(res.saved).toBe(true)
    expect(res.undo.some((u) => u.rel === paths.day(TODAY))).toBe(false)
  })

  it('dzień starego bloku nieczytelny albo z niepełnym logiem: odmowa, nic nie zapisane (nigdy drugi blok po cichu)', async () => {
    const { sent } = stub([planned(D1)], { '2099-03-03': null })
    expect(await planCase('t1', '2099-03-03', lm('10:00'))).toMatchObject({ saved: false, error: DAY_UNREADABLE })
    const s2 = stub([planned(D1)], { [D1]: { schema: 1, date: D1, blocks: [old] }, '2099-03-03': null }, { incomplete: [D1] })
    expect(await planCase('t1', '2099-03-03', lm('10:00'))).toMatchObject({ saved: false, error: DAY_UNREADABLE })
    expect([...sent, ...s2.sent]).toEqual([])
  })
})

describe('rozsuwanie: licznik i plan dnia po zmianie (T770)', () => {
  it('start, który już taki jest, nie liczy się do „Przesunięto”', async () => {
    const c = { id: 'c', categoryId: 'inne', startMin: lm('11:00'), durationMin: 30, origin: 'user' as const }
    stub([newTask('t1', placeLogical(D1, 600), D1, { title: 'x' })!], { [D1]: { schema: 1, date: D1, blocks: [c] } })
    const r = await planCase('t1', D1, lm('10:00'), { push: { blocks: [{ block: planBlock(c), startMin: lm('11:00') }], planOf: (file) => file.blocks } })
    expect(r).toMatchObject({ saved: true, moved: 0 })
  })

  it('blok, którego plan dnia po zmianie nie ma (stary szablon), nie trafia do pliku', async () => {
    stub([newTask('t1', placeLogical(D1, 600), D1, { title: 'x' })!], { [D1]: null })
    const model = modelOf(D1, [block({ id: 'tpl', cat: 'inne', at: '10:30', min: 30 })])
    const r = await planCase('t1', D1, lm('10:15'), {
      push: { blocks: [{ block: planBlock({ id: 'gone-tpl', categoryId: 'inne', startMin: lm('10:30'), durationMin: 30, origin: 'template' }), startMin: lm('10:45') }], planOf: (file) => dayPlanOf(model, file) }
    })
    expect(r).toMatchObject({ saved: true, moved: 0 })
    expect(blocksAfter(r, D1).map((b) => b.id)).toEqual([r.block!.id])
  })
})
