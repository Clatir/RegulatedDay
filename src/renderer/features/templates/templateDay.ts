/**
 * The day a template's version makes, as the page of „Szablony” counts it for its axis – one rule for the page (its render) and for a
 * change counted in the turn of its write (a group's change, D528: A6-01 – from the template as it is then, never the render's day).
 */
import type { PlanInputs } from '@shared/engine/context'
import { templateVersionOn, type Template, type TemplateVersion } from '@shared/model/plan'
import { placeLogical } from '@shared/time/day'
import { addDays, weekday } from '@shared/time/zone'
import { countDay, type DayModel } from '../../store/day'
import { axisVersion, previewChanges } from './sessionChoices'

/** The version of `t` from `from` as it is, or as it would be made (a copy of the one in force then; none – an empty one). */
export function versionFrom(t: Template, from: string): TemplateVersion {
  const inForce = templateVersionOn(t, from)
  return t.versions.find((v) => v.from === from) ?? (inForce ? { ...inForce, from } : { from, blocks: [], budgetMin: null, maxMin: null })
}

/** The day the version is counted on: the first date from `from` with one of the template's weekdays (none – `from`). */
export function sampleDay(t: Pick<Template, 'weekdays'>, from: string): string {
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i)
    if (!t.weekdays.length || t.weekdays.includes(weekday(d))) return d
  }
  return from
}

/**
 * The day `version` of `t` makes on `sample` (D515, T1455: every session of the version on the axis, whole – `axisVersion`; the template
 * as written – `previewChanges`, T1450), counted from 04:00 without the energy.
 */
export function templateDayOf(t: Template, version: TemplateVersion, sample: string, inputs: Pick<PlanInputs, 'changes' | 'lectures' | 'routines'>): DayModel {
  const only: Template = { ...t, versions: [{ ...axisVersion(version, sample), from: '2000-01-01' }] }
  return countDay(
    sample,
    { date: sample, dayFile: { schema: 1, date: sample, dayType: t.dayType }, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false },
    { changes: previewChanges(inputs.changes), templates: [only], lectures: inputs.lectures, series: [], routines: inputs.routines },
    placeLogical(sample, 4 * 60),
    false
  )
}
