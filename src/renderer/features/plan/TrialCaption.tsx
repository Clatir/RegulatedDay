/**
 * The caption of energy live (N19, D593, D594): „najniższa energia 52 → 44 (G)” – the lowest energy of the day before a change not written yet
 * (a drag, an edge, the window of a tile's cost) and with it, the pool that is the lowest after it in the letter of the tiles (G · E · B · C).
 * A day counted from the assumed check-in (a day to come, today before its own) says „· przyjęte” (D593, as beside the curve); a number that is
 * not the newest change's yet (the newest is being counted) is dimmed; a change that does not change the lowest says nothing (D594, as the line
 * after a change, D529). The numbers come from `useTrialLowest` (`plan/trialEnergy.ts`).
 */
import { cx } from '../../components/ui'
import { ASSUMED_CAPTION, POOL_LETTER } from './energyDraw'
import type { TrialShown } from './trialEnergy'

/** The words of the caption; null – nothing to say (D594: the lowest stays as it is). */
export function trialText(t: Pick<TrialShown, 'before' | 'after' | 'pool' | 'assumed'> | null): string | null {
  if (!t || t.after === t.before) return null
  return `najniższa energia ${t.before} → ${t.after} (${POOL_LETTER[t.pool]})${t.assumed ? ` · ${ASSUMED_CAPTION}` : ''}`
}

/** The caption as a line of a hint (`className` places it; dimmed while the newest change is counted). */
export function TrialCaption({ shown, className, testId = 'energy-trial' }: { shown: TrialShown | null; className?: string; testId?: string }) {
  const text = trialText(shown)
  if (!text) return null
  return (
    <span className={cx('num', shown!.fresh ? 'text-fg' : 'text-muted', className)} data-testid={testId} data-fresh={shown!.fresh ? 'true' : 'false'} data-after={shown!.after} data-before={shown!.before} data-pool={shown!.pool}>
      {text}
    </span>
  )
}
