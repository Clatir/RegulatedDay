/**
 * „Zmieniono 4 bloki · najniższa energia 52 → 44 · Cofnij” (D529, T1541): the line of a view after a change of a selection – in the window,
 * above the view's columns, list or calendar. The window's line (`store/groupLine`) stands to the end of `UNDO_LINE_MS`; „Cofnij” takes the
 * change back once and the line goes. The view says where it stands (`className`); the look is the one of `WeekPushLine`.
 */
import { groupLineLeft, undoGroupLine, useGroupLine, type GroupView } from '../store/groupLine'
import { cx } from './ui'

export function GroupLine({ view, className }: { view: GroupView; className?: string }) {
  const line = useGroupLine((s) => s.lines[view])
  // A line whose undo is running stays whatever the time (the store takes it away when the undo ends).
  if (!line || (groupLineLeft(line) <= 0 && !line.undoing)) return null
  return (
    // The text alone is the status (a window's message: a press on it is never „elsewhere”); „Cofnij” is not – a press on it leaves what is open
    // (a menu, a new block's panel) like a press on any other button.
    <div className={cx('flex items-center gap-2 self-start rounded border border-line bg-raised px-3 py-1.5 text-[12.5px]', className)} data-testid={`group-line-${view}`}>
      <span role="status">{line.text}</span>
      <button type="button" className="btn" disabled={line.undoing} onClick={() => void undoGroupLine(view)} data-testid={`group-line-${view}-undo`}>
        Cofnij
      </button>
    </div>
  )
}
