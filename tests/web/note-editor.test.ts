// @vitest-environment jsdom
/**
 * The note's editor as a field (D388, T661a, T662, T664): opened and left it writes nothing; an edit is saved on leaving
 * it – once, the whole note; Esc throws the edit away without a save; a click on a check box saves at once; the counter and
 * the warning of an older version show under the text.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Editor } from '@tiptap/core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { NoteEditor } from '@renderer/features/note/NoteEditor'
import { installEscape, onEscapeLayer } from '@renderer/lib/escape'
import { NOTE_MAX } from '@shared/model/note'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // The window's one listener of Esc (the layers: the panel, the enlarged note).
  installEscape()
})

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

async function mount(value: string, o: { older?: string[]; onCommit?: (n: string) => void } = {}) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const onCommit = o.onCommit ?? vi.fn<(note: string) => void>()
  await act(async () => {
    root!.render(createElement(NoteEditor, { value, onCommit, olderComputers: o.older ?? [] }))
  })
  const el = host.querySelector<HTMLElement>('[data-testid="block-note"]')!
  const editor = (el as unknown as { editor: Editor }).editor
  const type = (text: string) =>
    act(() => {
      editor.view.dispatch(editor.state.tr.insertText(text, editor.state.doc.content.size - 1))
    })
  const blur = () => act(() => void el.dispatchEvent(new FocusEvent('blur')))
  const esc = () => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true })))
  return { el, editor, type, blur, esc, onCommit: onCommit as ReturnType<typeof vi.fn<(note: string) => void>>, host }
}

describe('notatka jako pole (T662)', () => {
  it('otwarta i opuszczona bez edycji – żadnego zapisu, także przy zamknięciu panelu', async () => {
    const m = await mount('stara\nnotatka\n\n- [ ] a')
    await m.blur()
    act(() => root!.unmount())
    root = null
    expect(m.onCommit).not.toHaveBeenCalled()
  })

  it('inny zapis tych samych konstrukcji (normalizacja) nie jest edycją – żadnego zapisu', async () => {
    const m = await mount('__a__\n* b')
    await m.blur()
    expect(m.onCommit).not.toHaveBeenCalled()
  })

  it('edycja zapisuje się przy opuszczeniu: raz, cała notatka z podziałem na linie', async () => {
    const m = await mount('stara\nnotatka')
    await m.type('!')
    expect(m.onCommit).not.toHaveBeenCalled()
    await m.blur()
    expect(m.onCommit).toHaveBeenCalledTimes(1)
    expect(m.onCommit).toHaveBeenCalledWith('stara\nnotatka!')
    await m.blur()
    expect(m.onCommit).toHaveBeenCalledTimes(1)
  })

  it('edycja cofnięta ręcznie do tego samego tekstu – bez zapisu', async () => {
    const m = await mount('abc')
    await m.type('d')
    act(() => void m.editor.commands.setContent('abc', { contentType: 'markdown', emitUpdate: true }))
    await m.blur()
    expect(m.onCommit).not.toHaveBeenCalled()
  })

  it('Esc cofa niezatwierdzoną zmianę (bez zapisu, zdarzenie nie idzie dalej); drugi Esc idzie dalej', async () => {
    const m = await mount('abc')
    const reached = vi.fn()
    const off = onEscapeLayer(reached)
    await m.type('d')
    expect(m.editor.getText()).toBe('abcd')
    await m.esc()
    expect(m.editor.getText()).toBe('abc')
    await m.blur()
    expect(m.onCommit).not.toHaveBeenCalled()
    expect(reached).not.toHaveBeenCalled()
    await m.esc()
    expect(reached).toHaveBeenCalledTimes(1)
    off()
  })

  it('Esc w edytorze bez niezapisanej zmiany dochodzi do warstw okna (ProseMirror sam go połyka)', async () => {
    const m = await mount('abc')
    const closed = vi.fn()
    const off = onEscapeLayer(closed)
    await m.esc()
    expect(closed).toHaveBeenCalledTimes(1)
    off()
  })

  it('klik w pole wyboru zapisuje od razu (bez opuszczania pola)', async () => {
    const m = await mount('- [ ] a\n- [ ] b')
    const boxes = m.el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(boxes).toHaveLength(2)
    await act(async () => {
      boxes[0]!.click()
    })
    expect(m.onCommit).toHaveBeenCalledTimes(1)
    expect(m.onCommit).toHaveBeenCalledWith('- [x] a\n- [ ] b')
    await act(async () => {
      m.el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!.click()
    })
    expect(m.onCommit).toHaveBeenLastCalledWith('- [x] a\n- [x] b')
  })

  it('nowa wartość z zewnątrz (inny komputer) bez niezapisanej edycji wchodzi do edytora', async () => {
    const m = await mount('a')
    await act(async () => {
      root!.render(createElement(NoteEditor, { value: 'zmieniona\nzdalnie', onCommit: m.onCommit, olderComputers: [] }))
    })
    expect(m.editor.getMarkdown()).toBe('zmieniona\nzdalnie')
    expect(m.onCommit).not.toHaveBeenCalled()
  })

  it('wartość z zewnątrz nie wyrzuca niezapisanej edycji', async () => {
    const m = await mount('a')
    await m.type('X')
    await act(async () => {
      root!.render(createElement(NoteEditor, { value: 'z zewnątrz', onCommit: m.onCommit, olderComputers: [] }))
    })
    expect(m.editor.getText()).toBe('aX')
  })
})

describe('„Powiększ” (T665)', () => {
  it('ten sam edytor na całe okno: tekst niezapisany zostaje, Esc wraca bez cofania zmian', async () => {
    const m = await mount('abc')
    await m.type('d')
    const expand = m.host.querySelector<HTMLButtonElement>('[data-testid="note-expand"]')!
    expect(expand.textContent).toBe('Powiększ')
    await act(async () => expand.click())
    expect(m.host.querySelector('[data-testid="note-editor"]')!.getAttribute('role')).toBe('dialog')
    expect(m.host.querySelector('[data-testid="block-note"]')).toBe(m.el)
    expect(m.editor.getText()).toBe('abcd')
    expect(expand.textContent).toBe('Pomniejsz')
    await m.esc()
    expect(m.host.querySelector('[data-testid="note-editor"]')!.getAttribute('role')).toBeNull()
    expect(m.editor.getText()).toBe('abcd')
    expect(m.onCommit).not.toHaveBeenCalled()
  })
})

describe('licznik i ostrzeżenie pod notatką (T664)', () => {
  it('licznik „x z 10 000” dopiero od 9000 znaków', async () => {
    const short = await mount('x'.repeat(8999))
    expect(short.host.querySelector('[data-testid="note-counter"]')).toBeNull()
    act(() => root?.unmount())
    host?.remove()
    const long = await mount('x'.repeat(9000))
    expect(long.host.querySelector('[data-testid="note-counter"]')!.textContent).toBe(`9 000 z ${String(NOTE_MAX).replace(/(\d)(\d{3})$/, '$1 $2')}`)
  })

  it('ostrzeżenie z nazwą komputera ze starszą wersją, tylko dla notatki powyżej 2000 znaków', async () => {
    const calm = await mount('x'.repeat(2000), { older: ['Biuro'] })
    expect(calm.host.querySelector('[data-testid="note-warning"]')).toBeNull()
    act(() => root?.unmount())
    host?.remove()
    const warned = await mount('x'.repeat(2001), { older: ['Biuro'] })
    expect(warned.host.querySelector('[data-testid="note-warning"]')!.textContent).toBe('Notatka ma ponad 2000 znaków – na komputerze Biuro ze starszą wersją aplikacji zostanie obcięta.')
    act(() => root?.unmount())
    host?.remove()
    const none = await mount('x'.repeat(5000))
    expect(none.host.querySelector('[data-testid="note-warning"]')).toBeNull()
  })
})
