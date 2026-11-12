/**
 * „Przesunięto N bloków w K dniach · Cofnij” on top of „Tydzień” (D400): the window's line (`store/weekPush`) – it outlives the
 * page and stands to the end of `UNDO_LINE_MS` from the save – while a day of the batch still stands as it left it, or its
 * file cannot be read now (it is judged when „Cofnij” is clicked); „Cofnij” takes back those that stand, in one write
 * (`undoWeekLine`: what did not go through stays in the line).
 */
import { useMemo } from 'react'
import { useBusy } from '../../lib/busy'
import { useDayFiles } from '../../store/day'
import { useWeekPush, weekPushLeft, type WeekPushLine as Line } from '../../store/weekPush'
import { undoWeekLine, weekPushStanding } from './weekActions'
import { weekPushLineText } from './weekText'

export function WeekPushLine() {
  const line = useWeekPush((s) => s.line)
  // Without a line nothing is read: the days of a line are only asked for while it is there.
  return line && weekPushLeft(line) > 0 ? <WeekPushShown key={line.seq} line={line} /> : null
}

export function WeekPushShown({ line }: { line: Line }) {
  const dates = useMemo(() => line.push.days.map((d) => d.date), [line.push])
  // Only the read of these very days counts (after the line is replaced or trimmed the old read is not it).
  const files = useDayFiles(dates, true)
  const [busy, run] = useBusy()
  if (!weekPushStanding(line.push, files)) return null
  return (
    <div className="flex items-center gap-2 self-start rounded border border-line bg-raised px-3 py-1.5 text-[12.5px]" role="status" data-testid="week-pushed">
      <span>{weekPushLineText(line.push)}</span>
      <button type="button" className="btn" disabled={busy} onClick={() => void run(undoWeekLine)} data-testid="week-pushed-undo">
        Cofnij
      </button>
    </div>
  )
}
