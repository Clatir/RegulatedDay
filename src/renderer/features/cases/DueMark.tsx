/**
 * The badge of a due date (D409): „Po terminie” red, „Termin dziś” / „jutro” / „za N dni” / the date muted – in the lines of
 * „Sprawy” and in the panel beside the axis (the tile of a task's block on the axis draws its own, `Timeline`).
 */
import type { DueBadge } from '@shared/engine/caseDates'
import { cx } from '../../components/ui'
import { dueTone } from './casesLogic'

export function DueMark({ badge, className }: { badge: DueBadge; className?: string }) {
  const tone = dueTone(badge)
  return (
    <span className={cx('shrink-0 text-[11.5px]', tone === 'over' ? 'text-rose' : 'text-muted', className)} data-testid="case-due" data-tone={tone}>
      {badge.text}
    </span>
  )
}
