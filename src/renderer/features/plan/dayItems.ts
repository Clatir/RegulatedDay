/**
 * The axis of a counted day: started blocks where they ran (a running one up to now or its planned end), blocks still
 * to come where the forecast puts them today (other days: at their planned times, an anchored one after its anchor),
 * dimmed when passed, parked or cancelled; the lines of the wake, the boundary (approved – solid, a proposal – dashed),
 * the maximum, the hard end, the bedtime's forecast and now; the energy's forecast (after the check-in).
 */
import { ownHourBlock, plannedSpan } from '@shared/engine/blocks'
import { namingOf } from '@shared/engine/context'
import { dueBadge } from '@shared/engine/caseDates'
import { atOf, logicalSpan } from '@shared/engine/grid'
import { runningEdges } from '@shared/engine/resize'
import { plannedEndOf } from '@shared/engine/timer'
import { durationLabel, logicalClock } from '@shared/format'
import { logicalMinuteOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import type { DayModel } from '../../store/day'
import { blockColor, blockMarks, blockName, nameById, type Names } from './blockView'
import { dueTone } from '../cases/casesLogic'
import type { EnergyTrack, TimelineItem, TimelineMarker } from './Timeline'

export interface DayAxis {
  items: TimelineItem[]
  markers: TimelineMarker[]
  energy: EnergyTrack | null
  from: number
  to: number
}

/**
 * `today` – the logical day of the window (D409): the block of a task shows the task's due date badge, from `today` on (a day
 * gone by – none); null (the templates, the wizard) – none.
 */
export function dayAxis(model: DayModel, names: Names, now: number | null, today: string | null = null): DayAxis {
  const { state, ctx } = model
  const g = state.grid
  const lm = (idx: number) => logicalMinuteOf(model.date, atOf(g, idx))
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  const yesterday = addDays(model.date, -1)
  const nowIdx = now != null ? Math.round((now - g.start) / 60_000) : null
  // D365: a block running now (of its own hour – not a session, a lecture, a class of a „zjazd”, the second shift) has its bottom edge.
  const edges = now != null ? runningEdges(state, now) : null
  const items: TimelineItem[] = []
  const placed = new Map(state.forecast.map((p) => [p.block.id, p]))
  for (const p of ctx.plan) {
    const info = byId.get(p.id)
    if (!info) continue
    const span = plannedSpan(info, byId)
    const f = state.facts.blocks.get(p.id)
    const gone = f?.parkedAt != null && f.startedAt == null ? 'zaparkowany' : f?.cancelledAt != null && f.startedAt == null ? 'odwołany' : null
    // A started block stands where it ran (E4a); one still to come where the forecast puts it today, else at its plan.
    let from = span?.start ?? null
    let to = span?.end ?? null
    if (f?.startedAt != null) {
      from = f.startedAt
      to = f.endedAt ?? Math.max(nowIdx ?? f.startedAt, plannedEndOf(state, info, f))
    } else if (!gone && now != null && placed.has(p.id)) {
      from = placed.get(p.id)!.from
      to = placed.get(p.id)!.to
    }
    if (from == null || to == null) continue
    const edge = f?.startedAt != null && f.endedAt == null ? edges?.get(p.id) : undefined
    items.push({
      id: p.id,
      // As long as it lasts, also across the doubled hour of a 25-hour day (`logicalSpan` – the preview of a push the same).
      ...logicalSpan(g, from, Math.max(to, from + 1)),
      title: gone ? `${blockName(p, names)} (${gone})` : blockName(p, names),
      marks: [...blockMarks(p, { afterWork: info.afterWorkMark, fromYesterday: p.movedFrom === yesterday }), ...(f?.startedAt != null && f.endedAt == null ? ['biegnie'] : [])],
      color: blockColor(p.categoryId, names),
      background: info.bg,
      dim: gone != null || f?.endedAt != null || (nowIdx != null && f?.startedAt == null && to <= nowIdx),
      waits: info.waits,
      ...(p.origin === 'series' ? { series: true } : {}),
      ...taskBadge(p.task, names, today, model.date),
      ...(edge ? { resize: 'end' as const } : {}),
      // D305: a block not begun nor gone, with its own hour (`ownHourBlock`: not after another block, not a session, a lecture,
      // a class imported from the PDF of „zjazdy” – D357, nor the second shift – D192), not passed.
      movable: gone == null && f?.startedAt == null && ownHourBlock(info) && (nowIdx == null || to > nowIdx)
    })
  }
  // Blocks begun outside the plan („Pracuję”, a block begun by hand) or taken out of it after they began (D336): where
  // they ran, named as everywhere (`nameById`).
  const naming = namingOf(ctx, state.facts)
  for (const info of state.blocks) {
    if (info.inPlan) continue
    const f = state.facts.blocks.get(info.id)
    if (!f || f.startedAt == null) continue
    const to = f.endedAt ?? Math.max(nowIdx ?? f.startedAt, plannedEndOf(state, info, f))
    items.push({
      id: info.id,
      ...logicalSpan(g, f.startedAt, Math.max(to, f.startedAt + 1)),
      title: nameById(info.id, naming, names),
      marks: f.endedAt == null ? ['poza planem', 'biegnie'] : ['poza planem'],
      color: blockColor(info.categoryId, names),
      background: false,
      dim: f.endedAt != null,
      waits: false
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

/** The due-date badge of the task of a block (D409), for a day that is not gone by. */
function taskBadge(task: string | null | undefined, names: Names, today: string | null, date: string): { badge?: TimelineItem['badge'] } {
  if (!task || today == null || date < today) return {}
  const r = names.requests.find((x) => x.id === task)
  const b = r ? dueBadge(r, today) : null
  return b ? { badge: { text: b.text, tone: dueTone(b) } } : {}
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
