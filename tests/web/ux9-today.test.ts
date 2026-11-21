// @vitest-environment jsdom
/**
 * UX9 („Dziś” lżej: D3, D4, D7, D8, D10; D563 P10, P11): the panel of a new block says it is a draft („Nowy blok”, „Zapisze się, gdy
 * opuścisz panel · Esc – odrzuć”); the day's warnings stand only in the side panel and in the block's panel (never in the morning plan);
 * „Zatwierdź” sits in the morning plan's header; a routine's card ends with „Zakończ rutynę (3 z 5)”; the unit and the range of a cost
 * stand in the legend (under „?”) and in the small window of a tile; „Dzień w liczbach” explains its rows; „Tydzień” and the small
 * window of a new block say what the gestures do; the note's toolbar says what Esc does.
 */
import { readFileSync } from 'node:fs'
import { act, createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import { daysViewOf, weekDates, weekViewOf, type HorizonDay } from '@shared/engine/week'
import type { RoutineDue } from '@shared/engine/routineCheck'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { rdFrom } from '@shared/model/rd'
import { weekStart } from '@shared/time/day'
import { EnergyLegendHelp } from '@renderer/features/plan/EnergyLanes'
import { COST_SCALE_TEXT } from '@renderer/features/plan/energyDraw'
import { BlockEditor } from '@renderer/features/plan/BlockEditor'
import { Timeline, type TimelineItem } from '@renderer/features/plan/Timeline'
import { NoteEditor } from '@renderer/features/note/NoteEditor'
import { DayNumbers, DaySummary } from '@renderer/features/today/DayNumbers'
import { DayWarnings, dayWarningTexts } from '@renderer/features/today/DayWarnings'
import { Boundary, MorningHeader } from '@renderer/features/today/MorningPlan'
import { useBusy } from '@renderer/lib/busy'
import { RoutineCard, RoutinesWaiting } from '@renderer/features/today/RoutineCard'
import { NewBlockPopover } from '@renderer/features/week/NewBlockPopover'
import { WeekPage } from '@renderer/features/week/WeekPage'
import { installEscape } from '@renderer/lib/escape'
import { useCalendarFilter } from '@renderer/features/calendars/calendarFilter'
import { logEvents, useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { useDaysView, useWeekView } from '@renderer/store/horizon'
import { NO_MEMORY, useUi } from '@renderer/store/ui'
import { block as dslBlock, Scenario } from '../unit/engine/dsl'

vi.mock('@renderer/store/horizon', () => ({ useWeekView: vi.fn(), useDaysView: vi.fn(), useGoalsView: vi.fn(() => ({ view: null, failed: false })), useMonthView: vi.fn() }))
vi.mock('@renderer/store/data', async (orig) => ({ ...(await orig<typeof import('@renderer/store/data')>()), logEvents: vi.fn(async () => true) }))

const DATE = '2026-10-21'
const TODAY = '2026-11-18'
const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  Element.prototype.scrollIntoView ??= () => undefined
})
beforeEach(() => {
  ;(window as unknown as { rd: unknown }).rd = { pathForFile: (f: File) => `C:/${f.name}` }
  vi.mocked(logEvents).mockClear().mockResolvedValue(true)
  localStorage.clear()
  useData.setState({ view: { today: TODAY, allDay: [], computers: [] } as unknown as DataView, allDay: [] })
  useUi.setState({ page: 'week', day: null, pick: null, toasts: [], from: null, memory: NO_MEMORY })
  useCalendarFilter.setState({ hidden: [], revealed: null })
  const day = (date: string): HorizonDay =>
    ({ date, when: date < TODAY ? 'past' : date === TODAY ? 'today' : 'future', read: 'full', dayType: null, templateId: null, frozen: false, blocks: [], wakeMin: 7 * 60, bedtimeMin: null, boundary: null, extensionMin: 0, regen: null, studyMin: 0, sessions: { clean: 0, extended: 0, outsidePlan: 0 }, energy: null, budget: null }) as HorizonDay
  vi.mocked(useWeekView).mockImplementation((date) => {
    const week = weekStart(date)
    return { view: weekViewOf(week, TODAY, weekDates(week).map(day)), failed: false }
  })
  vi.mocked(useDaysView).mockImplementation((dates) => ({ view: daysViewOf(dates, TODAY, dates.map(day)), failed: false }))
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  document.body.innerHTML = ''
})

async function render(node: Parameters<Root['render']>[0]): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
}
const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))

/** A day with a work block that outruns the budget, the maximum and the minimum of regeneration (the engine warns). */
function overloaded() {
  const s = new Scenario({ date: DATE, plan: [dslBlock({ id: 'a', cat: 'analiza', at: '08:00', min: 13 * 60 }), dslBlock({ id: 'dz', cat: 'sesja', at: '21:30', min: 60, fixed: true })] })
  const state = s.state('07:00')
  return { s, state, model: { date: DATE, state, energy: { warnings: [] }, ctx: s.contextAt(s.at('07:00')), dayFile: null, data: { dayFile: null } } as unknown as DayModel }
}
/** A day with one work block: a proposal of the boundary, none approved. */
function proposed() {
  const s = new Scenario({ date: DATE, plan: [dslBlock({ id: 'a', cat: 'analiza', at: '08:00', min: 60 })] })
  const state = s.state('07:00')
  return { state, model: { date: DATE, state, ctx: s.contextAt(s.at('07:00')), dayFile: null, data: { dayFile: null } } as unknown as DayModel }
}

describe('panel nowego bloku (D4)', () => {
  const open = (block = dslBlock({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }), o: Partial<Parameters<typeof BlockEditor>[0]> = {}) =>
    render(createElement(BlockEditor, { block, plan: [], names, computers: [], onChange: () => undefined, onClose: () => undefined, ...o }))

  it('szkic nietknięty: nagłówek „Nowy blok” i linia o zapisie przy opuszczeniu panelu i o Esc', async () => {
    await open(undefined, { newBlock: { add: () => undefined, discards: true } })
    expect(q('block-editor')!.querySelector('h3')!.textContent).toBe('Nowy blok')
    expect(q('block-draft-hint')!.textContent).toBe('Zapisze się, gdy opuścisz panel · Esc – odrzuć')
  })

  it('szkic ruszony albo z rozpoczętym zapisem: Esc go nie odrzuci – linia mówi tylko o zapisie', async () => {
    await open(undefined, { newBlock: { add: () => undefined, discards: false } })
    expect(q('block-draft-hint')!.textContent).toBe('Zapisze się, gdy opuścisz panel')
  })

  it('zapisany blok: jego nazwa w nagłówku i bez linii o szkicu', async () => {
    await open()
    expect(q('block-editor')!.querySelector('h3')!.textContent).not.toBe('Nowy blok')
    expect(q('block-draft-hint')).toBeNull()
  })
})

describe('ostrzeżenia dnia (D3, P10)', () => {
  it('teksty z planu porannego (godzina maksimum, liczby budżetu, co zrobić) – zostają, jedna lista dla obu paneli', () => {
    const { model, state } = overloaded()
    expect(state.warnings.length).toBeGreaterThan(0)
    const texts = dayWarningTexts(model)
    expect(texts).toHaveLength(3)
    expect(texts.join(' | ')).toMatch(/Praca kończy się po maksimum \(\d\d?:\d\d\)\. Możesz przenieść blok/)
    expect(texts.join(' | ')).toMatch(/Plan przekracza budżet pracy \(.+ z .+\)/)
    expect(texts.join(' | ')).toContain('Minimum regeneracji nie mieści się przed porą snu')
  })

  it('ostrzeżenie energii (rezerwa) też – po tekstach dnia, z wielką literą', () => {
    const { model } = overloaded()
    const withEnergy = { ...model, energy: { warnings: ['prognoza energii na poziomie rezerwy'] } } as unknown as DayModel
    expect(dayWarningTexts(withEnergy).at(-1)).toBe('Prognoza energii na poziomie rezerwy')
    const calm = new Scenario({ date: DATE, plan: [dslBlock({ id: 'a', cat: 'analiza', at: '08:00', min: 60 })] })
    const quiet = { date: DATE, state: calm.state('07:00'), energy: { warnings: [] } } as unknown as DayModel
    expect(dayWarningTexts(quiet)).toEqual([])
    expect(dayWarningTexts({ ...quiet, energy: { warnings: ['prognoza energii na poziomie rezerwy'] } } as unknown as DayModel)).toEqual(['Prognoza energii na poziomie rezerwy'])
  })

  it('lista w komponencie; pusta – nic', async () => {
    await render(createElement(DayWarnings, { warnings: ['a', 'b'] }))
    expect([...q('day-warnings')!.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b'])
    act(() => root!.unmount())
    await render(createElement(DayWarnings, { warnings: [] }))
    expect(q('day-warnings')).toBeNull()
  })

  it('panel bloku pokazuje je pod nagłówkiem (przekroczenie budżetu widać od razu przy otwartym bloku)', async () => {
    const { model } = overloaded()
    await render(
      createElement(BlockEditor, { block: dslBlock({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }), plan: [], names, computers: [], onChange: () => undefined, onClose: () => undefined, dayNotes: createElement(DayWarnings, { warnings: dayWarningTexts(model) }) })
    )
    expect(q('block-editor')!.querySelector('[data-testid="day-warnings"]')).not.toBeNull()
    expect(q('day-warnings')!.textContent).toContain('Plan przekracza budżet pracy')
  })
})

describe('„Zatwierdź” w nagłówku planu porannego (D8)', () => {
  const header = (model: DayModel, o: { open?: boolean; plan?: boolean; onToggle?: () => void } = {}) => render(createElement(MorningHeader, { model, open: o.open ?? true, plan: o.plan ?? true, onToggle: o.onToggle ?? (() => undefined) }))

  it('propozycja granicy bez zatwierdzenia: przycisk w nagłówku zatwierdza plan jak „Zatwierdź” na dole', async () => {
    const { state, model } = proposed()
    expect(state.boundary.proposal).not.toBeNull()
    expect(state.boundary.approved).toBeNull()
    await header(model)
    expect(q('morning-approve')!.textContent).toBe('Zatwierdź')
    await act(async () => click(q('morning-approve')!))
    expect(logEvents).toHaveBeenCalledTimes(1)
    expect(logEvents).toHaveBeenCalledWith([expect.objectContaining({ k: 'boundary.approve', day: DATE, auto: false, plan: ['a'] })])
  })

  it('przycisk jest obok przycisku zwijania (nie w nim) – klik nie zwija karty', async () => {
    const { model } = proposed()
    const onToggle = vi.fn()
    await header(model, { onToggle })
    expect(q('morning-approve')!.closest('button:not([data-testid="morning-approve"])')).toBeNull()
    await act(async () => click(q('morning-approve')!))
    expect(onToggle).not.toHaveBeenCalled()
    await act(async () => click(q('morning-toggle')!))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('oba „Zatwierdź” (nagłówek i dół karty) mają wspólne „zajęte” – drugi klik w czasie zapisu nie zatwierdza drugi raz', async () => {
    const { model } = proposed()
    let finish: (v: boolean) => void = () => undefined
    vi.mocked(logEvents).mockImplementationOnce(() => new Promise<boolean>((r) => (finish = r)))
    const Both = () => {
      const busy = useBusy()
      return createElement(Fragment, null, createElement(MorningHeader, { model, open: true, plan: true, onToggle: () => undefined, busy }), createElement(Boundary, { model, lm: () => '08:00', approved: null, proposal: model.state.boundary.proposal, busy }))
    }
    await render(createElement(Both))
    expect((q('boundary-approve') as HTMLButtonElement).disabled).toBe(false)
    await act(async () => click(q('morning-approve')!))
    expect((q('morning-approve') as HTMLButtonElement).disabled).toBe(true)
    expect((q('boundary-approve') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => click(q('boundary-approve')!))
    expect(logEvents).toHaveBeenCalledTimes(1)
    await act(async () => finish(true))
  })

  it('bez przycisku: krok pytań (check-in, cele, Strona B), plan zatwierdzony, dzień bez propozycji', async () => {
    const { model } = proposed()
    await header(model, { plan: false })
    expect(q('morning-approve')).toBeNull()
    act(() => root!.unmount())
    const approved = new Scenario({ date: DATE, plan: [dslBlock({ id: 'a', cat: 'analiza', at: '08:00', min: 60 })] }).approve('09:30', '07:00')
    const st = approved.state('07:30')
    await header({ date: DATE, state: st, ctx: approved.contextAt(approved.at('07:30')), dayFile: null, data: { dayFile: null } } as unknown as DayModel)
    expect(q('morning-approve')).toBeNull()
    expect(q('morning-plan-head')!.textContent).toContain('zatwierdzony')
  })
})

describe('karta rutyny (D8)', () => {
  const step = (id: string, done: boolean) => ({ id, title: id, order: 0, done })
  const card = (done: boolean[]) => {
    const steps = done.map((d, i) => step(`k${i}`, d))
    const due = { block: 'rut', normal: steps, worse: [], version: 'normal', steps, ticked: steps.filter((s) => s.done).map((s) => s.id), from: 0, to: 0 } as unknown as RoutineDue
    const model = { date: DATE, data: { dayFile: null } } as unknown as DayModel
    return render(createElement(RoutineCard, { model, due, block: dslBlock({ id: 'rut', cat: 'rutyny', at: '07:00', min: 10 }), name: 'Poranna' }))
  }

  it('„Zakończ rutynę (2 z 3)” – wiadomo, że to zamyka rutynę i ile kroków', async () => {
    await card([true, true, false])
    expect(q('routine-card-save')!.textContent).toBe('Zakończ rutynę (2 z 3)')
    expect((q('routine-card-save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('nic nie odhaczone: „Zakończ rutynę (0 z 3)” wyłączone, „✓ Wszystkie” działa', async () => {
    await card([false, false, false])
    expect(q('routine-card-save')!.textContent).toBe('Zakończ rutynę (0 z 3)')
    expect((q('routine-card-save') as HTMLButtonElement).disabled).toBe(true)
    expect((q('routine-card-all') as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('rutyna w toku przy otwartym panelu bloku (D8, P10)', () => {
  const waiting = (due: Array<{ block: string }>, onShow = vi.fn()) => {
    const plan = due.map((d) => dslBlock({ id: d.block, cat: 'rutyny', at: '07:00', min: 10 }))
    const model = { date: DATE, ctx: { plan }, state: {}, dayFile: null } as unknown as DayModel
    return render(createElement(RoutinesWaiting, { due: due as unknown as RoutineDue[], model, names, onShow })).then(() => onShow)
  }

  it('jedna rutyna: „Rutyna „X” czeka na kroki” i przejście do karty (zamknięcie panelu)', async () => {
    const onShow = await waiting([{ block: 'rut' }])
    expect(q('routine-waiting')!.textContent).toContain('czeka na kroki')
    await act(async () => click(q('routine-waiting-show')!))
    expect(onShow).toHaveBeenCalledTimes(1)
  })

  it('kilka rutyn: liczba mnoga; żadna – nic', async () => {
    await waiting([{ block: 'a' }, { block: 'b' }])
    expect(q('routine-waiting')!.textContent).toContain('czekają na kroki')
    act(() => root!.unmount())
    await waiting([])
    expect(q('routine-waiting')).toBeNull()
  })
})

describe('legenda energii pod „?” (P10) i koszt (D7)', () => {
  it('zwinięta na starcie; „?” ją rozwija i zwija', async () => {
    await render(createElement(EnergyLegendHelp, { reserve: 30 }))
    expect(q('energy-legend')).toBeNull()
    const t = q('energy-legend-toggle')!
    expect(t.getAttribute('aria-expanded')).toBe('false')
    await act(async () => click(t))
    expect(q('energy-legend')).not.toBeNull()
    expect(t.getAttribute('aria-expanded')).toBe('true')
    await act(async () => click(t))
    expect(q('energy-legend')).toBeNull()
  })

  it('legenda mówi o koszcie: poziom na godzinę od −5 do 5, 1 = 3 punkty energii', async () => {
    await render(createElement(EnergyLegendHelp, { reserve: 30, open: true }))
    expect(q('energy-legend-cost')!.textContent).toContain('koszt na godzinę, od −5 do 5; 1 = 3 punkty energii')
  })

  const item = (cost: TimelineItem['cost']): TimelineItem => ({ id: 'a', startMin: 600, endMin: 660, title: 'Blok a', marks: [], color: '#F2B66D', categoryId: 'analiza', background: false, movable: true, cost })

  it('okienko kosztu na kafelku ma nagłówek z jednostką i zakresem', async () => {
    const c = { head: 3, emotions: 1, senses: 1, body: 0 }
    await render(createElement(Timeline, { items: [item({ costs: c, base: c, own: false, edit: true })], markers: [], selected: null, onSelect: vi.fn(), onCosts: vi.fn(), from: 6 * 60, to: 22 * 60 }))
    await act(async () => click(q('block-a-cost')!))
    // The same words as the legend's (one text).
    expect(q('cost-pop-head')!.textContent).toContain(COST_SCALE_TEXT)
    expect(COST_SCALE_TEXT).toBe('koszt na godzinę, od −5 do 5; 1 = 3 punkty energii')
  })
})

describe('„Dzień w liczbach” (D7)', () => {
  it('każdy wiersz ma podpowiedź (title) – maksimum, twardy koniec, granica, koniec pracy, pora snu', async () => {
    const { model } = overloaded()
    await render(createElement(DayNumbers, { model }))
    const rows = [...document.body.querySelectorAll('dt')]
    expect(rows.map((r) => r.textContent)).toEqual(['Granica', 'Maksimum', 'Koniec pracy (prognoza)', 'Twardy koniec projektów', 'Pora snu'])
    for (const r of rows) expect(r.getAttribute('title')!.length).toBeGreaterThan(20)
    expect(rows[1]!.getAttribute('title')).toContain('przekroczeni')
    expect(q('side-boundary')).not.toBeNull()
  })

  it('linia nad osią: ten sam tekst co dotąd, każda część z podpowiedzią (budżet, minimum, pula projektów)', async () => {
    const { model } = proposed()
    await render(createElement(DaySummary, { model }))
    const line = q('day-summary')!
    expect(line.textContent).toMatch(/^budżet pracy .+ z .+ · minimum regeneracji .+ · pula projektów .+$/)
    const parts = [...line.querySelectorAll<HTMLElement>('[title]')]
    expect(parts).toHaveLength(3)
    expect(parts[2]!.getAttribute('title')).toContain('limit projektów')
  })
})

describe('podpowiedzi gestów (D10)', () => {
  const mountWeek = async (mode: 'week' | '3days' | 'agenda') => {
    await render(createElement(WeekPage))
    await act(async () => click(q(`week-mode-${mode}`)!))
  }

  it('„Tydzień” i „3 dni”: linia o kliknięciu, przeciągnięciu i Ctrl; „Agenda” jej nie ma', async () => {
    await mountWeek('week')
    const text = q('week-hint')!.textContent!
    expect(text).toContain('Kliknij pustą godzinę')
    expect(text).toContain('przeciągnij blok')
    expect(text).toContain('Ctrl')
    await act(async () => click(q('week-mode-3days')!))
    expect(q('week-hint')).not.toBeNull()
    await act(async () => click(q('week-mode-agenda')!))
    expect(q('week-hint')).toBeNull()
  })

  it('okienko nowego bloku mówi, że zapisuje się samo, i że Esc odrzuca', async () => {
    await render(
      createElement(NewBlockPopover, { dates: [DATE], startMin: 9 * 60, durationMin: 60, today: TODAY, namesOf: () => names, place: { left: 0, top: 0 }, dragged: true, onClose: () => undefined, onDates: () => undefined, onMore: () => undefined })
    )
    expect(q('week-new-hint')!.textContent).toBe('Zapisze się po Enter w nazwie albo po kliknięciu poza okienkiem · Esc – odrzuć')
  })

  it('pasek narzędzi notatki mówi, co robi Esc (P11); notatka tylko do odczytu – bez napisu', async () => {
    await render(createElement(NoteEditor, { value: '', onCommit: () => undefined, olderComputers: [] }))
    expect(q('note-esc-hint')!.textContent).toBe('Esc – cofnij zmiany')
    // „Powiększ”: Esc only shrinks the note then (the unsaved text stays).
    await act(async () => click(q('note-expand')!))
    expect(q('note-esc-hint')!.textContent).toBe('Esc – pomniejsz')
    act(() => root!.unmount())
    await render(createElement(NoteEditor, { value: '', onCommit: () => undefined, olderComputers: [], readOnly: true }))
    expect(q('note-esc-hint')).toBeNull()
  })
})

describe('układ nad osią „Dziś” (P10) – w kodzie strony', () => {
  const page = readFileSync('src/renderer/features/today/TodayPage.tsx', 'utf8')
  const side = page.slice(page.indexOf('function SidePanel('))
  const day = page.slice(0, page.indexOf('function SidePanel('))

  it('karty rutyn stoją w panelu bocznym, nie nad osią', () => {
    expect(side).toContain('<RoutineCards')
    expect(day).not.toContain('<RoutineCards')
    // The panel of a block replaces the side panel: a routine waiting says so there and leads to its card.
    expect(day).toContain('<RoutinesWaiting')
  })

  it('ostrzeżenia dnia: panel boczny i panel bloku (jedna lista), nie plan poranny', () => {
    expect(side).toContain('<DayWarnings')
    expect(day).toContain('<DayWarnings')
    const morning = readFileSync('src/renderer/features/today/MorningPlan.tsx', 'utf8')
    expect(morning).not.toContain('morningWarnings(')
    expect(side).toContain('dayWarningTexts(model)')
    expect(day).toContain('dayWarningTexts(model)')
    expect(morning).not.toContain('warning-')
  })

  it('legenda energii tylko pod „?”', () => {
    expect(day).toContain('<EnergyLegendHelp')
    expect(day).not.toContain('<EnergyLegend ')
  })
})
