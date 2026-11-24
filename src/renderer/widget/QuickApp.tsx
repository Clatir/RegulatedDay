/**
 * „Do skrzynki” (D385): the window of the quick capture – one field, shown over every window only by your shortcut. Enter
 * saves a task of your own with this title into „Skrzynka” (the window hides then), Esc hides it; the text stays while
 * it is hidden for another reason (a click elsewhere) and is gone once saved. A refusal (no folder, no title) is said
 * under the field. Prośby are added as before – this makes only tasks. The words of dates at the end of the title (`!jutro`,
 * `@pt` – D409) are told under the field before Enter, in the place of the refusal (the window's height stays) – with a length, an hour and a subcategory (`#anal`, D600–D602).
 * A list of lines pasted into the field (N11, D605, D606) is asked about under it first („Dodać 5 spraw? · Enter · Esc – jeden tytuł”); Enter saves the
 * lines as sprawy and the window stays open with „Dodano 5 spraw · Cofnij” under the field until the text changes (or `UNDO_LINE_MS`), Esc pastes one title.
 */
import { useEffect, useRef, useState } from 'react'
import { TITLE_MAX } from '@shared/model/requests'
import { quickPreview } from '@shared/quickDates'
import { QUICK_UNDO_ASKED, quickListSavedText, quickUndoText } from '@shared/quickList'
import { quickSavedText } from '@shared/quickSaid'
import { UNDO_LINE_MS } from '@shared/widget'
import { setWindowEscape } from '../lib/escape'
import { useQuickToday } from './quickToday'
import { usePasteList } from './usePasteList'

export function QuickApp() {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // D601: saved, but the queue asks about the day's file – the window stays open and says it (a calm line, not an error).
  const [asked, setAsked] = useState<string | null>(null)
  // N11: what the pasted list made – its sentence and, while it can be taken back, the id of its „Cofnij”.
  // `until`: when the line goes (set once – a „Cofnij” that did not go through does not start its 15 minutes again); `note`: why the last „Cofnij” did not.
  const [listLine, setListLine] = useState<{ text: string; batch: string | null; until: number; note?: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const { today, nowMin, categories, reload } = useQuickToday(text)
  const preview = quickPreview(text, today, categories, nowMin)
  useEffect(() => {
    setWindowEscape(() => window.rd.quickClose())
    const off = window.rd.onQuickShown(() => {
      setError(null)
      setAsked(null)
      setListLine(null)
      reload()
      input.current?.focus()
      input.current?.select()
    })
    return () => {
      setWindowEscape(null)
      off()
    }
  }, [reload])
  const save = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await window.rd.quickAdd(text)
      if (r.ok) setText('')
      setListLine(null)
      setError(r.ok ? null : r.error)
      setAsked(r.ok && r.asked ? quickSavedText(r.title ?? '', { asked: true }) : null)
    } catch (e) {
      setError(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }
  const until = listLine?.batch ? listLine.until : null
  useEffect(() => {
    if (until == null) return
    const timer = setTimeout(() => setListLine(null), Math.max(0, until - Date.now()))
    return () => clearTimeout(timer)
  }, [until])
  // The list's save in progress (a ref, not the state: a second Enter before the next render must meet it).
  const saving = useRef(false)
  const saveList = async (lines: string[]) => {
    saving.current = true
    setBusy(true)
    try {
      const r = await window.rd.quickAddMany(lines)
      setError(r.ok ? null : r.error)
      setAsked(r.ok && r.asked ? quickListSavedText(r.count, { asked: true }) : null)
      setListLine(r.ok && !r.asked ? { text: quickListSavedText(r.count, { notPlaced: r.notPlaced }), batch: r.batch, until: Date.now() + UNDO_LINE_MS } : null)
    } catch (e) {
      setError(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const undoList = async () => {
    const batch = listLine?.batch
    if (!batch || busy) return
    setBusy(true)
    try {
      const r = await window.rd.quickUndo(batch)
      if (r.ok) setListLine({ text: r.asked ? QUICK_UNDO_ASKED : quickUndoText(r.undone, r.kept), batch: null, until: 0 })
      else {
        // Nothing was written and the list is given back (`again`): its „Cofnij” stays; else the list is spent.
        if (r.again) setListLine((l) => (l ? { ...l, note: r.error ?? '' } : l))
        else {
          setListLine(null)
          setError(r.error)
        }
      }
    } catch (e) {
      // A call that threw wrote nothing we know of: as a refusal in full, the button stays.
      setListLine((l) => (l ? { ...l, note: `Nie cofnięto: ${e instanceof Error ? e.message : String(e)}` } : l))
    } finally {
      setBusy(false)
    }
  }
  const paste = usePasteList({ value: text, setValue: setText, input, save: (lines) => (busy || saving.current ? false : (void saveList(lines), true)) })
  return (
    <div className="flex h-full flex-col justify-center gap-1 border border-line-strong bg-panel px-3 py-2" data-testid="quick">
      <label className="text-[12px] text-muted" htmlFor="quick-title">
        Do skrzynki
      </label>
      <input
        id="quick-title"
        ref={input}
        autoFocus
        className="input w-full"
        value={text}
        maxLength={TITLE_MAX}
        placeholder="Co zapisać? Enter zapisuje, Esc zamyka"
        onChange={(e) => {
          setText(e.currentTarget.value)
          setError(null)
          setAsked(null)
          setListLine(null)
        }}
        onPaste={paste.onPaste}
        onKeyDown={(e) => {
          if (paste.onKeyDown(e)) return
          if (e.key === 'Enter') {
            e.preventDefault()
            void save()
          }
        }}
        data-testid="quick-title"
      />
      {paste.question ? (
        <span className="text-[12px] text-muted" data-testid="quick-paste">
          {paste.question}
        </span>
      ) : error ? (
        <span className="text-[12px] text-rose" data-testid="quick-error">
          {error}
        </span>
      ) : asked ? (
        <span className="text-[12px] text-muted" data-testid="quick-asked">
          {asked}
        </span>
      ) : listLine ? (
        <span className="flex items-center gap-2 text-[12px] text-muted" data-testid="quick-list">
          <span data-testid="quick-list-text">{listLine.note ? `${listLine.text} · ${listLine.note}` : listLine.text}</span>
          {listLine.batch && (
            <button type="button" className="text-lamp hover:underline" disabled={busy} onClick={() => void undoList()} data-testid="quick-undo">
              Cofnij
            </button>
          )}
        </span>
      ) : (
        preview && (
          <span className="text-[12px] text-muted" data-testid="quick-preview">
            {preview}
          </span>
        )
      )}
    </div>
  )
}
