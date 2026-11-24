// @vitest-environment jsdom
/**
 * „Długość z historii” w oknie (N6, D569, D625): under „Długość” of a block's panel and under the row of a sprawa („Szacunek”) –
 * „zwykle trwa 45 min · Przyjmij” with the median and its blocks in the title; „Przyjmij” saves as the field does; 4 blocks, a value
 * near the median, a panel that cannot change, a sprawa done and the switch off in „Ustawienia → Plan dnia” – no hint (the switch off
 * reads nothing). The switch and its thresholds stand in „Plan dnia” and save into the shared settings at once.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import type { DurationHistory } from '@shared/engine/durationHistory'
import { planBlock, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { newRequest, newTask, requestFrom } from '@shared/model/requests'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { logicalDayOf } from '@shared/time/day'
import { CasesPage } from '@renderer/features/cases/CasesPage'
import { BlockEditor } from '@renderer/features/plan/BlockEditor'
import { FieldsSection } from '@renderer/features/settings/SharedSettings'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { HISTORY_RETRY_MS, HISTORY_TRUST_MS, loadDurationHistory, resetDurationHistory, useDurationHistoryStore } from '@renderer/store/durationHistory'
import { fieldText, valueText } from '@renderer/lib/recordText'
import { addDays } from '@shared/time/zone'
import { closeToast, useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView ??= () => undefined
})
const data = useData.getState()
const TODAY = logicalDayOf(Date.now())
let root: Root | null = null
let host: HTMLElement | null = null
let offEscape: (() => void) | null = null
beforeEach(() => {
  localStorage.clear()
  offEscape = installEscape()
  resetDurationHistory()
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  offEscape?.()
  for (const t of useUi.getState().toasts) closeToast(t.id)
  useData.setState(data, true)
})

/** A history counted on `day` (its window ends the day before). */
const history = (byCategory: Record<string, number[]>, oneRequest: number[] = [], day = TODAY): DurationHistory => ({ from: addDays(day, -90), to: addDays(day, -1), days: 90, unreadable: 0, missing: 0, byCategory, oneRequest })
const FIVE = history({ analiza: [45, 45, 45, 45, 45] }, [30, 30, 30, 30, 30])
const FOUR = history({ analiza: [45, 45, 45, 45] }, [30, 30, 30, 30])

/** The window over a folder of records (the edits are laid as the folder would), with the history `h`. */
function stub(h: DurationHistory, o: { records?: RawRecord[]; general?: Record<string, unknown>; folder?: string } = {}) {
  const sent: EditEntry[][] = []
  const state = { records: [...(o.records ?? [])] }
  const rdRaw: RawRecord = { schema: 1, general: { ...o.general } }
  const view = (): DataView => ({ status: 'open', folder: o.folder ?? 'C:/dane', today: TODAY, rd: rdRaw, templates: [], lectures: [], requests: state.records, routines: [], series: [], seriesDays: {}, computers: [] }) as unknown as DataView
  const apply = (e: EditEntry) => {
    if (!e.rel.startsWith('requests/')) return
    const id = e.rel.slice('requests/'.length, -'.json'.length)
    const was = state.records.find((r) => r.id === id)
    state.records = state.records.filter((r) => r.id !== id)
    const next: RawRecord = { ...(was ?? { id }) }
    for (const ed of e.edits) next[ed.path[0]!] = ed.value
    state.records.push(next)
  }
  const durationHistory = vi.fn(async () => h)
  const rd: Partial<RdApi> = {
    durationHistory,
    pathForFile: (f: File) => `C:/${f.name}`,
    dayFiles: async () => ({}),
    caseDays: async () => ({ files: {}, gone: {}, begun: {} }),
    dayData: async (date) => ({ date, dayFile: null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }),
    edit: async (entries) => (sent.push(entries), entries.forEach(apply), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view(),
    requestCounters: async () => ({ today: { count: 0, minutes: 0 }, week: { count: 0, minutes: 0 }, byPerson: {}, complete: true })
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  useData.setState({ view: view(), rd: rdFrom(rdRaw), requests: state.records.map((r) => requestFrom(r)!) })
  const wrote = (rel: string, name: string): unknown =>
    sent
      .flat()
      .filter((e) => e.rel === rel)
      .flatMap((e) => e.edits)
      .filter((ed) => ed.path.at(-1) === name)
      .map((ed) => ed.value)
      .at(-1)
  return { durationHistory, sent, wrote }
}

const q = (id: string, el: ParentNode = document) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))
const mount = async (node: ReturnType<typeof createElement>) => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
  await settle()
}

const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
const analiza = (durationMin: number) => planBlock({ id: 'b1', categoryId: 'analiza', startMin: 9 * 60, durationMin, origin: 'user' })
const editor = (block: PlanBlock, onChange: (p: Partial<PlanBlock>) => void, readOnly = false) => createElement(BlockEditor, { block, plan: [], names, computers: [], onChange, onClose: () => undefined, readOnly })

describe('„Długość” bloku (N6)', () => {
  it('„Gotowe, gdy”: 5 bloków po 45 min przy planie 30 – „zwykle trwa 45 min · Przyjmij”; „Przyjmij” ustawia 45 jak pole, potem podpowiedź znika', async () => {
    stub(FIVE)
    const onChange = vi.fn()
    await mount(editor(analiza(30), onChange))
    const hint = q('duration-hint')!
    expect(hint.textContent).toBe('zwykle trwa 45 min · Przyjmij')
    expect(hint.getAttribute('title')).toBe('mediana z 5 bloków w 90 dniach')
    expect(q('duration-hint-accept')!.getAttribute('aria-label')).toBe('Przyjmij 45 min – mediana z 5 bloków w 90 dniach')
    await click(q('duration-hint-accept')!)
    expect(onChange).toHaveBeenCalledWith({ durationMin: 45 })
    await act(async () => root!.render(editor(analiza(45), onChange)))
    expect(q('duration-hint')).toBeNull()
  })

  it('4 bloki – bez podpowiedzi', async () => {
    stub(FOUR)
    await mount(editor(analiza(30), vi.fn()))
    expect(q('block-duration')).not.toBeNull()
    expect(q('duration-hint')).toBeNull()
  })

  it('wyłączone w Ustawieniach – bez podpowiedzi i bez odczytu historii', async () => {
    const s = stub(FIVE, { general: { durationHints: false } })
    await mount(editor(analiza(30), vi.fn()))
    expect(q('duration-hint')).toBeNull()
    expect(s.durationHistory).not.toHaveBeenCalled()
  })

  it('panel, który nie zmienia bloku (dzień miniony) – bez podpowiedzi', async () => {
    stub(FIVE)
    await mount(editor(analiza(30), vi.fn(), true))
    expect(q('duration-hint')).toBeNull()
  })

  it('jedna historia dla wielu paneli: drugi panel nie czyta jej od nowa', async () => {
    const s = stub(FIVE)
    await mount(editor(analiza(30), vi.fn()))
    act(() => root!.unmount())
    root = createRoot(host!)
    await act(async () => root!.render(editor(analiza(30), vi.fn())))
    await settle()
    expect(q('duration-hint')).not.toBeNull()
    expect(s.durationHistory).toHaveBeenCalledTimes(1)
  })
})

describe('„Szacunek” sprawy (N6)', () => {
  const task = (id: string, p: Record<string, unknown> = {}) => newTask(id, Date.now(), TODAY, { title: `zadanie ${id}`, estimateMin: 30, categoryId: 'analiza', ...p })!
  const row = (id: string) => document.querySelector<HTMLElement>(`[data-testid="case-row"][data-case="${id}"]`)!

  it('zadanie: 5 bloków jego podkategorii po 45 min przy szacunku 30 – podpowiedź pod wierszem, „Przyjmij” zapisuje szacunek 45', async () => {
    const s = stub(FIVE, { records: [task('a')] })
    await mount(createElement(CasesPage))
    const hint = q('case-estimate-hint', row('a'))!
    expect(hint.textContent).toBe('zwykle trwa 45 min · Przyjmij')
    expect(hint.getAttribute('title')).toBe('mediana z 5 bloków w 90 dniach')
    await click(q('duration-hint-accept', row('a'))!)
    await settle()
    expect(s.wrote('requests/a.json', 'estimateMin')).toBe(45)
  })

  it('4 bloki, szacunek już blisko mediany, sprawa zrobiona, wyłączone – bez podpowiedzi', async () => {
    stub(FOUR, { records: [task('a')] })
    await mount(createElement(CasesPage))
    expect(q('case-estimate-hint', row('a'))).toBeNull()
    act(() => root!.unmount())
    host!.remove()
    resetDurationHistory()
    // Beside one whose estimate is far from the median (the history is there): 45 is the median – none.
    stub(FIVE, { records: [task('b', { estimateMin: 45 }), task('d'), task('e', { list: 'done' })] })
    await mount(createElement(CasesPage))
    expect(q('case-estimate-hint', row('d'))).not.toBeNull()
    expect(q('case-estimate-hint', row('b'))).toBeNull()
    // Done – no hint.
    expect(row('e')).not.toBeNull()
    expect(q('case-estimate-hint', row('e'))).toBeNull()
    act(() => root!.unmount())
    host!.remove()
    resetDurationHistory()
    const off = stub(FIVE, { records: [task('c')], general: { durationHints: false } })
    await mount(createElement(CasesPage))
    expect(q('case-estimate-hint', row('c'))).toBeNull()
    expect(off.durationHistory).not.toHaveBeenCalled()
  })

  it('prośba – bloki próśb z jedną prośbą (szacunek 15 przy medianie 30)', async () => {
    const req = newRequest('r1', Date.now(), { person: null, note: 'zakupy', estimateMin: 15 })
    stub(FIVE, { records: [req] })
    await mount(createElement(CasesPage))
    expect(q('case-estimate-hint', row('r1'))!.textContent).toBe('zwykle trwa 30 min · Przyjmij')
  })
})

describe('Ustawienia → „Plan dnia” (N6, D569)', () => {
  it('przełącznik „Podpowiedzi długości z historii” (włączony) i progi: 5 bloków, 20 %, 10 min; wyłączenie zapisuje się od razu we wspólnych', async () => {
    const s = stub(FIVE)
    await mount(createElement(FieldsSection, { group: 'plan' }))
    expect(q('field-durationHints')!.textContent).toContain('Podpowiedzi długości z historii')
    const toggle = q('setting-durationHints')!
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(q('setting-durationHintBlocks')!.closest('[data-testid="field-durationHintBlocks"]')).not.toBeNull()
    expect((q('setting-durationHintBlocks') as HTMLInputElement).value).toBe('5')
    expect((q('setting-durationHintPct') as HTMLInputElement).value).toBe('20')
    expect((q('setting-durationHintMin') as HTMLInputElement).value).toBe('10 min')
    await click(toggle)
    await settle()
    expect(s.wrote('rd.json', 'durationHints')).toBe(false)
  })
})

describe('po przeglądzie (N6, T2912–T2915)', () => {
  const dayEditor = (day: string) => createElement(BlockEditor, { block: analiza(30), plan: [], names, computers: [], onChange: () => undefined, onClose: () => undefined, day })

  it('panel bloku dnia minionego bez `readOnly` – bez podpowiedzi; dzisiejszego – z nią', async () => {
    stub(FIVE)
    await mount(dayEditor(addDays(TODAY, -1)))
    expect(q('block-duration')).not.toBeNull()
    expect(q('duration-hint')).toBeNull()
    await act(async () => root!.render(dayEditor(TODAY)))
    await settle()
    expect(q('duration-hint')).not.toBeNull()
  })

  it('inny folder danych – historia czytana od nowa, wynik starego folderu się nie pokazuje', async () => {
    const s = stub(FIVE)
    await mount(editor(analiza(30), vi.fn()))
    expect(q('duration-hint')).not.toBeNull()
    let answer!: (h: DurationHistory) => void
    s.durationHistory.mockImplementation(() => new Promise<DurationHistory>((r) => (answer = r)))
    await act(async () => useData.setState({ view: { ...useData.getState().view!, folder: 'D:/inne' } }))
    await settle()
    expect(s.durationHistory).toHaveBeenCalledTimes(2)
    // Until the other folder's history comes, none (the old folder's blocks are not this one's).
    expect(q('duration-hint')).toBeNull()
    await act(async () => answer(FIVE))
    await settle()
    expect(q('duration-hint')).not.toBeNull()
  })

  it('odczyt w toku dla innego dnia nie jest dzielony; spóźniony wynik starego dnia nie nadpisuje nowego', async () => {
    const answers: Array<(h: DurationHistory) => void> = []
    const durationHistory = vi.fn(() => new Promise<DurationHistory>((r) => answers.push(r)))
    ;(window as unknown as { rd: Partial<RdApi> }).rd = { durationHistory }
    const first = loadDurationHistory('2026-11-24', 'C:/dane')
    const second = loadDurationHistory('2026-11-25', 'C:/dane')
    await settle()
    expect(durationHistory).toHaveBeenCalledTimes(2)
    const later = history({ analiza: [60, 60, 60, 60, 60] }, [], '2026-11-25')
    answers[1]!(later)
    await second
    answers[0]!(FIVE)
    await first
    expect(useDurationHistoryStore.getState()).toMatchObject({ day: '2026-11-25', history: later })
    // The same day while it is read – shared.
    const again = vi.fn(() => new Promise<DurationHistory>(() => undefined))
    ;(window as unknown as { rd: Partial<RdApi> }).rd = { durationHistory: again }
    resetDurationHistory()
    void loadDurationHistory('2026-11-26', 'C:/dane')
    void loadDurationHistory('2026-11-26', 'C:/dane')
    await settle()
    expect(again).toHaveBeenCalledTimes(1)
  })

  it('wynik z dniami nieczytelnymi – ważny krótko (ponowienie po minucie), pełny – 10 min', async () => {
    const partial = { ...FIVE, unreadable: 2 }
    const durationHistory = vi.fn(async () => partial)
    ;(window as unknown as { rd: Partial<RdApi> }).rd = { durationHistory }
    await loadDurationHistory(TODAY, 'C:/dane')
    await loadDurationHistory(TODAY, 'C:/dane', Date.now() + HISTORY_RETRY_MS + 1000)
    expect(durationHistory).toHaveBeenCalledTimes(2)
    resetDurationHistory()
    const full = vi.fn(async () => FIVE)
    ;(window as unknown as { rd: Partial<RdApi> }).rd = { durationHistory: full }
    await loadDurationHistory(TODAY, 'C:/dane')
    await loadDurationHistory(TODAY, 'C:/dane', Date.now() + HISTORY_RETRY_MS + 1000)
    expect(full).toHaveBeenCalledTimes(1)
    await loadDurationHistory(TODAY, 'C:/dane', Date.now() + HISTORY_TRUST_MS + 1000)
    expect(full).toHaveBeenCalledTimes(2)
  })

  it('prośba bez wpisanego szacunku – bez podpowiedzi (porównanie tylko z wartością wpisaną)', async () => {
    const empty = newRequest('r2', Date.now(), { person: null, note: 'bez szacunku', estimateMin: null })
    const typed = newRequest('r3', Date.now(), { person: null, note: 'z szacunkiem', estimateMin: 15 })
    stub(FIVE, { records: [empty, typed] })
    await mount(createElement(CasesPage))
    const row = (id: string) => document.querySelector<HTMLElement>(`[data-testid="case-row"][data-case="${id}"]`)!
    expect(q('case-estimate-hint', row('r3'))).not.toBeNull()
    expect(q('case-estimate-hint', row('r2'))).toBeNull()
  })

  it('nazwy w pytaniach i historii rd.json: przełącznik i progi po polsku', () => {
    const n = { rd: rdFrom({}) }
    expect(fieldText('rd.json', ['general', 'durationHints'], n)).toBe('Podpowiedzi długości z historii')
    expect(fieldText('rd.json', ['general', 'durationHintBlocks'], n)).toBe('Podpowiedź długości od bloków')
    expect(fieldText('rd.json', ['general', 'durationHintPct'], n)).toBe('Podpowiedź przy różnicy od')
    expect(fieldText('rd.json', ['general', 'durationHintMin'], n)).toBe('Podpowiedź przy różnicy co najmniej')
  })
})

describe('runda 2 przeglądu (N6)', () => {
  const row = (testId: string) => q(testId)

  it('timer ponawia odczyt, gdy minie ważność: wynik częściowy po minucie, pełny po 10 min', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      const partial = { ...FIVE, unreadable: 1 }
      const s = stub(partial)
      host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      await act(async () => root!.render(editor(analiza(30), vi.fn())))
      await act(async () => void (await vi.advanceTimersByTimeAsync(10)))
      expect(s.durationHistory).toHaveBeenCalledTimes(1)
      s.durationHistory.mockImplementation(async () => FIVE)
      await act(async () => void (await vi.advanceTimersByTimeAsync(HISTORY_RETRY_MS + 100)))
      expect(s.durationHistory).toHaveBeenCalledTimes(2)
      await act(async () => void (await vi.advanceTimersByTimeAsync(HISTORY_RETRY_MS + 100)))
      expect(s.durationHistory).toHaveBeenCalledTimes(2)
      await act(async () => void (await vi.advanceTimersByTimeAsync(HISTORY_TRUST_MS)))
      expect(s.durationHistory).toHaveBeenCalledTimes(3)
      expect(row('duration-hint')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('wynik z większą liczbą dni nieczytelnych nie zastępuje lepszego tego samego folderu i dnia', async () => {
    const durationHistory = vi.fn(async () => FIVE)
    ;(window as unknown as { rd: Partial<RdApi> }).rd = { durationHistory }
    await loadDurationHistory(TODAY, 'C:/dane')
    durationHistory.mockImplementation(async () => ({ ...FOUR, days: 87, unreadable: 3, missing: 3 }))
    await loadDurationHistory(TODAY, 'C:/dane', Date.now() + HISTORY_TRUST_MS + 1000)
    expect(durationHistory).toHaveBeenCalledTimes(2)
    const st = useDurationHistoryStore.getState()
    expect(st.history).toBe(FIVE)
    // Tried again soon.
    expect(st.tried!.until).toBeLessThanOrEqual(Date.now() + HISTORY_RETRY_MS)
  })

  it('odpowiedź policzona dla innego folderu nie jest zapisana', async () => {
    const durationHistory = vi.fn(async () => ({ ...FIVE, folder: 'D:/inne' }))
    ;(window as unknown as { rd: Partial<RdApi> }).rd = { durationHistory }
    await loadDurationHistory(TODAY, 'C:/dane')
    expect(useDurationHistoryStore.getState().history).toBeNull()
    durationHistory.mockImplementation(async () => ({ ...FIVE, folder: 'C:/dane' }))
    await loadDurationHistory(TODAY, 'C:/dane', Date.now() + HISTORY_RETRY_MS + 1000)
    expect(useDurationHistoryStore.getState().history).toMatchObject({ folder: 'C:/dane', byCategory: FIVE.byCategory })
  })

  it('bez podpowiedzi: blok zaczęty albo skończony (`begun`), bufor dekompresji, sesja, wykład, zajęcia zjazdu, sesja w szablonie', async () => {
    stub(FIVE)
    const shown = (b: PlanBlock, o: { begun?: boolean } = {}) => createElement(BlockEditor, { block: b, plan: [], names, computers: [], onChange: () => undefined, onClose: () => undefined, day: TODAY, ...o })
    await mount(shown(analiza(30)))
    expect(row('duration-hint')).not.toBeNull()
    await act(async () => root!.render(shown(analiza(30), { begun: true })))
    expect(row('duration-hint')).toBeNull()
    for (const origin of ['decompress', 'session', 'lecture', 'zjazd'] as const) {
      await act(async () => root!.render(shown({ ...analiza(30), origin })))
      expect(row('duration-hint'), origin).toBeNull()
    }
    await act(async () => root!.render(shown({ ...analiza(30), session: { zone: 'America/New_York', markets: [], days: ['yes', 'yes', 'yes', 'yes', 'yes', 'no', 'no'], id: 'ny' } } as unknown as PlanBlock)))
    expect(row('duration-hint')).toBeNull()
  })

  it('wartość progu w procentach z „%” w pytaniach i historii', () => {
    const n = { rd: rdFrom({}) }
    expect(valueText('durationHintPct', 20, n)).toBe('20 %')
    expect(valueText('durationHintBlocks', 5, n)).toBe('5')
    expect(valueText('durationHintMin', 10, n)).toBe('10 min')
  })
})

describe('runda 3 przeglądu (N6)', () => {
  const as = (h: DurationHistory) => vi.fn(async () => h)
  const use = (fn: () => Promise<DurationHistory>) => ((window as unknown as { rd: Partial<RdApi> }).rd = { durationHistory: fn })

  it('dni nieczytelne uzupełnione pamięcią (`missing` 0) – wynik przyjęty, choć `unreadable` większe (nowy blok wczoraj)', async () => {
    const first = as(FIVE)
    use(first)
    await loadDurationHistory(TODAY, 'C:/dane')
    const newer = { ...history({ analiza: [45, 45, 45, 45, 45, 60] }), days: 89, unreadable: 1, missing: 0 }
    use(as(newer))
    await loadDurationHistory(TODAY, 'C:/dane', Date.now() + HISTORY_TRUST_MS + 1000)
    expect(useDurationHistoryStore.getState().history).toBe(newer)
  })

  it('cofnięty zegar nie gasi odczytów: timer wymusza odczyt', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      const s = stub(FIVE)
      host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      await act(async () => root!.render(editor(analiza(30), vi.fn())))
      await act(async () => void (await vi.advanceTimersByTimeAsync(10)))
      expect(s.durationHistory).toHaveBeenCalledTimes(1)
      // The clock goes back an hour (the timers keep their own time).
      vi.setSystemTime(Date.now() - 3_600_000)
      await act(async () => void (await vi.advanceTimersByTimeAsync(HISTORY_TRUST_MS + 100)))
      expect(s.durationHistory).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('historia zatrzymana przy nieudanym odczycie zostaje ze swoim dniem; odczyt próbowany osobno', async () => {
    const yesterday = addDays(TODAY, -1)
    use(as(history({ analiza: [45, 45, 45, 45, 45] }, [], yesterday)))
    await loadDurationHistory(yesterday, 'C:/dane')
    use(async () => Promise.reject(new Error('folder zamknięty')))
    await loadDurationHistory(TODAY, 'C:/dane')
    const st = useDurationHistoryStore.getState()
    expect(st).toMatchObject({ day: yesterday, folder: 'C:/dane', tried: { folder: 'C:/dane', day: TODAY } })
    expect(st.history?.to).toBe(addDays(TODAY, -2))
  })

  it('odpowiedź policzona dla innego dnia (`to`) nie jest zapisana', async () => {
    use(as(history({ analiza: [45, 45, 45, 45, 45] }, [], addDays(TODAY, -1))))
    await loadDurationHistory(TODAY, 'C:/dane')
    expect(useDurationHistoryStore.getState().history).toBeNull()
    use(as(FIVE))
    await loadDurationHistory(TODAY, 'C:/dane', Date.now() + HISTORY_RETRY_MS + 1000)
    expect(useDurationHistoryStore.getState().history).toBe(FIVE)
  })

  it('wartości ustawień w pytaniach i historii: „1 dzień / 2 dni”, pole po pełnej ścieżce („3 /h”)', () => {
    const n = { rd: rdFrom({}) }
    expect(valueText('deadlineDays', 1, n)).toBe('1 dzień')
    expect(valueText('deadlineDays', 2, n, ['general', 'deadlineDays'])).toBe('2 dni')
    expect(valueText('minCost', 3, n, ['settings', '#zmiana', 'patch', 'decompress', 'minCost'])).toBe('3 /h')
    expect(valueText('durationHintPct', 20, n, ['general', 'durationHintPct'])).toBe('20 %')
    // Another record's field of the same last name: no unit.
    expect(valueText('minCost', 3, n, ['blocks', '#b1', 'minCost'])).toBe('3')
  })
})
