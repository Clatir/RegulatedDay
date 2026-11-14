/**
 * A change of a block's fields and the scope of its series (D401, D501): a block of a series whose change touches what the series keeps
 * asks „Tylko to · To i następne · Cała seria” – the fields of the panel and the cost on the tile in „Dziś”, „3 dni” and „Tydzień” alike,
 * one question and one code. The tile's window asks once while it is open (`picked` – its scope for the next changes).
 */
import type { SeriesScope } from '@shared/api'
import type { Series } from '@shared/model/series'
import { seriesOfBlock } from '@shared/model/series'
import type { PlanBlock } from '@shared/model/plan'
import type { SaveAnswer } from '../../store/data'
import { askScope } from './scopeAsk'
import { changeSeries } from './seriesActions'
import { occurrenceRuleText, seriesBlockPatch, touchesSeries } from './seriesForm'

export interface ScopeOf {
  series: readonly Series[]
  block: PlanBlock
  date: string
  today: string
  name: string
  patch: Partial<PlanBlock>
  /** The scope already picked (the tile's open window): not asked again. */
  picked?: SeriesScope | null
}

/** The scope of a change: `'only'` – a block of no series or a change the series does not keep; else the scope picked (asked when not given); null – the question closed. */
export async function changeScope(o: ScopeOf): Promise<SeriesScope | null> {
  const of = seriesOfBlock(o.series, o.block, o.date)
  if (!of || !touchesSeries(o.patch)) return 'only'
  return o.picked ?? (await askScope('change', o.name, occurrenceRuleText(of, o.date, o.today)))
}

/** „To i następne” or „Cała seria”: the series' change (what of the patch the series keeps), said with „Cofnij”. */
export function changeInSeries(date: string, blockId: string, scope: Exclude<SeriesScope, 'only'>, patch: Partial<PlanBlock>): Promise<SaveAnswer> {
  return changeSeries({ date, blockId }, scope, { block: seriesBlockPatch(patch) }, 'Seria zmieniona')
}

/**
 * The scope first: „To i następne” and „Cała seria” are saved here (the series' change, its answer); the question closed – false, nothing
 * changes; „Tylko to”, a block of no series or a change the series does not keep – `'only'`: the caller makes the day's own edit.
 */
export async function seriesFirst(o: ScopeOf): Promise<SaveAnswer | 'only'> {
  const scope = await changeScope(o)
  if (!scope) return false
  return scope === 'only' ? 'only' : changeInSeries(o.date, o.block.id, scope, o.patch)
}
