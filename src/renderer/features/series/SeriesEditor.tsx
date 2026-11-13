/**
 * A series in the list of „Szablony” (D381, D401): its name and rule in words, the same fields as the panel of a block (the
 * rule, its end, „W dni szczególne”, and the block's own fields in the panel beside), „Zakończ serię” and „Usuń serię”. A
 * change from the list is the whole series from today (T709: `{ seriesId }`, scope „Cała seria”) – the days gone by, and the
 * occurrences changed on their own day, stay. A series that has ended is only shown.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Series } from '@shared/model/series'
import { settingsOn } from '@shared/model/settings'
import { plDate } from '@shared/format'
import { addDays } from '@shared/time/zone'
import { useBusy } from '../../lib/busy'
import { useData } from '../../store/data'
import { BlockEditor } from '../plan/BlockEditor'
import { changeSeriesListSteps } from '../../store/steps'
import { StepsEditor } from '../steps/StepsEditor'
import { blockName, type Names } from '../plan/blockView'
import { SeriesFields } from './SeriesFields'
import { changeSeries, endSeries, removeSeries } from './seriesActions'
import { draftOf, draftPatch, draftProblem, isEmptyPatch, occurrenceRuleText, seriesBlockOf, seriesBlockPatch, type SeriesDraft } from './seriesForm'

/** The names the list and the editor use for a series' block: today's settings, the routines and requests. */
export function useSeriesNames(today: string): Names {
  const { rd, routines, requests } = useData()
  return useMemo(() => ({ rd, settings: settingsOn(rd.settings, today), routines, requests }), [rd, today, routines, requests])
}

export function SeriesEditor({ series, today, onClosed }: { series: Series; today: string; onClosed: () => void }) {
  const { seriesPlans } = useData()
  const view = useData((s) => s.view)!
  const names = useSeriesNames(today)
  const last = seriesPlans.find((p) => p.series.id === series.id)?.last ?? series.until
  // Ended: its days gone by keep their occurrences, nothing is left to change.
  const ended = last != null && last < today
  const block = useMemo(() => seriesBlockOf(series, today), [series, today])
  const base = useMemo(() => draftOf(series, today), [series, today])
  const sig = JSON.stringify(base)
  const [draft, setDraft] = useState<SeriesDraft>(base)
  useEffect(() => setDraft(base), [sig])
  const [busy, run] = useBusy()
  const name = blockName(block, names)
  const patch = draftPatch(base, draft)
  const problem = draftProblem(draft)

  const saveRule = () =>
    run(async () => {
      if (isEmptyPatch(patch)) return
      await changeSeries({ seriesId: series.id }, 'all', patch, 'Seria zmieniona')
    })
  const end = () => run(async () => void (await endSeries(series.id, addDays(today, -1), `Seria zakończona: ${name}`)))
  const remove = () =>
    run(async () => {
      if ((await removeSeries({ seriesId: series.id }, 'all', `Usunięta seria: ${name}`)) === true) onClosed()
    })
  return (
    <div className="flex min-h-0 flex-1" data-testid="series-editor">
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <h2 className="text-[15px] font-medium" data-testid="series-name">
          {name}
        </h2>
        <p className="text-[12.5px]" data-testid="series-rule-text">
          <span className="text-muted">Powtarza się: </span>
          {occurrenceRuleText(series, today, today)}
        </p>
        {ended && (
          <p className="text-[12.5px] text-muted" data-testid="series-ended">
            Ta seria zakończyła się{last ? ` ${plDate(last)}` : ''} – jej dni minione zostają w planach. Utwórz nową serię z bloku w „Dziś”, „Tygodniu” albo „Kalendarzu”.
          </p>
        )}
        <div className="max-w-[420px]">
          <SeriesFields draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} today={today} readOnly={ended} allowNone={false} />
        </div>
        {!ended && !isEmptyPatch(patch) && (
          <div className="flex flex-col gap-1">
            <button type="button" className="btn btn-accent self-start" disabled={busy || problem != null} onClick={() => void saveRule()} data-testid="series-save">
              Zapisz zmianę serii
            </button>
          </div>
        )}
        <p className="text-[12px] text-muted">Zmiana serii z listy działa od dziś (dzisiejsze wystąpienie, gdy jeszcze się nie zaczęło); dni minione i wystąpienia zmienione osobno zostają.</p>
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {!ended && (
            <button type="button" className="btn" disabled={busy} onClick={() => void end()} data-testid="series-end-now">
              Zakończ serię
            </button>
          )}
          <button type="button" className="btn" disabled={busy} onClick={() => void remove()} data-testid="series-remove">
            Usuń serię
          </button>
        </div>
      </div>
      <BlockEditor
        key={series.id}
        block={block}
        plan={[]}
        names={names}
        computers={view.computers}
        inSeries
        place={{ scope: 'series', root: series.root }}
        readOnly={ended}
        onChange={(p) => {
          const b = seriesBlockPatch(p)
          if (!Object.keys(b).length) return
          return changeSeries({ seriesId: series.id }, 'all', { block: b }, 'Seria zmieniona')
        }}
        onClose={onClosed}
        // D440: the series' list without boxes (every occurrence starts with none ticked), changed for the whole series from today.
        steps={
          <StepsEditor
            steps={block.steps}
            lengthMin={block.durationMin}
            ticks={false}
            readOnly={ended}
            // The op goes to each version's own list in the write's turn; „Cofnij” only for a removal (D443: an empty text – none).
            onOp={(op) => changeSeriesListSteps(series.id, op, op.op === 'remove' ? 'Krok usunięty' : '')}
          />
        }
      />
    </div>
  )
}
