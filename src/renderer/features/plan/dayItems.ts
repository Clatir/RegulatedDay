/**
 * The axis of a counted day: the plan's blocks at their planned times (an anchored one after its anchor), dimmed when
 * passed, parked or cancelled; the lines of the wake, the boundary (approved – solid, a proposal – dashed), the maximum,
 * the hard end, the bedtime's forecast and now; the energy's forecast (after the check-in).
 *
 * Until the timer of E4a writes starts and ends, blocks stand where the plan put them – the engine's numbers (boundary,
 * hard end, pool) are its own (T-decision of E3).
 */
import { plannedSpan } from '@shared/engine/blocks'
import { atOf } from '@shared/engine/grid'
import { durationLabel, logicalClock } from '@shared/format'
import { logicalMinuteOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import type { DayModel } from '../../store/day'
import { blockColor, blockMarks, blockName, type Names } from './blockView'
import type { EnergyTrack, TimelineItem, TimelineMarker } from './Timeline'

export interface DayAxis {
  items: TimelineItem[]
  markers: TimelineMarker[]
  energy: EnergyTrack | null
  from: number
  to: number
}

export function dayAxis(model: DayModel, names: Names, now: number | null): DayAxis {
  const { state, ctx } = model
  const g = state.grid
  const lm = (idx: number) => logicalMinuteOf(model.date, atOf(g, idx))
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const yesterday = addDays(model.date, -1)
  const nowIdx = now != null ? Math.round((now - g.start) / 60_000) : null
  const items: TimelineItem[] = []
  for (const p of ctx.plan) {
    const info = byId.get(p.id)
    if (!info) continue
    const span = plannedSpan(info, byId)
    if (!span) continue
    const f = state.facts.blocks.get(p.id)
    const gone = f?.parkedAt != null ? 'zaparkowany' : f?.cancelledAt != null ? 'odwołany' : null
    items.push({
      id: p.id,
      startMin: lm(span.start),
      endMin: lm(span.end),
      title: gone ? `${blockName(p, names)} (${gone})` : blockName(p, names),
      marks: blockMarks(p, { afterWork: info.afterWorkMark, fromYesterday: p.movedFrom === yesterday }),
      color: blockColor(p.categoryId, names),
      background: info.bg,
      dim: gone != null || (nowIdx != null && span.end <= nowIdx),
      waits: info.waits
    })
  }
  const markers: TimelineMarker[] = []
  markers.push({ at: lm(state.wake), label: `pobudka ${logicalClock(lm(state.wake))}`, tone: 'muted' })
  const b = state.boundary
  if (b.approved != null) markers.push({ at: lm(b.approved), label: `granica ${logicalClock(lm(b.approved))}`, tone: 'lamp' })
  else if (b.proposal != null) markers.push({ at: lm(b.proposal), label: `propozycja granicy ${logicalClock(lm(b.proposal))}`, tone: 'lamp', dashed: true })
  markers.push({ at: lm(b.max), label: `maksimum ${logicalClock(lm(b.max))}`, tone: 'rose', dashed: true })
  if (!state.hardEnd.unreachable && state.hardEnd.at < state.bedtime.forecast) markers.push({ at: lm(state.hardEnd.at), label: `twardy koniec ${logicalClock(lm(state.hardEnd.at))}`, tone: 'sea', dashed: true })
  markers.push({ at: lm(state.bedtime.forecast), label: `pora snu ${logicalClock(lm(state.bedtime.forecast))}`, tone: 'muted' })
  if (nowIdx != null && nowIdx >= 0 && nowIdx <= g.length) markers.push({ at: lm(nowIdx), label: `teraz ${logicalClock(lm(nowIdx))}`, tone: 'fg' })

  let energy: EnergyTrack | null = null
  const e = model.energy
  if (e.known && e.enabled) {
    const samples: EnergyTrack['samples'] = []
    for (let k = 0; k < Math.min(g.length, e.series.head.length); k += 10) {
      const v = { head: e.series.head[k]!, emotions: e.series.emotions[k]!, senses: e.series.senses[k]! }
      if (Number.isFinite(v.head)) samples.push({ at: lm(k), ...v })
    }
    energy = { samples, reserve: e.reserve }
  }
  return { items, markers, energy, from: Math.min(lm(state.wake) - 30, 6 * 60), to: Math.max(lm(state.bedtime.forecast) + 30, 22 * 60) }
}

/** The day's numbers in words (the plan's summary). */
export function daySummary(model: DayModel): string[] {
  const s = model.state
  const out: string[] = []
  out.push(`budżet pracy ${durationLabel(s.budgetUsedMin + s.budget.forecastMin)} z ${durationLabel(s.budget.limitMin)}`)
  out.push(`minimum regeneracji ${durationLabel(s.regen.requiredMin)}`)
  if (!s.hardEnd.unreachable) out.push(`pula projektów ${durationLabel(Math.max(0, s.pool.min))}`)
  return out
}
