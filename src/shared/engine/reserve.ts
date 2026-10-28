/**
 * Reactions to the reserve (spec „Reakcje aplikacji”, Grywalizacja „Reakcja na rezerwę”, D241, D244): the way of
 * regeneration the message proposes, and whether the day keeps the reward. When a message was seen comes from the bar
 * (spec „Timer”: a panel or the main window with presence, a clicked notification); a message waiting in the session or
 * class mode is seen after the mode ends.
 */
import { REGEN_CATEGORY, costsOf, type Pool } from '../model/categories'
import { isKnown, type AnyEvent } from '../model/events'
import type { RulesSettings } from '../model/settings'
import type { DayState } from './day'
import type { Descent, EnergyState } from './energy'
import { idxOf } from './grid'

/** Rest that counts lasts without a break at least this long, from the later of its start and the descent. */
const REST_MIN = 10
/** It begins at the latest this long after the message is first seen. */
const SEEN_WINDOW = 60
/** A message first seen later than this before the effective bedtime counts as not seen. */
const BEFORE_BED = 10

/**
 * The way of regeneration for a pool: the lowest cost in it, on a tie the first of your list (spec, T121, T167); a way
 * without its own costs has the category's.
 */
export function suggestRegen(settings: RulesSettings, pool: Pool): string | null {
  const regen = settings.categories[REGEN_CATEGORY]
  let best: { id: string; cost: number } | null = null
  for (const v of regen?.variants ?? []) {
    const cost = costsOf(regen!, v.id)[pool]
    if (!best || cost < best.cost) best = { id: v.id, cost }
  }
  return best?.id ?? null
}

export interface Sighting {
  /** The first moment the message was seen (index), null: not seen. */
  seenAt: number | null
  /** Only as the silent icon of „mniej pytań” (D157), also once opened. */
  iconOnly: boolean
}

export type ReactionStatus = 'met' | 'excused' | 'missed' | 'pending'

export interface Reaction {
  /** 'none': the day does not count (energy unknown, the module off that day, the check-in after the first work). */
  verdict: 'reward' | 'missed' | 'pending' | 'none'
  why: string | null
  descents: Array<{ descent: Descent; status: ReactionStatus; rest: { from: number; to: number } | null }>
}

export interface ReactionInput {
  events: readonly AnyEvent[]
  day: DayState
  energy: EnergyState
  seen: (d: Descent) => Sighting
  /** The day is closed: what is still open is decided. */
  over?: boolean
}

/** Stretches of rest without a break, up to now (the day engine's regeneration for this reward, as known now). */
function restStretches(day: DayState): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = []
  let start = -1
  for (let k = 0; k <= day.now; k++) {
    const on = k < day.now && day.rewardRest[k]! !== 0
    if (on && start < 0) start = k
    if (!on && start >= 0) {
      out.push({ from: start, to: k })
      start = -1
    }
  }
  return out
}

/**
 * The reward „Reakcja na rezerwę”: no descent, or after each one a rest of at least 10 min without a break, begun after
 * the descent and at the latest 60 min after the message was first seen (also one going on when it is seen), or going
 * on already at the descent. A descent does not take the reward away when its message was not seen 10 min before the
 * effective bedtime, was only the silent icon of „mniej pytań”, or repeats an earlier descent of its pool.
 */
export function reserveReaction(inp: ReactionInput): Reaction {
  const { day, energy } = inp
  const firstUse = (() => {
    let at: number | null = null
    for (const e of inp.events) if (isKnown(e) && e.k === 'presence.first') at = Math.min(at ?? Number.POSITIVE_INFINITY, idxOf(day.grid, e.at))
    return at
  })()
  const none = (why: string): Reaction => ({ verdict: 'none', why, descents: [] })
  if (!energy.known) return none('energia nieznana')
  if (energy.offToday) return none('energia wyłączona tego dnia')
  // Only with the first check-in before the first block of work (begun before the first use: that use counts).
  const work = day.firstWorkStart != null && firstUse != null && day.firstWorkStart < firstUse ? firstUse : day.firstWorkStart
  if (work != null && energy.checkinAt! > work) return none('check-in po pierwszym bloku pracy')

  const stretches = restStretches(day)
  const bedLimit = day.bedtime.effective - BEFORE_BED
  const seenPools = new Set<Pool>()
  const out: Reaction['descents'] = []
  for (const d of energy.descents) {
    const repeat = seenPools.has(d.pool)
    seenPools.add(d.pool)
    if (d.silent || repeat) {
      out.push({ descent: d, status: 'excused', rest: null })
      continue
    }
    const s = inp.seen(d)
    const seen = s.seenAt != null && s.seenAt <= bedLimit && !s.iconOnly ? s.seenAt : null
    // Rest going on at the descent, or begun after it within 60 min of the first sighting.
    const fits = (r: { from: number; to: number }) => r.to > d.at && (r.from < d.at || (seen != null && r.from <= seen + SEEN_WINDOW))
    const done = stretches.find((r) => fits(r) && r.to - Math.max(r.from, d.at) >= REST_MIN)
    if (done) {
      out.push({ descent: d, status: 'met', rest: done })
      continue
    }
    let status: ReactionStatus
    if (s.iconOnly || (s.seenAt != null && seen == null)) status = 'excused'
    else if (seen == null) status = inp.over || day.now > bedLimit ? 'excused' : 'pending'
    else {
      const going = stretches.some((r) => r.to === day.now && fits(r))
      status = !inp.over && (day.now <= seen + SEEN_WINDOW || going) ? 'pending' : 'missed'
    }
    out.push({ descent: d, status, rest: null })
  }
  const verdict = out.some((x) => x.status === 'missed') ? 'missed' : out.some((x) => x.status === 'pending') ? 'pending' : 'reward'
  return { verdict, why: null, descents: out }
}
