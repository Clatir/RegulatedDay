// @vitest-environment jsdom
/**
 * The screens of steps (SNT5, D440, D401, D404): the list „Kroki” of the panel – Enter adds and stays in the field, a tick,
 * a title in place, a removal („Cofnij”), a drag and Alt+↑ / Alt+↓, the counter, the limits and their messages; the same list
 * of a template without boxes; the counter „✓ 3/4” on the tile of the axis and of the week; the panel's change of a block of
 * a series asking its scope (a tick never); a task's steps in the row of „Sprawy”; the search finding the steps.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi, SeriesResult, SeriesScope } from '@shared/api'
import { paths } from '@shared/data/paths'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { horizonDay } from '@shared/engine/week'
import { newSeries } from '@shared/engine/series'
import { planBlock, templateFrom, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { newTask, requestFrom } from '@shared/model/requests'
import type { SeriesBlock } from '@shared/model/series'
import { STEPS_FULL, STEPS_MAX, STEP_NO_TITLE, moveStepOp, type Step } from '@shared/model/steps'
import { logicalDayOf } from '@shared/time/day'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { Timeline } from '@renderer/features/plan/Timeline'
import { saveBlockSteps } from '@renderer/features/steps/blockSteps'
import { StepsEditor } from '@renderer/features/steps/StepsEditor'
import { dropMove, keyMove, refusedOp, stepsAnswer } from '@renderer/features/steps/stepsUi'
import { askScope } from '@renderer/features/series/scopeAsk'
import { seriesBlockOf } from '@renderer/features/series/seriesForm'
import { CasesPage } from '@renderer/features/cases/CasesPage'
import { textWithSteps } from '@shared/model/steps'
import { hitView, search } from '@shared/search'
import { PAGE_LABEL, pageKeys } from '@renderer/app/pages'
import { searchRecords } from '@renderer/features/search/records'
import { useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { closeToast, useUi } from '@renderer/store/ui'
import { block as dslBlock, Scenario } from '../unit/engine/dsl'

vi.mock('@renderer/features/series/scopeAsk', async (orig) => ({ ...(await orig<typeof import('@renderer/features/series/scopeAsk')>()), askScope: vi.fn() }))

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const four = (done: string[] = []): Step[] => ['Napisać testy', 'Przygotować logikę', 'Sprawdzić na Windowsie', 'Zrobić commit'].map((title, order) => ({ id: `s${order + 1}`, title, order, done: done.includes(`s${order + 1}`) }))
const plain = (steps: Step[]) => steps.map(({ done: _d, ...s }) => s)

describe('klawiatura i upuszczenie (czyste)', () => {
  it('Alt+↑ / Alt+↓ – jedno miejsce; na końcu listy nic', () => {
    const s = four()
    expect(keyMove(s, 's2', 'ArrowUp')).toEqual({ op: 'move', id: 's2', before: 's1' })
    expect(keyMove(s, 's2', 'ArrowDown')).toEqual({ op: 'move', id: 's2', before: 's4' })
    expect(keyMove(s, 's4', 'ArrowDown')).toBeNull()
    expect(keyMove(s, 's1', 'ArrowUp')).toBeNull()
    expect(keyMove(s, 'nie ma', 'ArrowUp')).toBeNull()
    expect(keyMove(s, 's1', 'Enter')).toBeNull()
  })

  it('upuszczenie przed i za krokiem; na tym samym miejscu – nic do zapisania', () => {
    const s = four()
    expect(dropMove(s, 's4', 's1', false)).toEqual(moveStepOp(s, 's4', 0))
    expect(dropMove(s, 's1', 's3', true)).toEqual({ op: 'move', id: 's1', before: 's4' })
    expect(dropMove(s, 's1', 's4', true)).toEqual({ op: 'move', id: 's1', before: null })
    expect(dropMove(s, 's2', 's1', true)).toBeNull()
    expect(dropMove(s, 's2', 's3', false)).toBeNull()
    expect(dropMove(s, 's2', 's2', false)).toBeNull()
  })

  it('odmowa przed wysłaniem: pusty tytuł i pełna lista – komunikaty modelu', () => {
    expect(refusedOp(four(), { op: 'add', id: 'x', title: '   ' })).toBe(STEP_NO_TITLE)
    const full = Array.from({ length: STEPS_MAX }, (_, i) => ({ id: `f${i}`, title: `k${i}`, order: i, done: false }))
    expect(refusedOp(full, { op: 'add', id: 'x', title: 'jeszcze jeden' })).toBe(STEPS_FULL)
    expect(refusedOp(four(), { op: 'add', id: 'x', title: 'ok' })).toBeNull()
  })
})

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.mocked(askScope).mockReset()
  for (const t of useUi.getState().toasts) closeToast(t.id)
})

const render = async (el: ReturnType<typeof createElement>) => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(el))
  return host
}
const setValue = (el: HTMLInputElement, v: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
const key = (el: Element, k: string, o: KeyboardEventInit = {}) => act(async () => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o })))
const q = (sel: string) => host!.querySelector<HTMLElement>(`[data-testid="${sel}"]`)!
const qa = (sel: string) => [...host!.querySelectorAll<HTMLElement>(`[data-testid="${sel}"]`)]
const titles = () => qa('step-title').map((x) => (x as HTMLInputElement).value)

describe('lista „Kroki” w panelu', () => {
  const editor = (o: Partial<Parameters<typeof StepsEditor>[0]> = {}) => {
    const onOp = vi.fn(async (..._a: unknown[]) => true as boolean | 'asked')
    const onTick = vi.fn()
    return { onOp, onTick, el: createElement(StepsEditor, { steps: [], ticks: true, onOp: onOp as never, onTick, ...o }) }
  }

  it('Enter dodaje i zostaje w polu na kolejny; pole czyści się od razu, ostatni krok – po koniec listy', async () => {
    const m = editor()
    await render(m.el)
    const add = q('step-add') as HTMLInputElement
    add.focus()
    setValue(add, 'Napisać testy')
    await key(add, 'Enter')
    expect(m.onOp).toHaveBeenCalledTimes(1)
    expect(m.onOp.mock.calls[0]![0]).toMatchObject({ op: 'add', title: 'Napisać testy', after: null })
    expect(add.value).toBe('')
    expect(document.activeElement).toBe(add)
    setValue(add, 'Przygotować logikę')
    await key(add, 'Enter')
    expect(m.onOp).toHaveBeenCalledTimes(2)
    expect(document.activeElement).toBe(add)
  })

  it('zapis nie doszedł do skutku – tekst wraca do pola; „zapytano” (konflikt) – pole puste', async () => {
    const m = editor()
    m.onOp.mockResolvedValueOnce(false).mockResolvedValueOnce('asked')
    await render(m.el)
    const add = q('step-add') as HTMLInputElement
    setValue(add, 'Jeden')
    await key(add, 'Enter')
    expect(add.value).toBe('Jeden')
    await key(add, 'Enter')
    expect(add.value).toBe('')
  })

  it('zapis odmówiony, a w międzyczasie wpisano coś innego – to zostaje, stary tytuł nie nadpisuje', async () => {
    let finish: (v: boolean) => void = () => undefined
    const m = editor()
    m.onOp.mockImplementationOnce(() => new Promise<boolean>((r) => (finish = r)))
    await render(m.el)
    const add = q('step-add') as HTMLInputElement
    setValue(add, 'Pierwszy')
    await key(add, 'Enter')
    expect(add.value).toBe('')
    setValue(add, 'Drugi')
    await act(async () => finish(false))
    expect(add.value).toBe('Drugi')
  })

  it('pusty tytuł: komunikat modelu pod polem i w toaście, nic nie wysłane', async () => {
    const m = editor()
    await render(m.el)
    const add = q('step-add') as HTMLInputElement
    setValue(add, '   ')
    await key(add, 'Enter')
    expect(m.onOp).not.toHaveBeenCalled()
    expect(q('step-add-error').textContent).toBe(STEP_NO_TITLE)
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual([])
    // The next key takes the message away.
    setValue(add, 'a')
    expect(host!.querySelector('[data-testid="step-add-error"]')).toBeNull()
  })

  it('30 kroków: trzydziesty pierwszy odmówiony z komunikatem, tekst zostaje w polu', async () => {
    const full = Array.from({ length: STEPS_MAX }, (_, i) => ({ id: `f${i}`, title: `krok ${i}`, order: i, done: false }))
    const m = editor({ steps: full })
    await render(m.el)
    const add = q('step-add') as HTMLInputElement
    setValue(add, 'jeszcze jeden')
    await key(add, 'Enter')
    expect(m.onOp).not.toHaveBeenCalled()
    expect(q('step-add-error').textContent).toBe(STEPS_FULL)
    expect(add.value).toBe('jeszcze jeden')
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual([STEPS_FULL])
  })

  it('ptaszek, licznik „✓ 1/4”; szablon (bez ptaszków) – ani pól, ani licznika', async () => {
    const m = editor({ steps: four(['s1']) })
    await render(m.el)
    expect(q('steps-counter').textContent).toBe('✓ 1/4')
    expect(qa('step-tick').map((x) => (x as HTMLInputElement).checked)).toEqual([true, false, false, false])
    await act(async () => qa('step-tick')[1]!.click())
    expect(m.onTick).toHaveBeenCalledWith('s2', true)
    expect(m.onOp).not.toHaveBeenCalled()
    act(() => root!.unmount())
    host!.remove()
    const t = editor({ steps: four(), ticks: false })
    await render(t.el)
    expect(qa('step-tick')).toHaveLength(0)
    expect(host!.querySelector('[data-testid="steps-counter"]')).toBeNull()
    expect(titles()).toEqual(['Napisać testy', 'Przygotować logikę', 'Sprawdzić na Windowsie', 'Zrobić commit'])
  })

  it('tytuł w miejscu: opuszczenie pola zmienia; pusty – odmowa i nic nie wysłane; usunięcie – op remove', async () => {
    const m = editor({ steps: four() })
    await render(m.el)
    const title = qa('step-title')[0] as HTMLInputElement
    title.focus()
    setValue(title, 'Napisać więcej testów')
    act(() => title.blur())
    expect(m.onOp).toHaveBeenCalledWith({ op: 'rename', id: 's1', title: 'Napisać więcej testów' })
    const second = qa('step-title')[1] as HTMLInputElement
    second.focus()
    setValue(second, '  ')
    act(() => second.blur())
    expect(m.onOp).toHaveBeenCalledTimes(1)
    await act(async () => qa('step-remove')[2]!.click())
    expect(m.onOp).toHaveBeenLastCalledWith({ op: 'remove', id: 's3' })
  })

  it('Alt+↑ / Alt+↓ na kroku przestawia; na końcu listy nic; bez Alt – nic', async () => {
    const m = editor({ steps: four() })
    await render(m.el)
    const second = qa('step-title')[1]!
    await key(second, 'ArrowUp', { altKey: true })
    expect(m.onOp).toHaveBeenLastCalledWith({ op: 'move', id: 's2', before: 's1' })
    await key(second, 'ArrowDown', { altKey: true })
    expect(m.onOp).toHaveBeenLastCalledWith({ op: 'move', id: 's2', before: 's4' })
    const calls = m.onOp.mock.calls.length
    await key(qa('step-title')[3]!, 'ArrowDown', { altKey: true })
    await key(second, 'ArrowUp')
    expect(m.onOp.mock.calls).toHaveLength(calls)
  })

  it('przeciągnięcie uchwytu na inny krok przestawia; upuszczenie na tym samym miejscu – nic', async () => {
    const m = editor({ steps: four() })
    await render(m.el)
    const rows = qa('step')
    const fire = (el: Element, type: string) => act(async () => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY: 0 })))
    await fire(qa('step-handle')[3]!, 'dragstart')
    await fire(rows[0]!, 'dragover')
    expect(rows[0]!.getAttribute('data-drop')).toBe('before')
    await fire(rows[0]!, 'drop')
    expect(m.onOp).toHaveBeenCalledWith({ op: 'move', id: 's4', before: 's1' })
    expect(rows[0]!.getAttribute('data-drop')).toBeNull()
    await fire(qa('step-handle')[0]!, 'dragstart')
    await fire(rows[0]!, 'dragover')
    await fire(rows[0]!, 'drop')
    expect(m.onOp).toHaveBeenCalledTimes(1)
  })

  it('tylko do odczytu (zakończona seria): bez pola dodawania, uchwytów i usuwania', async () => {
    const m = editor({ steps: four(), ticks: false, readOnly: true })
    await render(m.el)
    expect(host!.querySelector('[data-testid="step-add"]')).toBeNull()
    expect(qa('step-handle')).toHaveLength(0)
    expect(qa('step-remove')).toHaveLength(0)
    expect(titles()).toHaveLength(4)
  })
})

describe('odpowiedź na zmianę kroków', () => {
  it('zapisane usunięcie dostaje „Cofnij” w toaście; dodanie i przestawienie – nie; odmowa – false', () => {
    const saved = { saved: true, error: null, outcomes: [], undo: [{ rel: 'days/x.json', before: null, after: { a: 1 } }] }
    expect(stepsAnswer({ op: 'remove', id: 's1' }, saved)).toBe(true)
    expect(useUi.getState().toasts.map((t) => [t.text, t.action?.label])).toEqual([['Krok usunięty', 'Cofnij']])
    for (const t of useUi.getState().toasts) closeToast(t.id)
    expect(stepsAnswer({ op: 'add', id: 'n', title: 'x' }, saved)).toBe(true)
    expect(stepsAnswer({ op: 'move', id: 's1', before: null }, saved)).toBe(true)
    expect(useUi.getState().toasts).toEqual([])
    expect(stepsAnswer({ op: 'remove', id: 's1' }, { ...saved, saved: false, error: 'Nie.', undo: [] })).toBe(false)
    // Nothing saved and no reason of ours: the queue's answer decides – a conflict is a question, a failed send or a broken file a refusal.
    expect(stepsAnswer({ op: 'remove', id: 's1' }, { ...saved, saved: false, outcomes: [{ status: 'conflict' }], undo: [] })).toBe('asked')
    expect(stepsAnswer({ op: 'remove', id: 's1' }, { ...saved, saved: false, outcomes: null, undo: [] })).toBe(false)
    expect(stepsAnswer({ op: 'remove', id: 's1' }, { ...saved, saved: false, outcomes: [{ status: 'broken' }], undo: [] })).toBe(false)
  })
})

const DATE = logicalDayOf(Date.now())

/** The window over a day's file and a task; the edits and the series API's calls are collected. */
function stub(records: { requests?: RawRecord[]; templates?: RawRecord[] } = {}, days: Record<string, RawRecord | null> = {}) {
  const sent: EditEntry[][] = []
  const state = { requests: [...(records.requests ?? [])], templates: [...(records.templates ?? [])], days: { ...days } }
  const view = (): DataView => ({ status: 'open', rd: null, templates: state.templates, lectures: [], requests: state.requests, routines: [], series: [], seriesDays: {} }) as unknown as DataView
  const seriesChange = vi.fn(async (..._a: unknown[]): Promise<SeriesResult> => ({ ok: true, error: null, code: null, seriesId: 'ang', outcomes: [], undo: [] }))
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => d in state.days).map((d) => [d, state.days[d] ?? null])),
    edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view(),
    seriesChange: seriesChange as never,
    requestCounters: async () => ({ today: { count: 0, minutes: 0 }, week: { count: 0, minutes: 0 }, byPerson: {}, complete: true })
  }
  ;(globalThis as unknown as { window: { rd: unknown } }).window.rd = rd
  useData.setState({ view: view(), requests: state.requests.map((r) => requestFrom(r)!), templates: state.templates.map((t) => templateFrom(t)!) })
  return { sent, seriesChange }
}

describe('zmiana kroków bloku w panelu (zakres serii – D401, D404)', () => {
  const sblock: SeriesBlock = { categoryId: 'inne', variantId: null, startMin: 17 * 60, durationMin: 60, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: 'Angielski', routine: null, steps: four() }
  const series = newSeries('ang', sblock, '2026-11-01', { kind: 'daily' }, 'held', { until: null, count: null })
  const occ = (): PlanBlock => seriesBlockOf(series, DATE)
  const ctx = (extra: Partial<Parameters<typeof saveBlockSteps>[0]> = {}) => ({ date: DATE, today: DATE, raw: null, series: [series], names: { rd: rdFrom({}), settings: new Scenario({ date: DATE, plan: [] }).settings, routines: [], requests: [] }, patchDraft: vi.fn(), scope: { current: null as SeriesScope | null }, ...extra })
  const add = { op: 'add', id: 'nowy', title: 'Napisać changelog', after: null } as const

  beforeEach(() => {
    stub({}, { [DATE]: null })
  })

  it('blok serii: zmiana listy pyta o zakres; „Anuluj” – nic nie zapisane', async () => {
    const w = stub({}, { [DATE]: null })
    vi.mocked(askScope).mockResolvedValue(null)
    expect(occ().origin).toBe('series')
    expect(await saveBlockSteps(ctx(), occ(), add, false)).toBe(false)
    expect(askScope).toHaveBeenCalledTimes(1)
    expect(vi.mocked(askScope).mock.calls[0]![0]).toBe('change')
    expect(w.sent).toEqual([])
    expect(w.seriesChange).not.toHaveBeenCalled()
  })

  it('„Tylko to” – blok tego dnia w pliku dnia, seria nietknięta; „To i następne” / „Cała seria” – sama operacja do serii (`stepsOp`), nie lista z okna', async () => {
    const w = stub({}, { [DATE]: null })
    vi.mocked(askScope).mockResolvedValueOnce('only')
    expect(await saveBlockSteps(ctx(), occ(), add, false)).toBe(true)
    expect(w.sent).toHaveLength(1)
    expect(w.sent[0]![0]!.rel).toBe(paths.day(DATE))
    expect(w.seriesChange).not.toHaveBeenCalled()
    vi.mocked(askScope).mockResolvedValueOnce('following')
    const done = { ...occ(), steps: four(['s1']) }
    expect(await saveBlockSteps(ctx(), done, add, false)).toBe(true)
    expect(w.seriesChange).toHaveBeenCalledTimes(1)
    const [target, scope, patch] = w.seriesChange.mock.calls[0] as [unknown, string, unknown]
    expect(target).toEqual({ date: DATE, blockId: done.id })
    expect(scope).toBe('following')
    // The op, never a list copied from the window: each version of the series lays it on its own list.
    expect(patch).toEqual({ stepsOp: add })
  })

  it('zakres pytany raz na otwarty panel: trzy zmiany = jedno pytanie; nowy panel pyta znowu; „Anuluj” nic nie pamięta (T798)', async () => {
    const w = stub({}, { [DATE]: null })
    vi.mocked(askScope).mockResolvedValue('only')
    const opened = ctx()
    for (const id of ['n1', 'n2', 'n3']) expect(await saveBlockSteps(opened, occ(), { op: 'add', id, title: `krok ${id}`, after: null }, false)).toBe(true)
    expect(askScope).toHaveBeenCalledTimes(1)
    expect(opened.scope.current).toBe('only')
    expect(w.sent).toHaveLength(3)
    // The panel closed (the screen resets the memory): the next change asks again, and the scope picked then holds.
    vi.mocked(askScope).mockResolvedValue('following')
    const reopened = ctx()
    expect(await saveBlockSteps(reopened, occ(), add, false)).toBe(true)
    expect(await saveBlockSteps(reopened, occ(), { op: 'rename', id: 's1', title: 'Inny tytuł' }, false)).toBe(true)
    expect(askScope).toHaveBeenCalledTimes(2)
    expect(w.seriesChange).toHaveBeenCalledTimes(2)
    // „Anuluj” saves nothing and the next change asks again.
    vi.mocked(askScope).mockResolvedValue(null)
    const cancelled = ctx()
    expect(await saveBlockSteps(cancelled, occ(), add, false)).toBe(false)
    expect(cancelled.scope.current).toBeNull()
    vi.mocked(askScope).mockResolvedValue('all')
    expect(await saveBlockSteps(cancelled, occ(), add, false)).toBe(true)
    expect(askScope).toHaveBeenCalledTimes(4)
  })

  it('„Cofnij” w zakresie serii tylko po usunięciu kroku (D443); dodanie i przestawienie – bez toastu', async () => {
    const w = stub({}, { [DATE]: null })
    w.seriesChange.mockImplementation(async () => ({ ok: true, error: null, code: null, seriesId: 'ang', outcomes: [], undo: [{ rel: 'series/ang.json', before: null, after: { id: 'ang' } }] }))
    vi.mocked(askScope).mockResolvedValue('all')
    const o = ctx()
    expect(await saveBlockSteps(o, occ(), add, false)).toBe(true)
    expect(await saveBlockSteps(o, occ(), { op: 'move', id: 's1', before: null }, false)).toBe(true)
    expect(useUi.getState().toasts).toEqual([])
    expect(await saveBlockSteps(o, occ(), { op: 'remove', id: 's1' }, false)).toBe(true)
    expect(useUi.getState().toasts.map((t) => [t.text, t.action?.label])).toEqual([['Krok usunięty', 'Cofnij']])
  })

  it('zakres zapamiętany od razu po odpowiedzi (D443): drugie przestawienie bez czekania nie pyta; zapis, który padł, zakresu nie zmienia; „Anuluj” nic nie pamięta', async () => {
    const w = stub({}, { [DATE]: null })
    vi.mocked(askScope).mockResolvedValue('all')
    let finish: (r: SeriesResult) => void = () => undefined
    w.seriesChange.mockImplementationOnce(() => new Promise<SeriesResult>((r) => (finish = r)))
    const o = ctx()
    const move = (id: string) => saveBlockSteps(o, occ(), { op: 'move', id, before: null }, false)
    // Two moves without waiting for the first save: one question, both go with its answer.
    const first = move('s1')
    await vi.waitFor(() => expect(o.scope.current).toBe('all'))
    const second = move('s2')
    finish({ ok: false, error: 'Ta seria już się zakończyła.', code: 'ended', seriesId: 'ang', outcomes: [], undo: [] })
    expect(await first).toBe(false)
    expect(await second).toBe(true)
    expect(askScope).toHaveBeenCalledTimes(1)
    expect(w.seriesChange).toHaveBeenCalledTimes(2)
    // The save failed, the scope stays: the next change does not ask either.
    expect(await move('s3')).toBe(true)
    expect(askScope).toHaveBeenCalledTimes(1)
    // „Anuluj”: nothing is kept, the next change asks again.
    vi.mocked(askScope).mockResolvedValue(null)
    const cancelled = ctx()
    expect(await saveBlockSteps(cancelled, occ(), add, false)).toBe(false)
    expect(cancelled.scope.current).toBeNull()
    expect(askScope).toHaveBeenCalledTimes(2)
    vi.mocked(askScope).mockResolvedValue('only')
    expect(await saveBlockSteps(cancelled, occ(), add, false)).toBe(true)
    expect(askScope).toHaveBeenCalledTimes(3)
    expect(cancelled.scope.current).toBe('only')
  })

  it('odhaczenie nigdy nie pyta (to, co robi `tickBlockStep`); blok własny dnia – bez pytania o zakres', async () => {
    const w = stub({}, { [DATE]: null })
    const own = planBlock({ id: 'b1', categoryId: 'inne', startMin: 600, durationMin: 60, origin: 'user', steps: four() })
    expect(await saveBlockSteps(ctx(), own, add, false)).toBe(true)
    expect(askScope).not.toHaveBeenCalled()
    expect(w.sent).toHaveLength(1)
    const { tickBlockStep } = await import('@renderer/store/steps')
    expect((await tickBlockStep(DATE, occ(), 's1', true)).saved).toBe(true)
    expect(askScope).not.toHaveBeenCalled()
  })

  it('nowy blok przed „Dodaj”: lista w szkicu, nic nie zapisane, bez pytania; odmowa modelu – false', async () => {
    const w = stub({}, { [DATE]: null })
    const patchDraft = vi.fn()
    const draft = planBlock({ id: 'd', categoryId: 'inne', startMin: 600, durationMin: 60, origin: 'user', steps: four().slice(0, 1) })
    expect(await saveBlockSteps(ctx({ patchDraft }), draft, add, true)).toBe(true)
    expect(patchDraft).toHaveBeenCalledWith([expect.objectContaining({ id: 's1' }), expect.objectContaining({ id: 'nowy', title: 'Napisać changelog', done: false })])
    expect(await saveBlockSteps(ctx({ patchDraft }), draft, { op: 'add', id: 'x', title: ' ' }, true)).toBe(false)
    expect(patchDraft).toHaveBeenCalledTimes(1)
    expect(w.sent).toEqual([])
    expect(askScope).not.toHaveBeenCalled()
  })
})

describe('licznik „✓ 3/4” na kafelku', () => {
  it('oś dnia: kafelek bloku z krokami ma licznik z odhaczeniami dnia; bez kroków – nic', () => {
    const plan = [{ ...dslBlock({ id: 'a', cat: 'inne', at: '10:00', min: 60 }), steps: four(['s1', 's2', 's3']) }, dslBlock({ id: 'b', cat: 'inne', at: '12:00', min: 60 })]
    const s = new Scenario({ date: '2026-11-18', plan }).observe('07:00', null)
    const c = s.contextAt(s.at('08:00'))
    const state = computeDay(c)
    const model = { date: '2026-11-18', ctx: c, state, energy: computeEnergy(c, state) } as unknown as DayModel
    const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
    const items = dayAxis(model, names, s.at('08:00')).items
    expect(items.map((i) => [i.id, i.steps])).toEqual([
      ['a', '✓ 3/4'],
      ['b', undefined]
    ])
    const html = renderToStaticMarkup(createElement(Timeline, { items, markers: [], selected: null, onSelect: () => undefined, from: 6 * 60, to: 22 * 60 }))
    expect(html).toContain('data-testid="steps-counter"')
    expect(html).toContain('✓ 3/4')
    expect(html.match(/steps-counter/g)).toHaveLength(1)
  })

  it('tydzień: blok dnia niesie kroki z odhaczeniami, kafelek pokazuje licznik', async () => {
    const day = '2026-11-18'
    const plan = [{ ...dslBlock({ id: 'a', cat: 'inne', at: '10:00', min: 60 }), steps: four(['s1']) }, dslBlock({ id: 'b', cat: 'inne', at: '12:00', min: 60 })]
    const s = new Scenario({ date: day, plan })
    const d = horizonDay(s.contextAt(s.at('08:00')), 'future')
    const by = Object.fromEntries(d.blocks.map((b) => [b.id, b]))
    expect(by.a!.steps!.map((x) => x.done)).toEqual([true, false, false, false])
    expect('steps' in by.b!).toBe(false)
    const { BlockBox } = await import('@renderer/features/week/WeekPage')
    const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
    const html = (b: (typeof d.blocks)[number]) => renderToStaticMarkup(createElement(BlockBox, { block: b, lo: 6 * 60, lane: 0, lanes: 1, names, brightness: 100, date: day }))
    expect(html(by.a!)).toContain('✓ 1/4')
    expect(html(by.b!)).not.toContain('steps-counter')
  })
})

describe('Sprawy: kroki zadania w wierszu', () => {
  it('zadanie ma przycisk „Kroki” z licznikiem; rozwija listę z ptaszkami i dodawaniem; prośba – bez kroków', async () => {
    const task = { ...newTask('t1', Date.now(), DATE, { title: 'Wdrożenie' })!, steps: plain(four()), stepsDone: { s1: true } }
    const request = { schema: 1, id: 'r1', kind: 'request', person: null, estimateMin: 15, note: 'telefon', list: 'inbox', state: 'open', createdAt: Date.now() }
    const w = stub({ requests: [task, request] })
    useData.setState({ rd: rdFrom({}) })
    await render(createElement(CasesPage))
    const rows = qa('case-row')
    const taskRow = rows.find((r) => r.getAttribute('data-kind') === 'task')!
    const requestRow = rows.find((r) => r.getAttribute('data-kind') === 'request')
    expect(taskRow.querySelector('[data-testid="case-steps-toggle"]')!.textContent).toBe('Kroki ✓ 1/4')
    expect(taskRow.querySelector('[data-testid="case-steps"]')).toBeNull()
    expect(requestRow?.querySelector('[data-testid="case-steps-toggle"]') ?? null).toBeNull()
    await act(async () => taskRow.querySelector<HTMLElement>('[data-testid="case-steps-toggle"]')!.click())
    const list = taskRow.querySelector('[data-testid="case-steps"]')!
    expect([...list.querySelectorAll<HTMLInputElement>('[data-testid="step-tick"]')].map((x) => x.checked)).toEqual([true, false, false, false])
    await act(async () => list.querySelectorAll<HTMLElement>('[data-testid="step-tick"]')[1]!.click())
    expect(w.sent.at(-1)!.map((e) => e.rel)).toEqual([paths.record('request', 't1')])
    expect(w.sent.at(-1)![0]!.edits.map((f) => f.path.join('.'))).toContain('stepsDone.s2')
    const add = list.querySelector<HTMLInputElement>('[data-testid="step-add"]')!
    setValue(add, 'Napisać changelog')
    await key(add, 'Enter')
    expect(w.sent.at(-1)![0]!.rel).toBe(paths.record('request', 't1'))
    expect(JSON.stringify(w.sent.at(-1)![0]!.edits)).toContain('Napisać changelog')
  })

  it('Ctrl K: tytuł kroku znajduje blok dnia i zadanie; wynik pokazuje fragment z kroku (bez zmian w wyszukiwarce)', () => {
    expect(textWithSteps('notatka', four())).toBe('notatka\nNapisać testy · Przygotować logikę · Sprawdzić na Windowsie · Zrobić commit')
    expect(textWithSteps(undefined, [])).toBe('')
    const steps = [{ id: 'k1', title: 'Zadzwonić do ubezpieczyciela', order: 0, done: false }]
    const task = requestFrom({ ...newTask('t1', Date.now(), DATE, { title: 'Sprawy domowe' })!, steps: plain(steps) })!
    const rs = searchRecords({ today: DATE, rd: rdFrom({}), templates: [], requests: [task], routines: [], series: [], blocks: [{ date: DATE, id: 'b1', title: 'Wdrożenie', note: 'opis', steps }], pageLabel: PAGE_LABEL, pageKeys })
    const hits = search(rs, 'ubezpieczyciela', DATE).flatMap((g) => g.hits.map((h) => h.record))
    expect(hits.map((r) => [r.kind, r.title])).toEqual([
      ['block', 'Wdrożenie'],
      ['request', 'Sprawy domowe']
    ])
    expect(hitView(hits[0]!, ['ubezpieczyciela']).snippet!.text).toContain('Zadzwonić do ubezpieczyciela')
  })
})
