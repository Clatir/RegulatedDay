/**
 * The game in the main window (D322): read again at every change of the data and every minute (today's notes grow with
 * the time), shared by the header of „Dziś”, the room and the celebrations. `game` null – no game yet (or no folder);
 * `loaded` false – not counted yet; `failed` – the last count failed (the last good one stays).
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import type { GameScreen } from '@shared/api'
import { useData } from './data'

export const useGame = create<{ game: GameScreen | null; loaded: boolean; failed: boolean }>(() => ({ game: null, loaded: false, failed: false }))

/** Mounted once in the main window: keeps `useGame` fresh while the folder is open and the game module on. */
export function useGameFeed(): void {
  const stamp = useData((s) => s.stamp)
  const open = useData((s) => s.view?.status === 'open')
  const on = useData((s) => s.rd.general.modules.game)
  useEffect(() => {
    if (!open || !on) return void useGame.setState({ game: null, loaded: open, failed: false })
    let alive = true
    const load = () =>
      void window.rd
        .game()
        .then((game) => alive && useGame.setState({ game, loaded: true, failed: false }))
        // A count that failed keeps the last one (the next change or minute tries again).
        .catch(() => alive && useGame.setState({ failed: true }))
    load()
    const t = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [stamp, open, on])
}
