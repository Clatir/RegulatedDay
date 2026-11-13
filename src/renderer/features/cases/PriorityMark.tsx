/**
 * The priority of a sprawa as a narrow coloured stripe on the left of its row, its chip in the panel beside the axis and the
 * tile of its block on the axis (HKU3, D450). The stripe is a graphic: the quarter's name is its label and title, so a screen
 * reader and a hover say it (the colour alone never does). The parent is `relative` (rows, chips, the tile); the stripe lies in
 * its padding box, along the whole height. The bar of the desktop has no priority.
 * On the tile of a block (`apart`) it stands 2 px away from the edge of the category: the priorities' colours are the categories'
 * too, so a stripe laid against an edge of its own colour would be one thick edge – the gap shows the tile's own background and
 * the two stripes stay two.
 */
import { PRIORITY_NAMES, type Priority } from '@shared/model/requests'
import { cx } from '../../components/ui'

/** The classes by name – literal, so that Tailwind finds them (`--color-prio-*` are the theme's tokens, not dimmed with the brightness). */
export const PRIORITY_BG: Record<Priority, string> = { p1: 'bg-prio-p1', p2: 'bg-prio-p2', p3: 'bg-prio-p3', p4: 'bg-prio-p4' }

/** Where the stripe stands: against the left edge of the parent's padding box, or (`apart`) 2 px from it, the gap in the parent's own background. */
export const PRIORITY_PLACE = { flush: 'left-0 rounded-l-[3px]', apart: 'left-[2px] rounded-[1px]' } as const

export function PriorityMark({ priority, className, testId = 'case-priority', apart = false }: { priority: Priority; className?: string; testId?: string; apart?: boolean }) {
  const name = PRIORITY_NAMES[priority].name
  return <span role="img" aria-label={name} title={name} className={cx('absolute inset-y-0 w-[3px]', apart ? PRIORITY_PLACE.apart : PRIORITY_PLACE.flush, PRIORITY_BG[priority], className)} data-testid={testId} data-priority={priority} data-apart={apart ? 'true' : undefined} />
}
