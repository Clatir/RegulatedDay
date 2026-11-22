// @vitest-environment jsdom
/**
 * T2440: the dialogs around a cost – „Przenieś na dzień…” of a group moves nothing while its date field stands refused (31.02); the cost
 * fields of „Nowa podkategoria” / „Nowy wariant” warn about an older computer under a cost past ±5.
 */
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DataView } from '@shared/api'
import type { Costs } from '@shared/model/categories'
import { GroupMoveDialog } from '@renderer/features/plan/BlockGroupMenu'
import { CostFields } from '@renderer/features/plan/NewThingDialogs'
import { installEscape } from '@renderer/lib/escape'
import { useData } from '@renderer/store/data'

let root: Root | null = null
let host: HTMLElement | null = null
let removeEscape: (() => void) | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  removeEscape = installEscape()
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
  useData.setState({ view: null })
  removeEscape?.()
  removeEscape = installEscape()
})

const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const typeLeave = (id: string, text: string) =>
  act(() => {
    const el = q(id) as HTMLInputElement
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.blur()
  })
const click = (id: string) => act(() => void q(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
const render = (el: ReturnType<typeof createElement>) => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(el))
}

describe('„Przenieś na dzień…” grupy (T2440)', () => {
  const mount = () => {
    const onMove = vi.fn()
    render(createElement(GroupMoveDialog, { n: 2, today: '2026-11-18', initial: '2026-11-19', onClose: () => undefined, onMove }))
    return onMove
  }

  it('data z pola odrzucona (31.02, blur) – „Przenieś” nic nie robi; poprawna data – przenosi na nią', () => {
    const onMove = mount()
    click('group-move-apply')
    expect(onMove).toHaveBeenLastCalledWith('2026-11-19')
    onMove.mockClear()
    typeLeave('group-move-date', '31.02.2026')
    expect(q('group-move-date')!.getAttribute('aria-invalid')).toBe('true')
    click('group-move-apply')
    expect(onMove).not.toHaveBeenCalled()
    typeLeave('group-move-date', '25.11.2026')
    expect(q('group-move-date')!.getAttribute('aria-invalid')).toBe('false')
    click('group-move-apply')
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith('2026-11-25')
  })
})

describe('pola kosztu w „Nowa podkategoria” / „Nowy wariant” (T2440)', () => {
  function Harness() {
    const [costs, setCosts] = useState<Costs>({ head: 1, emotions: 1, senses: 1, body: 0 })
    return createElement(CostFields, { costs, onChange: (c: Partial<Costs>) => setCosts((now) => ({ ...now, ...c })) })
  }
  const computers = (...list: Array<{ name: string; appVersion: string }>) => act(() => useData.setState({ view: { computers: list } as unknown as DataView }))

  it('starszy komputer (1.36.0) i koszt 40 – `new-cost-old` jest, z nazwą; po wpisaniu 5 znika', () => {
    computers({ name: 'Laptop', appVersion: '1.36.0' })
    render(createElement(Harness))
    expect(q('new-cost-old')).toBeNull()
    typeLeave('new-cost-head', '40')
    expect(q('new-cost-old')!.textContent).toContain('Komputer Laptop ma starszą wersję')
    typeLeave('new-cost-head', '5')
    expect(q('new-cost-old')).toBeNull()
  })

  it('bez ostrzeżenia: komputer z 1.37.0, brak starszych komputerów', () => {
    computers({ name: 'Laptop', appVersion: '1.37.0' })
    render(createElement(Harness))
    typeLeave('new-cost-head', '40')
    expect(q('new-cost-old')).toBeNull()
    computers()
    expect(q('new-cost-old')).toBeNull()
  })
})
