/**
 * A change of a block's fields and the scope of its series (D401, D501): a block of a series whose change touches what the series keeps
 * asks „Tylko to · To i następne · Cała seria” – the fields of the panel and the cost on the tile in „Dziś”, „3 dni” and „Tydzień” alike,
 * one question and one code.
 */
import type { Series } from '@shared/model/series'
import { seriesOfBlock } from '@shared/model/series'
import type { PlanBlock } from '@shared/model/plan'
import type { SaveAnswer } from '../../store/data'
import { askScope } from './scopeAsk'
import { changeSeries } from './seriesActions'
import { occurrenceRuleText, seriesBlockPatch, touchesSeries } from './seriesForm'

/**
 * The scope first: „To i następne” and „Cała seria” are saved here (the series' change, its answer); the question closed – false, nothing
 * changes; „Tylko to”, a block of no series or a change the series does not keep – `'only'`: the caller makes the day's own edit.
 */
export async function seriesFirst(o: { series: readonly Series[]; block: PlanBlock; date: string; today: string; name: string; patch: Partial<PlanBlock> }): Promise<SaveAnswer | 'only'> {
  const of = seriesOfBlock(o.series, o.block, o.date)
  if (!of || !touchesSeries(o.patch)) return 'only'
  const scope = await askScope('change', o.name, occurrenceRuleText(of, o.date, o.today))
  if (!scope) return false
  if (scope === 'only') return 'only'
  return changeSeries({ date: o.date, blockId: o.block.id }, scope, { block: seriesBlockPatch(o.patch) }, 'Seria zmieniona')
}
