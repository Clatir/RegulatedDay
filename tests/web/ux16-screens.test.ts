// @vitest-environment jsdom
/**
 * UX16 (D565 P24): the screens of words and formats – „Skopiuj ten dzień do…” is the window of days of the templates (the fields „Od” and „Do”,
 * DD.MM.RRRR, „3.01”), the lists of „Szablony” and „Rutyny” say what a series and a routine are, a routine says where it is used, the shortcuts are
 * written „Ctrl+K”, „Zaplanuj…” of the page of „Sprawy” opens a form.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DataView, RawRecord } from '@shared/api'
import { WEEKDAY_SHORT } from '@shared/format'
import { planBlock, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { newTask, requestFrom } from '@shared/model/requests'
import type { Routine } from '@shared/model/routines'
import type { Series } from '@shared/model/series'
import { installEscape } from '@renderer/lib/escape'
import { CasesPage } from '@renderer/features/cases/CasesPage'
import { routineUses, usesText } from '@renderer/features/routines/routineUses'
import { RoutinesPage } from '@renderer/features/routines/RoutinesPage'
import { TemplatesPage } from '@renderer/features/templates/TemplatesPage'
import { MonthGrid } from '@renderer/features/calendar/MonthGrid'
import { CopyDayDialog } from '@renderer/features/today/MoveDialogs'
import { COMMANDS } from '@renderer/features/search/records'
import { SHORTCUTS } from '@renderer/lib/shortcuts'
import { THING_KINDS_HINT } from '@renderer/lib/thingKinds'
import { useData } from '@renderer/store/data'
import type { DayModel } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'

const copied = vi.hoisted(() => ({ calls: [] as string[][] }))
vi.mock('@renderer/features/today/dayActions', async (orig) => ({
  ...(await orig<typeof import('@renderer/features/today/dayActions')>()),
  copyDayTo: vi.fn(async (_source: unknown, targets: readonly string[]) => {
    copied.calls.push([...targets])
    return true
  })
}))

let root: Root | null = null
let host: HTMLElement | null = null
let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterAll(() => removeEscape?.())
const data = useData.getState()
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  copied.calls.length = 0
  useUi.setState({ toasts: [] })
  useData.setState(data, true)
})

const q = (id: string, el: ParentNode = document.body) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (el: Element | null) => act(async () => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
const type = (el: HTMLElement, v: string) =>
  act(async () => {
    const input = el as HTMLInputElement
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
async function mount(node: ReturnType<typeof createElement>) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(node))
}

describe('„Skopiuj ten dzień do…” = okno dni szablonu (F6)', () => {
  const SOURCE = '2026-11-26'
  const model = { date: SOURCE, ctx: { plan: [] }, dayFile: null } as unknown as DayModel

  it('ma pola Od i Do w DD.MM.RRRR; osiem cyfr staje się datą; dzień kopiowany nie liczy się do celów; za długi zakres jest nazwany', async () => {
    await mount(createElement(CopyDayDialog, { model, today: '2026-11-21', onClose: () => undefined }))
    const from = q('copy-dialog-from') as HTMLInputElement
    const to = q('copy-dialog-to') as HTMLInputElement
    expect(from).not.toBeNull()
    expect(to).not.toBeNull()
    expect(from.placeholder).toBe('DD.MM.RRRR')
    await type(from, '25112026')
    expect(from.value).toBe('25.11.2026')
    await type(to, '27.11.2026')
    // 25, 26 (the day copied from) and 27: two targets.
    expect(q('copy-apply')!.textContent).toBe('Skopiuj (2)')
    // „3.01” works as in every field of a date: the nearest 3 January from today – 25.11 to 3.01 is 40 days, 39 without the day copied from.
    await type(to, '3.01')
    expect(q('copy-apply')!.textContent).toBe('Skopiuj (39)')
    await type(to, '3.01.2028')
    expect(q('copy-dialog-count')!.textContent).toContain('Zakres dłuższy')
  })

  it('zakres wpisany w polach to cele kopii: „Skopiuj” wysyła dni bez dnia kopiowanego', async () => {
    await mount(createElement(CopyDayDialog, { model, today: '2026-11-21', onClose: () => undefined }))
    await type(q('copy-dialog-from')!, '25-11-2026')
    await type(q('copy-dialog-to')!, '27/11/2026')
    await click(q('copy-apply'))
    expect(copied.calls).toEqual([['2026-11-25', '2026-11-27']])
  })

  it('dzień, który już trwał wśród celów: ostrzeżenie czeka na „Kopiuj mimo to” (D330 bez zmian)', async () => {
    await mount(createElement(CopyDayDialog, { model, today: '2026-11-26', onClose: () => undefined }))
    await type(q('copy-dialog-from')!, '25.11.2026')
    await type(q('copy-dialog-to')!, '28.11.2026')
    await click(q('copy-apply'))
    expect(q('copy-warning')!.textContent).toContain('25.11.2026')
    expect(copied.calls).toEqual([])
    await click(q('copy-back'))
    expect(q('copy-warning')).toBeNull()
    await click(q('copy-apply'))
    await click(q('copy-ahead'))
    expect(copied.calls).toEqual([['2026-11-27', '2026-11-28']])
  })
})

describe('puste stany i opisy: szablon, seria, rutyna (F9)', () => {
  const tpl = (blocks: ReturnType<typeof planBlock>[]): Template => ({ id: 't1', name: 'Dzień pracy', dayType: 'zwykly', weekdays: [], versions: [{ from: '2026-01-01', blocks, budgetMin: null, maxMin: null }], archived: false })
  const routine: Routine = { id: 'r1', name: 'Poranna', normal: [{ id: 's1', name: 'Woda', min: 5 }], worse: [], archived: false }
  const series = (id: string, routineId: string | null): Series =>
    ({ id, root: id, start: '2026-01-01', until: null, count: null, archived: false, versions: [{ from: '2026-01-01', block: { categoryId: 'inne', variantId: null, startMin: 600, durationMin: 30, fixed: false, background: null, costs: null, bgCostPct: null, note: '', name: 'Spacer', routine: routineId, steps: [] }, rule: { kind: 'daily' }, special: 'ask' }] }) as unknown as Series
  const view = { today: '2026-11-18', computers: [] } as unknown as DataView

  it('„Szablony” bez serii: nagłówek „Serie” z podpowiedzią „Powtarzaj”, a bez szablonów – zdanie o szablonie, serii i rutynie', async () => {
    useData.setState({ templates: [], routines: [], series: [], seriesPlans: [], rd: rdFrom({}), view })
    await mount(createElement(TemplatesPage))
    expect(q('series-list')!.textContent).toContain('Serie')
    expect(q('series-empty')!.textContent).toContain('„Powtarzaj”')
    expect(document.body.textContent).toContain(THING_KINDS_HINT)
  })

  it('„Szablony” z serią: lista serii bez podpowiedzi pustego stanu', async () => {
    useData.setState({ templates: [tpl([])], routines: [], series: [series('s1', null)], seriesPlans: [{ series: series('s1', null), last: null }], rd: rdFrom({}), view })
    await mount(createElement(TemplatesPage))
    expect(q('series-empty')).toBeNull()
    expect(document.querySelectorAll('[data-testid="series-item"]').length).toBe(1)
  })

  it('„Rutyny” bez rutyn: to samo zdanie o szablonie, serii i rutynie', async () => {
    useData.setState({ routines: [], templates: [], series: [], rd: rdFrom({}), view })
    await mount(createElement(RoutinesPage))
    expect(document.body.textContent).toContain(THING_KINDS_HINT)
  })

  it('rutyna mówi, gdzie jest używana: szablony i serie z jej imieniem', async () => {
    const t = tpl([planBlock({ id: 'b', categoryId: 'rutyny', startMin: 420, durationMin: 30, origin: 'template', routine: 'r1' })])
    expect(routineUses('r1', [t], [series('s1', 'r1'), series('s2', null)], (s) => s.versions[0]!.block.name ?? '')).toEqual({ templates: ['Dzień pracy'], series: ['Spacer'] })
    expect(usesText({ templates: ['Dzień pracy'], series: ['Spacer'] })).toBe('Używana w szablonach: „Dzień pracy” · w seriach: „Spacer”')
    expect(usesText({ templates: [], series: [] })).toBe('Nie jest użyta w żadnym szablonie ani serii.')
    useData.setState({ routines: [routine], templates: [t], series: [series('s1', 'r1')], rd: rdFrom({}), view })
    ;(window as unknown as { rd: unknown }).rd = {}
    await mount(createElement(RoutinesPage))
    await click(q('routine-item'))
    expect(q('routine-used')!.textContent).toBe('Używana w szablonach: „Dzień pracy” · w seriach: „Spacer”')
  })
})

describe('skróty zapisywane „Ctrl+K” (F4)', () => {
  it('lista skrótów i podpowiedzi: klawisze łączy plus', () => {
    const joined = SHORTCUTS.map(([keys]) => keys).join(' | ')
    expect(joined).toContain('Ctrl+K')
    expect(joined).toContain('Ctrl+klik')
    expect(joined).toContain('Shift+klik')
    expect(joined).toContain('Win+Alt+N')
    expect(joined).not.toMatch(/(Ctrl|Shift|Alt|Win) (?!…)[^ ]/)
    for (const c of COMMANDS) if (c.hint) expect(c.hint).not.toMatch(/Ctrl [A-Z]/)
  })
})

describe('„Zaplanuj…” na stronie „Spraw” (F4)', () => {
  it('przycisk otwierający formularz ma wielokropek (w panelu „Zaplanuj” stawia od razu)', async () => {
    const record = newTask('t1', Date.now(), '2026-11-21', { title: 'Raport', list: 'week' })!
    const raw = [record] as unknown as RawRecord[]
    ;(window as unknown as { rd: unknown }).rd = {
      dayFiles: async () => ({}),
      caseDays: async () => ({ files: {}, gone: {}, begun: {} }),
      edit: async () => [],
      dataView: async () => ({}) as DataView,
      requestCounters: async () => ({ today: { count: 0, minutes: 0 }, week: { count: 0, minutes: 0 }, byPerson: {}, complete: true })
    }
    useData.setState({ view: { status: 'open', rd: null, templates: [], lectures: [], requests: raw, routines: [], series: [], seriesDays: {}, computers: [] } as unknown as DataView, rd: rdFrom({}), requests: raw.map((r) => requestFrom(r)!) })
    await mount(createElement(CasesPage))
    expect(q('case-plan-open')!.textContent).toBe('Zaplanuj…')
  })
})

describe('jeden zestaw skrótów dni tygodnia (F1)', () => {
  it('nagłówki siatki miesiąca to „pn wt śr cz pt sb nd”, jak w całej aplikacji', async () => {
    await mount(createElement(MonthGrid, { month: '2026-11', today: '2026-11-21', selected: new Set<string>(), onSelect: () => undefined, cell: () => ({ tone: null, marks: null }) }))
    const heads = [...document.querySelectorAll('[data-testid="month-grid"] > div:first-child > span')].map((s) => s.textContent)
    expect(heads).toEqual([...WEEKDAY_SHORT])
  })
})
