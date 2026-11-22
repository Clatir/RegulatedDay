// @vitest-environment jsdom
/**
 * Selecting many sprawy and changing them together (D527–D530, ciąg Z) in the window: the page „Sprawy” (click, Ctrl+click, Shift+click and
 * Ctrl+A within a list, Esc, the line over the selection), the menu of the right button with ✓ and „—”, the change and its line with „Cofnij”,
 * „Zaplanuj…” („Od której?”), Del for the selection, and the panel beside the axis of „Dziś” (its own selection, the group a drag carries).
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { paths } from '@shared/data/paths'
import { rdFrom } from '@shared/model/rd'
import { newRequest, newTask, requestFrom } from '@shared/model/requests'
import { plDate } from '@shared/format'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { CasesPage } from '@renderer/features/cases/CasesPage'
import { CasesPanel } from '@renderer/features/cases/CasesPanel'
import { casesMenu } from '@renderer/features/cases/groupActions'
import { carriedBy } from '@renderer/features/cases/groupActions'
import { PlanGroupDialog } from '@renderer/features/cases/PlanGroupDialog'
import { caseItems, type CaseItem } from '@shared/engine/cases'
import { deleteTargetOf, useDeleteSelected } from '@renderer/lib/deleteKey'
import { installEscape } from '@renderer/lib/escape'
import { reloadData, useData } from '@renderer/store/data'
import { useGroupLine } from '@renderer/store/groupLine'
import { closeToast, useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
const data = useData.getState()
let root: Root | null = null
let host: HTMLElement | null = null
let offEscape: (() => void) | null = null
beforeEach(() => {
  offEscape = installEscape()
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  offEscape?.()
  for (const t of useUi.getState().toasts) closeToast(t.id)
  useGroupLine.setState({ lines: {} })
  useData.setState(data, true)
})

const TODAY = logicalDayOf(Date.now())
const rel = (id: string) => paths.record('request', id)
/** Newest first on a list: `age` is how old it is. */
const task = (id: string, age: number, p: Partial<Parameters<typeof newTask>[3]> = {}) => newTask(id, Date.now() - age * 1000, TODAY, { title: `zadanie ${id}`, estimateMin: 30, ...p })!

/** The window over a folder of records; the edits are laid (applied) as the folder would, the days' files only collected. */
function stub(records: RawRecord[], days: Record<string, RawRecord | null> = {}) {
  const sent: EditEntry[][] = []
  const state = { records: [...records], days: { ...days } }
  const view = (): DataView => ({ status: 'open', rd: null, templates: [], lectures: [], requests: state.records, routines: [], series: [], seriesDays: {}, computers: [] }) as unknown as DataView
  const apply = (e: EditEntry) => {
    if (!e.rel.startsWith('requests/')) return
    const id = e.rel.slice('requests/'.length, -'.json'.length)
    const was = state.records.find((r) => r.id === id)
    state.records = state.records.filter((r) => r.id !== id)
    if (e.remove) return
    const next: RawRecord = { ...(e.create ? { id } : (was ?? { id })) }
    for (const ed of e.edits) next[ed.path[0]!] = ed.value
    state.records.push(next)
  }
  const rd: Partial<RdApi> = {
    dayFiles: async (dates) => Object.fromEntries(dates.filter((d) => d in state.days).map((d) => [d, state.days[d] ?? null])),
    caseDays: async (dates) => {
      const known = dates.filter((d) => d in state.days)
      return { files: Object.fromEntries(known.map((d) => [d, state.days[d] ?? null])), gone: Object.fromEntries(known.map((d) => [d, []])), begun: Object.fromEntries(known.map((d) => [d, []])) }
    },
    dayData: async (date) => ({ date, dayFile: state.days[date] ?? null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }),
    edit: async (entries) => (sent.push(entries), entries.forEach(apply), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view(),
    requestCounters: async () => ({ today: { count: 0, minutes: 0 }, week: { count: 0, minutes: 0 }, byPerson: {}, complete: true })
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  useData.setState({ view: view(), rd: rdFrom({}), requests: state.records.map((r) => requestFrom(r)!) })
  return { sent, listOf: (id: string) => state.records.find((r) => r.id === id)?.list }
}

const q = (id: string, el: ParentNode = document) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const row = (id: string) => document.querySelector<HTMLElement>(`[data-testid="case-row"][data-case="${id}"]`)!
const selectedIds = () => [...document.querySelectorAll('[data-testid="case-row"][data-selected="true"]')].map((e) => e.getAttribute('data-case'))
const click = (el: Element, init: MouseEventInit = {}) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })))
const rightClick = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 80 })))
const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) => act(async () => void target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })))
const render = async (node: Parameters<Root['render']>[0]) => {
  if (!root) {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  }
  await act(async () => root!.render(node))
}
/** The promises of the window's answers that follow an action (a read of a day, a write) settled. */
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))
/** Types into a field the way a hand does (the value setter React does not track, then `input`). */
const typeInto = (el: HTMLInputElement, text: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
const labels = (menu: Element) => [...menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')].map((e) => e.querySelector('span.flex-1')?.textContent)

/** Five tasks in „Skrzynka” (a newest … e oldest, 30 min) and one in „Dziś”. */
const five = () => [task('a', 1), task('b', 2), task('c', 3), task('d', 4), task('e', 5), task('f', 6, { list: 'today' })]

describe('zaznaczanie spraw na stronie „Sprawy” (D527)', () => {
  it('klik zaznacza tylko wiersz i daje mu fokus; Ctrl+klik dokłada; Shift+klik dokłada zakres od kotwicy (A, C, Shift E → A, C, D, E); klik – tylko jeden', async () => {
    stub(five())
    await render(createElement(CasesPage))
    await click(row('a'))
    expect(selectedIds()).toEqual(['a'])
    expect(document.activeElement).toBe(row('a'))
    await click(row('c'), { ctrlKey: true })
    expect(selectedIds()).toEqual(['a', 'c'])
    await click(row('e'), { shiftKey: true })
    expect(selectedIds()).toEqual(['a', 'c', 'd', 'e'])
    // Four selected: the line over the lists – the count, the estimates together, the four pools of energy.
    expect(q('cases-selection')!.textContent).toMatch(/^Zaznaczone: 4 · 2 h · energia /)
    await click(row('b'))
    expect(selectedIds()).toEqual(['b'])
    expect(q('cases-selection')).toBeNull()
  })

  it('Ctrl+klik łączy sprawy z różnych list; Shift+klik w inną listę nie robi zakresu (jak zwykły klik)', async () => {
    stub(five())
    await render(createElement(CasesPage))
    await click(row('b'))
    await click(row('f'), { ctrlKey: true })
    expect(selectedIds()).toEqual(['b', 'f'])
    await click(row('d'), { shiftKey: true })
    expect(selectedIds()).toEqual(['d'])
  })

  it('Ctrl+A zaznacza jedną listę – tę z kotwicą; Shift+strzałki rozszerzają zakres; Esc czyści zaznaczenie', async () => {
    stub(five())
    await render(createElement(CasesPage))
    await click(row('b'))
    await key(document.body, 'a', { code: 'KeyA', ctrlKey: true })
    expect(selectedIds()).toEqual(['a', 'b', 'c', 'd', 'e'])
    await click(row('b'))
    await key(row('b'), 'ArrowDown', { shiftKey: true })
    expect(selectedIds()).toEqual(['b', 'c'])
    await key(row('b'), 'Escape')
    expect(selectedIds()).toEqual([])
  })

  it('pole wiersza (tytuł, szacunek, przyciski) jest swoje – klik w nie nie zaznacza; sprawa zniknięta wypada z zaznaczenia', async () => {
    const s = stub(five())
    await render(createElement(CasesPage))
    await click(q('request-estimate', row('a'))!)
    expect(selectedIds()).toEqual([])
    await click(row('a'))
    await click(row('b'), { ctrlKey: true })
    expect(selectedIds()).toEqual(['a', 'b'])
    // „b” removed on another computer.
    await act(async () => void stub(five().filter((r) => r.id !== 'b')))
    await act(async () => void (await reloadData()))
    expect(selectedIds()).toEqual(['a'])
    expect(s.sent).toEqual([])
  })
})

describe('menu pod prawym przyciskiem i zmiana grupowa (D528, D529)', () => {
  const selectThree = async () => {
    await click(row('a'))
    await click(row('b'), { ctrlKey: true })
    await click(row('c'), { ctrlKey: true })
  }

  it('prawy przycisk na zaznaczonej – „Zmień 3 sprawy”; na niezaznaczonej – zaznacza tylko ją; w polu tekstowym – nic (systemowe menu pola)', async () => {
    stub(five())
    await render(createElement(CasesPage))
    await selectThree()
    await rightClick(row('b'))
    const menu = q('context-menu')!
    expect(menu.getAttribute('aria-label')).toBe('Zmień 3 sprawy')
    expect(selectedIds()).toEqual(['a', 'b', 'c'])
    expect(labels(menu)).toEqual(['Przenieś na listę', 'Kategoria', 'Zrobione', 'Zaplanuj…', 'Usuń'])
    await key(menu, 'Escape')
    expect(q('context-menu')).toBeNull()
    await rightClick(row('e'))
    expect(selectedIds()).toEqual(['e'])
    expect(q('context-menu')!.getAttribute('aria-label')).toBe('Zmień 1 sprawa')
    await key(q('context-menu')!, 'Escape')
    const field = q('case-title', row('a'))!
    await rightClick(field)
    expect(q('context-menu')).toBeNull()
  })

  it('„Przenieś na listę”: ✓ przy liście, na której są wszystkie, „—” przy tej, na której jest część; 3 sprawy ze Skrzynki → „Dziś” i „Cofnij” → Skrzynka', async () => {
    const s = stub(five())
    await render(createElement(CasesPage))
    await selectThree()
    await rightClick(row('a'))
    await click(q('cases-menu-list')!)
    const lists = q('cases-menu-list-menu')!
    expect(labels(lists)).toEqual(['Skrzynka', 'Dziś', 'W tym tygodniu', 'Kiedyś / Może'])
    const inbox = q('cases-menu-list-inbox')!
    expect(inbox.getAttribute('aria-checked')).toBe('true')
    expect(inbox.getAttribute('aria-disabled')).toBe('true')
    await click(q('cases-menu-list-today')!)
    expect(q('context-menu')).toBeNull()
    expect(s.sent).toHaveLength(1)
    expect(['a', 'b', 'c'].map(s.listOf)).toEqual(['today', 'today', 'today'])
    const line = q('group-line-cases')!
    expect(line.textContent).toBe('Przeniesiono 3 sprawy' + 'Cofnij')
    await click(q('group-line-cases-undo')!)
    expect(['a', 'b', 'c'].map(s.listOf)).toEqual(['inbox', 'inbox', 'inbox'])
    expect(q('group-line-cases')).toBeNull()
    // Part of the selection already on the list: „—”, and that one is left out with its reason.
    await click(row('a'))
    await click(row('f'), { ctrlKey: true })
    await rightClick(row('a'))
    await click(q('cases-menu-list')!)
    expect(q('cases-menu-list-today')!.getAttribute('aria-checked')).toBe('mixed')
    await click(q('cases-menu-list-today')!)
    expect(q('group-line-cases')!.textContent).toContain('Przeniesiono 1 sprawa · pominięto 1: już tam jest')
  })

  it('kategoria: tylko zadania – prośba pominięta z powodem; same prośby – pozycja wyłączona z powodem; szacunek z pola „1:30”', async () => {
    const req = newRequest('r1', Date.now() - 9000, { person: null, estimateMin: 15, note: 'mama' })
    const s = stub([task('a', 1), task('b', 2), req])
    await render(createElement(CasesPage))
    await click(row('a'))
    await click(row('r1'), { ctrlKey: true })
    await rightClick(row('a'))
    await click(q('cases-menu-category')!)
    // The subcategories are listed by the category of the tree: open its group, then pick.
    for (const g of document.querySelectorAll<HTMLElement>('[data-testid^="cases-menu-group-"]')) {
      if (q('cases-menu-category-nauka')) break
      await click(g)
    }
    await click(q('cases-menu-category-nauka')!)
    expect(q('group-line-cases')!.textContent).toContain('Zmieniono 1 sprawa · pominięto 1: prośba')
    expect(s.sent[0]!.map((e) => e.rel)).toEqual([rel('a')])
    // Only requests: the item is disabled with the reason.
    await click(row('r1'))
    await rightClick(row('r1'))
    expect(q('cases-menu-category')!.getAttribute('aria-disabled')).toBe('true')
    expect(q('cases-menu-category')!.getAttribute('title')).toMatch(/Prośba nie ma kategorii/)
    await key(q('context-menu')!, 'Escape')
    // „Szacunek”: a field in the menu; 1:30 → 90 min for both, a value out of the range is refused in the menu.
    await click(row('a'))
    await click(row('b'), { ctrlKey: true })
    await rightClick(row('a'))
    const field = q('cases-menu-estimate') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '9:00')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await key(field, 'Enter')
    expect(q('context-menu')).not.toBeNull()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, '1:30')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await key(field, 'Enter')
    expect(q('context-menu')).toBeNull()
    const last = s.sent.at(-1)!
    expect(last.map((e) => e.edits.find((x) => x.path.join('.') === 'estimateMin')!.value)).toEqual([90, 90])
    expect(q('group-line-cases')!.textContent).toContain('Zmieniono 2 sprawy')
  })

  it('„Zrobione” albo „Przywróć” – ta, która ma sens; obie przy mieszanym zaznaczeniu', () => {
    const open = caseItems([task('a', 1)].map((r) => requestFrom(r)!), TODAY, () => undefined)
    const done = caseItems([task('d', 2, { list: 'done' })].map((r) => requestFrom(r)!), TODAY, () => undefined)
    const on = { list: () => undefined, category: () => undefined, estimate: () => undefined, done: () => undefined, restore: () => undefined, plan: () => undefined, remove: () => undefined }
    const names = (items: typeof open) => casesMenu(items, [], on).flatMap((e) => (e.kind === 'separator' || e.kind === 'field' ? [] : [e.label]))
    expect(names(open)).toEqual(['Przenieś na listę', 'Kategoria', 'Zrobione', 'Zaplanuj…', 'Usuń'])
    expect(names(done)).toEqual(['Przenieś na listę', 'Kategoria', 'Przywróć', 'Zaplanuj…', 'Usuń'])
    expect(names([...open, ...done])).toEqual(['Przenieś na listę', 'Kategoria', 'Zrobione', 'Przywróć', 'Zaplanuj…', 'Usuń'])
    const planItem = casesMenu(done, [], on).find((e) => e.kind !== 'separator' && e.kind !== 'field' && e.label === 'Zaplanuj…')
    expect(planItem).toMatchObject({ disabled: expect.stringContaining('Zrobione') })
  })

  it('„Zaplanuj…” 3 spraw (30, 15, 30 min) od 14:00 – „Od której?”, Enter w godzinie; bloki 14:00, 14:30, 14:45 jedną zmianą dnia; „Zaplanowano 3 sprawy · Cofnij”', async () => {
    const s = stub([task('a', 1, { estimateMin: 30 }), task('b', 2, { estimateMin: 15 }), task('c', 3, { estimateMin: 30 })], { [TODAY]: null })
    await render(createElement(CasesPage))
    await click(row('a'))
    await click(row('b'), { ctrlKey: true })
    await click(row('c'), { ctrlKey: true })
    await rightClick(row('b'))
    await click(q('cases-menu-plan')!)
    await settle()
    const dialog = q('plan-group')!
    expect(dialog.textContent).toContain('Od której?')
    expect((q('plan-group-date') as HTMLInputElement).value).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
    const start = q('plan-group-start') as HTMLInputElement
    // The proposal is the beginning of the nearest free place (the field is filled once the day is read).
    expect(start.value).toMatch(/^\d{1,2}:\d{2}( \+1)?$/)
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(start, '14:00')
      start.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => start.focus())
    await key(start, 'Enter')
    await settle()
    expect(q('plan-group')).toBeNull()
    expect(s.sent).toHaveLength(1)
    expect(s.sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(TODAY), rel('a'), rel('b'), rel('c')].sort())
    const dayEdit = s.sent[0]!.find((e) => e.rel === paths.day(TODAY))!
    // The day's file is made whole by this one change: the three blocks one after another, each of its sprawa.
    const blocks = dayEdit.edits.find((e) => e.path.join('.') === 'blocks')!.value as Array<{ startMin: number; task: string; durationMin: number }>
    expect(blocks.map((b) => [b.task, b.startMin, b.durationMin])).toEqual([['a', 840, 30], ['b', 870, 15], ['c', 885, 30]])
    expect(q('group-line-cases')!.textContent).toBe('Zaplanowano 3 sprawyCofnij')
  })
})

describe('„Od której?” – dzień, godzina i przycisk (D530)', () => {
  const open = async () => {
    await click(row('a'))
    await click(row('b'), { ctrlKey: true })
    await rightClick(row('a'))
    await click(q('cases-menu-plan')!)
    await settle()
  }

  it('dzień wpisany i klik „Zaplanuj” bez Entera planuje na ten dzień – wpisana godzina zostaje, klik nie ginie przy czekaniu na dzień', async () => {
    const tomorrow = addDays(TODAY, 1)
    const s = stub([task('a', 1), task('b', 2)], { [TODAY]: null })
    await render(createElement(CasesPage))
    await open()
    const start = q('plan-group-start') as HTMLInputElement
    await act(async () => start.focus())
    await typeInto(start, '9:00')
    await act(async () => start.blur())
    const date = q('plan-group-date') as HTMLInputElement
    await act(async () => date.focus())
    await typeInto(date, plDate(tomorrow))
    // The press on the button leaves the field first (the day is taken, the new day is read), then comes the click.
    // Both in one go: the day typed is taken and the click comes before the new day is read (the button must not have gone away meanwhile).
    act(() => {
      date.blur()
    })
    act(() => {
      q('plan-group-save')!.click()
    })
    await settle()
    await settle()
    expect(q('plan-group')).toBeNull()
    expect(s.sent[0]!.map((e) => e.rel).sort()).toEqual([paths.day(tomorrow), rel('a'), rel('b')].sort())
    const blocks = s.sent[0]!.find((e) => e.rel === paths.day(tomorrow))!.edits.find((e) => e.path.join('.') === 'blocks')!.value as Array<{ startMin: number; task: string }>
    expect(blocks.map((b) => [b.task, b.startMin])).toEqual([['a', 540], ['b', 570]])
  })

  it('Enter w godzinie ma te same osłony co przycisk: sama zrobiona lista – nic nie planuje, okno zostaje, przycisk wyłączony', async () => {
    const s = stub([task('d', 1, { list: 'done' })], { [TODAY]: null })
    const items = caseItems(s.sent.length ? [] : [requestFrom(task('d', 1, { list: 'done' }))!], TODAY, () => undefined)
    await render(createElement(PlanGroupDialog, { items, today: TODAY, view: 'cases', onClose: () => undefined }))
    await settle()
    expect((q('plan-group-save') as HTMLButtonElement).disabled).toBe(true)
    const start = q('plan-group-start') as HTMLInputElement
    await act(async () => start.focus())
    await key(start, 'Enter')
    await settle()
    expect(q('plan-group')).not.toBeNull()
    expect(q('group-line-cases')).toBeNull()
    expect(s.sent).toEqual([])
  })

  it('godzina odrzucona przez pole (nie godzina) – Enter nic nie planuje, komunikat pola zostaje', async () => {
    const s = stub([task('a', 1), task('b', 2)], { [TODAY]: null })
    await render(createElement(CasesPage))
    await open()
    const start = q('plan-group-start') as HTMLInputElement
    await act(async () => start.focus())
    await typeInto(start, 'jutro rano')
    await key(start, 'Enter')
    await settle()
    expect(q('plan-group')).not.toBeNull()
    expect(s.sent).toEqual([])
  })
})

describe('panel przy osi: klik po przeciągnięciu nie zaznacza (UX17, wspólny `started` z Macierzą)', () => {
  it('gest, który się zaczął (`started`), nie jest kliknięciem w chip – także gdy wrócił na start; bez gestu klik zaznacza', async () => {
    stub(five())
    const started = { current: true }
    await render(createElement(CasesPanel, { drag: null, grab: () => undefined, started, onPlan: () => undefined }))
    const chip = document.querySelector<HTMLElement>('[data-testid="case-chip"][data-case="a"]')!
    await click(chip)
    expect(chip.getAttribute('data-selected')).toBeNull()
    started.current = false
    await click(chip)
    expect(chip.getAttribute('data-selected')).toBe('true')
  })
})

describe('klik w otwarty formularz wiersza i zmiana widoku (D527)', () => {
  it('klik w puste miejsce rozwiniętego formularza („Zaplanuj”) nie zmienia zaznaczenia', async () => {
    stub(five(), { [TODAY]: null })
    await render(createElement(CasesPage))
    await click(row('a'))
    await click(row('b'), { ctrlKey: true })
    await click(q('case-plan-open', row('a'))!)
    await settle()
    const form = q('case-plan-form', row('a'))!
    await click(form)
    await click(form.querySelector('span')!)
    expect(selectedIds()).toEqual(['a', 'b'])
  })

  it('zmiana widoku (Macierz i z powrotem) zeruje zaznaczenie i listę kotwicy – Ctrl+A po powrocie nic nie zaznacza', async () => {
    stub(five())
    await render(createElement(CasesPage))
    await click(row('b'))
    expect(selectedIds()).toEqual(['b'])
    await click(q('cases-view-matrix')!)
    await click(q('cases-view-lists')!)
    expect(selectedIds()).toEqual([])
    await key(document.body, 'a', { code: 'KeyA', ctrlKey: true })
    expect(selectedIds()).toEqual([])
  })
})

describe('Del na zaznaczeniu (D528)', () => {
  it('fokus na wierszu zaznaczenia ≥ 2 – „Usunąć 3 sprawy?”; na wierszu spoza zaznaczenia – jedna sprawa jak dotąd; jedna zaznaczona – jak dotąd', async () => {
    stub(five())
    await render(createElement(CasesPage))
    await click(row('a'))
    expect(deleteTargetOf(row('a'))!.title).toBe('Usunąć „zadanie a”?')
    await click(row('b'), { ctrlKey: true })
    await click(row('c'), { ctrlKey: true })
    expect(deleteTargetOf(row('b'))).toMatchObject({ title: 'Usunąć 3 sprawy?', yes: 'Usuń' })
    expect(deleteTargetOf(row('e'))!.title).toBe('Usunąć „zadanie e”?')
    // With the focus on no row the selection answers.
    expect(deleteTargetOf(document.body)).toMatchObject({ title: 'Usunąć 3 sprawy?' })
  })

  it('potwierdzone usuwa wszystkie w jednej zmianie, „Usunięto 3 sprawy · Cofnij” przywraca', async () => {
    const s = stub(five())
    await render(createElement(CasesPage))
    await click(row('a'))
    await click(row('b'), { ctrlKey: true })
    await click(row('c'), { ctrlKey: true })
    const target = deleteTargetOf(row('b'))!
    await act(async () => void (await target.run()))
    expect(s.sent[0]!.map((e) => e.rel).sort()).toEqual([rel('a'), rel('b'), rel('c')])
    expect(s.sent[0]!.every((e) => e.remove)).toBe(true)
    expect(q('group-line-cases')!.textContent).toBe('Usunięto 3 sprawyCofnij')
    await click(q('group-line-cases-undo')!)
    expect(s.sent[1]!.every((e) => e.create)).toBe(true)
    expect(['a', 'b', 'c'].map(s.listOf)).toEqual(['inbox', 'inbox', 'inbox'])
  })
})

describe('panel „Sprawy” przy osi „Dziś” (D527, D530)', () => {
  // What the page of the axis hears of the panel's selection (`onSelected`).
  let heard: readonly CaseItem[] = []
  const droppedGroup = (id: string) => carriedBy(heard, id)
  const panel = async (drag: Parameters<typeof CasesPanel>[0]['drag'] = null) => {
    await render(createElement(CasesPanel, { drag, grab: () => undefined, onPlan: () => undefined, onSelected: (s) => void (heard = s) }))
  }
  const chip = (id: string) => document.querySelector<HTMLElement>(`[data-testid="case-chip"][data-case="${id}"]`)!

  it('własne zaznaczenie panelu: klik, Ctrl+klik, napis nad listami; Ctrl+A tylko z fokusem w panelu; przeciągnięcie zaznaczonej niesie grupę', async () => {
    stub([task('a', 1, { list: 'today' }), task('b', 2, { list: 'today' }), task('c', 3)])
    await panel()
    await click(chip('a'))
    await click(chip('c'), { ctrlKey: true })
    // In the order the panel shows them: „Skrzynka” (c) before „Dziś” (a).
    expect([...document.querySelectorAll('[data-testid="case-chip"][data-selected="true"]')].map((e) => e.getAttribute('data-case'))).toEqual(['c', 'a'])
    expect(q('cases-panel-selection')!.textContent).toMatch(/^Zaznaczone: 2 · 1 h · energia /)
    expect(droppedGroup('a')!.map((x) => x.record.id)).toEqual(['c', 'a'])
    expect(droppedGroup('c')!.map((x) => x.record.id)).toEqual(['c', 'a'])
    // A sprawa outside the selection is dragged alone, as before.
    expect(droppedGroup('b')).toBeNull()
    await key(chip('a'), 'Escape')
    expect(droppedGroup('a')).toBeNull()
    // Ctrl+A with the focus outside the panel is not its – the axis' own selection takes it there.
    await act(async () => void (document.activeElement as HTMLElement).blur())
    await key(document.body, 'a', { code: 'KeyA', ctrlKey: true })
    expect(document.querySelectorAll('[data-testid="case-chip"][data-selected="true"]')).toHaveLength(0)
    await click(chip('a'))
    await key(chip('a'), 'a', { code: 'KeyA', ctrlKey: true })
    expect(document.querySelectorAll('[data-testid="case-chip"][data-selected="true"]')).toHaveLength(2)
  })

  it('Del w panelu: jedna zaznaczona sprawa nie przejmuje Del (zaznaczony blok osi go zachowuje), dwie i więcej – „Usunąć 2 sprawy?”', async () => {
    stub([task('a', 1, { list: 'today' }), task('b', 2, { list: 'today' }), task('c', 3)])
    const Host = () => {
      // The block selected on the axis (its panel open): it answers Del when the focus is on no marked element.
      useDeleteSelected({ title: 'Usunąć „blok”?', yes: 'Usuń', run: () => undefined })
      return createElement(CasesPanel, { drag: null, grab: () => undefined, onPlan: () => undefined })
    }
    await render(createElement(Host))
    await click(chip('a'))
    expect(deleteTargetOf(chip('a'))).toMatchObject({ title: 'Usunąć „blok”?' })
    await click(chip('b'), { ctrlKey: true })
    expect(deleteTargetOf(chip('b'))).toMatchObject({ title: 'Usunąć 2 sprawy?' })
    // A sprawa outside the selection is not the group's: the block of the axis answers.
    expect(deleteTargetOf(chip('c'))).toMatchObject({ title: 'Usunąć „blok”?' })
  })

  it('duch przeciągania mówi „3 sprawy” (z Ctrl – „+ 3 sprawy”), dla jednej – jej tytuł', async () => {
    stub([task('a', 1, { list: 'today' }), task('b', 2, { list: 'today' }), task('c', 3)])
    await panel()
    await click(chip('a'))
    await click(chip('b'), { ctrlKey: true })
    await click(chip('c'), { ctrlKey: true })
    await panel({ id: 'b', x: 10, y: 10, target: 600, copy: false })
    expect(q('case-drag')!.textContent).toBe('3 sprawy')
    await panel({ id: 'b', x: 10, y: 10, target: 600, copy: true })
    expect(q('case-drag')!.textContent).toBe('+ 3 sprawy')
  })
})
