// @vitest-environment jsdom
/**
 * The limit at the save (D388, T664, T672): the limit of the editor counts the plain Markdown; the note the guard writes (with
 * escapes) may be longer. Over the limit the plain writing (which the limit measured) is saved, once, with a warning in the log.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { NoteEditor } from '@renderer/features/note/NoteEditor'
import { NOTE_MAX } from '@shared/model/note'

const guarded = vi.hoisted(() => ({ longer: 0 }))
vi.mock('@renderer/features/note/noteMarkdown', async (importOriginal) => {
  const original = await importOriginal<typeof import('@renderer/features/note/noteMarkdown')>()
  // The guard wrote the note `longer` characters longer than the plain writing.
  return { ...original, noteMarkdown: (editor: Editor, doc?: Parameters<typeof original.noteMarkdown>[1]) => original.noteMarkdown(editor, doc) + 'x'.repeat(guarded.longer) }
})

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  guarded.longer = 0
})

describe('limit przy zapisie notatki po strażniku (T672)', () => {
  it('zapis po strażniku dłuższy niż limit: zapisuje się zwykły zapis (w limicie), raz, z jednym ostrzeżeniem w logu – tekst nie ginie', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const onCommit = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await act(async () => {
      root!.render(createElement(NoteEditor, { value: 'a', onCommit, olderComputers: [] }))
    })
    const el = host.querySelector<HTMLElement>('[data-testid="block-note"]')!
    const editor = (el as unknown as { editor: Editor }).editor
    act(() => void editor.view.dispatch(editor.state.tr.insertText('b'.repeat(NOTE_MAX - 100), 2)))
    guarded.longer = 200
    await act(async () => void el.dispatchEvent(new FocusEvent('blur')))
    expect(onCommit).toHaveBeenCalledTimes(1)
    const saved = onCommit.mock.calls[0]![0] as string
    expect(saved).toBe('a' + 'b'.repeat(NOTE_MAX - 100))
    expect(saved.length).toBeLessThanOrEqual(NOTE_MAX)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).not.toContain('bbbbbbbbbb')
    // Saved: another blur writes nothing, the text stays.
    await act(async () => void el.dispatchEvent(new FocusEvent('blur')))
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(editor.getText()).toBe(saved)
    warn.mockRestore()
  })
})
