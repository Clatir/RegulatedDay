/**
 * „Do skrzynki” (D385): the window of the quick capture – one field, shown over every window only by your shortcut. Enter
 * saves a task of your own with this title into „Skrzynka” (the window hides then), Esc hides it; the text stays while
 * it is hidden for another reason (a click elsewhere) and is gone once saved. A refusal (no folder, no title) is said
 * under the field. Prośby are added as before – this makes only tasks. The words of dates at the end of the title (`!jutro`,
 * `@pt` – D409) are told under the field before Enter, in the place of the refusal (the window's height stays).
 */
import { useEffect, useRef, useState } from 'react'
import { TITLE_MAX } from '@shared/model/requests'
import { quickPreview } from '@shared/quickDates'
import { setWindowEscape } from '../lib/escape'
import { useQuickToday } from './quickToday'

export function QuickApp() {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const { today, reload } = useQuickToday(text)
  const preview = quickPreview(text, today)
  useEffect(() => {
    setWindowEscape(() => window.rd.quickClose())
    const off = window.rd.onQuickShown(() => {
      setError(null)
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
      setError(r.ok ? null : r.error)
    } catch (e) {
      setError(`Nie zapisano: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }
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
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void save()
          }
        }}
        data-testid="quick-title"
      />
      {error ? (
        <span className="text-[12px] text-rose" data-testid="quick-error">
          {error}
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
