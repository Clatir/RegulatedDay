// @vitest-environment jsdom
/**
 * A refused text says why under its field (D347) – and the reason goes when the field's value changes from outside (a step beside it, another
 * save): it was about the text before (T2440). The same value again (a re-render of the parent) leaves it.
 */
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parseInteger } from '@shared/format'
import { CommitField } from '@renderer/components/fields'
import { SettingNumber } from '@renderer/features/settings/SettingNumber'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const q = (id: string) => document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const input = (id: string) => q(id) as HTMLInputElement
const typeLeave = (id: string, text: string) =>
  act(() => {
    const el = input(id)
    el.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.blur()
  })

type Control = { set: (v: number) => void; rerender: () => void }

/** A parent that owns the value: `set` changes it from outside, `rerender` renders it again with the same one. */
function mount(kind: 'setting' | 'commit', initial = 3): Control {
  const control = {} as Control
  function Parent() {
    const [value, setValue] = useState(initial)
    const [, tick] = useState(0)
    control.set = setValue
    control.rerender = () => tick((n) => n + 1)
    const onCommit = vi.fn()
    return kind === 'setting'
      ? createElement(SettingNumber, { field: { kind: 'integer', range: [-100, 100] }, value, onCommit, 'data-testid': 'f' })
      : createElement(CommitField<number>, { value, onCommit, parse: (t: string) => parseInteger(t, -100, 100), format: String, 'data-testid': 'f' })
  }
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(createElement(Parent)))
  return control
}

describe.each(['setting', 'commit'] as const)('powód odmowy pola znika, gdy wartość zmieni się z zewnątrz (%s)', (kind) => {
  it('wpis odrzucony, potem rodzic zmienia wartość – powód znika, aria-invalid false', () => {
    const c = mount(kind)
    typeLeave('f', '101')
    expect(q('f-error')).not.toBeNull()
    expect(input('f').getAttribute('aria-invalid')).toBe('true')
    act(() => c.set(4))
    expect(q('f-error')).toBeNull()
    expect(input('f').getAttribute('aria-invalid')).toBe('false')
    expect(input('f').value).toBe('4')
  })

  it('ta sama wartość (rerender rodzica bez zmiany) – powód zostaje', () => {
    const c = mount(kind)
    typeLeave('f', '101')
    act(() => c.rerender())
    act(() => c.set(3))
    expect(q('f-error')).not.toBeNull()
    expect(input('f').getAttribute('aria-invalid')).toBe('true')
    expect(input('f').value).toBe('3')
  })

  it('po zmianie z zewnątrz nowa odmowa pokazuje powód znowu, a kolejna zmiana znowu go zdejmuje', () => {
    const c = mount(kind)
    typeLeave('f', '101')
    act(() => c.set(4))
    expect(q('f-error')).toBeNull()
    typeLeave('f', 'abc')
    expect(q('f-error')).not.toBeNull()
    act(() => c.set(5))
    expect(q('f-error')).toBeNull()
  })
})
