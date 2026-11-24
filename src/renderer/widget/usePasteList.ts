/**
 * A list pasted into a field of the quick capture (N11, D605, D606): the one hook of the three fields (the window „Do skrzynki”, the bar's
 * „+ Skrzynka” in the window and the panel, „Nowe zadanie” of „Sprawy”). A text of two or more lines (`pastedLines`) is not put into the
 * field: `question` stands under it – „Dodać 5 spraw? · Enter · Esc – jeden tytuł”. Enter hands the lines to `save` (the field keeps what
 * it held; a `save` that does not take them – one already running, `false` – leaves the question standing); Esc puts the paste into the field as one title, as an ordinary paste would – at the caret, the lines joined with a space, the
 * title cut to `TITLE_MAX`; the first Esc only answers the question (it neither closes the field nor the window). Any change of the text
 * drops the question. A text of one line is pasted as always. Light – the window „Do skrzynki” and the bar load it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type RefObject } from 'react'
import { TITLE_MAX } from '@shared/model/requests'
import { pastedLines, pastedOneTitle, pasteQuestion, type PastedList } from '@shared/quickList'
import { useEscapeLayer } from '../lib/escape'

/** A paste that waits for its answer: the list, the text pasted and where the caret and the selection were. */
interface Pending {
  list: PastedList
  text: string
  from: number
  to: number
}

export interface PasteList {
  /** The line under the field while a pasted list waits for Enter or Esc; null – none. */
  question: string | null
  /** `onPaste` of the field. */
  onPaste: (e: ClipboardEvent<HTMLInputElement>) => void
  /** `onKeyDown` of the field, first: true – the key was the answer (Enter, Esc) and the field has nothing more to do with it. */
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => boolean
}

export function usePasteList(o: { value: string; setValue: (text: string) => void; input: RefObject<HTMLInputElement | null>; save: (lines: string[]) => boolean | void }): PasteList {
  const [pending, setPending] = useState<Pending | null>(null)
  const latest = useRef(o)
  latest.current = o
  // Where the caret goes once the title is in the field (after the render that gives the field its value).
  const caret = useRef<number | null>(null)
  useLayoutEffect(() => {
    const at = caret.current
    caret.current = null
    if (at != null) o.input.current?.setSelectionRange(at, at)
  }, [o.value])
  // Typing, saving or clearing the field – whatever changes the text – ends the question.
  useEffect(() => setPending(null), [o.value])

  const asTitle = (p: Pending): void => {
    const { value, setValue } = latest.current
    const before = value.slice(0, p.from)
    const after = value.slice(p.to)
    const inserted = pastedOneTitle(p.text).slice(0, Math.max(0, TITLE_MAX - before.length - after.length))
    const next = before + inserted + after
    setPending(null)
    // A field that stays as it was (full – nothing fits) gives no render to spend the caret: none is left for a later change of the text.
    caret.current = next === value ? null : before.length + inserted.length
    setValue(next)
  }
  // Esc with the focus elsewhere (a click on the page, the window's own field blurred) still only answers the question.
  useEscapeLayer(pending != null, () => pending && asTitle(pending))

  return {
    question: pending ? pasteQuestion(pending.list) : null,
    onPaste: (e) => {
      const text = e.clipboardData.getData('text')
      const list = pastedLines(text)
      if (!list) return
      e.preventDefault()
      const field = e.currentTarget
      const from = field.selectionStart ?? field.value.length
      setPending({ list, text, from, to: field.selectionEnd ?? from })
    },
    onKeyDown: (e) => {
      if (!pending || e.nativeEvent.isComposing) return false
      if (e.key === 'Enter') {
        e.preventDefault()
        if (latest.current.save(pending.list.lines) !== false) setPending(null)
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        asTitle(pending)
        return true
      }
      return false
    }
  }
}
