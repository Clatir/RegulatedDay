/**
 * The axis of „Dziś” put at its hour when the page opens (D563, P6): today's „teraz” a third of the way down, another day from an hour before
 * its wake – never past the top of a card that asks you something (the morning plan not approved, a late wake, unclosed days, the ritual:
 * \`data-prompt-card\`). Put again at each day chosen, not when the logical day turns over under an open page (\`placed\` – the day it was put for,
 * kept above the view that is mounted anew with each day). Followed while the content over the axis changes (a strip of events, a card that comes
 * late) until you act; the ritual's own scroll ends it (\`stopFollowing\`).
 */
import { useCallback, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import { contentTop, followAxis, scrollAxis } from '../../lib/axisScroll'
import { PPM } from '../plan/Timeline'

/** The day the axis was put for: the chosen date, null – today, undefined – not yet. */
export type PlacedDay = MutableRefObject<string | null | undefined>

/** Puts the axis in `box` for `chosen`; returns what ends the following of the content (the ritual's scroll does). */
export function useAxisOpening(box: RefObject<HTMLElement | null>, chosen: string | null, placed: PlacedDay): () => void {
  const following = useRef<(() => boolean) | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    const content = el?.firstElementChild
    if (!el || !(content instanceof HTMLElement) || placed.current === chosen) return
    placed.current = chosen
    const apply = () => {
      const axis = el.querySelector<HTMLElement>('[data-testid="timeline-axis"]')
      if (!axis) return
      const at = (id: string) => {
        const line = el.querySelector<HTMLElement>(`[data-testid="marker-${id}"]`)
        return line ? contentTop(line, el) : null
      }
      const card = el.querySelector<HTMLElement>('[data-prompt-card]')
      scrollAxis(el, { axisTop: contentTop(axis, el), nowY: at('teraz'), wakeY: at('pobudka'), hourPx: 60 * PPM, maxTop: card ? contentTop(card, el) : null })
    }
    apply()
    const stop = followAxis(el, content, apply)
    following.current = stop
    return () => {
      stop()
      if (following.current === stop) following.current = null
    }
  }, [box, chosen, placed])
  return useCallback(() => void following.current?.(), [])
}
