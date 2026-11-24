// @vitest-environment jsdom
/**
 * „Gorszy dzień” in the morning plan (D570, D587, N4): the button in the card's header always (also in the check-in's step, without the
 * setting); accepted – the mark with „Cofnij” instead (one taken back – the button again). The proposal „Gorszy dzień? · Przyjmij · ×” only
 * with the setting on and after a check-in worse (≤ 65) in two pools or more; „×” – not today (`asked`). „Przyjmij” writes one edit of the
 * day's file (the routine's version, the mark) and – with an approved boundary – its approval in the same turn of the window's writes;
 * says „Gorszy dzień: … · Cofnij” (an approval not written – that the boundary stays); „Cofnij” takes it back. The card's buttons share one
 * busy state; the boundary's card says how much earlier the proposal is.
 */
import { act, createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, DayData, EditEntry, EditOutcome, EventIn, RawRecord, RdApi } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { setAt } from '@shared/data/merge'
import type { Pool } from '@shared/model/categories'
import { RULES_VERSION, type Answer } from '@shared/model/events'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import type { Routine } from '@shared/model/routines'
import { worsePeriodsOf } from '@shared/model/worseDay'
import { Boundary, MorningHeader } from '@renderer/features/today/MorningPlan'
import { WorseDayProposal } from '@renderer/features/today/WorseDay'
import { useBusy } from '@renderer/lib/busy'
import { useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'
import { block, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-21'
const NONE: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }
const ROUTINES: Routine[] = [{ id: 'r', name: 'Poranna', normal: [{ id: 'woda', name: 'woda', min: 2 }, { id: 'kot', name: 'kot', min: 8 }], worse: [{ id: 'woda', name: 'woda', min: 2 }], archived: false }]
const PLAN: PlanBlock[] = [
  { ...block({ id: 'rut', cat: 'rutyny', at: '12:00', min: 20, origin: 'user' }), routine: 'r' },
  block({ id: 'a', cat: 'analiza', at: '09:30', min: 6 * 60, origin: 'user' })
]
// Without the sessions of the layer: the boundary is the work block's end + 15 min (15:45).
const FILE: RawRecord = { schema: 1, date: DATE, dayType: 'zwykly', sessions: { londyn: 'no', ny: 'no' }, blocks: Object.fromEntries(PLAN.map((b) => [b.id, blockJson(b)])) }
const MARK = { at: 1, earlierMin: 60, routines: {} }

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.useFakeTimers({ now: new Scenario({ date: DATE, plan: [] }).at('09:00'), toFake: ['Date'] })
  useData.setState({ rd: rdFrom({}), templates: [], lectures: [], seriesPlans: [], routines: ROUTINES })
  useUi.setState({ toasts: [] })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  vi.useRealTimers()
})

/**
 * The data folder as the window talks to it: the day's file (each edit applied to it), its log, the edits and the events sent, the order of
 * the calls; `log` – how the log answers; `hold` – the edit waits for it.
 */
function stub(o: { file?: RawRecord | null; events?: unknown[]; log?: () => Promise<void>; hold?: Promise<void>; status?: EditOutcome['status']; statuses?: Array<EditOutcome['status']>; dayData?: (n: number) => DayData | null } = {}) {
  const sent: EditEntry[][] = []
  const logged: EventIn[][] = []
  const order: string[] = []
  // `unreadable` – the day's file cannot be read now (the window's own version stands in for it).
  const state = { file: o.file === undefined ? FILE : o.file, unreadable: false }
  // The day's log: the events given, and those the window writes (with their ids, as the main process writes them).
  const events: unknown[] = [...(o.events ?? [])]
  const data = (): DayData => ({ date: DATE, dayFile: state.file, nextFile: null, prevFile: null, events, complete: true, unknown: false, away: false })
  let reads = 0
  const rd: Partial<RdApi> = {
    dayFiles: async (): Promise<Record<string, RawRecord | null>> => (state.unreadable ? {} : { [DATE]: state.file }),
    dayData: async () => {
      const d = o.dayData ? o.dayData(reads++) : data()
      if (!d) throw new Error('most nie odpowiada')
      return d
    },
    edit: async (entries): Promise<EditOutcome[]> => {
      await o.hold
      order.push('edit')
      sent.push(entries)
      const status = o.statuses?.[sent.length - 1] ?? o.status ?? 'applied'
      // A file that waits for the folder is not written yet (the queue lays it later).
      if (status === 'applied')
        for (const e of entries) {
          if (e.remove) state.file = null
          else for (const x of e.edits) state.file = setAt(e.create ? (state.file ?? {}) : state.file, x.path, x.value) as RawRecord
        }
      return entries.map(() => ({ status }))
    },
    // The ids of the events written, in order (as the main process answers).
    logEvents: async (list) => {
      order.push('log')
      await (o.log ?? (async () => undefined))()
      logged.push(list)
      const ids = list.map((_, i) => `pcw-${logged.length}-${i}`)
      list.forEach((e, i) => events.push({ ...e, id: ids[i], c: 'pcw', n: 1000 + events.length, t: Date.now(), l: Date.now(), v: RULES_VERSION, dom: 'timer', at: Date.now() }))
      return ids
    },
    dataView: async () => (order.push('view'), { today: DATE }) as DataView
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  return { sent, logged, state, order }
}

/** The day as the window counts it at 09:00: the setting „Proponuj…” (`propose`), the check-in's answers, the file (its mark in the context). */
function model(o: { propose?: boolean; checkin?: Partial<Record<Pool, [Answer, Answer]>> | null; file?: RawRecord; approved?: boolean } = {}): DayModel {
  const s = new Scenario({ date: DATE, plan: PLAN, settings: { worseDay: { propose: o.propose ?? true } } })
  if (o.checkin !== null) s.checkin('07:00', { ...NONE, ...(o.checkin ?? { head: [1, 1], senses: [2, 0] }) })
  if (o.approved) s.approve('15:45', '08:30')
  const raw = o.file ?? FILE
  const file = dayFileFrom(raw, DATE)
  const extra = file.worseDay ? { worseDays: worsePeriodsOf(file.worseDay) } : {}
  const ctx = s.contextAt(s.at('09:00'), extra)
  return { date: DATE, ctx, state: s.state('09:00', extra), dayFile: file, data: { dayFile: raw }, events: ctx.events } as unknown as DayModel
}

async function render(node: Parameters<Root['render']>[0]): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
}
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (id: string) => act(async () => void q(id)!.click())
const header = (m: DayModel, plan = true) => render(createElement(MorningHeader, { model: m, open: true, plan, onToggle: () => undefined }))
const lastToast = () => useUi.getState().toasts.at(-1)!

describe('przycisk „Gorszy dzień” w nagłówku planu porannego (D570: zawsze)', () => {
  it('jest bez ustawienia, bez check-inu i w kroku check-inu', async () => {
    stub()
    await header(model({ propose: false, checkin: null }), false)
    expect(q('worse-day')!.textContent).toBe('Gorszy dzień')
    expect(q('worse-day-mark')).toBeNull()
  })

  it('przyjęty dzień: zamiast niego znak „Gorszy dzień” z „Cofnij”; cofnięty – znów przycisk', async () => {
    stub()
    await header(model({ file: { ...FILE, worseDay: MARK } }))
    expect(q('worse-day')).toBeNull()
    expect(q('worse-day-mark')!.textContent).toBe('Gorszy dzieńCofnij')
    expect(q('worse-day-undo')).not.toBeNull()
    act(() => root!.unmount())
    host!.remove()
    await header(model({ file: { ...FILE, worseDay: { ...MARK, undoneAt: 2 } } }))
    expect(q('worse-day')).not.toBeNull()
    expect(q('worse-day-mark')).toBeNull()
  })

  it('klik: jedna edycja pliku dnia (wersja rutyny, znak), dymek „Gorszy dzień: … · Cofnij”; „Cofnij” przywraca rutynę, znak zostaje cofnięty, propozycja nie wraca', async () => {
    const { sent, state, logged } = stub()
    await header(model({ propose: false }))
    await click('worse-day')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toHaveLength(1)
    const after = dayFileFrom(state.file, DATE)
    expect(after.routineSteps?.rut?.version).toBe('worse')
    expect(after.worseDay).toMatchObject({ earlierMin: 60, routines: ['rut'], undoneAt: null })
    expect(logged).toEqual([])
    const t = lastToast()
    expect(t).toMatchObject({ text: 'Gorszy dzień: 1 rutyna na gorsze dni, granica 15:45 → 14:45', action: { label: 'Cofnij' } })
    await act(async () => t.action!.run())
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    const back = dayFileFrom(state.file, DATE)
    expect(back.routineSteps).toEqual({})
    // The instant of „Cofnij” (`vi.waitFor` moves the faked clock by its steps).
    expect(back.worseDay?.undoneAt).toBeGreaterThanOrEqual(new Scenario({ date: DATE, plan: [] }).at('09:00'))
    expect(back.worseDay?.undoneAt).toBeLessThanOrEqual(Date.now())
    expect(back.asked.worseDay).toBe('no')
    await vi.waitFor(() => expect(lastToast().text).toBe('Cofnięto gorszy dzień.'))
  })

  it('zatwierdzona granica – w tej samej turze co plik nowe zatwierdzenie w logu, wcześniej o 60 min', async () => {
    const s = new Scenario({ date: DATE, plan: PLAN }).approve('15:45', '08:30')
    const { logged, order, state, sent } = stub({ events: s.events })
    await header(model({ approved: true }))
    await click('worse-day')
    await vi.waitFor(() => expect(logged).toHaveLength(1))
    expect(logged[0]).toEqual([{ k: 'boundary.approve', day: DATE, boundary: s.at('14:45'), auto: false, plan: ['rut', 'a'] }])
    // The file, then the approval, then its id into the mark, then the view read again – one turn, nothing between them.
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(order.slice(0, 4)).toEqual(['edit', 'log', 'edit', 'view'])
    const mark = dayFileFrom(state.file, DATE).worseDay!
    expect(mark.approvalId).toBe('pcw-1-0')
    expect(mark.approvalBefore).toEqual({ to: s.at('15:45'), auto: false, id: s.events.at(-1)!.id })
    expect(lastToast().text).toBe('Gorszy dzień: 1 rutyna na gorsze dni, granica 15:45 → 14:45')
  })

  it('plik dnia czeka na folder (`waiting`) – zatwierdzenia nie pisze; dymek: granica bez zmian do zapisu planu', async () => {
    const s = new Scenario({ date: DATE, plan: PLAN }).approve('15:45', '08:30')
    const { logged } = stub({ events: s.events, status: 'waiting' })
    await header(model({ approved: true }))
    await click('worse-day')
    await vi.waitFor(() => expect(lastToast()?.text).toBe('Gorszy dzień: 1 rutyna na gorsze dni, granica 15:45 bez zmian – plan czeka na zapis, granicę zatwierdzisz ręcznie'))
    expect(logged).toEqual([])
  })

  it('„Cofnij” przy granicy zatwierdzonej samej po przyjęciu: granicy nie rusza, dymek ją nazywa', async () => {
    // Accepted at 08:00 (no work yet); the work block began 09:30 – the boundary approved itself then, from the earlier proposal (14:45).
    vi.setSystemTime(new Scenario({ date: DATE, plan: [] }).at('10:00'))
    const s = new Scenario({ date: DATE, plan: PLAN }).start('a', '09:30')
    const file = { ...FILE, worseDay: { at: s.at('08:00'), earlierMin: 60, routines: {} } }
    const { logged, sent } = stub({ file, events: s.events })
    await header(model({ file }))
    await click('worse-day-undo')
    await vi.waitFor(() => expect(lastToast()?.text).toBe('Cofnięto gorszy dzień – zostaje: granica 14:45 – zmienisz ją w karcie granicy.'))
    expect(sent).toHaveLength(1)
    expect(logged).toEqual([])
  })

  it('„Cofnij” z dymku po przyjęciu przy zatwierdzonej granicy: dostaje plik z id zatwierdzenia – granica wraca (także gdy plik nieczytelny)', async () => {
    const s = new Scenario({ date: DATE, plan: PLAN }).approve('15:45', '08:30')
    const st = stub({ events: s.events })
    await header(model({ approved: true }))
    await click('worse-day')
    await vi.waitFor(() => expect(st.sent).toHaveLength(2))
    // The file cannot be read now: „Cofnij” goes on the file as the window left it – with the approval's id.
    st.state.unreadable = true
    await act(async () => lastToast().action!.run())
    await vi.waitFor(() => expect(st.logged).toHaveLength(2))
    expect(st.logged[1]).toEqual([{ k: 'boundary.approve', day: DATE, boundary: s.at('15:45'), auto: false, plan: ['rut', 'a'] }])
  })

  it('id zatwierdzenia nie trafi do znaku (edycja odrzucona na dobre) – dymek przyjęcia mówi, że granicę cofniesz ręcznie', async () => {
    const s = new Scenario({ date: DATE, plan: PLAN }).approve('15:45', '08:30')
    stub({ events: s.events, statuses: ['applied', 'broken'] })
    await header(model({ approved: true }))
    await click('worse-day')
    await vi.waitFor(() => expect(lastToast()?.text).toBe('Gorszy dzień: 1 rutyna na gorsze dni, granica 15:45 → 14:45 – granicę cofniesz ręcznie w karcie granicy'))
  })

  it('edycja id czeka na folder (`waiting`) – bez noty; „Cofnij” z dymku dostaje plik z id', async () => {
    const s = new Scenario({ date: DATE, plan: PLAN }).approve('15:45', '08:30')
    const st = stub({ events: s.events, statuses: ['applied', 'waiting'] })
    await header(model({ approved: true }))
    await click('worse-day')
    await vi.waitFor(() => expect(lastToast()?.text).toBe('Gorszy dzień: 1 rutyna na gorsze dni, granica 15:45 → 14:45'))
    // The id waits in the queue (the stub has not written it): „Cofnij” on a file not readable now goes on the window's version – with the id.
    st.state.unreadable = true
    await act(async () => lastToast().action!.run())
    await vi.waitFor(() => expect(st.logged).toHaveLength(2))
    expect(st.logged[1]).toMatchObject([{ k: 'boundary.approve', boundary: s.at('15:45'), auto: false }])
  })

  it('„Cofnij”: dnia nie da się policzyć – odmowa, nic nie zapisane', async () => {
    vi.setSystemTime(new Scenario({ date: DATE, plan: [] }).at('10:00'))
    const s = new Scenario({ date: DATE, plan: PLAN }).start('a', '09:30')
    const file = { ...FILE, worseDay: { at: s.at('08:00'), earlierMin: 60, routines: {} } }
    const ok = (): DayData => ({ date: DATE, dayFile: file, nextFile: null, prevFile: null, events: s.events, complete: true, unknown: false, away: false })
    const never = stub({ file, events: s.events, dayData: () => ({ ...ok(), complete: false }) })
    await header(model({ file }))
    await click('worse-day-undo')
    await vi.waitFor(() => expect(lastToast()?.text).toBe('Dnia nie da się teraz policzyć – nic nie zapisano, spróbuj za chwilę.'))
    expect([never.sent, never.logged]).toEqual([[], []])
  })

  it('zatwierdzenie się nie zapisało – dymek mówi, że granica się nie przesunęła', async () => {
    const s = new Scenario({ date: DATE, plan: PLAN }).approve('15:45', '08:30')
    stub({ events: s.events, log: async () => Promise.reject(new Error('dziennik niedostępny')) })
    await header(model({ approved: true }))
    await click('worse-day')
    await vi.waitFor(() => expect(useUi.getState().toasts.some((t) => t.text === 'Gorszy dzień: 1 rutyna na gorsze dni, granica 15:45 bez zmian – nie zapisano zatwierdzenia')).toBe(true))
  })

  it('wspólne „busy” karty: w czasie przyjęcia „Zatwierdź” w nagłówku i „Przyjmij” są wyłączone', async () => {
    let release = () => undefined as void
    const hold = new Promise<void>((r) => (release = r))
    stub({ hold })
    const m = model()
    const Both = () => {
      const busy = useBusy()
      return createElement(Fragment, null, createElement(MorningHeader, { model: m, open: true, plan: true, onToggle: () => undefined, busy }), createElement(WorseDayProposal, { model: m, busy }))
    }
    await render(createElement(Both))
    expect((q('morning-approve') as HTMLButtonElement).disabled).toBe(false)
    await click('worse-day')
    expect((q('morning-approve') as HTMLButtonElement).disabled).toBe(true)
    expect((q('worse-day-accept') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => release())
    await vi.waitFor(() => expect((q('morning-approve') as HTMLButtonElement).disabled).toBe(false))
  })
})

describe('propozycja „Gorszy dzień?” po check-inie (D570: tylko z ustawieniem)', () => {
  it('ustawienie i ≥ 2 pule gorzej (≤ 65) – linia z pulami, „Przyjmij” i „×”', async () => {
    stub()
    await render(createElement(WorseDayProposal, { model: model() }))
    expect(q('worse-day-proposal-text')!.textContent).toContain('gorzej – głowa, bodźce')
    expect(q('worse-day-accept')!.textContent).toBe('Przyjmij')
    expect(q('worse-day-dismiss')!.textContent).toBe('×')
  })

  it('bez ustawienia (domyślnie wyłączone) – brak propozycji', async () => {
    stub()
    await render(createElement(WorseDayProposal, { model: model({ propose: false }) }))
    expect(q('worse-day-proposal')).toBeNull()
  })

  it('jedna pula gorzej, dwie po jednym „trochę” (85), bez check-inu, po „×” albo po przyjęciu – brak', async () => {
    stub()
    for (const m of [model({ checkin: { head: [2, 2] } }), model({ checkin: { head: [1, 0], senses: [0, 1] } }), model({ checkin: null }), model({ file: { ...FILE, asked: { worseDay: 'no' } } }), model({ file: { ...FILE, worseDay: MARK } })]) {
      await render(createElement(WorseDayProposal, { model: m }))
      expect(q('worse-day-proposal')).toBeNull()
      act(() => root!.unmount())
      host!.remove()
    }
    root = host = null
  })

  it('„×” – nie dziś: odpowiedź w pliku dnia (`asked.worseDay`), nic więcej', async () => {
    const { state } = stub()
    await render(createElement(WorseDayProposal, { model: model() }))
    await click('worse-day-dismiss')
    const file = dayFileFrom(state.file, DATE)
    expect(file.asked.worseDay).toBe('no')
    expect(file.worseDay).toBeUndefined()
    expect(file.routineSteps).toEqual({})
  })

  it('„Przyjmij” – to samo przyjęcie co przycisk w nagłówku', async () => {
    const { state } = stub()
    await render(createElement(WorseDayProposal, { model: model() }))
    await click('worse-day-accept')
    expect(dayFileFrom(state.file, DATE).worseDay).toMatchObject({ earlierMin: 60, routines: ['rut'] })
  })
})

describe('karta granicy w gorszy dzień', () => {
  const boundary = (m: DayModel) => render(createElement(Boundary, { model: m, lm: () => '14:45', approved: null, proposal: m.state.boundary.proposal }))

  it('dopisek mówi, o ile faktycznie wcześniej; bez przesunięcia (np. 0 min) – bez dopisku', async () => {
    stub()
    await boundary(model({ file: { ...FILE, worseDay: { ...MARK, at: new Scenario({ date: DATE, plan: [] }).at('08:00') } } }))
    expect(q('boundary-worse')!.textContent).toBe('; gorszy dzień – 1 h wcześniej')
    act(() => root!.unmount())
    host!.remove()
    await boundary(model({ file: { ...FILE, worseDay: { ...MARK, earlierMin: 0, at: new Scenario({ date: DATE, plan: [] }).at('08:00') } } }))
    expect(q('boundary-worse')).toBeNull()
  })
})
