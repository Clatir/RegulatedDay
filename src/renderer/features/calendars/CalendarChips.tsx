/**
 * The chips over a view (D419): one per calendar, in its colour; a click checks it or unchecks it (an unchecked calendar's
 * blocks are not in the views of the window), and „ukryte: N” says how many blocks of the view are hidden. With one calendar
 * („Moje” only) there is nothing to switch: no chips.
 */
import { blockFill } from '@shared/theme'
import { cx } from '../../components/ui'
import { useData } from '../../store/data'
import { useMachine } from '../../store/machine'
import { useCalendarFilter } from './calendarFilter'

export function CalendarChips({ hiddenCount, className }: { hiddenCount: number; className?: string }) {
  const calendars = useData((x) => x.rd.calendars)
  const hidden = useCalendarFilter((x) => x.hidden)
  const toggle = useCalendarFilter((x) => x.toggle)
  const brightness = useMachine((x) => x.prefs.brightness)
  if (calendars.length < 2) return null
  return (
    <div className={cx('flex flex-wrap items-center gap-1.5', className)} role="group" aria-label="Kalendarze" data-testid="calendar-chips">
      {calendars.map((c) => {
        const on = !hidden.includes(c.id)
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            title={on ? `Ukryj kalendarz „${c.name}” w widokach` : `Pokaż kalendarz „${c.name}”`}
            className={cx('flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px]', on ? 'text-fg' : 'border-dashed text-muted line-through')}
            style={on ? { background: blockFill(c.color, brightness), borderColor: c.color } : { borderColor: 'var(--color-line-strong)' }}
            onClick={() => toggle(c.id)}
            data-testid="calendar-chip"
            data-calendar={c.id}
          >
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: c.color, opacity: on ? 1 : 0.4 }} />
            {c.name}
          </button>
        )
      })}
      {hiddenCount > 0 && (
        <span className="text-[12px] text-muted" data-testid="calendar-hidden-count">
          ukryte: {hiddenCount}
        </span>
      )}
    </div>
  )
}
