// @vitest-environment jsdom
/**
 * The line after a group change (D529, T1541): in the window, one for each view, 15 minutes by a slow (fake) clock, the next change of the
 * view replaces it, „Cofnij” runs the undo once, the line is gone after it and the undo's message goes to the corner of the window.
 */
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNDO_LINE_MS } from '@shared/widget'
import { ContextMenu } from '@renderer/components/ContextMenu'
import { GroupLine } from '@renderer/components/GroupLine'
import { clearGroupLine, showGroupLine, UNDO_FAILED_TEXT, useGroupLine, type GroupView } from '@renderer/store/groupLine'
import { useUi } from '@renderer/store/ui'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let host: HTMLDivElement
let root: Root
const VIEWS: GroupView[] = ['today', 'template', 'week', 'cases', 'calendar']

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  for (const v of VIEWS) clearGroupLine(v)
  useUi.setState({ toasts: [] })
  vi.useRealTimers()
})

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const show = (views: GroupView[] = ['week']) => act(() => root.render(createElement('div', null, ...views.map((v) => createElement(GroupLine, { key: v, view: v })))))
const press = (id: string) => act(async () => void q(id)!.click())
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

describe('linia zmiany grupowej', () => {
  it('pokazuje tekst i „Cofnij” w swoim widoku; inne widoki jej nie mają', () => {
    show(['week', 'cases'])
    expect(q('group-line-week')).toBeNull()
    act(() => void showGroupLine('week', { text: 'Zmieniono 4 bloki', undo: () => {} }))
    expect(q('group-line-week')!.textContent).toContain('Zmieniono 4 bloki')
    expect(q('group-line-week-undo')!.textContent).toBe('Cofnij')
    expect(q('group-line-cases')).toBeNull()
  })

  it('stoi 15 minut (wolny zegar), potem znika sama', async () => {
    show()
    act(() => void showGroupLine('week', { text: 'Zmieniono 2 bloki', undo: () => {} }))
    await advance(UNDO_LINE_MS - 1000)
    expect(q('group-line-week')).not.toBeNull()
    await advance(1000)
    expect(q('group-line-week')).toBeNull()
    expect(useGroupLine.getState().lines.week).toBeUndefined()
  })

  it('kolejna zmiana w tym widoku zastępuje linię i liczy swoje 15 minut od siebie; linia innego widoku zostaje', async () => {
    show(['week', 'cases'])
    act(() => void showGroupLine('week', { text: 'pierwsza', undo: () => {} }))
    act(() => void showGroupLine('cases', { text: 'sprawy', undo: () => {} }))
    await advance(5 * 60_000)
    act(() => void showGroupLine('week', { text: 'druga', undo: () => {} }))
    expect(q('group-line-week')!.textContent).toContain('druga')
    expect(q('group-line-week')!.textContent).not.toContain('pierwsza')
    // The first line's time is over – the second one's is not (it neither ends it nor is cut short by it).
    await advance(UNDO_LINE_MS - 5 * 60_000)
    expect(q('group-line-cases')).toBeNull()
    expect(q('group-line-week')).not.toBeNull()
    await advance(5 * 60_000)
    expect(q('group-line-week')).toBeNull()
  })

  it('„Cofnij” woła cofanie raz – drugi klik w trakcie nic nie robi; po nim linia znika', async () => {
    show()
    let finish: () => void = () => {}
    const undo = vi.fn(() => new Promise<void>((resolve) => void (finish = resolve)))
    act(() => void showGroupLine('week', { text: 'Zmieniono 3 bloki', undo }))
    await press('group-line-week-undo')
    expect(undo).toHaveBeenCalledTimes(1)
    expect((q('group-line-week-undo') as HTMLButtonElement).disabled).toBe(true)
    await press('group-line-week-undo')
    expect(undo).toHaveBeenCalledTimes(1)
    expect(q('group-line-week')).not.toBeNull()
    await act(async () => finish())
    expect(q('group-line-week')).toBeNull()
    expect(undo).toHaveBeenCalledTimes(1)
    expect(useUi.getState().toasts).toEqual([])
  })

  it('wynik cofania z komunikatem idzie do rogu okna („2 bloki zmienione od tego czasu – zostały”)', async () => {
    show()
    act(() => void showGroupLine('week', { text: 'Zmieniono 4 bloki', undo: () => '2 bloki zmienione od tego czasu – zostały' }))
    await press('group-line-week-undo')
    expect(q('group-line-week')).toBeNull()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['2 bloki zmienione od tego czasu – zostały'])
  })

  it('cofanie, które się nie udało, zostawia linię (można ponowić) i mówi o tym', async () => {
    show()
    const undo = vi.fn().mockRejectedValueOnce(new Error('zapis')).mockResolvedValue(undefined)
    act(() => void showGroupLine('week', { text: 'Zmieniono 4 bloki', undo }))
    await press('group-line-week-undo')
    expect(q('group-line-week')).not.toBeNull()
    expect((q('group-line-week-undo') as HTMLButtonElement).disabled).toBe(false)
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual([UNDO_FAILED_TEXT])
    await press('group-line-week-undo')
    expect(undo).toHaveBeenCalledTimes(2)
    expect(q('group-line-week')).toBeNull()
  })

  it('nowa zmiana w czasie cofania: linia nowej zostaje, cofanie starej jej nie zdejmuje', async () => {
    show()
    let finish: () => void = () => {}
    act(() => void showGroupLine('week', { text: 'stara', undo: () => new Promise<void>((resolve) => void (finish = resolve)) }))
    await press('group-line-week-undo')
    act(() => void showGroupLine('week', { text: 'nowa', undo: () => {} }))
    await act(async () => finish())
    expect(q('group-line-week')!.textContent).toContain('nowa')
  })

  it('linia przeżywa zmianę ekranu: po ponownym pokazaniu widoku jest do końca czasu', async () => {
    show()
    act(() => void showGroupLine('week', { text: 'Zmieniono 4 bloki', undo: () => {} }))
    act(() => root.render(createElement('div')))
    await advance(60_000)
    show()
    expect(q('group-line-week')).not.toBeNull()
  })
})

describe('poprawki po przeglądzie Z1', () => {
  it('licznik 15 min nie zdejmuje linii w trakcie cofania; po wyjątku linia zostaje z nowym terminem', async () => {
    show()
    let fail: (e: Error) => void = () => {}
    const undo = vi.fn(() => new Promise<void>((_, reject) => void (fail = reject)))
    act(() => void showGroupLine('week', { text: 'Zmieniono 3 bloki', undo }))
    await press('group-line-week-undo')
    await advance(UNDO_LINE_MS + 5000)
    expect(q('group-line-week')).not.toBeNull()
    await act(async () => fail(new Error('zapis')))
    // Not undone: the line stays, with a new term from the failure.
    expect(q('group-line-week')).not.toBeNull()
    expect((q('group-line-week-undo') as HTMLButtonElement).disabled).toBe(false)
    await advance(UNDO_LINE_MS - 1000)
    expect(q('group-line-week')).not.toBeNull()
    await advance(1000)
    expect(q('group-line-week')).toBeNull()
  })

  it('po wyjątku przed końcem czasu linia stoi do końca starego terminu (nie dostaje nowego)', async () => {
    show()
    const undo = vi.fn().mockRejectedValue(new Error('zapis'))
    act(() => void showGroupLine('week', { text: 'Zmieniono 3 bloki', undo }))
    await advance(5 * 60_000)
    await press('group-line-week-undo')
    expect(q('group-line-week')).not.toBeNull()
    await advance(UNDO_LINE_MS - 5 * 60_000 - 1000)
    expect(q('group-line-week')).not.toBeNull()
    await advance(1000)
    expect(q('group-line-week')).toBeNull()
  })

  it('cofanie udane po upływie terminu zdejmuje linię (i pokazuje komunikat)', async () => {
    show()
    let finish: (m: string) => void = () => {}
    act(() => void showGroupLine('week', { text: 'Zmieniono 3 bloki', undo: () => new Promise<string>((resolve) => void (finish = resolve)) }))
    await press('group-line-week-undo')
    await advance(UNDO_LINE_MS + 1000)
    await act(async () => finish('1 blok zmieniony od tego czasu – został'))
    expect(q('group-line-week')).toBeNull()
    expect(useUi.getState().toasts.map((t) => t.text)).toEqual(['1 blok zmieniony od tego czasu – został'])
  })

  it('koniec linii liczy się od jej `until`, nie od chwili wywołania: `now` sprzed 10 min – 5 min życia', async () => {
    show()
    act(() => void showGroupLine('week', { text: 'stara zmiana', undo: () => {} }, Date.now() - 10 * 60_000))
    await advance(UNDO_LINE_MS - 10 * 60_000 - 1000)
    expect(q('group-line-week')).not.toBeNull()
    await advance(1000)
    expect(q('group-line-week')).toBeNull()
  })

  it('linia dawno po terminie (`now` sprzed ponad 15 min) znika od razu', async () => {
    show()
    act(() => void showGroupLine('week', { text: 'za stara', undo: () => {} }, Date.now() - UNDO_LINE_MS - 1000))
    await advance(0)
    expect(q('group-line-week')).toBeNull()
  })

  it('klik „Cofnij” liczy się jako klik poza otwartym menu (zamyka je); klik w komunikat okna – nie', () => {
    function Page() {
      const [open, setOpen] = useState(true)
      return createElement(
        'div',
        null,
        createElement(GroupLine, { view: 'week' }),
        createElement('div', { role: 'status', 'data-testid': 'toast' }, 'komunikat'),
        open ? createElement(ContextMenu, { title: 'Zmień 2 bloki', at: { x: 10, y: 10 }, items: [{ label: 'A' }], onClose: () => setOpen(false) }) : null
      )
    }
    act(() => root.render(createElement(Page)))
    act(() => void showGroupLine('week', { text: 'Zmieniono 3 bloki', undo: () => {} }))
    expect(q('context-menu')).not.toBeNull()
    act(() => void q('toast')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(q('context-menu')).not.toBeNull()
    act(() => void q('group-line-week-undo')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(q('context-menu')).toBeNull()
  })
})
