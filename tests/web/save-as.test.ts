// @vitest-environment jsdom
/**
 * „Zapisz jako szablon / rutynę…” (N15, D615–D619) in the window: the two entries of „Zmień N bloków” (where the screen gives them – „Dziś”, „Tydzień”,
 * „3 dni”; off with the reason for blocks of several days), the day and blocks of a selection (`saveAsSource`), the window of a template (the day's
 * own template chosen, „Zastąp” first, „Od” tomorrow – the day after a later day saved; what goes, what is left out, „już w szablonie” for „Dołóż”,
 * the warning of a day that would take its blocks twice) and the window of a routine (the first block's name, the steps of the blocks' names and
 * planned lengths in the order of their start); „Zapisz” hands the choice to the write.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DayData } from '@shared/api'
import { blockJson } from '@shared/data/dayEdits'
import { templateBlockId } from '@shared/engine/createDay'
import { planBlock, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SESSIONS } from '@shared/model/settings'
import { placeLogical } from '@shared/time/day'
import type { MenuEntry } from '@renderer/components/ContextMenu'
import { saveAsSource, SAVE_AS_DAYS_WHY } from '@renderer/features/plan/BlockGroupMenu'
import { blockKey, blockMenu, type BlockMenuOn, type MenuBlock, type MenuCtx } from '@renderer/features/plan/groupMenu'
import { SaveAsRoutineDialog, SaveAsTemplateDialog } from '@renderer/features/plan/SaveAsDialogs'
import { saveAsRoutine, saveAsTemplate } from '@renderer/features/plan/saveAs'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { countDay } from '@renderer/store/day'

vi.mock('@renderer/features/plan/saveAs', async (orig) => ({
  ...(await orig<typeof import('@renderer/features/plan/saveAs')>()),
  saveAsTemplate: vi.fn(async () => ({ saved: true, added: 0, skipped: [], inTemplate: 0 })),
  saveAsRoutine: vi.fn(async () => true)
}))

// Far ahead of the real clock: a Monday, an ordinary day; the window's clock 06:00 of it.
const TODAY = '2099-01-05'
const AT = placeLogical(TODAY, 6 * 60)
const TPL = 'roboczy'
const NO_SESSIONS = Object.fromEntries(DEFAULT_SESSIONS.map((s) => [s.id, 'no']))
const template = (id: string, name: string, dayType: Template['dayType'] = 'zwykly'): Template => ({
  id,
  name,
  dayType,
  weekdays: [],
  archived: false,
  versions: [{ from: '2098-01-01', blocks: [planBlock({ id: 'old', categoryId: 'inne', startMin: 8 * 60, durationMin: 60, origin: 'template' })], budgetMin: null, maxMin: null }]
})
const TEMPLATES = [template(TPL, 'Roboczy'), template('wolny', 'Weekend', 'weekend')]

/** The day `date` counted as the window counts it: the template's block, two of yours, a series' occurrence. */
function modelOf(date: string) {
  const blocks = [
    planBlock({ id: 'a', categoryId: 'inne', startMin: 10 * 60, durationMin: 45, name: 'Raport' }),
    planBlock({ id: 'b', categoryId: 'inne', startMin: 9 * 60, durationMin: 300, name: 'Głęboka praca' }),
    planBlock({ id: 's', categoryId: 'inne', startMin: 12 * 60, durationMin: 30, origin: 'series', sourceId: 'root' })
  ]
  const data: DayData = { date, dayFile: { schema: 1, date, dayType: 'zwykly', sessions: NO_SESSIONS, blocks: blocks.map((b) => blockJson(b)) }, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false } as DayData
  return countDay(date, data, { changes: rdFrom({}).settings, templates: TEMPLATES, lectures: [], series: [], routines: [] }, AT, false)
}

let root: Root | null = null
let host: HTMLDivElement | null = null
let offEsc: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  offEsc?.()
  root = null
  host = null
  vi.mocked(saveAsTemplate).mockClear()
  vi.mocked(saveAsRoutine).mockClear()
})
async function mount(el: ReturnType<typeof createElement>) {
  offEsc = installEscape()
  useData.setState({ templates: TEMPLATES, routines: [], requests: [], series: [], rd: rdFrom({}), view: { today: TODAY } as never })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(el))
}
const q = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelector<T>(`[data-testid="${id}"]`)
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click())
const typeIn = (id: string, v: string) =>
  act(() => {
    const el = q<HTMLInputElement>(id)!
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.blur()
  })

describe('menu „Zmień N bloków”: „Zapisz jako…” (N15)', () => {
  const CTX: MenuCtx = { groups: [], variantsOf: () => [], kindOf: () => 'other', routines: [] }
  const blk = (id: string): MenuBlock => ({ id, categoryId: 'inne', variantId: null, routine: null, costs: null, state: 'open', movable: true })
  const ON: BlockMenuOn = { action: () => undefined, cost: () => undefined, moveTo: () => undefined }
  const item = (entries: readonly MenuEntry[], testId: string) => entries.find((e) => e.kind !== 'separator' && e.kind !== 'field' && e.testId === testId) as (Extract<MenuEntry, { label: string }> & { disabled?: string; onPick?: () => void }) | undefined

  it('pozycje tylko tam, gdzie ekran je daje; wybór otwiera okno swojego rodzaju', () => {
    expect(item(blockMenu([blk('a')], CTX, ON), 'block-menu-save-template')).toBeUndefined()
    const picked: string[] = []
    const entries = blockMenu([blk('a')], CTX, { ...ON, saveAs: { pick: (k) => void picked.push(k) } })
    expect([item(entries, 'block-menu-save-template')?.label, item(entries, 'block-menu-save-routine')?.label]).toEqual(['Zapisz jako szablon…', 'Zapisz jako rutynę…'])
    item(entries, 'block-menu-save-template')!.onPick!()
    item(entries, 'block-menu-save-routine')!.onPick!()
    expect(picked).toEqual(['template', 'routine'])
  })

  it('bloki kilku dni – obie wyłączone z powodem', () => {
    const entries = blockMenu([blk('a')], CTX, { ...ON, saveAs: { pick: () => undefined, why: SAVE_AS_DAYS_WHY } })
    expect(item(entries, 'block-menu-save-template')!.disabled).toBe(SAVE_AS_DAYS_WHY)
    expect(item(entries, 'block-menu-save-routine')!.onPick).toBeUndefined()
  })

  it('źródło: dzień „Dziś” i jego id; klucze „Tygodnia” jednego dnia – ten dzień; kilku dni – powód', () => {
    expect(saveAsSource('today', ['a', 'b'], { date: TODAY })).toEqual({ date: TODAY, ids: ['a', 'b'] })
    expect(saveAsSource('week', [blockKey(TODAY, 'a'), blockKey(TODAY, 'b')])).toEqual({ date: TODAY, ids: ['a', 'b'] })
    expect(saveAsSource('week', [blockKey(TODAY, 'a'), blockKey('2099-01-06', 'b')])).toEqual({ why: SAVE_AS_DAYS_WHY })
  })
})

describe('okno „Zapisz jako szablon” (D615–D617)', () => {
  it('cały dzień dziś: szablon dnia, „Zastąp”, od jutra; 3 bloki, seria pominięta; „Zapisz” przekazuje wybór', async () => {
    await mount(createElement(SaveAsTemplateDialog, { model: modelOf(TODAY), open: { kind: 'template', date: TODAY, ids: null }, today: TODAY, view: 'today', onClose: () => undefined }))
    expect(q<HTMLSelectElement>('save-template-which')!.value).toBe(TPL)
    expect(q('save-template-mode')!.querySelector('[aria-checked="true"]')!.textContent).toBe('Zastąp bloki szablonu')
    expect(q<HTMLInputElement>('save-template-from')!.value).toBe('06.01.2099')
    expect(q('save-template-going')!.textContent).toBe('Do szablonu „Roboczy” od 06.01: 3 bloki – zastąpią bloki szablonu (jego sesje zostają).')
    expect(q('save-template-skipped')!.textContent).toContain('Pominięto 1 blok (seria)')
    expect(q('save-template-twice')).toBeNull()
    await click(q('save-template-apply'))
    expect(saveAsTemplate).toHaveBeenCalledWith({ date: TODAY, ids: null, templateId: TPL, from: '2099-01-06', mode: 'replace', view: 'today' })
  })

  it('„Dołóż”: blok tego szablonu, który wersja ma – „już w szablonie”; inny szablon z listy', async () => {
    await mount(createElement(SaveAsTemplateDialog, { model: modelOf(TODAY), open: { kind: 'template', date: TODAY, ids: [templateBlockId(TODAY, TPL, 'old'), 'a'] }, today: TODAY, view: 'today', onClose: () => undefined }))
    await click(q('save-template-mode')!.querySelectorAll('[role="radio"]')[1]!)
    expect(q('save-template-going')!.textContent).toBe('Do szablonu „Roboczy” od 06.01: 1 blok – dojdą do bloków szablonu.')
    expect(q('save-template-in')!.textContent).toBe('1 blok już w szablonie – nie dojdą drugi raz.')
    await act(async () => {
      const el = q<HTMLSelectElement>('save-template-which')!
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, 'wolny')
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    // Another template: the day's block of „Roboczy” is a new block there.
    expect(q('save-template-in')).toBeNull()
    await click(q('save-template-apply'))
    expect(vi.mocked(saveAsTemplate).mock.calls[0]![0]).toMatchObject({ templateId: 'wolny', mode: 'add' })
  })

  it('dzień późniejszy: „Od” – dzień po nim; „Od” na niego albo wcześniej – ostrzeżenie o podwójnych blokach (nie blokada); przed jutrem – jutro', async () => {
    const later = '2099-01-07'
    await mount(createElement(SaveAsTemplateDialog, { model: modelOf(later), open: { kind: 'template', date: later, ids: null }, today: TODAY, view: 'week', onClose: () => undefined }))
    expect(q<HTMLInputElement>('save-template-from')!.value).toBe('08.01.2099')
    expect(q('save-template-twice')).toBeNull()
    await typeIn('save-template-from', '06.01.2099')
    expect(q('save-template-twice')!.textContent).toContain('Dzień 07.01.2099 też powstaje z tego szablonu')
    expect(q<HTMLButtonElement>('save-template-apply')!.disabled).toBe(false)
    await typeIn('save-template-from', '01.01.2099')
    expect(q<HTMLInputElement>('save-template-from')!.value).toBe('06.01.2099')
  })
})

describe('okno „Zapisz jako rutynę” (D618)', () => {
  it('nazwa pierwszego bloku, kroki w kolejności startu (blok ponad 4 h – 4 h), seria pominięta; „Zapisz” – rutyna z tymi krokami', async () => {
    await mount(createElement(SaveAsRoutineDialog, { model: modelOf(TODAY), open: { kind: 'routine', date: TODAY, ids: ['a', 'b', 's'] }, view: 'today', onClose: () => undefined }))
    expect(q<HTMLInputElement>('new-routine-name')!.value).toBe('Głęboka praca')
    expect(q('save-routine-skipped')!.textContent).toContain('Pominięto 1 blok (seria)')
    await click(q('new-thing-save'))
    expect(saveAsRoutine).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(saveAsRoutine).mock.calls[0]![0]
    expect([arg.name, arg.normal.map((s) => [s.name, s.min]), arg.worse, arg.view]).toEqual([
      'Głęboka praca',
      [
        ['Głęboka praca', 240],
        ['Raport', 45]
      ],
      [],
      'today'
    ])
  })
})
