/**
 * The field „Powtarzaj” of a block's panel (D381, D401), in „Dziś”, „Tydzień” and „Kalendarz” alike (they all open the
 * day's panel): a block of yours – flexible or fixed, one of a template too – can become a series (the rule, its end,
 * „W dni szczególne”, then „Utwórz serię”: the block is the first occurrence); a block that is an occurrence says its rule in
 * words („co 2 tygodnie w czwartek, do 30.04”) and edits it – the change asks „To i następne · Cała seria” (a change of the
 * rule is never one day's). Not for a block of a session, a lecture, a class of a „zjazd”, the second shift or requests.
 */
import { useEffect, useMemo, useState } from 'react'
import type { SeriesScope } from '@shared/api'
import { blockNotSeries } from '@shared/engine/series'
import type { PlanBlock } from '@shared/model/plan'
import { seriesOfBlock } from '@shared/model/series'
import { useBusy } from '../../lib/busy'
import { useData } from '../../store/data'
import { changeSeries, createSeries } from './seriesActions'
import { askScope } from './scopeAsk'
import { SeriesFields } from './SeriesFields'
import { createInput, draftOf, draftPatch, draftProblem, isEmptyPatch, newDraft, occurrenceRuleText, type SeriesDraft } from './seriesForm'

/** Whether the panel of this block has the field at all (a block of the plan, not the one still to be added). */
export function blockMayRepeat(b: PlanBlock): boolean {
  return b.origin === 'series' || blockNotSeries(b) == null
}

/**
 * The short reason „Powtarzaj” is not offered on a block of requests or of a task (D408) – said in the panel in place of the
 * field; null for any other block (a session, a lecture… simply has no field, as before).
 */
export function repeatNote(b: PlanBlock): string | null {
  return b.task || b.requests.length ? (blockNotSeries(b)?.message ?? null) : null
}

/** The note in place of „Powtarzaj” (`repeatNote`). */
export function RepeatNote({ text }: { text: string }) {
  return (
    <p className="border-t border-line pt-3 text-[12px] text-muted" data-testid="series-unavailable">
      Powtarzaj: niedostępne. {text}
    </p>
  )
}

export function BlockSeries({ block, date, today, name, onCreated }: { block: PlanBlock; date: string; today: string; name: string; onCreated?: (seriesId: string) => void }) {
  const series = useData((s) => s.series)
  const own = useMemo(() => seriesOfBlock(series, block, date), [series, block, date])
  const base = useMemo(() => (own ? draftOf(own, date) : newDraft(date)), [own, date])
  const sig = JSON.stringify(base)
  const [draft, setDraft] = useState<SeriesDraft>(base)
  // The series changed (here, on another computer, after „Cofnij”): the form shows it again.
  useEffect(() => setDraft(base), [sig])
  const [busy, run] = useBusy()
  const patch = own ? draftPatch(base, draft) : null
  const problem = draftProblem(draft)
  const change = (p: Partial<SeriesDraft>) => setDraft((d) => ({ ...d, ...p }))

  if (block.origin === 'series' && !own) return null
  if (!own && blockNotSeries(block)) return null

  const create = () =>
    run(async () => {
      const input = createInput(date, block.id, draft)
      if (!input) return
      const r = await createSeries(input, 'Seria ustawiona')
      if (r.answer === true && r.seriesId) onCreated?.(r.seriesId)
    })
  const save = () =>
    run(async () => {
      if (!own || !patch || isEmptyPatch(patch)) return
      // A change of the rule, the end or the special days is never one day's: „Tylko to” is not offered.
      const scopes: SeriesScope[] = ['following', 'all']
      const scope = await askScope('change', name, occurrenceRuleText(own, date, today), scopes)
      if (!scope) return
      await changeSeries({ date, blockId: block.id }, scope, patch, 'Seria zmieniona')
    })
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3" data-testid="block-series">
      {own && (
        <p className="text-[12.5px]" data-testid="series-text">
          <span className="text-muted">Seria: </span>
          {occurrenceRuleText(own, date, today)}
        </p>
      )}
      <SeriesFields draft={draft} onChange={change} today={today} allowNone={!own} />
      {!own && draft.kind !== 'none' && (
        <button type="button" className="btn btn-accent self-start" disabled={busy || problem != null} onClick={() => void create()} data-testid="series-create">
          Utwórz serię
        </button>
      )}
      {own && patch && !isEmptyPatch(patch) && (
        <div className="flex flex-col gap-1">
          <button type="button" className="btn btn-accent self-start" disabled={busy || problem != null} onClick={() => void save()} data-testid="series-save">
            Zmień serię…
          </button>
          <span className="text-[11.5px] text-muted">Zmiana serii działa od dziś; dni minione zostają.</span>
        </div>
      )}
    </div>
  )
}
