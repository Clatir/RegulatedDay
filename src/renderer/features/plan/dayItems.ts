/**
 * The axis of a counted day: started blocks where they ran (a running one up to now or its planned end), blocks still
 * to come where the forecast puts them today (other days: at their planned times, an anchored one after its anchor),
 * dimmed when passed, parked or cancelled; the lines of the wake, the boundary (approved – solid, a proposal – dashed),
 * the maximum, the hard end, the bedtime's forecast and now; the energy's forecast (after the check-in).
 */
import { movableBlock, plannedSpan } from '@shared/engine/blocks'
import { namedById } from '@shared/blockName'
import { namingOf } from '@shared/engine/context'
import { dueBadge } from '@shared/engine/caseDates'
import { isDone } from '@shared/engine/cases'
import type { Priority, RequestRecord } from '@shared/model/requests'
import { energyTrack } from '@shared/engine/energyTrack'
import { atOf, logicalSpan } from '@shared/engine/grid'
import { runningEdges } from '@shared/engine/resize'
import { plannedEndOf } from '@shared/engine/timer'
import { durationLabel, logicalClock } from '@shared/format'
import { shownSteps } from '@shared/model/routineSteps'
import { stepsCounter } from '@shared/model/steps'
import { logicalMinuteOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import type { DayModel } from '../../store/day'
import { blockColor, blockKind, blockMarks, blockName, type Names } from './blockView'
import type { EnergyTrack, TimelineItem, TimelineMarker } from './Timeline'

export interface DayAxis {
  items: TimelineItem[]
  markers: TimelineMarker[]
  energy: EnergyTrack | null
  from: number
  to: number
}

/**
 * A block done (D477, T1106): it ended and was not left unfinished (`done` false – parked after it began, „Usuń”, „Dalej” as
 * not done); a fixed block ended by its window or by „Skończyłem” (`done` null) is done too. The axis puts ✓ before its name.
 */
export const finishedBlock = (f: { endedAt: number | null; done: boolean | null } | undefined): boolean => f?.endedAt != null && f.done !== false

/**
 * `today` – the logical day of the window (D409): the block of a task shows the task's due date badge, from `today` on (a day
 * gone by – none); null (the templates, the wizard) – none.
 */
export function dayAxis(model: DayModel, names: Names, now: number | null, today: string | null = null): DayAxis {
  const { state, ctx } = model
  const g = state.grid
  const lm = (idx: number) => logicalMinuteOf(model.date, atOf(g, idx))
  const byId = new Map(state.blocks.map((b) => [b.id, b]))
  // The sprawa of a block's task, found once per block by id (its badge and its priority).
  const sprawaOf = new Map(names.requests.map((r) => [r.id, r]))
  const yesterday = addDays(model.date, -1)
  const nowIdx = now != null ? Math.round((now - g.start) / 60_000) : null
  // D365: a block running now (of its own hour – not a session, a lecture nor a class of a „zjazd”) has its bottom edge.
  const edges = now != null ? runningEdges(state, now) : null
  const items: TimelineItem[] = []
  const placed = new Map(state.forecast.map((p) => [p.block.id, p]))
  for (const p of ctx.plan) {
    const info = byId.get(p.id)
    if (!info) continue
    const span = plannedSpan(info, byId)
    const sprawa = p.task ? sprawaOf.get(p.task) : undefined
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
    // D473: a block of a day („Dziś”) of a routine without steps of its own counts the routine's – the templates' and the
    // wizard's axes (`today` null) count their own lists only, as their panels show them (T1103).
    const counter = stepsCounter(today != null ? shownSteps(p, names.routines, model.dayFile) : p.steps)
    const kind = blockKind(p, names)
    items.push({
      id: p.id,
      // As long as it lasts, also across the doubled hour of a 25-hour day (`logicalSpan` – the preview of a push the same).
      ...logicalSpan(g, from, Math.max(to, from + 1)),
      title: gone ? `${blockName(p, names)} (${gone})` : blockName(p, names),
      // D430: its category beside its hours when its own name is in the category's place.
      ...(kind ? { kind } : {}),
      marks: [...blockMarks(p, { afterWork: info.afterWorkMark, fromYesterday: p.movedFrom === yesterday }), ...(f?.startedAt != null && f.endedAt == null ? ['biegnie'] : [])],
      color: blockColor(p.categoryId, names),
      categoryId: p.categoryId,
      background: info.bg,
      dim: gone != null || f?.endedAt != null || (nowIdx != null && f?.startedAt == null && to <= nowIdx),
      // D477: ended and not left unfinished – ✓ before its name.
      ...(finishedBlock(f) ? { finished: true } : {}),
      waits: info.waits,
      ...(p.origin === 'series' ? { series: true } : {}),
      ...taskBadge(sprawa, today, model.date),
      ...taskPriority(sprawa),
      // D440: the counter of its steps on the tile (none – nothing).
      ...(counter ? { steps: counter } : {}),
      ...(edge ? { resize: 'end' as const } : {}),
      // D305: a block not begun nor gone, with its own hour (`ownHourBlock`: not after another block, not a session, a lecture,
      // nor a class imported from the PDF of „zjazdy” – D357), not passed – the one rule of
      // `movableBlock`, also for the columns of „Tydzień” and „3 dni” (D417).
      movable: movableBlock(info, f, to, nowIdx)
    })
  }
  // Blocks begun outside the plan („Pracuję”, a block begun by hand) or taken out of it after they began (D336): where
  // they ran, named as everywhere (`namedById`).
  const naming = namingOf(ctx, state.facts)
  for (const info of state.blocks) {
    if (info.inPlan) continue
    const f = state.facts.blocks.get(info.id)
    if (!f || f.startedAt == null) continue
    const to = f.endedAt ?? Math.max(nowIdx ?? f.startedAt, plannedEndOf(state, info, f))
    // Named as everywhere (`namedById`); with its own name its category beside its hours, as „Tydzień” has it (`BlockBox`).
    const named = namedById(info.id, naming)
    const kind = named ? blockKind(named, names) : null
    items.push({
      id: info.id,
      ...logicalSpan(g, f.startedAt, Math.max(to, f.startedAt + 1)),
      title: named ? blockName(named, names) : 'blok',
      ...(kind ? { kind } : {}),
      marks: f.endedAt == null ? ['poza planem', 'biegnie'] : ['poza planem'],
      color: blockColor(info.categoryId, names),
      categoryId: info.categoryId,
      background: false,
      dim: f.endedAt != null,
      ...(finishedBlock(f) ? { finished: true } : {}),
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

  // The one sampling of the curve (`energyTrack` – the columns of „Tydzień” and „3 dni” draw the same, D417).
  const energy = energyTrack(model.date, g, model.energy)
  return { items, markers, energy, from: Math.min(lm(state.wake) - 30, 6 * 60), to: Math.max(lm(state.bedtime.forecast) + 30, 22 * 60) }
}

/** The due-date badge of the task of a block (D409), for a day that is not gone by. */
function taskBadge(r: RequestRecord | undefined, today: string | null, date: string): { badge?: TimelineItem['badge'] } {
  if (!r || today == null || date < today) return {}
  const b = dueBadge(r, today)
  return b ? { badge: b } : {}
}

/** The priority of the task of a block (D450), as long as the task is not done – on any day the block stands on. */
function taskPriority(r: RequestRecord | undefined): { priority?: Priority } {
  return r?.priority && !isDone(r) ? { priority: r.priority } : {}
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
