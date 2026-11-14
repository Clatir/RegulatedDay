// @vitest-environment jsdom
/**
 * D464, D461, D466 in the window: „Koniec” beside every start (panel of a block, the small „Nowy blok” of „Tydzień”, lectures,
 * „Postaw na osi”), the small window of „Tydzień” saved without „Dodaj”, the draft tile on the axis of „Dziś”.
 */
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { planBlock, type PlanBlock } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { BlockEditor } from '@renderer/features/plan/BlockEditor'
import { Timeline } from '@renderer/features/plan/Timeline'
import { draftTile } from '@renderer/features/today/blockDraft'
import { NewBlockPopover } from '@renderer/features/week/NewBlockPopover'
import { addWeekBlocks } from '@renderer/features/week/weekActions'
import { installEscape } from '@renderer/lib/escape'
import { closeToast, dropSavedDraft, patchBlockDraft, setBlockDraft, useUi } from '@renderer/store/ui'
import { nextFreeStart } from '@renderer/features/cases/casesUi'
import { newUserBlock } from '@shared/engine/planEdit'
import { block as specBlock, lm, Scenario } from '../unit/engine/dsl'

vi.mock('@renderer/features/week/weekActions', async (orig) => ({ ...(await orig<typeof import('@renderer/features/week/weekActions')>()), addWeekBlocks: vi.fn(async () => ({ saved: ['2026-11-18'], failed: [], pending: [], unknown: false, push: null })) }))

const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
const D = '2026-11-18'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  installEscape()
  Element.prototype.scrollIntoView ??= () => undefined
})
beforeEach(() => {
  ;(window as unknown as { rd: unknown }).rd = { pathForFile: (f: File) => `C:/${f.name}` }
})
let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  for (const t of useUi.getState().toasts) closeToast(t.id)
  vi.mocked(addWeekBlocks).mockClear()
})
const el = <T extends HTMLElement = HTMLInputElement>(testId: string) => host!.querySelector<T>(`[data-testid="${testId}"]`)!
/** Types `v` into the field and leaves it (the commit of the field). */
const typeLeave = (input: HTMLInputElement, v: string) =>
  act(() => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.blur()
  })
const editorProps = (block: PlanBlock, onChange: (p: Partial<PlanBlock>) => void, o: Partial<Parameters<typeof BlockEditor>[0]> = {}): Parameters<typeof BlockEditor>[0] => ({
  block,
  plan: [],
  names,
  computers: [],
  onChange,
  onClose: () => undefined,
  ...o
})
const mountEditor = async (block: PlanBlock, o: Partial<Parameters<typeof BlockEditor>[0]> = {}) => {
  const onChange = vi.fn((_p: Partial<PlanBlock>) => undefined)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(BlockEditor, editorProps(block, onChange, o))))
  return { onChange }
}
const analiza = planBlock({ id: 'b1', categoryId: 'analiza', startMin: 9 * 60, durationMin: 90, origin: 'user' })

describe('„Koniec” w panelu bloku (D464)', () => {
  it('pole stoi między początkiem a długością i pokazuje początek + długość', async () => {
    await mountEditor(analiza)
    expect(el('block-end').value).toBe('10:30')
    const order = [...host!.querySelectorAll('[data-testid="block-start"], [data-testid="block-end"], [data-testid="block-duration"]')].map((n) => n.getAttribute('data-testid'))
    expect(order).toEqual(['block-start', 'block-end', 'block-duration'])
    expect(host!.querySelector('[data-testid="block-end-day"]')).toBeNull()
  })

  it('wpisany koniec zmienia długość, początek zostaje; dłuższa długość przesuwa koniec', async () => {
    const { onChange } = await mountEditor(analiza)
    typeLeave(el('block-end'), '11:00')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ durationMin: 120 })
    act(() => root!.render(createElement(BlockEditor, editorProps({ ...analiza, durationMin: 120 }, onChange))))
    expect(el('block-end').value).toBe('11:00')
  })

  it('koniec nie później niż początek – następna doba z dopiskiem „+1 dzień”', async () => {
    const { onChange } = await mountEditor({ ...analiza, startMin: 22 * 60 })
    expect(host!.querySelector('[data-testid="block-end-day"]')).toBeNull()
    typeLeave(el('block-end'), '9:00')
    expect(onChange).toHaveBeenCalledWith({ durationMin: 11 * 60 })
    act(() => root!.render(createElement(BlockEditor, editorProps({ ...analiza, startMin: 22 * 60, durationMin: 180 }, onChange))))
    expect(el('block-end').value).toBe('01:00 +1')
    expect(el<HTMLElement>('block-end-day').textContent).toBe('+1 dzień')
  })

  it('koniec krótszy niż 5 min jest odrzucony z komunikatem pod polem', async () => {
    const { onChange } = await mountEditor(analiza)
    typeLeave(el('block-end'), '9:02')
    expect(onChange).not.toHaveBeenCalled()
    expect(el<HTMLElement>('block-end-error').textContent).toBe('Blok trwa najkrócej 5 min.')
  })

  it('blok „po bloku”: koniec to napis „ok. HH:MM” z prognozy (bez prognozy – kreska)', async () => {
    const after = planBlock({ id: 'b2', categoryId: 'analiza', anchor: 'b1', startMin: null, durationMin: 45, origin: 'user' })
    await mountEditor(after, { plan: [analiza], forecastEnd: 15 * 60 + 20 })
    expect(el<HTMLElement>('block-end-forecast').textContent).toBe('ok. 15:20')
    expect(host!.querySelector('[data-testid="block-end"]')).toBeNull()
    act(() => root!.unmount())
    host!.remove()
    await mountEditor(after, { plan: [analiza] })
    expect(el<HTMLElement>('block-end-forecast').textContent).toBe('—')
  })

  it('Esc zamyka panel przez `onEscape`, gdy jest podane (nowy blok się odrzuca); bez niego przez `onClose`', async () => {
    const onEscape = vi.fn()
    const onClose = vi.fn()
    await mountEditor(analiza, { onEscape, onClose })
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(onEscape).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    act(() => root!.unmount())
    host!.remove()
    const plain = vi.fn()
    await mountEditor(analiza, { onClose: plain })
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(plain).toHaveBeenCalledTimes(1)
  })
})

describe('pole nowego bloku zatwierdzone tą samą wartością zapisuje szkic (D461)', () => {
  // The day of E3 at any hour: a work block at 03:00 of the night after. „+ Blok” puts the draft in the nearest free place from
  // the next quarter – from about 02:00 to 03:00 right after that block, at 03:30 +1: the start typed („3:30”) is the one the
  // field shows already. Committed, it is still the first committed field – the draft saves (the exchange asks), at night as by day.
  const day = new Scenario({ date: '2026-11-13', plan: [specBlock({ id: 'late', cat: 'inne', at: '03:00', min: 30, origin: 'user' })] })
  /** Types `v` into the field and presses Enter. */
  const typeEnter = (input: HTMLInputElement, v: string) =>
    act(() => {
      input.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
  const draftAt = (now: string) => newUserBlock('inne', nextFreeStart(day.state(now), { isToday: true, nowMin: lm(now), wakeMin: day.snapshot.wakeMin }), 60, DEFAULT_SETTINGS.categories.inne)

  it.each([
    ['02:19', '03:30'],
    ['14:10', '14:15']
  ])('„+ Blok” o %s (szkic na %s), Początek 3:30 Enter – szkic zapisuje się z tym początkiem', async (now, shown) => {
    const draft = draftAt(now)
    expect(draft.startMin).toBe(lm(shown))
    const { onChange } = await mountEditor(draft, { newBlock: { add: () => undefined } })
    typeEnter(el('block-start'), '3:30')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ startMin: lm('03:30') })
  })

  it('Koniec i Długość wpisane takie, jakie są, też zapisują szkic; w istniejącym bloku ta sama wartość nic nie zmienia', async () => {
    const draft = draftAt('02:19')
    const { onChange } = await mountEditor(draft, { newBlock: { add: () => undefined } })
    typeEnter(el('block-end'), '4:30')
    typeLeave(el('block-duration'), '60')
    expect(onChange.mock.calls).toEqual([[{ durationMin: 60 }], [{ durationMin: 60 }]])
    act(() => root!.unmount())
    host!.remove()
    const saved = await mountEditor(analiza)
    typeEnter(el('block-start'), '9:00')
    typeLeave(el('block-end'), '10:30')
    typeLeave(el('block-duration'), '90')
    expect(saved.onChange).not.toHaveBeenCalled()
  })
})

describe('szkic na osi „Dziś” (D466)', () => {
  const draftBlock = planBlock({ id: 'd1', categoryId: 'inne', startMin: 9 * 60, durationMin: 60, origin: 'user', name: 'Analiza rynku' })
  const axis = (draft: ReturnType<typeof draftTile>) => {
    const div = document.createElement('div')
    div.innerHTML = renderToStaticMarkup(createElement(Timeline, { items: [], markers: [], selected: null, onSelect: () => undefined, draft, from: 6 * 60, to: 22 * 60 }))
    return div
  }

  it('kafelek z przerywaną ramką i godzinami, nazwą i kategorią; bez szkicu – brak kafelka', () => {
    const tile = axis(draftTile(draftBlock, names)).querySelector<HTMLElement>('[data-testid="draft-tile"]')!
    expect(tile.className).toContain('border-dashed')
    expect(tile.dataset.start).toBe(String(9 * 60))
    expect(tile.dataset.end).toBe(String(10 * 60))
    expect(tile.querySelector('[data-testid="draft-tile-hours"]')!.textContent).toBe('09:00–10:00 · Inne obowiązki')
    expect(tile.textContent).toContain('Analiza rynku')
    expect(axis(null).querySelector('[data-testid="draft-tile"]')).toBeNull()
  })

  it('kafelek idzie za początkiem i długością szkicu; blok bez własnej godziny (po bloku) go nie ma', () => {
    const longer = draftTile({ ...draftBlock, startMin: 10 * 60, durationMin: 90 }, names)!
    expect([longer.startMin, longer.endMin]).toEqual([10 * 60, 11 * 60 + 30])
    expect(draftTile({ ...draftBlock, startMin: null, anchor: 'x' }, names)).toBeNull()
    expect(draftTile(null, names)).toBeNull()
  })

  it('oś rozszerza się o szkic poza zwykłym zakresem', () => {
    const night = axis(draftTile({ ...draftBlock, startMin: 23 * 60, durationMin: 120 }, names))
    expect(night.querySelector('[data-testid="draft-tile"]')).not.toBeNull()
    expect(night.querySelector('[data-testid="timeline-hours"]')!.textContent).toContain('01:00 +1')
  })

  it('„Dziś” rysuje szkic, a przy nowym bloku nie ma „Dodaj” ani „Anuluj”', () => {
    const page = readFileSync('src/renderer/features/today/TodayPage.tsx', 'utf8')
    expect(page).toMatch(/draft=\{draftTile\(draft, names\)\}/)
    expect(page).toMatch(/actions=\{\s*draft \? undefined : \(/)
    expect(page).not.toContain('data-testid="block-add"')
  })
})

describe('szkic w store: zamierzony – przeciągnięcie, „+ Blok”, Ctrl+N, „Więcej” (D461, T1045)', () => {
  it('goły szkic (klik osi) nie jest zamierzony; zmiana pola albo jawnie zamierzony – tak', () => {
    const b = planBlock({ id: 'd2', categoryId: 'inne', startMin: 600, durationMin: 60, origin: 'user' })
    setBlockDraft(D, b)
    expect(useUi.getState().blockDraft?.intended).toBe(false)
    patchBlockDraft(D, { name: 'x' })
    expect(useUi.getState().blockDraft?.intended).toBe(true)
    setBlockDraft(D, b, true)
    expect(useUi.getState().blockDraft?.intended).toBe(true)
    setBlockDraft(D, null)
    expect(useUi.getState().blockDraft).toBeNull()
  })

  it('zapisany szkic schodzi ze store sam: nowy zrobiony w międzyczasie (Ctrl+N tuż po zapisie poprzedniego) zostaje', () => {
    // The day's effect that drops a draft once the plan has its block may run late, with the draft of the render before.
    setBlockDraft(D, planBlock({ id: 'd4', categoryId: 'inne', startMin: 600, durationMin: 60, origin: 'user' }), true)
    dropSavedDraft(D, 'd3')
    expect(useUi.getState().blockDraft?.block.id).toBe('d4')
    dropSavedDraft('2026-11-19', 'd4')
    expect(useUi.getState().blockDraft?.block.id).toBe('d4')
    dropSavedDraft(D, 'd4')
    expect(useUi.getState().blockDraft).toBeNull()
    const page = readFileSync('src/renderer/features/today/TodayPage.tsx', 'utf8')
    expect(page).toContain('dropSavedDraft(date, stored.block.id)')
  })
})

describe('okienko „Nowy blok” w „Tygodniu”: bez „Dodaj” (D461), z końcem (D464)', () => {
  const popover = async (o: { dates?: string[]; dragged?: boolean } = {}) => {
    const onClose = vi.fn()
    const onMore = vi.fn((_b: PlanBlock) => undefined)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () =>
      root!.render(
        createElement(NewBlockPopover, { dates: o.dates ?? [D], startMin: 9 * 60, durationMin: 60, today: '2026-11-13', namesOf: () => names, place: { left: 0, top: 0 }, dragged: o.dragged ?? true, onClose, onDates: () => undefined, onMore })
      )
    )
    return { onClose, onMore }
  }
  const away = () => act(async () => void document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))

  it('są „Anuluj” i „Więcej”, nie ma „Dodaj”; pola: nazwa, kategoria, początek, koniec, długość', async () => {
    await popover()
    expect(host!.querySelector('[data-testid="week-new-add"]')).toBeNull()
    expect(host!.querySelector('[data-testid="week-new-cancel"]')).not.toBeNull()
    expect(host!.querySelector('[data-testid="week-new-more"]')).not.toBeNull()
    expect([el('week-new-start').value, el('week-new-end').value, el('week-new-duration').value]).toEqual(['09:00', '10:00', '1 h'])
    expect(el<HTMLElement>('week-new-hours').textContent).toBe('09:00–10:00')
  })

  it('koniec zmienia długość, początek przesuwa koniec; zapis niesie wpisane godziny do każdego dnia', async () => {
    await popover({ dates: [D, '2026-11-19'] })
    typeLeave(el('week-new-end'), '11:30')
    expect(el('week-new-duration').value).toBe('2 h 30 min')
    typeLeave(el('week-new-start'), '8:00')
    expect(el('week-new-end').value).toBe('10:30')
    expect(el<HTMLElement>('week-new-hours').textContent).toBe('08:00–10:30')
    await away()
    await act(async () => undefined)
    const [entries] = vi.mocked(addWeekBlocks).mock.calls[0]!
    expect(entries.map((e) => [e.date, e.block.startMin, e.block.durationMin])).toEqual([
      [D, 8 * 60, 150],
      ['2026-11-19', 8 * 60, 150]
    ])
  })

  it('klik poza okienkiem zapisuje blok od razu, z tym, co wpisano w polu (także niezatwierdzone), i zamyka okienko', async () => {
    const { onClose } = await popover()
    const name = el('week-new-name')
    act(() => {
      name.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'Analiza rynku')
      name.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await away()
    await act(async () => undefined)
    expect(addWeekBlocks).toHaveBeenCalledTimes(1)
    expect(vi.mocked(addWeekBlocks).mock.calls[0]![0].map((e) => e.block.name)).toEqual(['Analiza rynku'])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('klik w samym okienku nic nie zapisuje; Esc i „Anuluj” odrzucają bez zapisu', async () => {
    const { onClose } = await popover()
    await act(async () => void el('week-new-duration').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(addWeekBlocks).not.toHaveBeenCalled()
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(onClose).toHaveBeenCalledTimes(1)
    await act(async () => el<HTMLElement>('week-new-cancel').click())
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(addWeekBlocks).not.toHaveBeenCalled()
  })

  it('„Więcej” zabiera blok z wpisanymi godzinami do „Dziś” i nic nie zapisuje', async () => {
    const { onMore } = await popover()
    typeLeave(el('week-new-end'), '10:45')
    await act(async () => el<HTMLElement>('week-new-more').click())
    expect(onMore.mock.calls[0]![0]).toMatchObject({ startMin: 9 * 60, durationMin: 105 })
    expect(addWeekBlocks).not.toHaveBeenCalled()
  })

  it('okienko otwarte gołym kliknięciem siatki: klik poza nim nic nie zostawia; po zmianie pola – zapisuje (D461)', async () => {
    const { onClose } = await popover({ dragged: false })
    await away()
    await act(async () => undefined)
    expect(addWeekBlocks).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => root!.unmount())
    host!.remove()
    await popover({ dragged: false })
    typeLeave(el('week-new-end'), '10:30')
    await away()
    await act(async () => undefined)
    expect(addWeekBlocks).toHaveBeenCalledTimes(1)
  })

  it('zapis okienka mówi „Dodano blok” z „Cofnij”; zapis na kilka dni – „Dodano 2 bloki”', async () => {
    await popover()
    await away()
    await act(async () => undefined)
    expect(useUi.getState().toasts.map((t) => [t.text, t.action?.label])).toEqual([['Dodano blok', 'Cofnij']])
    for (const t of useUi.getState().toasts) closeToast(t.id)
    act(() => root!.unmount())
    host!.remove()
    vi.mocked(addWeekBlocks).mockResolvedValueOnce({ saved: [D, '2026-11-19'], failed: [], pending: [], unknown: false, push: null })
    await popover({ dates: [D, '2026-11-19'] })
    await away()
    await act(async () => undefined)
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['Dodano 2 bloki'])
  })

  it('drugi klik poza okienkiem w czasie zapisu nie zapisuje drugi raz', async () => {
    let finish: (v: Awaited<ReturnType<typeof addWeekBlocks>>) => void = () => undefined
    vi.mocked(addWeekBlocks).mockImplementationOnce(() => new Promise((r) => (finish = r)))
    await popover()
    await away()
    await away()
    expect(addWeekBlocks).toHaveBeenCalledTimes(1)
    await act(async () => finish({ saved: [D], failed: [], pending: [], unknown: false, push: null }))
  })
})

describe('„Koniec” wszędzie, gdzie jest godzina początku (D464)', () => {
  it('wykłady w ustawieniach i w kreatorze, „Postaw na osi” w Sprawach mają pole „Koniec”', () => {
    expect(readFileSync('src/renderer/features/settings/LecturesSection.tsx', 'utf8')).toMatch(/<EndField startMin=\{l\.startMin\} durationMin=\{l\.durationMin\}/)
    expect(readFileSync('src/renderer/features/wizard/Wizard.tsx', 'utf8')).toMatch(/<EndField startMin=\{l\.startMin\} durationMin=\{l\.durationMin\}/)
    const cases = readFileSync('src/renderer/features/cases/CasesPage.tsx', 'utf8')
    expect(cases).toMatch(/<EndField startMin=\{at\} durationMin=\{long\}/)
    expect(cases).toContain('planOnAxis(model, today, x.record, title, at, length ?? undefined)')
  })
})
