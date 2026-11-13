/**
 * Steps in the window (SNT5) – the cases of the second xhigh review without a DOM: „Przenieś” of a block keeps its ticks
 * (the path of the panel, `moveDayBlock`); a task whose block's day gone by cannot be read changes alone (only the days
 * from today are written – T769); a change sent and its result not known is a question for the field (`'asked'` – a second
 * Enter must not add the step twice), never a refusal.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { setStepDone } from '@shared/data/dayEdits'
import { paths } from '@shared/data/paths'
import { planBlock } from '@shared/model/plan'
import { newTask, requestFrom } from '@shared/model/requests'
import { addStepOp, type Step } from '@shared/model/steps'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { moveDayBlock } from '@renderer/features/today/dayActions'
import { stepsAnswer } from '@renderer/features/steps/stepsUi'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { changeTaskSteps, tickBlockStep } from '@renderer/store/steps'
import { DAY_UNREADABLE } from '@renderer/store/cases'

const four = (): Step[] => ['Napisać testy', 'Przygotować logikę', 'Sprawdzić na Windowsie', 'Zrobić commit'].map((title, order) => ({ id: `s${order + 1}`, title, order, done: false }))
const TODAY = logicalDayOf(Date.now())

const data = useData.getState()
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  useData.setState(data, true)
  useUi.setState({ toasts: [] })
})

function stub(o: { requests?: RawRecord[]; days?: Record<string, RawRecord | null>; edit?: RdApi['edit']; broken?: string[] } = {}) {
  const sent: EditEntry[][] = []
  const days = o.days ?? {}
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: o.requests ?? [], routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => d in days).map((d) => [d, days[d] ?? null])),
    caseDays: async (dates) => {
      const known = dates.filter((d) => d in days)
      return { files: Object.fromEntries(known.map((d) => [d, days[d] ?? null])), gone: {}, begun: {}, ...(o.broken ? { broken: dates.filter((d) => o.broken!.includes(d)) } : {}) }
    },
    edit: o.edit ?? (async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const })))),
    dataView: async () => view()
  }
  ;(globalThis as unknown as { window: { rd: Partial<RdApi> } }).window = { rd }
  useData.setState({ view: view(), requests: (o.requests ?? []).map((r) => requestFrom(r)!) })
  return { sent }
}

const leafs = (e: EditEntry) => e.edits.filter((x) => x.path[0] === 'stepsDone').map((x) => [x.path.join('.'), x.value])

describe('„Przenieś” z panelu zabiera odhaczenia (przegląd 2, T786)', () => {
  it('blok własny z pliku: dzień docelowy dostaje jego odhaczenia, źródłowy je traci', async () => {
    const tomorrow = addDays(TODAY, 1)
    const b = planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 60, steps: four() })
    const from = setStepDone({ schema: 1, date: TODAY, blocks: [{ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 60, origin: 'user', steps: four().map(({ done: _d, ...s }) => s) }] }, 'b1', 's2', true)
    const { sent } = stub({ days: { [TODAY]: from, [tomorrow]: null } })
    // The block as the plan of the panel has it (its ticks of the day), or as the file has it (none) – the same move.
    const shown = { ...b, steps: four().map((s) => ({ ...s, done: s.id === 's2' })) }
    await moveDayBlock(TODAY, from, [shown], shown, tomorrow, null)
    const [source, target] = sent[0]!
    expect(leafs(target!)).toEqual([['stepsDone.b1.s2', true]])
    expect(leafs(source!)).toEqual([['stepsDone.b1.s2', undefined]])
    sent.length = 0
    await moveDayBlock(TODAY, from, [b], b, tomorrow, null)
    expect(leafs(sent[0]![1]!)).toEqual([['stepsDone.b1.s2', true]])
  })
})

describe('zadanie: dzień bloku w łańcuchu nieczytelny – nie wiadomo, gdzie blok stoi (przegląd 3, T792)', () => {
  it('11-10 → 11-15, 11-10 nieczytelny: odmowa `DAY_UNREADABLE`, nic nie zapisane; dzień miniony czytelny, blok w nim – sam rekord', async () => {
    const past = addDays(TODAY, -3)
    const task = { ...newTask('t1', Date.now(), TODAY, { title: 'Wdrożenie' })!, day: past, block: 'tb', state: 'planned', steps: four().map(({ done: _d, ...s }) => s) }
    // The day gone by cannot be read now: its `movedTo` may send the block to today or later – nothing written.
    const a = stub({ requests: [task] })
    expect(await changeTaskSteps('t1', addStepOp('nowy'))).toMatchObject({ saved: false, error: DAY_UNREADABLE })
    expect(a.sent).toEqual([])
    // Read: the block stayed on the day gone by (never written) – the task's change alone.
    const blockRaw = { id: 'tb', categoryId: 'inne', startMin: 600, durationMin: 60, origin: 'user', task: 't1', steps: four().map(({ done: _d, ...s }) => s) }
    const b = stub({ requests: [task], days: { [past]: { schema: 1, date: past, blocks: [blockRaw] } } })
    const r = await changeTaskSteps('t1', addStepOp('nowy'))
    expect([r.saved, r.error]).toEqual([true, null])
    expect(b.sent[0]!.map((e) => e.rel)).toEqual([paths.record('request', 't1')])
    // Moved from it to today (read): the block there goes with the task.
    const c = stub({ requests: [task], days: { [past]: { schema: 1, date: past, blocks: [], movedTo: { tb: TODAY } }, [TODAY]: { schema: 1, date: TODAY, blocks: [blockRaw] } } })
    expect((await changeTaskSteps('t1', addStepOp('nowy'))).saved).toBe(true)
    expect(c.sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), paths.record('request', 't1')].sort())
  })
})

describe('dzień drogi bloku uszkodzony a chwilowo nieczytelny (przegląd 4, T792)', () => {
  const past = addDays(TODAY, -3)
  const task = () => ({ ...newTask('t1', Date.now(), TODAY, { title: 'Wdrożenie' })!, day: past, block: 'tb', state: 'planned', steps: four().map(({ done: _d, ...s }) => s) })
  it('dzień miniony uszkodzony – łańcuch kończy się na nim, zmiana zadania idzie sama', async () => {
    const { sent } = stub({ requests: [task()], broken: [past] })
    const r = await changeTaskSteps('t1', addStepOp('nowy'))
    expect([r.saved, r.error]).toEqual([true, null])
    expect(sent[0]!.map((e) => e.rel)).toEqual([paths.record('request', 't1')])
  })
  it('dzień miniony chwilowo nieczytelny – odmowa „spróbuj za chwilę”; uszkodzony dzień od dziś – też odmowa', async () => {
    const a = stub({ requests: [task()] })
    expect(await changeTaskSteps('t1', addStepOp('nowy'))).toMatchObject({ saved: false, error: DAY_UNREADABLE })
    expect(a.sent).toEqual([])
    const b = stub({ requests: [{ ...task(), day: TODAY }], broken: [TODAY] })
    expect(await changeTaskSteps('t1', addStepOp('nowy'))).toMatchObject({ saved: false, error: DAY_UNREADABLE })
    expect(b.sent).toEqual([])
  })
})

describe('wynik nieznany po wysłaniu – pytanie, nie odmowa (przegląd 2, kontrakt `SaveAnswer`)', () => {
  it('błąd po przyjęciu przez kolejkę: `sent.afterSend`, `stepsAnswer` daje `asked`; odmowa procesu głównego przed kolejką i przed wysłaniem – `false` (przegląd 4)', async () => {
    const block = planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 60, steps: four() })
    // The queue answered, what follows failed (an answer that breaks the notice): not known – a question.
    stub({ days: { [TODAY]: null }, edit: async () => undefined as never })
    const r = await tickBlockStep(TODAY, block, 's1', true)
    expect(r).toMatchObject({ saved: false, error: null, outcomes: null, sent: { afterSend: true } })
    expect(stepsAnswer({ op: 'rename', id: 's1', title: 'x' }, r)).toBe('asked')
    // The main process refused the edit before its queue: nothing written – a refusal.
    stub({ days: { [TODAY]: null }, edit: async () => Promise.reject(new Error('plik jest teraz nieczytelny')) })
    const before = await tickBlockStep(TODAY, block, 's1', true)
    expect(before.sent).toEqual({ afterSend: false })
    expect(stepsAnswer({ op: 'rename', id: 's1', title: 'x' }, before)).toBe(false)
    // Refused before anything was sent (no such step): a refusal.
    stub({ days: { [TODAY]: null } })
    const no = await tickBlockStep(TODAY, block, 'nie-ma', true)
    expect(no.sent).toEqual({ afterSend: false })
    expect(stepsAnswer({ op: 'rename', id: 'nie-ma', title: 'x' }, no)).toBe(false)
  })
})
