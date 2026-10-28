/**
 * The calibration (spec „Kalibracja”, D99, D119, T53): the period – the first 14 qualifying days (closed by the ritual,
 * no stationary „zjazd”, regeneration nor free day) from the day of the first closed ritual, at most 28 calendar days;
 * while it lasts, reactions of energy only inform. Its review proposes, one by one: a category's time from at least 5
 * finished blocks (the median of real ÷ planned – without blocks whose end or start is not known; the new lengths in the
 * templates rounded to 5 min), its costs from the signals and relative assessments of at least 5 days with it. The
 * morning plan proposes the review the day after the period, with „Nie teraz” without a limit; after the third deferral
 * it waits in the settings. Pure.
 */
import { POOLS, type Costs, type Pool } from '../model/categories'
import { compareEvents, isKnown, type AnyEvent, type CloseHow, type EnergyEvent, type FeltCost } from '../model/events'
import { templateVersionOn, type Template } from '../model/plan'
import type { RulesSettings } from '../model/settings'
import { addDays } from '../time/zone'
import { settingsAtMinute, type DayContext, type DayState } from './day'
import { anchorEffect } from './energy'
import { OPEN, ranMinutes } from './facts'
import { blockEvidence } from './game'
import { idxOf } from './grid'

export const CALIBRATION_DAYS = 14
export const CALIBRATION_MAX_DAYS = 28
/** A category's time is proposed from at least this many finished blocks, its costs from this many days with it. */
export const MIN_SAMPLES = 5
export const MIN_COST_DAYS = 5
/** After this many „Nie teraz” the morning plan stops asking (D119). */
export const REVIEW_DEFERRALS = 3

/** The felt cost the ritual gathered in the period (D319, spec „dodatkowe źródło”): by category, the days of each answer. */
export type FeltCounts = Record<string, Record<FeltCost, number>>
/** A signal is set against the blocks of at most this many minutes before it (since the anchor before it). */
const ANCHOR_WINDOW_MIN = 180

const NOT_QUALIFYING: ReadonlySet<string> = new Set(['zjazd-stacjonarny', 'regeneracyjny', 'wolne'])

export interface CalibrationDay {
  date: string
  closed: CloseHow | null
  dayType: string
}

export interface CalibrationPeriod {
  /** The day of the first closed ritual. */
  from: string
  /** Its qualifying days so far (at most 14). */
  days: string[]
  /** Over: 14 qualifying days, or 28 calendar days passed. */
  done: boolean
  /** Its last day once over, else null. */
  to: string | null
}

const qualifies = (d: CalibrationDay) => d.closed === 'ritual' && !NOT_QUALIFYING.has(d.dayType)

/** The period from the days so far (any order); null before the first closed ritual. */
export function calibrationPeriod(days: readonly CalibrationDay[], today: string): CalibrationPeriod | null {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const first = sorted.find((d) => d.closed === 'ritual')
  if (!first) return null
  const last = addDays(first.date, CALIBRATION_MAX_DAYS - 1)
  const q = sorted.filter((d) => d.date >= first.date && d.date <= last && qualifies(d)).map((d) => d.date).slice(0, CALIBRATION_DAYS)
  const full = q.length >= CALIBRATION_DAYS
  const done = full || today > last
  return { from: first.date, days: q, done, to: done ? (full ? q.at(-1)! : last) : null }
}

/** Reactions of energy only inform (spec „W okresie kalibracji reakcje tylko informują, bez wariantów”). */
export const inCalibration = (p: CalibrationPeriod | null): boolean => p != null && !p.done

export type ReviewPrompt = 'none' | 'morning' | 'settings'

/** Where the review waits today: the morning plan (the day after the period), the settings after 3 deferrals, or none. */
export function reviewPrompt(p: CalibrationPeriod | null, today: string, o: { deferrals: number; reviewed: boolean }): ReviewPrompt {
  if (!p?.done || p.to == null || o.reviewed || today <= p.to) return 'none'
  return o.deferrals >= REVIEW_DEFERRALS ? 'settings' : 'morning'
}

export interface TimeSample {
  category: string
  plannedMin: number
  realMin: number
}

/**
 * The day's samples of time (spec): finished flexible blocks whose start and end you gave – a click, an answer, a time
 * given later or a correction – so not one ended by itself without your answer (a limit, the bedtime, when you left,
 * the app's close), not one that „happened as planned”, nor one with an absence counted out without „odlicz”.
 */
export function timeSamples(ctx: DayContext, state: DayState): TimeSample[] {
  const out: TimeSample[] = []
  for (const x of blockEvidence(ctx, state)) {
    const p = x.f.planned!
    if (p.fixed || !x.done || x.absenceUnanswered) continue
    if (!(x.givenStart || x.corrected.start) || !(x.givenEnd || x.corrected.end)) continue
    out.push({ category: p.categoryId, plannedMin: p.durationMin, realMin: ranMinutes(x.f, x.f.endedAt!) })
  }
  return out
}

/**
 * A day's evidence of costs, by the costs a block ran with (`costKey`): the minutes in the foreground, and what the
 * anchors put on them (units).
 */
export interface CostEvidence {
  minutes: Record<string, number>
  residual: Record<string, Costs>
}

/**
 * Which costs a block ran with (its key in the evidence): a variant with its own costs – `category:variant`, else the
 * category; a block with its own costs is none of them (null: no evidence for a proposal).
 */
export function costKey(settings: RulesSettings, p: { categoryId: string; variantId: string | null; costs?: Costs | null }): string | null {
  if (p.costs) return null
  const variant = p.variantId ? settings.categories[p.categoryId]?.variants.find((v) => v.id === p.variantId) : undefined
  return variant?.costs ? `${p.categoryId}:${variant.id}` : p.categoryId
}

/** The costs in force for a key (null: the category or its variant is gone, or the variant has no costs of its own). */
export function costsOfKey(settings: RulesSettings, key: string): Costs | null {
  const [cat, variant] = key.split(':') as [string, string | undefined]
  const rules = settings.categories[cat]
  if (!rules) return null
  if (variant == null) return rules.costs
  return rules.variants.find((v) => v.id === variant)?.costs ?? null
}

/**
 * The day's evidence of costs (D99): every signal and relative assessment after the first check-in is set against the
 * blocks in the foreground in the time before it – since the anchor or check-in before (anchors of the same minute share
 * it), at most 3 h – in proportion to their minutes, with the effect it had then: a signal the model did not foresee
 * says their costs were too low. A shared minute is the block's begun last. Null without a check-in or with the energy
 * module off at any moment of the day (`energyOn` – on all day).
 */
export function costEvidence(ctx: DayContext, state: DayState, energyOn: boolean): CostEvidence | null {
  if (!energyOn) return null
  const g = state.grid
  const events = ctx.events.filter((e): e is EnergyEvent & AnyEvent => isKnown(e) && e.dom === 'energy').sort(compareEvents)
  const checkins = events.filter((e) => e.k === 'energy.checkin').map((e) => idxOf(g, e.at))
  if (!checkins.length) return null
  const from = Math.min(...checkins)
  const now = Math.min(state.now, g.length)
  const fg: Array<string | null> = new Array(Math.max(0, now)).fill(null)
  const runs: Array<{ from: number; to: number; key: string | null }> = []
  for (const f of state.facts.blocks.values()) {
    if (!f.planned) continue
    const key = costKey(state.settings, f.planned)
    for (const r of f.runs) if (!r.bg) runs.push({ from: r.from, to: r.to === OPEN ? now : r.to, key })
  }
  for (const r of runs.sort((a, b) => a.from - b.from)) for (let k = Math.max(r.from, from); k < Math.min(r.to, now); k++) fg[k] = r.key
  const minutes: Record<string, number> = {}
  for (let k = from; k < now; k++) if (fg[k]) minutes[fg[k]!] = (minutes[fg[k]!] ?? 0) + 1
  const residual: Record<string, Costs> = {}
  let since = from
  let last: { at: number; since: number } | null = null
  for (const e of events) {
    const at = idxOf(g, e.at)
    if (at < from || at > now) continue
    // A later check-in sets the pools anew: what came before it is no part of the next anchor.
    if (e.k === 'energy.checkin') {
      since = Math.max(since, at)
      continue
    }
    if (e.k !== 'energy.signal' && e.k !== 'energy.relative') continue
    const start: number = last && last.at === at ? last.since : Math.max(since, at - ANCHOR_WINDOW_MIN)
    last = { at, since: start }
    since = at
    const window: Record<string, number> = {}
    let total = 0
    for (let k = start; k < at; k++) {
      if (!fg[k]) continue
      window[fg[k]!] = (window[fg[k]!] ?? 0) + 1
      total++
    }
    if (!total) continue
    const effect = anchorEffect(e, settingsAtMinute(ctx.snapshot, state.facts, at).settings.signalEffects)
    for (const [key, min] of Object.entries(window)) {
      const r = (residual[key] ??= { head: 0, emotions: 0, senses: 0 })
      for (const p of POOLS) r[p] += (effect[p] * min) / total
    }
  }
  return { minutes, residual }
}

export interface TimeProposal {
  category: string
  samples: number
  /** The median of real ÷ planned (two decimals). */
  multiplier: number
  /** The templates' blocks of the category (as in force on the review's day) whose length changes, rounded to 5 min. */
  blocks: Array<{ template: string; block: string; fromMin: number; toMin: number }>
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** The proposals for time: every category with at least 5 samples, with its multiplier and the blocks it changes. */
export function timeProposals(samples: readonly TimeSample[], templates: readonly Template[], date: string): TimeProposal[] {
  const by = new Map<string, number[]>()
  for (const s of samples) if (s.plannedMin > 0) by.set(s.category, [...(by.get(s.category) ?? []), s.realMin / s.plannedMin])
  const out: TimeProposal[] = []
  for (const [category, ratios] of [...by].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (ratios.length < MIN_SAMPLES) continue
    const multiplier = Math.round(median(ratios) * 100) / 100
    const blocks: TimeProposal['blocks'] = []
    for (const t of templates) {
      if (t.archived) continue
      for (const b of templateVersionOn(t, date)?.blocks ?? []) {
        if (b.categoryId !== category || b.fixed) continue
        const toMin = Math.max(5, Math.round((b.durationMin * multiplier) / 5) * 5)
        if (toMin !== b.durationMin) blocks.push({ template: t.id, block: b.id, fromMin: b.durationMin, toMin })
      }
    }
    out.push({ category, samples: ratios.length, multiplier, blocks })
  }
  return out
}

export interface CostProposal {
  category: string
  /** The variant whose own costs change (null: the category's). */
  variant: string | null
  days: number
  hours: number
  from: Costs
  to: Costs
}

/**
 * The proposals for costs: the costs a block ran with (a category's, or a variant's own), in the foreground on at least
 * 5 days of the period, get the change per hour that would have foreseen what their anchors said (a cost k takes 3·k
 * units an hour), rounded, within −5…5 – against the costs in force now.
 */
export function costProposals(days: readonly CostEvidence[], settings: RulesSettings): CostProposal[] {
  const keys = new Set(days.flatMap((d) => Object.keys(d.minutes)))
  const out: CostProposal[] = []
  for (const key of [...keys].sort()) {
    const from = costsOfKey(settings, key)
    if (!from) continue
    const withIt = days.filter((d) => (d.minutes[key] ?? 0) > 0)
    if (withIt.length < MIN_COST_DAYS) continue
    const hours = withIt.reduce((s, d) => s + d.minutes[key]!, 0) / 60
    const to = { ...from }
    for (const p of POOLS as readonly Pool[]) {
      const r = withIt.reduce((s, d) => s + (d.residual[key]?.[p] ?? 0), 0)
      to[p] = Math.max(-5, Math.min(5, Math.round(from[p] - r / (3 * hours))))
    }
    const [category, variant] = key.split(':') as [string, string | undefined]
    if (POOLS.some((p) => to[p] !== from[p])) out.push({ category, variant: variant ?? null, days: withIt.length, hours: Math.round(hours * 10) / 10, from: { ...from }, to })
  }
  return out
}
