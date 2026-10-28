/**
 * The game in the header of „Dziś” (D322): „Passa 5 · 142 nuty · dziś +6 w toku”, and „+3 ♪” for a moment when today's
 * notes grow (spec „krótka animacja w widoku dnia … przy wzroście nut”). Nothing of the game in the bar or the icon.
 */
import { useEffect, useRef, useState } from 'react'
import { useData } from '../../store/data'
import { useGame } from '../../store/game'
import { gameLine } from './gameText'

export function GameLine() {
  const game = useGame((s) => s.game)
  const on = useData((s) => s.rd.general.modules.game)
  const today = useData((s) => s.view?.today ?? '')
  const seen = useRef<{ day: string; notes: number } | null>(null)
  const [growth, setGrowth] = useState<{ by: number; at: number } | null>(null)
  const notes = game?.notesToday ?? null
  useEffect(() => {
    if (notes == null) return
    const was = seen.current
    seen.current = { day: today, notes }
    // Only a growth seen in this window on the same day (the first count of a day is no news).
    if (was && was.day === today && notes > was.notes) setGrowth({ by: notes - was.notes, at: Date.now() })
  }, [notes, today])
  useEffect(() => {
    if (!growth) return
    const t = setTimeout(() => setGrowth(null), 4000)
    return () => clearTimeout(t)
  }, [growth])
  if (!on || !game) return null
  return (
    <span className="ml-2 inline-flex items-center gap-2 text-[12.5px] text-muted" data-testid="game-line">
      <span>{gameLine(game)}</span>
      {growth && (
        <span key={growth.at} className="rd-note-rise text-lamp" data-testid="game-growth">
          +{growth.by} ♪
        </span>
      )}
    </span>
  )
}
