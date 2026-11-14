// @vitest-environment jsdom
/**
 * Del removes the selected element (D462): the focused element marked for it, or the screen's selection; the question „Usunąć „…”?”
 * (Enter – Usuń, Esc – Anuluj); the removal asking by itself (a series' scope) is not asked twice; nothing in a field, with a dialog
 * open or with a modifier; the steps' list as an example of a list (the same code as „×”, so „Cofnij” follows from the screen).
 */
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Step, StepOp } from '@shared/model/steps'
import { Dialog } from '@renderer/components/Dialog'
import { DeleteDialog } from '@renderer/components/DeleteDialog'
import { deleteMark, installDeleteKey, isEditable, removeTarget, useDeleteAsk, useDeleteResolver, useDeleteSelected, type DeleteTarget } from '@renderer/lib/deleteKey'
import { installEscape } from '@renderer/lib/escape'
import { StepsEditor } from '@renderer/features/steps/StepsEditor'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let host: HTMLDivElement
let root: Root
let offDel: () => void
let offEsc: () => void

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  offDel = installDeleteKey()
  offEsc = installEscape()
})
afterEach(() => {
  act(() => root.unmount())
  useDeleteAsk.setState({ ask: null })
  host.remove()
  offDel()
  offEsc()
})

const render = (el: ReactElement) => act(() => root.render(el))
const key = (target: Element, k: string, init: KeyboardEventInit = {}) => act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })))
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click())

/** Two rows marked for Del, a field, and the question. */
function Rows({ run, asked = false }: { run: (id: string) => void; asked?: boolean }) {
  useDeleteResolver('row', (id) => (id === 'a' || id === 'b' ? { ...removeTarget(`Wiersz ${id}`, () => run(id)), asked } : null))
  return createElement(
    'div',
    null,
    createElement('div', { ...deleteMark('row', 'a'), 'data-testid': 'row-a' }, createElement('button', { 'data-testid': 'row-a-btn' }, 'x'), createElement('input', { 'data-testid': 'row-a-input' })),
    createElement('div', { ...deleteMark('row', 'b'), 'data-testid': 'row-b' }),
    createElement('div', { ...deleteMark('row', 'zły'), 'data-testid': 'row-bad' }),
    createElement('input', { type: 'checkbox', 'data-testid': 'check' }),
    createElement(DeleteDialog)
  )
}

describe('Del na zaznaczonym elemencie', () => {
  it('Del na elemencie otwiera pytanie z jego nazwą; Enter (przycisk „Usuń” ma fokus) usuwa', async () => {
    const run = vi.fn()
    render(createElement(Rows, { run }))
    const row = q('row-a')!
    act(() => row.focus())
    key(row, 'Delete')
    expect(q('delete-ask')).not.toBeNull()
    expect(q('delete-ask')!.textContent).toContain('Usunąć „Wiersz a”?')
    expect(run).not.toHaveBeenCalled()
    // The default button has the focus: Enter is its click.
    expect(document.activeElement).toBe(q('delete-ask-yes'))
    await click(q('delete-ask-yes'))
    expect(run).toHaveBeenCalledWith('a')
    expect(q('delete-ask')).toBeNull()
  })

  it('Esc i „Anuluj” zostawiają wszystko; focus wraca do elementu', async () => {
    const run = vi.fn()
    render(createElement(Rows, { run }))
    const row = q('row-b')!
    act(() => row.focus())
    key(row, 'Delete')
    key(document.activeElement!, 'Escape')
    expect(q('delete-ask')).toBeNull()
    expect(document.activeElement).toBe(row)
    key(row, 'Delete')
    await click(q('delete-ask-cancel'))
    expect(q('delete-ask')).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it('element w środku (przycisk) działa jak jego wiersz; pole tekstowe – Del kasuje tekst i nic więcej', () => {
    const run = vi.fn()
    render(createElement(Rows, { run }))
    const btn = q('row-a-btn')!
    act(() => btn.focus())
    key(btn, 'Delete')
    expect(q('delete-ask')).not.toBeNull()
    key(document.activeElement!, 'Escape')
    const input = q('row-a-input')!
    act(() => input.focus())
    key(input, 'Delete')
    expect(q('delete-ask')).toBeNull()
    expect(isEditable(input)).toBe(true)
    expect(isEditable(q('check'))).toBe(false)
  })

  it('Backspace, Del z modyfikatorem, element bez wiersza w rozwiązaniu i brak zaznaczenia – nic', () => {
    const run = vi.fn()
    render(createElement(Rows, { run }))
    const row = q('row-a')!
    act(() => row.focus())
    key(row, 'Backspace')
    key(row, 'Delete', { ctrlKey: true })
    key(row, 'Delete', { shiftKey: true })
    key(row, 'Delete', { repeat: true })
    const bad = q('row-bad')!
    act(() => bad.focus())
    key(bad, 'Delete')
    act(() => (document.activeElement as HTMLElement).blur())
    key(document.body, 'Delete')
    expect(q('delete-ask')).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it('usunięcie, które pyta samo (zakres serii), nie pyta drugi raz', () => {
    const run = vi.fn()
    render(createElement(Rows, { run, asked: true }))
    const row = q('row-a')!
    act(() => row.focus())
    key(row, 'Delete')
    expect(q('delete-ask')).toBeNull()
    expect(run).toHaveBeenCalledWith('a')
  })

  it('przy otwartym oknie Del nic nie robi', () => {
    const run = vi.fn()
    render(createElement('div', null, createElement(Rows, { run }), createElement(Dialog, { title: 'Inne', onClose: () => undefined, 'data-testid': 'other', children: createElement('div', { ...deleteMark('row', 'a'), tabIndex: 0, 'data-testid': 'in-dialog' }) })))
    const el = q('in-dialog')!
    act(() => el.focus())
    key(el, 'Delete')
    expect(q('delete-ask')).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it('zaznaczenie ekranu: Del z fokusem poza elementami usuwa zaznaczone; nowsze zaznaczenie wygrywa', async () => {
    const outer = vi.fn()
    const inner = vi.fn()
    const target = (name: string, run: () => void): DeleteTarget => removeTarget(name, run)
    function Screens({ inside }: { inside: boolean }) {
      useDeleteSelected(target('Blok', outer))
      return createElement('div', null, inside ? createElement(Inner) : null, createElement(DeleteDialog))
    }
    function Inner() {
      useDeleteSelected(target('Wydarzenie', inner))
      return null
    }
    render(createElement(Screens, { inside: false }))
    act(() => (document.activeElement as HTMLElement | null)?.blur())
    key(document.body, 'Delete')
    expect(q('delete-ask')!.textContent).toContain('Usunąć „Blok”?')
    await click(q('delete-ask-yes'))
    expect(outer).toHaveBeenCalledTimes(1)
    render(createElement(Screens, { inside: true }))
    key(document.body, 'Delete')
    expect(q('delete-ask')!.textContent).toContain('Usunąć „Wydarzenie”?')
    await click(q('delete-ask-yes'))
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).toHaveBeenCalledTimes(1)
  })

  it('słowa przycisku elementu: „Odwołać … na ten dzień?” i przycisk „Odwołaj”', () => {
    const run = vi.fn()
    function Cancel() {
      useDeleteSelected({ title: 'Odwołać „Analiza” na ten dzień?', yes: 'Odwołaj', run })
      return createElement(DeleteDialog)
    }
    render(createElement(Cancel))
    key(document.body, 'Delete')
    expect(q('delete-ask')!.textContent).toContain('Odwołać „Analiza” na ten dzień?')
    expect(q('delete-ask-yes')!.textContent).toBe('Odwołaj')
  })
})

describe('lista kroków: Del na kroku to „×”', () => {
  const steps: Step[] = ['Pierwszy', 'Drugi'].map((title, order) => ({ id: `s${order + 1}`, title, order, done: false }))

  it('klik obok pól zaznacza krok, Del pyta, „Usuń” wysyła tę samą operację co „×”', async () => {
    const ops: StepOp[] = []
    render(createElement('div', null, createElement(StepsEditor, { steps, ticks: false, onOp: (op: StepOp) => void ops.push(op) }), createElement(DeleteDialog)))
    const row = document.querySelector<HTMLElement>('[data-step-id="s2"]')!
    act(() => row.focus())
    key(row, 'Delete')
    expect(q('delete-ask')!.textContent).toContain('Usunąć „Drugi”?')
    await act(async () => void q('delete-ask-yes')!.click())
    expect(ops).toEqual([{ op: 'remove', id: 's2' }])
    // The button does the same at once, with no question.
    await act(async () => void document.querySelectorAll<HTMLElement>('[data-testid="step-remove"]')[0]!.click())
    expect(ops.at(-1)).toEqual({ op: 'remove', id: 's1' })
    expect(q('delete-ask')).toBeNull()
  })

  it('w polu tytułu kroku Del kasuje tekst – bez pytania; lista tylko do odczytu – bez pytania', () => {
    const ops: StepOp[] = []
    render(createElement('div', null, createElement(StepsEditor, { steps, ticks: false, onOp: (op: StepOp) => void ops.push(op) }), createElement(DeleteDialog)))
    const input = document.querySelector<HTMLInputElement>('[data-step-id="s1"] [data-testid="step-title"]')!
    act(() => input.focus())
    key(input, 'Delete')
    expect(q('delete-ask')).toBeNull()
    render(createElement('div', null, createElement(StepsEditor, { steps, ticks: false, readOnly: true, onOp: (op: StepOp) => void ops.push(op) }), createElement(DeleteDialog)))
    const row = document.querySelector<HTMLElement>('[data-step-id="s1"]')!
    act(() => row.focus())
    key(row, 'Delete')
    expect(q('delete-ask')).toBeNull()
    expect(ops).toEqual([])
  })
})
