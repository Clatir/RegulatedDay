/**
 * D367 in „Dziś” without a DOM: a block dragged by its body or its bottom edge, or a new one added, on a taken place –
 * the same count gives the preview while dragging and the edit of the drop; the change and the pushed starts go as one
 * edit of the day's file, and the main process is told of it for the bar's „Przesunięto N bloków · Cofnij”.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { computeDay } from '@shared/engine/day'
import { blockJson, putBlock } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import type { PlanBlock } from '@shared/model/plan'
import { pushDayBlocks, withPushed } from '@renderer/features/today/dayActions'
import { addChange, dragChange, pushedSpans, pushedStarts } from '@renderer/features/today/dayPush'
import { useData } from '@renderer/store/data'
import { block, lm, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-28'
const flex = (id: string, at: string, min: number): PlanBlock => block({ id, cat: 'inne', at, min, origin: 'user' })
const PLAN = [flex('a', '10:00', 60), flex('b', '11:00', 60), flex('c', '12:00', 60)]

function day(plan = PLAN) {
  const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
  const ctx = s.contextAt(s.at('08:00'))
  return { ctx, state: computeDay(ctx) }
}
const span = (from: string, to: string) => ({ startMin: lm(from), endMin: lm(to) })

describe('D367 – co zmienia przeciągnięcie albo „Dodaj” w „Dziś”', () => {
  it('przeciągnięcie bloku na zajęte miejsce: nowy start i przesunięte kolejne – podgląd to te same godziny, co zapis', () => {
    const d = day()
    const c = dragChange(d, 'a', span('10:30', '11:30'), null, span('10:00', '11:00'), true)!
    expect(c.patch).toEqual({ startMin: lm('10:30') })
    expect(c.pushed.map((p) => [p.id, p.startMin])).toEqual([
      ['b', lm('11:30')],
      ['c', lm('12:30')]
    ])
    expect(pushedSpans(c)).toEqual(
      new Map([
        ['b', span('11:30', '12:30')],
        ['c', span('12:30', '13:30')]
      ])
    )
    expect(pushedStarts(d.ctx.plan, c)).toEqual([
      { block: PLAN[1], startMin: lm('11:30') },
      { block: PLAN[2], startMin: lm('12:30') }
    ])
  })

  it('wydłużenie dolną krawędzią: długość jak pole „Długość”, kolejne przesunięte', () => {
    const d = day()
    const c = dragChange(d, 'a', span('10:00', '11:30'), 'end', span('10:00', '11:00'), true)!
    expect(c.patch).toEqual({ durationMin: 90 })
    expect(c.pushed.map((p) => [p.id, p.startMin])).toEqual([
      ['b', lm('11:30')],
      ['c', lm('12:30')]
    ])
  })

  it('dzień miniony (bez rozsuwania) i przeciągnięcie w wolne miejsce: nic nie przesuwa – zapis jak dotąd', () => {
    const d = day()
    expect(dragChange(d, 'a', span('10:30', '11:30'), null, span('10:00', '11:00'), false)!.pushed).toEqual([])
    expect(pushedSpans(dragChange(d, 'c', span('14:00', '15:00'), null, span('12:00', '13:00'), true))).toBeNull()
    expect(dragChange(d, 'brak', span('14:00', '15:00'), null, span('12:00', '13:00'), true)).toBeNull()
  })

  it('„Dodaj” nowego bloku o 10:00 przesuwa trzy kolejne', () => {
    const d = day()
    const x = flex('x', '10:00', 30)
    const c = addChange(d, x, true)
    expect(c).toMatchObject({ was: null, block: x, patch: x })
    expect(c.pushed.map((p) => [p.id, p.startMin])).toEqual([
      ['a', lm('10:30')],
      ['b', lm('11:30')],
      ['c', lm('12:30')]
    ])
  })
})

describe('D367 – zapis partii: jedna edycja pliku dnia i „Przesunięto N bloków” w pasku', () => {
  const file: RawRecord = { schema: 1, date: DATE, blocks: PLAN.map((b) => blockJson(b)) }
  // The window's data as before each test: a view set here never leaks into another file's tests.
  const data = useData.getState()
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
    useData.setState(data, true)
  })

  function stub(dayFile: RawRecord | null) {
    const sent: EditEntry[][] = []
    const pushed: Array<[string, number, EditEntry, RawRecord | null]> = []
    const rd: Partial<RdApi> = {
      dayFiles: async () => ({ [DATE]: dayFile }),
      edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
      dataView: async () => ({ today: DATE }) as DataView,
      planPushed: async (day, count, entry, made) => void pushed.push([day, count, entry, made])
    }
    ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
    useData.setState({ view: { today: DATE } as DataView })
    return { sent, pushed }
  }

  it('przeciągnięty blok i przesunięte w jednej edycji; ta sama edycja idzie do paska z liczbą bloków', async () => {
    const { sent, pushed } = stub(file)
    const d = day()
    const c = dragChange(d, 'a', span('10:30', '11:30'), null, span('10:00', '11:00'), true)!
    const out = await pushDayBlocks(DATE, file, (r) => putBlock(r, { ...PLAN[0]!, ...c.patch }), pushedStarts(d.ctx.plan, c))
    expect(out).toEqual([{ status: 'applied' }])
    expect(sent).toHaveLength(1)
    expect(sent[0]).toHaveLength(1)
    const entry = sent[0]![0]!
    expect(entry.rel).toBe(paths.day(DATE))
    expect(entry.edits.map((e) => [e.path.join('.'), e.base, e.value])).toEqual([
      ['blocks.#a.startMin', lm('10:00'), lm('10:30')],
      ['blocks.#b.startMin', lm('11:00'), lm('11:30')],
      ['blocks.#c.startMin', lm('12:00'), lm('12:30')]
    ])
    expect(pushed).toEqual([[DATE, 2, entry, null]])
  })

  it('dzień bez pliku: plik powstaje z tą partią – pasek dostaje go, żeby „Cofnij” mogło go zdjąć', async () => {
    const { sent, pushed } = stub(null)
    const x = flex('x', '10:00', 30)
    const raw = withPushed({ schema: 1, date: DATE }, DATE, (r) => putBlock(r, x), [])
    const out = await pushDayBlocks(DATE, null, (r) => putBlock(r, x), [{ block: PLAN[0]!, startMin: lm('10:30') }])
    expect(out).toEqual([{ status: 'applied' }])
    expect(sent[0]![0]!.create).toBe(true)
    expect(pushed).toHaveLength(1)
    expect(pushed[0]![1]).toBe(1)
    expect(pushed[0]![3]).toMatchObject({ ...raw, blocks: expect.arrayContaining([expect.objectContaining({ id: 'x' }), expect.objectContaining({ id: 'a', startMin: lm('10:30') })]) })
  })

  it('nic nie przesunięte: ta sama droga to jeden zapis zmiany, bez linii w pasku', async () => {
    const { sent, pushed } = stub(file)
    const out = await pushDayBlocks(DATE, file, (r) => putBlock(r, { ...PLAN[2]!, startMin: lm('14:00') }), [])
    expect(out).toEqual([{ status: 'applied' }])
    expect(sent.map((e) => e.map((x) => x.edits.map((y) => y.path.join('.'))))).toEqual([[['blocks.#c.startMin']]])
    expect(pushed).toEqual([])
  })

  it('zapis odrzucony (konflikt z innym komputerem): pasek nie dostaje „Cofnij”', async () => {
    const { pushed } = stub(file)
    ;(window.rd as Partial<RdApi>).edit = async (entries) => entries.map(() => ({ status: 'conflict' as const }))
    const d = day()
    const c = dragChange(d, 'a', span('10:30', '11:30'), null, span('10:00', '11:00'), true)!
    await pushDayBlocks(DATE, file, (r) => putBlock(r, { ...PLAN[0]!, ...c.patch }), pushedStarts(d.ctx.plan, c))
    expect(pushed).toEqual([])
  })
})
