/**
 * The badge of a due date (D409): „Po terminie” red, „Termin dziś” / „jutro” / „za N dni” / the date muted – in the lines of
 * „Sprawy”, in the panel beside the axis, on the morning plan's cards and on the tile of a task's block on the axis (`compact`:
 * a smaller type, `testId`: the tile's own `block-due` – the E2E tests stand on it).
 */
import type { DueBadge } from '@shared/engine/caseDates'
import { cx } from '../../components/ui'
import { dueTone } from './casesLogic'

export function DueMark({ badge, className, compact, testId = 'case-due' }: { badge: DueBadge; className?: string; compact?: boolean; testId?: string }) {
  const tone = dueTone(badge)
  return (
    <span className={cx('shrink-0', compact ? 'text-[10.5px]' : 'text-[11.5px]', tone === 'over' ? 'text-rose' : 'text-muted', className)} data-testid={testId} data-tone={tone}>
      {badge.text}
    </span>
  )
}
