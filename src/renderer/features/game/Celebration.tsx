/**
 * The full-screen celebration (spec „Świętowanie”, D322 – an overlay on the main window): a streak of 7, 14, 30, 60 or
 * 100 days and every new item of the room, once on this computer. At most 5 s, no flashes, gone at any key or click (the
 * key goes no further – it never clicks what is under it); it waits for the main window to be open and in front, and
 * never shows with the game module off, in the quiet modes (also the night's) or in „Odcinam się”. One at a time, in
 * the order of their days; the one shown is held here, whatever the next counts of the game say.
 */
import { useEffect, useState } from 'react'
import type { Celebration as CelebrationItem } from '@shared/engine/progress'
import { useData } from '../../store/data'
import { useGame } from '../../store/game'
import { useWidget } from '../../store/widget'
import { celebrationText } from './gameText'

/** At most this long (spec). */
const SHOW_MS = 5000

export function Celebration() {
  const due = useGame((s) => s.game?.due ?? null)
  const on = useData((s) => s.rd.general.modules.game)
  const calm = useWidget((s) => !!s.view && !s.view.quiet && !s.view.hidden && !s.view.night)
  const [front, setFront] = useState(() => document.visibilityState === 'visible' && document.hasFocus())
  const [showing, setShowing] = useState<CelebrationItem | null>(null)
  // Shown in this window already (the main process remembers them too – this only bridges the next count).
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const check = () => setFront(document.visibilityState === 'visible' && document.hasFocus())
    window.addEventListener('focus', check)
    window.addEventListener('blur', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      window.removeEventListener('blur', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  const allowed = on && calm && front
  // The next one, when nothing shows and it may: remembered at once (once on this computer, also if the app closes now).
  useEffect(() => {
    if (showing || !allowed) return
    const next = due?.find((c) => !done.has(c.key))
    if (!next) return
    setShowing(next)
    void window.rd.celebrated([next.key]).catch(() => undefined)
  }, [showing, allowed, due, done])
  const key = showing?.key ?? null
  useEffect(() => {
    if (!key) return
    const dismiss = () => {
      setDone((d) => new Set([...d, key]))
      setShowing(null)
    }
    // A quiet mode, „Odcinam się” or the module off meanwhile: gone at once.
    if (!on || !calm) return dismiss()
    const t = setTimeout(dismiss, SHOW_MS)
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dismiss()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey, { capture: true })
    }
  }, [key, on, calm])
  if (!showing) return null
  const text = celebrationText(showing)
  const close = () => {
    setDone((d) => new Set([...d, showing.key]))
    setShowing(null)
  }
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-bg/85" onClick={close} role="dialog" aria-label={text.title} data-testid="celebration">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-panel px-10 py-8 text-center">
        <span className="text-[40px] text-lamp" aria-hidden="true">
          ♪
        </span>
        <span className="text-[20px] font-medium text-lamp">{text.title}</span>
        <span className="text-[13px] text-muted">{text.line}</span>
      </div>
    </div>
  )
}
