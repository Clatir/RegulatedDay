// @vitest-environment jsdom
/**
 * Wklejenie listy w polach szybkiego zapisu (N11, D605, D606): okienko „Do skrzynki” (`QuickApp`) i pole „+ Skrzynka” paska (`Bar`) – pytanie pod polem
 * zamiast tekstu w polu, Enter zapisuje linie (`quickAddMany`), Esc wkleja jeden tytuł (pierwszy Esc tylko odpowiada), po zapisie w okienku
 * „Dodano 5 spraw · Cofnij”; wklejenie jednej linii działa jak dotąd; „Dodaj” strony „Sprawy” – dymek z „Cofnij” (`addTaskList`).
 */
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuickAddManyResult, QuickUndoResult, RdApi } from '@shared/api'
import { TITLE_MAX } from '@shared/model/requests'
import { installEscape } from '@renderer/lib/escape'
import { Bar, barLines } from '@renderer/widget/Bar'
import { QuickApp } from '@renderer/widget/QuickApp'
import { NewTask } from '@renderer/features/cases/CasesPage'
import { addTaskList } from '@renderer/features/cases/taskList'
import { useData } from '@renderer/store/data'
import { useUi } from '@renderer/store/ui'
import { noFolderView, type WidgetView } from '@shared/widget'
import type { DataView, EditEntry } from '@shared/api'

let uninstallEscape: () => void = () => undefined
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  uninstallEscape = installEscape()
})
afterAll(() => uninstallEscape())

const MAIN_DAY = '2030-05-06'
const LIST = '- jeden\r\n- dwa @jutro 15:00\r\n\r\n- [ ] trzy\n4. cztery\n• pięć'
const FIVE = ['jeden', 'dwa @jutro 15:00', 'trzy', 'cztery', 'pięć']

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  delete (window as unknown as { rd?: unknown }).rd
})

const ok = (count: number, over: Partial<QuickAddManyResult> = {}): QuickAddManyResult => ({ ok: true, error: null, count, notPlaced: 0, batch: 'b1', ...over })
function stubRd(extra: Partial<RdApi> = {}): Partial<RdApi> {
  const rd: Partial<RdApi> = { quickToday: () => Promise.resolve({ today: MAIN_DAY, nowMin: null }), quickCategories: () => Promise.resolve([]), quickClose: vi.fn(), onQuickShown: () => () => undefined, ...extra }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  return rd
}
const pasteInto = (input: HTMLInputElement, text: string) =>
  act(async () => {
    const ev = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(ev, 'clipboardData', { value: { getData: () => text } })
    input.dispatchEvent(ev)
  })
const typeInto = (input: HTMLInputElement, text: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
const key = (input: HTMLInputElement, k: string) => act(async () => void input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })))
const q = (id: string) => host!.querySelector(`[data-testid="${id}"]`)
async function mountQuick() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(QuickApp)))
  return host.querySelector<HTMLInputElement>('[data-testid="quick-title"]')!
}

describe('okienko „Do skrzynki”: wklejona lista', () => {
  it('pole nie dostaje tekstu, pod nim pytanie; pytanie nie jest błędem ani podglądem', async () => {
    stubRd()
    const input = await mountQuick()
    await pasteInto(input, LIST)
    expect(input.value).toBe('')
    expect(q('quick-paste')?.textContent).toBe('Dodać 5 spraw? · Enter · Esc – jeden tytuł')
  })

  it('wklejenie jednej linii (także z końcowym enterem) – zwykłe wklejenie: bez pytania, zdarzenie nie jest anulowane', async () => {
    stubRd()
    const input = await mountQuick()
    let prevented = true
    await act(async () => {
      const ev = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'clipboardData', { value: { getData: () => 'Kup mleko\n' } })
      input.dispatchEvent(ev)
      prevented = ev.defaultPrevented
    })
    expect(prevented).toBe(false)
    expect(q('quick-paste')).toBeNull()
  })

  it('Enter – quickAddMany z liniami bez znaczników, okienko zostaje (nie woła quickClose), „Dodano 5 spraw · Cofnij”; pole zachowuje, co w nim było', async () => {
    const quickAddMany = vi.fn(() => Promise.resolve(ok(5)))
    const quickAdd = vi.fn()
    const rd = stubRd({ quickAddMany, quickAdd })
    const input = await mountQuick()
    await typeInto(input, 'Zaczęte')
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    expect(quickAddMany).toHaveBeenCalledWith(FIVE)
    expect(quickAdd).not.toHaveBeenCalled()
    expect(rd.quickClose).not.toHaveBeenCalled()
    expect(q('quick-paste')).toBeNull()
    expect(q('quick-list-text')?.textContent).toBe('Dodano 5 spraw')
    expect(q('quick-undo')).not.toBeNull()
    expect(input.value).toBe('Zaczęte')
  })

  it('bez miejsca na osi: „Dodano 5 spraw · 1 bez miejsca na osi”; następna zmiana tekstu zdejmuje linię', async () => {
    stubRd({ quickAddMany: () => Promise.resolve(ok(5, { notPlaced: 1 })) })
    const input = await mountQuick()
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    expect(q('quick-list-text')?.textContent).toBe('Dodano 5 spraw · 1 bez miejsca na osi')
    await typeInto(input, 'x')
    expect(q('quick-list')).toBeNull()
  })

  it('„Cofnij” woła quickUndo z id zapisu i mówi, co cofnięto', async () => {
    const quickUndo = vi.fn((): Promise<QuickUndoResult> => Promise.resolve({ ok: true, error: null, undone: 3, kept: 2 }))
    stubRd({ quickAddMany: () => Promise.resolve(ok(5)), quickUndo })
    const input = await mountQuick()
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    await act(async () => (q('quick-undo') as HTMLButtonElement).click())
    expect(quickUndo).toHaveBeenCalledWith('b1')
    expect(q('quick-list-text')?.textContent).toBe('Cofnięto 3 sprawy · 2 sprawy zmienione od tego czasu – zostały')
    expect(q('quick-undo')).toBeNull()
  })

  it('odmowa zapisu listy – powód pod polem, bez „Cofnij”; zapis czekający na odpowiedź – spokojny komunikat', async () => {
    const quickAddMany = vi.fn<(l: string[]) => Promise<QuickAddManyResult>>().mockResolvedValueOnce({ ok: false, error: 'Nie zapisano – spróbuj jeszcze raz.', count: 0, notPlaced: 0, batch: null }).mockResolvedValueOnce(ok(5, { asked: true, batch: null }))
    stubRd({ quickAddMany })
    const input = await mountQuick()
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    expect(q('quick-error')?.textContent).toBe('Nie zapisano – spróbuj jeszcze raz.')
    expect(q('quick-undo')).toBeNull()
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    expect(q('quick-asked')?.textContent).toBe('Zapisano 5 spraw – czeka na odpowiedź o zmianie z innego komputera')
  })

  it('Esc – jeden tytuł w miejscu kursora (linie połączone spacją, znaczniki zostają); pierwszy Esc nie zamyka okienka, drugi zamyka', async () => {
    const quickAddMany = vi.fn()
    const rd = stubRd({ quickAddMany })
    const input = await mountQuick()
    await typeInto(input, 'Przed Po')
    input.setSelectionRange(6, 6)
    await pasteInto(input, '- a\n\n- b\n c ')
    expect(q('quick-paste')).not.toBeNull()
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    // The Esc of the window (focus not in the field) answers the question the same.
    expect(input.value).toBe('Przed - a - b cPo')
    expect(q('quick-paste')).toBeNull()
    expect(rd.quickClose).not.toHaveBeenCalled()
    expect(quickAddMany).not.toHaveBeenCalled()
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(rd.quickClose).toHaveBeenCalledTimes(1)
  })

  it('Esc w polu: jeden tytuł, kursor za wklejonym, okienko zostaje; za długi tytuł – ucięty do TITLE_MAX', async () => {
    const rd = stubRd()
    const input = await mountQuick()
    await pasteInto(input, 'raz\ndwa')
    await key(input, 'Escape')
    expect(input.value).toBe('raz dwa')
    expect(input.selectionStart).toBe(7)
    expect(rd.quickClose).not.toHaveBeenCalled()
    await typeInto(input, '')
    const long = 'x'.repeat(TITLE_MAX - 2)
    await typeInto(input, long)
    input.setSelectionRange(TITLE_MAX - 2, TITLE_MAX - 2)
    await pasteInto(input, 'abcdef\nghi')
    await key(input, 'Escape')
    expect(input.value).toBe(`${long}ab`)
  })

  it('zmiana tekstu zdejmuje pytanie – wklejone nie wraca', async () => {
    const quickAddMany = vi.fn()
    stubRd({ quickAddMany })
    const input = await mountQuick()
    await pasteInto(input, LIST)
    await typeInto(input, 'x')
    expect(q('quick-paste')).toBeNull()
    await key(input, 'Enter')
    expect(quickAddMany).not.toHaveBeenCalled()
  })

  it('więcej niż 50 linii: pytanie mówi, ile pominięto; zapis dostaje pierwsze 50', async () => {
    const quickAddMany = vi.fn((_l: string[]) => Promise.resolve(ok(50)))
    stubRd({ quickAddMany })
    const input = await mountQuick()
    await pasteInto(input, Array.from({ length: 62 }, (_, i) => `z${i + 1}`).join('\n'))
    expect(q('quick-paste')?.textContent).toBe('Dodać 50 spraw? (12 linii pominięto) · Enter · Esc – jeden tytuł')
    await key(input, 'Enter')
    expect(quickAddMany.mock.calls[0]![0]).toHaveLength(50)
  })
})

describe('pole „+ Skrzynka” paska', () => {
  const dayView = (): WidgetView => ({ ...noFolderView(), day: '2026-11-12', lines: [], block: null })
  async function openField() {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    return host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')!
  }

  it('pytanie pod polem; Enter – quickAddMany (nie quickAdd przez pasek), pole się zwija; Esc – jeden tytuł i pole zostaje', async () => {
    const quickAddMany = vi.fn(() => Promise.resolve(ok(5)))
    const widgetAction = vi.fn(() => Promise.resolve())
    stubRd({ quickAddMany, widgetAction })
    const input = await openField()
    await pasteInto(input, LIST)
    expect(input.value).toBe('')
    expect(q('bar-quick-paste')?.textContent).toBe('Dodać 5 spraw? · Enter · Esc – jeden tytuł')
    await key(input, 'Escape')
    expect(input.value).toBe('- jeden - dwa @jutro 15:00 - [ ] trzy 4. cztery • pięć')
    expect(q('bar-quick-title')).not.toBeNull()
    await typeInto(input, '')
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    expect(quickAddMany).toHaveBeenCalledWith(FIVE)
    expect(widgetAction).not.toHaveBeenCalled()
    expect(q('bar-quick-title')).toBeNull()
  })

  it('odmowa – powód pod polem, pole zostaje otwarte', async () => {
    stubRd({ quickAddMany: () => Promise.resolve({ ok: false, error: 'Nie zapisano – spróbuj jeszcze raz.', count: 0, notPlaced: 0, batch: null }) })
    const input = await openField()
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    expect(q('bar-quick-error')?.textContent).toBe('Nie zapisano – spróbuj jeszcze raz.')
    expect(q('bar-quick-title')).not.toBeNull()
  })

  it('pierwszy Esc przy pytaniu nie zwija pola (tylko odpowiada); drugi zwija', async () => {
    stubRd()
    const input = await openField()
    await pasteInto(input, LIST)
    await key(input, 'Escape')
    expect(q('bar-quick-title')).not.toBeNull()
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(q('bar-quick-title')).toBeNull()
  })
})

describe('strona „Sprawy”: dymek z „Cofnij” po wklejonej liście (addTaskList)', () => {
  const data = useData.getState()
  afterEach(() => {
    useData.setState(data, true)
    useUi.setState({ toasts: [] })
  })

  it('zapisana – jedna edycja i dymek „Dodano 5 spraw” z „Cofnij” (samo cofnięcie – tests/web/cases-list.test.ts); odmowa – false i dymek błędu', async () => {
    const sent: EditEntry[][] = []
    const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: [], routines: [], series: [], seriesDays: {} }) as unknown as DataView
    ;(window as unknown as { rd: Partial<RdApi> }).rd = {
      dayFiles: async () => ({}),
      caseDays: async (dates) => ({ files: Object.fromEntries(dates.map((d) => [d, null])), gone: {}, begun: {} }),
      edit: async (entries) => (sent.push(entries), entries.map(() => ({ status: 'applied' as const }))),
      dataView: async () => view()
    }
    useData.setState({ view: view(), requests: [] })
    expect(await addTaskList(FIVE)).toBe(true)
    const toast = useUi.getState().toasts.at(-1)!
    expect(toast.text).toBe('Dodano 5 spraw')
    expect(toast.action?.label).toBe('Cofnij')
    // One edit: the day's file of the one line with an hour and the five records.
    expect(sent).toHaveLength(1)
    expect(sent[0]).toHaveLength(6)
    expect(await addTaskList(['!jutro', ' '])).toBe(false)
    expect(useUi.getState().toasts.at(-1)!.text).toBe('Zadanie potrzebuje tytułu.')
  })
})

beforeEach(() => {
  useUi.setState({ toasts: [] })
})

describe('wklejona lista: Esc przy pełnym polu, zapis w toku, tekst sprzed wklejenia (N11, D607)', () => {
  it('Esc przy pełnym polu (nic nie wstawione) nie zostawia kursora – następne pisanie nie skacze na miejsce wklejenia', async () => {
    stubRd()
    const input = await mountQuick()
    const full = 'x'.repeat(TITLE_MAX)
    await typeInto(input, full)
    input.setSelectionRange(3, 3)
    await pasteInto(input, 'a\nb')
    await key(input, 'Escape')
    expect(input.value).toBe(full)
    await typeInto(input, full.slice(0, -1))
    expect(input.selectionStart).toBe(TITLE_MAX - 1)
  })

  it('okienko: Enter przy zapisie w toku nie zdejmuje pytania (zapis go nie przyjął); po zapisie Enter działa', async () => {
    const resolvers: Array<(r: QuickAddManyResult) => void> = []
    const quickAddMany = vi.fn(() => new Promise<QuickAddManyResult>((r) => resolvers.push(r)))
    stubRd({ quickAddMany })
    const input = await mountQuick()
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    expect(quickAddMany).toHaveBeenCalledTimes(1)
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    expect(quickAddMany).toHaveBeenCalledTimes(1)
    expect(q('quick-paste')).not.toBeNull()
    await act(async () => resolvers[0]!(ok(5)))
    await key(input, 'Enter')
    expect(quickAddMany).toHaveBeenCalledTimes(2)
    expect(q('quick-paste')).toBeNull()
  })

  const dayView = (): WidgetView => ({ ...noFolderView(), day: '2026-11-12', lines: [], block: null })
  async function openBar() {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    return host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')!
  }

  it('pole paska: Enter przy zapisie w toku nie zdejmuje pytania', async () => {
    const quickAddMany = vi.fn(() => new Promise<QuickAddManyResult>(() => undefined))
    stubRd({ quickAddMany })
    const input = await openBar()
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    expect(quickAddMany).toHaveBeenCalledTimes(1)
    expect(q('bar-quick-paste')).not.toBeNull()
  })

  it('pole paska: tekst wpisany przed wklejeniem zostaje po zapisie listy, pole się nie zwija; puste pole – zwija się', async () => {
    stubRd({ quickAddMany: () => Promise.resolve(ok(5)) })
    const input = await openBar()
    await typeInto(input, 'Zaczęte')
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    expect(q('bar-quick-title')).not.toBeNull()
    expect(input.value).toBe('Zaczęte')
    expect(q('bar-quick-paste')).toBeNull()
    await typeInto(input, '')
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    expect(q('bar-quick-title')).toBeNull()
  })

  describe('„Nowe zadanie” strony „Sprawy”', () => {
    const data = useData.getState()
    afterEach(() => {
      useData.setState(data, true)
      useUi.setState({ toasts: [] })
    })
    function stubEdit(hold = false) {
      const sent: EditEntry[][] = []
      const release: Array<() => void> = []
      const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: [], routines: [], series: [], seriesDays: {} }) as unknown as DataView
      ;(window as unknown as { rd: Partial<RdApi> }).rd = {
        dayFiles: async () => ({}),
        caseDays: async (dates) => ({ files: Object.fromEntries(dates.map((d) => [d, null])), gone: {}, begun: {} }),
        edit: (entries) => (sent.push(entries), hold ? new Promise((r) => release.push(() => r(entries.map(() => ({ status: 'applied' as const }))))) : Promise.resolve(entries.map(() => ({ status: 'applied' as const })))),
        dataView: async () => view()
      }
      useData.setState({ view: view(), requests: [] })
      return { sent, release }
    }
    async function mountNew(onClose: () => void) {
      host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      await act(async () => root!.render(createElement(NewTask, { onClose })))
      return host.querySelector<HTMLInputElement>('[data-testid="case-add-title"]')!
    }

    it('puste pole: Enter dodaje listę i zamyka formularz; z tekstem sprzed wklejenia – tekst zostaje, formularz otwarty', async () => {
      const { sent } = stubEdit()
      const onClose = vi.fn()
      const input = await mountNew(onClose)
      await pasteInto(input, LIST)
      expect(q('case-add-paste')?.textContent).toBe('Dodać 5 spraw? · Enter · Esc – jeden tytuł')
      await key(input, 'Enter')
      await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
      expect(sent).toHaveLength(1)
      await typeInto(input, 'Zaczęte')
      await pasteInto(input, LIST)
      await key(input, 'Enter')
      await vi.waitFor(() => expect(sent).toHaveLength(2))
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(input.value).toBe('Zaczęte')
    })

    it('Enter przy zapisie w toku nie zdejmuje pytania', async () => {
      const { sent, release } = stubEdit(true)
      const input = await mountNew(vi.fn())
      await pasteInto(input, LIST)
      await key(input, 'Enter')
      await vi.waitFor(() => expect(sent).toHaveLength(1))
      await pasteInto(input, LIST)
      await key(input, 'Enter')
      expect(sent).toHaveLength(1)
      expect(q('case-add-paste')).not.toBeNull()
      await act(async () => release.forEach((r) => r()))
    })
  })
})

describe('wklejona lista – runda 2 (N11, D607)', () => {
  it('okienko: „Cofnij” odmówione w całości (`again`) zostawia „Cofnij” i mówi powód; bez `again` linia znika', async () => {
    const quickUndo = vi
      .fn<(b: string) => Promise<QuickUndoResult>>()
      .mockResolvedValueOnce({ ok: false, error: 'Nie cofnięto – spróbuj jeszcze raz.', undone: 0, kept: 0, again: true })
      .mockResolvedValueOnce({ ok: false, error: 'Tego zapisu nie da się już cofnąć.', undone: 0, kept: 0 })
    stubRd({ quickAddMany: () => Promise.resolve(ok(5)), quickUndo })
    const input = await mountQuick()
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    await act(async () => (q('quick-undo') as HTMLButtonElement).click())
    expect(q('quick-list-text')?.textContent).toBe('Dodano 5 spraw · Nie cofnięto – spróbuj jeszcze raz.')
    expect(q('quick-undo')).not.toBeNull()
    await act(async () => (q('quick-undo') as HTMLButtonElement).click())
    expect(q('quick-error')?.textContent).toBe('Tego zapisu nie da się już cofnąć.')
    expect(q('quick-undo')).toBeNull()
    expect(q('quick-list')).toBeNull()
  })

  it('okienko: „Cofnij” odmówione w całości zostawia przycisk (lista nadal do cofnięcia)', async () => {
    const quickUndo = vi.fn<(b: string) => Promise<QuickUndoResult>>().mockResolvedValue({ ok: false, error: 'Nie cofnięto – spróbuj jeszcze raz.', undone: 0, kept: 0, again: true })
    stubRd({ quickAddMany: () => Promise.resolve(ok(5)), quickUndo })
    const input = await mountQuick()
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    await act(async () => (q('quick-undo') as HTMLButtonElement).click())
    expect(q('quick-undo')).not.toBeNull()
    await act(async () => (q('quick-undo') as HTMLButtonElement).click())
    expect(quickUndo).toHaveBeenCalledTimes(2)
  })

  it('okienko: dwa Enter w jednym tchnieniu (zanim pole się przerysuje) zapisują listę raz', async () => {
    const quickAddMany = vi.fn(() => new Promise<QuickAddManyResult>(() => undefined))
    stubRd({ quickAddMany })
    const input = await mountQuick()
    await pasteInto(input, LIST)
    await act(async () => {
      for (let i = 0; i < 2; i++) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(quickAddMany).toHaveBeenCalledTimes(1)
  })

  it('pole paska: tekst wpisany w trakcie zapisu listy (pole było puste przy Enter) nie jest czyszczony ani zwijany po odpowiedzi', async () => {
    let resolve: (r: QuickAddManyResult) => void = () => undefined
    stubRd({ quickAddMany: () => new Promise<QuickAddManyResult>((r) => (resolve = r)) })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Bar, { view: { ...noFolderView(), day: '2026-11-12', lines: [], block: null }, mode: 'main' })))
    await act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    const input = host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')!
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    await typeInto(input, 'Nowe')
    await act(async () => resolve(ok(5)))
    expect(q('bar-quick-title')).not.toBeNull()
    expect(input.value).toBe('Nowe')
  })
})

describe('wklejona lista – runda 3 (N11, D607)', () => {
  const dayView = (): WidgetView => ({ ...noFolderView(), day: '2026-11-12', lines: [], block: null })

  it('pole paska: odpowiedź zapisu z pola, które zwinął Esc, nie czyści ponownie otwartego pola (wpisane „abc” zostaje)', async () => {
    let resolve: (r: QuickAddManyResult) => void = () => undefined
    stubRd({ quickAddMany: () => new Promise<QuickAddManyResult>((r) => (resolve = r)) })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(Bar, { view: dayView(), mode: 'main' })))
    const reopen = () => act(async () => host!.querySelector<HTMLButtonElement>('[data-testid="bar-quick"]')!.click())
    await reopen()
    const first = host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')!
    await pasteInto(first, LIST)
    await key(first, 'Enter')
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(q('bar-quick-title')).toBeNull()
    await reopen()
    const again = host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')!
    await typeInto(again, 'abc')
    await act(async () => resolve(ok(5)))
    expect(q('bar-quick-title')).not.toBeNull()
    expect(host.querySelector<HTMLInputElement>('[data-testid="bar-quick-title"]')!.value).toBe('abc')
  })

  describe('„Nowe zadanie” – odpowiedź zapisu listy', () => {
    const data = useData.getState()
    afterEach(() => {
      useData.setState(data, true)
      useUi.setState({ toasts: [] })
    })
    function stubHeld() {
      const release: Array<() => void> = []
      const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: [], routines: [], series: [], seriesDays: {} }) as unknown as DataView
      ;(window as unknown as { rd: Partial<RdApi> }).rd = {
        dayFiles: async () => ({}),
        caseDays: async (dates) => ({ files: Object.fromEntries(dates.map((d) => [d, null])), gone: {}, begun: {} }),
        edit: (entries: EditEntry[]) => new Promise((r) => release.push(() => r(entries.map(() => ({ status: 'applied' as const }))))),
        dataView: async () => view()
      }
      useData.setState({ view: view(), requests: [] })
      return release
    }
    const field = () => host!.querySelector<HTMLInputElement>('[data-testid="case-add-title"]')

    it('tekst wpisany w trakcie zapisu zostaje, formularz się nie zamyka (wyścig tej samej instancji)', async () => {
      const release = stubHeld()
      const onClose = vi.fn()
      host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      await act(async () => root!.render(createElement(NewTask, { onClose })))
      await pasteInto(field()!, LIST)
      await key(field()!, 'Enter')
      await vi.waitFor(() => expect(release).toHaveLength(1))
      await typeInto(field()!, 'abc')
      await act(async () => release.forEach((r) => r()))
      expect(onClose).not.toHaveBeenCalled()
      expect(field()!.value).toBe('abc')
    })

    it('odpowiedź z formularza zamkniętego Esc nie zamyka ponownie otwartego', async () => {
      const release = stubHeld()
      function Host() {
        const [open, setOpen] = useState(true)
        return createElement('div', null, createElement('button', { 'data-testid': 'reopen', onClick: () => setOpen(true) }, 'Nowe'), open ? createElement(NewTask, { onClose: () => setOpen(false) }) : null)
      }
      host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      await act(async () => root!.render(createElement(Host)))
      await pasteInto(field()!, LIST)
      await key(field()!, 'Enter')
      await vi.waitFor(() => expect(release).toHaveLength(1))
      // Esc in the field: the form is closed while its save is still going.
      await key(field()!, 'Escape')
      expect(field()).toBeNull()
      await act(async () => (q('reopen') as HTMLButtonElement).click())
      expect(field()).not.toBeNull()
      await act(async () => release.forEach((r) => r()))
      expect(field()).not.toBeNull()
    })
  })

  it('okienko: „Cofnij”, które rzuciło, zostawia przycisk i mówi powód w linii (jak odmowa w całości)', async () => {
    stubRd({ quickAddMany: () => Promise.resolve(ok(5)), quickUndo: () => Promise.reject(new Error('EIO')) })
    const input = await mountQuick()
    await pasteInto(input, LIST)
    await key(input, 'Enter')
    await act(async () => (q('quick-undo') as HTMLButtonElement).click())
    expect(q('quick-list-text')?.textContent).toBe('Dodano 5 spraw · Nie cofnięto: EIO')
    expect(q('quick-undo')).not.toBeNull()
  })

  it('okienko: „Cofnij” odmówione – linia „<pierwotny tekst> · <powód>”, a jej termin zostaje pierwotny (15 min od zapisu, nie od odmowy)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      stubRd({ quickAddMany: () => Promise.resolve(ok(5)), quickUndo: () => Promise.resolve({ ok: false, error: 'Nie cofnięto – spróbuj jeszcze raz.', undone: 0, kept: 0, again: true }) })
      const input = await mountQuick()
      await pasteInto(input, LIST)
      await key(input, 'Enter')
      await act(async () => void (await vi.advanceTimersByTimeAsync(14 * 60_000)))
      expect(q('quick-list')).not.toBeNull()
      await act(async () => (q('quick-undo') as HTMLButtonElement).click())
      expect(q('quick-list-text')?.textContent).toBe('Dodano 5 spraw · Nie cofnięto – spróbuj jeszcze raz.')
      await act(async () => void (await vi.advanceTimersByTimeAsync(2 * 60_000)))
      expect(q('quick-list')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('linia „Dodano 5 spraw · Cofnij” w pasku (N11)', () => {
  const line = (id: string) => ({ id, text: id, actions: [], dot: false }) as unknown as WidgetView['lines'][number]

  it('jak linie zmian planu (`moved:`): po pytaniach dnia, nie wypycha ich do „⋯”; z dwóch takich linii na wierzchu jedna (pierwsza), druga czeka w „⋯”', () => {
    const lines = [line('next:2026-11-12:1'), line('water:2026-11-12:1'), line('quick:b1'), line('moved:push')]
    const { shown, extra } = barLines(lines, false)
    expect(shown.map((l) => l.id)).toEqual(['next:2026-11-12:1', 'water:2026-11-12:1'])
    expect(extra.map((l) => l.id)).toEqual(['quick:b1', 'moved:push'])
    expect(barLines([line('next:2026-11-12:1'), line('quick:b1')], false).shown.map((l) => l.id)).toEqual(['next:2026-11-12:1', 'quick:b1'])
  })
})
