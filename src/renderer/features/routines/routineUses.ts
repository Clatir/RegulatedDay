/**
 * Where a routine is used (D565 P24, F9): the templates (a block of any of their versions) and the series (a block of any of their versions) that
 * point at it – by their names, never by id. The days that already stand in the folder are not counted (a block of a day keeps its own list
 * of steps, D473).
 */
import type { Template } from '@shared/model/plan'
import type { Series } from '@shared/model/series'

export interface RoutineUses {
  templates: string[]
  series: string[]
}

/**
 * The names of the templates and series whose blocks use the routine `id` (an archived template too – it comes back with its blocks; a removed series is gone);
 * each name once. `seriesName` – a series by its block's name, as the list in „Szablony” has it.
 */
export function routineUses(id: string, templates: readonly Template[], series: readonly Series[], seriesName: (s: Series) => string): RoutineUses {
  const names = (list: string[]) => [...new Set(list)]
  return {
    templates: names(templates.filter((t) => t.versions.some((v) => v.blocks.some((b) => b.routine === id))).map((t) => t.name)),
    series: names(series.filter((s) => !s.archived && s.versions.some((v) => v.block.routine === id)).map(seriesName))
  }
}

/** „Używana w szablonach: „A”, „B” · w seriach: „C””, or – when it is nowhere – the way to use it. */
export function usesText(u: RoutineUses): string {
  const quoted = (list: string[]) => list.map((n) => `„${n}”`).join(', ')
  const parts = [u.templates.length ? `w szablonach: ${quoted(u.templates)}` : '', u.series.length ? `w seriach: ${quoted(u.series)}` : '']
  const text = parts.filter(Boolean).join(' · ')
  return text ? `Używana ${text}` : 'Nie jest użyta w żadnym szablonie ani serii.'
}
