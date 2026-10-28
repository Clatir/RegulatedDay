/**
 * The review of the calibration taken into the data (spec „Kalibracja”: „Zmiany obowiązują od daty przeglądu i nie
 * przeliczają dni przeszłych”): a proposal of time is a new version of each template from today with the blocks' new
 * lengths (later versions too, where the block still had its old length); a proposal of cost a change of the settings
 * from now (the rest of today counts by it, as „od dziś”). Each approved proposal is remembered in rd.json's
 * `calibrationReview` – a review opened again never takes one in twice. Every save says whether it saved (T511).
 */
import type { CostProposal, TimeProposal } from '@shared/engine/calibration'
import { paths } from '@shared/data/paths'
import { templateJson } from '@shared/model/defaults'
import { templateFrom, templateVersionOn, type Template } from '@shared/model/plan'
import { calibrationReviewFrom, proposalKey } from '@shared/model/rd'
import type { DayTypeId, RulesSettings } from '@shared/model/settings'
import { editOf, isSaved, rawRecord, trySaveRd, trySaveWith } from '../../store/data'
import { saveSettingsChange } from '../settings/settingsStore'

/**
 * The template with a version from `from` (its blocks as in force then) whose blocks take the new lengths; a later
 * version takes them too where the block still has its old length (one changed by hand keeps it).
 */
export function templateWithTimes(t: Template, changes: ReadonlyArray<{ block: string; fromMin: number; toMin: number }>, from: string): Template {
  const base = templateVersionOn(t, from)
  if (!base) return t
  const by = new Map(changes.map((c) => [c.block, c]))
  const lengths = (v: (typeof t.versions)[number], all: boolean) => ({ ...v, blocks: v.blocks.map((b) => (by.has(b.id) && (all || b.durationMin === by.get(b.id)!.fromMin) ? { ...b, durationMin: by.get(b.id)!.toMin } : b)) })
  const later = t.versions.filter((v) => v.from > from).map((v) => lengths(v, false))
  const earlier = t.versions.filter((v) => v.from < from)
  return { ...t, versions: [...earlier, lengths({ ...base, from }, true), ...later] }
}

/**
 * The change of the settings a proposal of cost makes: the category's costs, or its variant's own (lists go whole);
 * null – the category or the variant is not there any more (never written onto the whole category).
 */
export function costPatch(settings: RulesSettings, p: CostProposal): Record<string, unknown> | null {
  const cat = settings.categories[p.category]
  if (!cat) return null
  if (!p.variant) return { categories: { [p.category]: { costs: p.to } } }
  if (!cat.variants.some((v) => v.id === p.variant)) return null
  return { categories: { [p.category]: { variants: cat.variants.map((v) => (v.id === p.variant ? { ...v, costs: p.to } : v)) } } }
}

/** A proposal of time approved: each template it concerns gets its version from today; true once saved and remembered. */
export async function applyTime(p: TimeProposal, templates: readonly Template[], today: string): Promise<boolean> {
  const byTemplate = new Map<string, Array<{ block: string; fromMin: number; toMin: number }>>()
  for (const b of p.blocks) byTemplate.set(b.template, [...(byTemplate.get(b.template) ?? []), { block: b.block, fromMin: b.fromMin, toMin: b.toMin }])
  // Each template as it is in the change's turn (T517).
  const out = await trySaveWith(() =>
    [...byTemplate].map(([id, changes]) => {
      const rel = paths.record('template', id)
      const before = rawRecord(rel)
      const t = before ? templateFrom(before) : templates.find((x) => x.id === id)
      if (!t) return null
      return editOf(rel, before, templateJson(templateWithTimes(t, changes, today), before))
    })
  )
  return isSaved(out) && remember(proposalKey('time', p.category))
}

/** A proposal of cost approved: a change of the settings from now; false – not saved, or it cannot apply any more. */
export async function applyCost(p: CostProposal, settings: RulesSettings, today: string, todayType: DayTypeId): Promise<boolean> {
  const patch = costPatch(settings, p)
  if (!patch) return false
  return (await saveSettingsChange(patch, todayType, today, today, Date.now())) && remember(proposalKey('cost', p.category, p.variant))
}

/** An approved proposal into rd.json's review. */
async function remember(key: string): Promise<boolean> {
  return isSaved(await trySaveRd((raw) => ({ ...raw, calibrationReview: { ...calibrationReviewFrom(raw.calibrationReview), applied: [...new Set([...calibrationReviewFrom(raw.calibrationReview).applied, key])] } })))
}

/** „Nie teraz”: one more deferral (from the third the morning stops asking – the review waits in the settings). */
export async function deferReview(): Promise<boolean> {
  return isSaved(await trySaveRd((raw) => ({ ...raw, calibrationReview: { ...calibrationReviewFrom(raw.calibrationReview), deferrals: calibrationReviewFrom(raw.calibrationReview).deferrals + 1 } })))
}

/** The review done today: it is not proposed again. */
export async function finishReview(today: string): Promise<boolean> {
  return isSaved(await trySaveRd((raw) => ({ ...raw, calibrationReview: { ...calibrationReviewFrom(raw.calibrationReview), reviewed: today } })))
}
