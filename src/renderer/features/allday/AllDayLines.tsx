/**
 * The lines of all-day events on top of „Dziś” and „Tydzień” (D406): „Usunięto „…” · Cofnij” and „Typ dnia „Wolne” na K
 * dniach · Cofnij”, 15 minutes (`store/allDayLine`). „Cofnij” of a removal brings the record back (only while none of its id
 * is there); of „Wolne” – the days that still stand as it left them.
 */
import { allDayRemovedText } from '@shared/model/allDay'
import { useBusy } from '../../lib/busy'
import { allDayRel, restoreAllDay } from '../../store/allDay'
import { dropAllDayLine, linesOf, useAllDayLines, type AllDayLine, type AllDayLinePage } from '../../store/allDayLine'
import { rawRecord } from '../../store/data'
import { freeLineText } from './allDayView'
import { undoFreeDays } from './freeDays'

export function AllDayLines({ page }: { page: AllDayLinePage }) {
  const lines = useAllDayLines((s) => s.lines)
  const mine = linesOf(lines, page)
  if (!mine.length) return null
  return (
    <div className="flex flex-col items-start gap-1" data-testid={`allday-lines-${page}`}>
      {mine.map((l) => (
        <LineView key={l.seq} line={l} />
      ))}
    </div>
  )
}

function LineView({ line }: { line: AllDayLine }) {
  const [busy, run] = useBusy()
  const undo = () =>
    run(async () => {
      if (line.kind === 'removed') {
        // A record of its id there already (brought back elsewhere): nothing more to take back.
        if ((await restoreAllDay(line.raw)) || rawRecord(allDayRel(String(line.raw.id))) != null) dropAllDayLine(line.seq)
        return
      }
      if ((await undoFreeDays(line.change)).saved) dropAllDayLine(line.seq)
    })
  return (
    <div className="flex items-center gap-2 rounded border border-line bg-raised px-3 py-1.5 text-[12.5px]" role="status" data-testid={line.kind === 'removed' ? 'allday-removed' : 'allday-free-set'}>
      <span>{line.kind === 'removed' ? allDayRemovedText(line.title) : freeLineText(line.change.days.length)}</span>
      <button type="button" className="btn" disabled={busy} onClick={() => void undo()} data-testid="allday-line-undo">
        Cofnij
      </button>
    </div>
  )
}
