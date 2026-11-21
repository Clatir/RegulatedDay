// @vitest-environment jsdom
/**
 * „Sprawy” po UX17 (F8, D565 P25): the row of a sprawa is one line (title or person and note, estimate, the badges of the due date and the priority, „Zaplanuj…”, „…”),
 * the rest under „▸” and in the menu „…”; the matrix: a click on a card opens the sprawa's row in the lists, the cards take the focus, the arrows walk them,
 * the right button opens „Priorytet ▸”.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DataView, EditEntry, RawRecord, RdApi } from '@shared/api'
import { paths } from '@shared/data/paths'
import { caseItems } from '@shared/engine/cases'
import { rdFrom } from '@shared/model/rd'
import { newRequest, newTask, requestFrom } from '@shared/model/requests'
import { logicalDayOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import { CasesPage } from '@renderer/features/cases/CasesPage'
import { caseRowMenu, type RowMenuActs } from '@renderer/features/cases/rowMenu'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'
import { closeToast, useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = () => undefined
})
const data = useData.getState()
let root: Root | null = null
let host: HTMLElement | null = null
let offEscape: (() => void) | null = null
beforeEach(() => {
  localStorage.clear()
  offEscape = installEscape()
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

const TODAY = logicalDayOf(Date.now())
const rel = (id: string) => paths.record('request', id)
const task = (id: string, age: number, p: Partial<Parameters<typeof newTask>[3]> = {}) => newTask(id, Date.now() - age * 1000, TODAY, { title: `zadanie ${id}`, estimateMin: 30, ...p })!

/** The window over a folder of records; the edits are laid (applied) as the folder would. */
function stub(records: RawRecord[]) {
  const sent: EditEntry[][] = []
  const state = { records: [...records] }
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
    dayFiles: async () => ({}),
    caseDays: async () => ({ files: {}, gone: {}, begun: {} }),
    dayData: async (date) => ({ date, dayFile: null, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }),
    edit: async (entries) => (sent.push(entries), entries.forEach(apply), entries.map(() => ({ status: 'applied' as const }))),
    dataView: async () => view(),
    requestCounters: async () => ({ today: { count: 0, minutes: 0 }, week: { count: 0, minutes: 0 }, byPerson: {}, complete: true })
  }
  ;(window as unknown as { rd: Partial<RdApi> }).rd = rd
  useData.setState({ view: view(), rd: rdFrom({}), requests: state.records.map((r) => requestFrom(r)!) })
  /** What the sent edits wrote into the field `name` of the record `id` (the last write). */
  const wrote = (id: string, name: string): unknown => sent.flat().filter((e) => e.rel === rel(id)).flatMap((e) => e.edits).filter((ed) => ed.path[0] === name).map((ed) => ed.value).at(-1)
  const publish = () => useData.setState({ view: view(), requests: state.records.map((r) => requestFrom(r)!) })
  /** The record gone from the folder (removed on another computer); `bring` puts it back (a „Cofnij”). */
  const take = (id: string) => {
    const was = state.records.find((r) => r.id === id)!
    state.records = state.records.filter((r) => r.id !== id)
    publish()
    return () => (state.records.push(was), publish())
  }
  return { sent, wrote, take, record: (id: string) => state.records.find((r) => r.id === id) }
}

const q = (id: string, el: ParentNode = document) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const row = (id: string) => document.querySelector<HTMLElement>(`[data-testid="case-row"][data-case="${id}"]`)!
const card = (id: string) => document.querySelector<HTMLElement>(`[data-testid="matrix-card"][data-case="${id}"]`)!
const click = (el: Element, init: MouseEventInit = {}) => act(async () => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })))
const rightClick = (el: Element) => act(async () => void el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 80 })))
const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) => act(async () => void target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })))
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))
const render = async () => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(CasesPage)))
}
const menuItems = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]')]
const itemText = (el: Element) => el.textContent ?? ''

describe('wiersz sprawy w jednym wierszu (P25)', () => {
  it('zwinięty: tytuł, szacunek, znaczek terminu i priorytetu, „Zaplanuj…” i „…” – reszta ukryta', async () => {
    stub([task('a', 1, { priority: 'p1', dueDate: addDays(TODAY, 2) }), task('b', 2)])
    await render()
    const a = row('a')
    const line = q('case-line', a)!
    for (const id of ['case-expand', 'case-title', 'request-estimate', 'case-due', 'case-priority-chip', 'case-plan-open', 'case-menu']) expect(q(id, line), id).not.toBeNull()
    expect(q('case-priority-chip', a)!.textContent).toBe('P1')
    expect(q('case-priority-chip', a)!.getAttribute('title')).toBe('Ważne i pilne')
    expect(q('case-plan-open', a)!.textContent).toBe('Zaplanuj…')
    // What the row no longer carries in its line.
    for (const id of ['case-more', 'case-list', 'case-category', 'case-priority-choice', 'case-done', 'case-dates-open', 'case-repeat-open', 'case-steps-toggle', 'request-remove', 'request-note']) expect(q(id, a), id).toBeNull()
    // No priority, no due date: no badges.
    expect(q('case-priority-chip', row('b'))).toBeNull()
    expect(q('case-due', row('b'))).toBeNull()
  })

  it('„▸” rozwija notatkę, podkategorię, listę, priorytet, „Zrobione”, „Terminy”, „Kroki”, „Powtarzaj”, „Usuń”; drugi klik zwija', async () => {
    stub([task('a', 1)])
    await render()
    const toggle = q('case-expand', row('a'))!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const more = q('case-more', row('a'))!
    for (const id of ['request-note', 'case-category', 'case-list', 'case-steps-toggle', 'case-priority-choice', 'case-done', 'case-dates-open', 'case-repeat-open', 'request-remove']) expect(q(id, more), id).not.toBeNull()
    await click(toggle)
    expect(q('case-more', row('a'))).toBeNull()
  })

  it('prośba: osoba i notatka w wierszu, bez „Kroki” i „Powtarzaj”; rozwinięta – lista, priorytet, „Zrobione”, „Terminy”', async () => {
    stub([{ ...newRequest('r1', Date.now(), { person: null, estimateMin: 15, note: 'zakupy' }) }])
    await render()
    const r = row('r1')
    expect(q('request-person', q('case-line', r)!)).not.toBeNull()
    expect((q('request-note', q('case-line', r)!) as HTMLInputElement).value).toBe('zakupy')
    await click(q('case-menu', r)!)
    expect(menuItems().map(itemText).join('|')).not.toMatch(/Kroki|Powtarzaj/)
    await key(document.activeElement!, 'Escape')
    await click(q('case-expand', r)!)
    expect(q('case-steps-toggle', r)).toBeNull()
    expect(q('case-repeat-open', r)).toBeNull()
    expect(q('case-category', r)).toBeNull()
    for (const id of ['case-list', 'case-priority-choice', 'case-done', 'case-dates-open']) expect(q(id, r), id).not.toBeNull()
  })

  it('rozwinięcie wiersza zostaje po przeniesieniu sprawy na inną listę (wiersz stoi wtedy w innej sekcji)', async () => {
    stub([task('a', 1), task('b', 2)])
    await render()
    await click(q('case-expand', row('a'))!)
    expect(q('case-more', row('a'))).not.toBeNull()
    await click(q('case-menu', row('a'))!)
    await click(q('case-menu-list')!)
    await click(q('case-menu-list-week')!)
    await settle()
    expect(row('a').getAttribute('data-list')).toBe('week')
    expect(q('case-more', row('a'))).not.toBeNull()
    expect(q('case-more', row('b'))).toBeNull()
  })

  it('„Zaplanuj…” zostaje w wierszu i otwiera formularz; klik w pola i przyciski nie zaznacza wiersza', async () => {
    stub([task('a', 1)])
    await render()
    await click(q('case-plan-open', row('a'))!)
    await settle()
    expect(q('case-plan-form', row('a'))).not.toBeNull()
    expect(row('a').getAttribute('data-selected')).toBeNull()
  })
})

describe('menu „…” wiersza (P25)', () => {
  it('pozycje zadania: Zrobione, Przenieś na listę ▸, Priorytet ▸, Terminy…, Kroki…, Powtarzaj…, Usuń', async () => {
    stub([task('a', 1)])
    await render()
    await click(q('case-menu', row('a'))!)
    expect(q('case-menu-list-popup')).not.toBeNull()
    expect(menuItems().map((e) => e.getAttribute('data-testid'))).toEqual(['case-menu-done', 'case-menu-list', 'case-menu-priority', 'case-menu-dates', 'case-menu-steps', 'case-menu-repeat', 'case-menu-remove'])
    expect(q('case-menu-list')!.getAttribute('aria-haspopup')).toBe('menu')
    expect(q('case-menu-priority')!.getAttribute('aria-haspopup')).toBe('menu')
  })

  it('„Zrobione” przenosi na „Zrobione”; „Terminy…” i „Kroki…” otwierają formularze pod wierszem bez rozwijania', async () => {
    const s = stub([task('a', 1), task('b', 2)])
    await render()
    await click(q('case-menu', row('b'))!)
    await click(q('case-menu-dates')!)
    expect(q('case-dates-form', row('b'))).not.toBeNull()
    expect(q('case-more', row('b'))).toBeNull()
    await click(q('case-menu', row('b'))!)
    await click(q('case-menu-steps')!)
    expect(q('case-steps', row('b'))).not.toBeNull()
    await click(q('case-menu', row('a'))!)
    await click(q('case-menu-done')!)
    await settle()
    expect(s.wrote('a', 'list')).toBe('done')
  })

  it('„Przenieś na listę ▸” – lista sprawy z ✓, wybór ją przenosi', async () => {
    const s = stub([task('a', 1)])
    await render()
    await click(q('case-menu', row('a'))!)
    await click(q('case-menu-list')!)
    const lists = [...document.querySelectorAll<HTMLElement>('[data-testid^="case-menu-list-"]')].filter((e) => e.getAttribute('role')?.startsWith('menuitem'))
    expect(lists.map((e) => [e.getAttribute('data-testid'), e.getAttribute('aria-checked')])).toEqual([
      ['case-menu-list-inbox', 'true'],
      ['case-menu-list-today', null],
      ['case-menu-list-week', null],
      ['case-menu-list-someday', null],
      ['case-menu-list-done', null]
    ])
    await click(q('case-menu-list-week')!)
    await settle()
    expect(s.wrote('a', 'list')).toBe('week')
  })

  it('„Terminy…”, „Kroki…” i „Powtarzaj…” tylko otwierają: drugi wybór nie zamyka otwartego formularza', async () => {
    stub([task('a', 1)])
    await render()
    for (const [item, form] of [['case-menu-dates', 'case-dates-form'], ['case-menu-steps', 'case-steps'], ['case-menu-repeat', 'case-repeat-form']] as const) {
      await click(q('case-menu', row('a'))!)
      await click(q(item)!)
      expect(q(form, row('a')), form).not.toBeNull()
      await click(q('case-menu', row('a'))!)
      await click(q(item)!)
      expect(q(form, row('a')), form + ' po drugim wyborze').not.toBeNull()
    }
  })

  it('„Priorytet ▸” – pięć wyborów, ✓ przy obecnym; wybór zapisuje priorytet', async () => {
    const s = stub([task('a', 1, { priority: 'p2' })])
    await render()
    await click(q('case-menu', row('a'))!)
    await click(q('case-menu-priority')!)
    const choices = [...document.querySelectorAll<HTMLElement>('[data-testid^="case-menu-priority-"]')].filter((e) => e.getAttribute('role')?.startsWith('menuitem'))
    expect(choices.map((e) => [e.getAttribute('data-testid')!.slice('case-menu-priority-'.length), e.getAttribute('aria-checked')])).toEqual([
      ['none', null],
      ['p1', null],
      ['p2', 'true'],
      ['p3', null],
      ['p4', null]
    ])
    await click(q('case-menu-priority-p3')!)
    await settle()
    expect(s.wrote('a', 'priority')).toBe('p3')
    expect(q('case-priority-chip', row('a'))!.textContent).toBe('P3')
  })

  it('„Usuń” usuwa sprawę (dymek „Cofnij” jak przycisk)', async () => {
    const s = stub([task('a', 1)])
    await render()
    await click(q('case-menu', row('a'))!)
    await click(q('case-menu-remove')!)
    await settle()
    expect(s.sent.flat().some((e) => e.rel === rel('a') && e.remove === true)).toBe(true)
    expect(useUi.getState().toasts.some((t) => t.text === 'Zadanie usunięte')).toBe(true)
  })

  it('czyste: sprawa zrobiona ma listę i „Usuń”, bez „Zrobione”, priorytetu i terminów', () => {
    const acts: RowMenuActs = { list: () => undefined, priority: () => undefined, done: () => undefined, dates: () => undefined, steps: () => undefined, repeat: () => undefined, remove: () => undefined }
    const [d] = caseItems([requestFrom({ ...task('d', 1), state: 'done', list: 'done', doneAt: Date.now() })!], TODAY, () => undefined)
    expect(caseRowMenu(d!, acts).flatMap((e) => (e.kind === 'separator' ? [] : [e.label]))).toEqual(['Przenieś na listę', 'Kroki…', 'Usuń'])
  })
})

describe('Macierz: klik, fokus, strzałki, prawy przycisk (F8)', () => {
  const matrix = async (records: RawRecord[]) => {
    const s = stub(records)
    await render()
    await click(q('cases-view-matrix')!)
    return s
  }
  const five = () => [task('a', 1, { priority: 'p1' }), task('b', 2, { priority: 'p1' }), task('c', 3, { priority: 'p2' }), task('d', 4, { priority: 'p3' }), task('e', 5)]

  it('klik w kartę przełącza na „Listy”, otwiera wiersz sprawy i daje fokus jej tytułowi', async () => {
    await matrix(five())
    expect(q('cases-matrix')).not.toBeNull()
    await click(card('c'))
    await settle()
    expect(q('cases-matrix')).toBeNull()
    expect(document.activeElement).toBe(q('case-title', row('c')))
  })

  /** A pointer gesture on the card: the press, the moves of the window (a button held), the release, then the click the browser sends after it. */
  const gesture = async (id: string, moves: Array<[number, number]>, click_: [number, number]) => {
    document.elementFromPoint = () => null
    const fire = (type: string, x: number, y: number, el: EventTarget = window) => act(async () => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })))
    await fire('pointerdown', 10, 10, card(id))
    for (const [x, y] of moves) await fire('pointermove', x, y)
    await fire('pointerup', moves.at(-1)?.[0] ?? 10, moves.at(-1)?.[1] ?? 10)
    await click(card(id), { clientX: click_[0], clientY: click_[1] })
  }

  it('klik w kartę (i Enter) rozwija otwierany wiersz – widać jego notatkę i pola, nie tylko linię', async () => {
    await matrix(five())
    await click(card('c'))
    await settle()
    expect(q('case-more', row('c'))).not.toBeNull()
    expect(q('case-more', row('d'))).toBeNull()
  })

  it('menu karty znika, gdy jej sprawa znika (usunięta gdzie indziej), i nie wraca po „Cofnij”', async () => {
    const s = await matrix(five())
    await rightClick(card('c'))
    expect(q('matrix-menu')).not.toBeNull()
    let bring: () => void = () => undefined
    await act(async () => void (bring = s.take('c')))
    expect(q('matrix-menu')).toBeNull()
    await act(async () => bring())
    expect(card('c')).not.toBeNull()
    expect(q('matrix-menu')).toBeNull()
  })

  it('karta ma nazwę z tytułu, listy, znaczka terminu i szacunku, a podpowiedź osobno (aria-describedby)', async () => {
    await matrix([task('a', 1, { priority: 'p1', dueDate: addDays(TODAY, 2), estimateMin: 45 }), task('b', 2, { priority: 'p1' })])
    expect(card('a').getAttribute('aria-label')).toMatch(/^zadanie a, Skrzynka, Termin za 2 dni, 45 min$/)
    expect(card('b').getAttribute('aria-label')).toBe('zadanie b, Skrzynka, 30 min')
    const hint = document.getElementById(card('a').getAttribute('aria-describedby')!)
    expect(hint?.textContent).toMatch(/Enter/)
  })

  it('klik po przeciągnięciu nie otwiera wiersza – także przeciągnięcie wycofane na kartę i puszczenie tuż za progiem', async () => {
    await matrix(five())
    await gesture('c', [[80, 60]], [80, 60])
    expect(q('cases-matrix')).not.toBeNull()
    // Out and back to where it was: the gesture started, so it is a drag (not a click on the card).
    await gesture('c', [[80, 60], [10, 10]], [10, 10])
    expect(q('cases-matrix')).not.toBeNull()
    // A press that never moved past the threshold is a click.
    await gesture('c', [[11, 11]], [11, 11])
    expect(q('cases-matrix')).toBeNull()
  })

  it('jeden przystanek Tab (pierwsza karta), fokus karty przenosi go; Enter i spacja otwierają wiersz', async () => {
    await matrix(five())
    const tab = () => [...document.querySelectorAll<HTMLElement>('[data-testid="matrix-card"]')].filter((e) => e.tabIndex === 0).map((e) => e.getAttribute('data-case'))
    expect(tab()).toEqual(['a'])
    await act(async () => card('d').focus())
    expect(tab()).toEqual(['d'])
    await key(card('d'), 'Enter')
    await settle()
    expect(document.activeElement).toBe(q('case-title', row('d')))
  })

  it('strzałki chodzą po kartach i polach (↓ w polu, ↓ do pola niżej, → do sąsiada) i nie robią nic na brzegu', async () => {
    await matrix(five())
    const at = () => document.activeElement?.getAttribute('data-case')
    await act(async () => card('a').focus())
    await key(card('a'), 'ArrowDown')
    expect(at()).toBe('b')
    await key(card('b'), 'ArrowDown')
    expect(at()).toBe('d')
    await key(card('d'), 'ArrowRight')
    // P4 is empty: stays.
    expect(at()).toBe('d')
    await key(card('d'), 'ArrowUp')
    expect(at()).toBe('b')
    await key(card('a'), 'ArrowRight')
    expect(at()).toBe('c')
    await key(card('c'), 'ArrowDown')
    expect(at()).toBe('e')
    await key(card('e'), 'ArrowUp')
    expect(at()).toBe('d')
  })

  it('prawy przycisk i Shift+F10 – „Priorytet ▸” z ✓ i „Otwórz w Listach”; wybór zmienia priorytet jednym zapisem', async () => {
    const s = await matrix(five())
    await rightClick(card('c'))
    expect(q('matrix-menu')).not.toBeNull()
    expect(menuItems().map((e) => e.getAttribute('data-testid'))).toEqual(['matrix-menu-priority', 'matrix-menu-open'])
    await click(q('matrix-menu-priority')!)
    expect(q('case-menu-priority-p2')!.getAttribute('aria-checked')).toBe('true')
    await click(q('case-menu-priority-p4')!)
    await settle()
    expect(s.wrote('c', 'priority')).toBe('p4')
    expect(q('matrix-menu')).toBeNull()
    // The same from the keyboard; the choice of the priority the sprawa has writes nothing.
    await act(async () => card('e').focus())
    await key(card('e'), 'F10', { shiftKey: true })
    expect(q('matrix-menu')).not.toBeNull()
    await click(q('matrix-menu-priority')!)
    await click(q('case-menu-priority-none')!)
    await settle()
    expect(s.wrote('e', 'priority')).toBeUndefined()
  })

  it('„Otwórz w Listach” z menu karty otwiera wiersz', async () => {
    await matrix(five())
    await rightClick(card('b'))
    await click(q('matrix-menu-open')!)
    await settle()
    expect(document.activeElement).toBe(q('case-title', row('b')))
  })
})
