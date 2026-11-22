/**
 * The axis of a counted day: started blocks where they ran (a running one up to now or its planned end), blocks still
 * to come where the forecast puts them today (other days: at their planned times, an anchored one after its anchor),
 * dimmed when passed, parked or cancelled; the lines of the wake, the boundary (approved – solid, a proposal – dashed),
 * the maximum, the hard end, the bedtime's forecast and now; the energy's forecast (after the check-in; today before it and a day
 * to come – from the assumed check-in, T2430).
 */
import { movableBlock, plannedSpan } from '@shared/engine/blocks'
import { namedById } from '@shared/blockName'
import { namingOf } from '@shared/engine/context'
import { dueBadge } from '@shared/engine/caseDates'
import { isDone } from '@shared/engine/cases'
import type { Priority, RequestRecord } from '@shared/model/requests'
import { assumedEnergy, energyTrack } from '@shared/engine/energyTrack'
import { atOf, logicalSpan } from '@shared/engine/grid'
import { pausedPlaceOf } from '@shared/engine/facts'
import { runningEdges } from '@shared/engine/resize'
import { plannedEndOf } from '@shared/engine/timer'
import { durationLabel, logicalClock } from '@shared/format'
import { blockCosts } from '@shared/model/blockCosts'
import { begunCosts, costChangesOf, costEditable } from '@shared/engine/costChange'
import { shownSteps } from '@shared/model/routineSteps'
import { stepsCounter } from '@shared/model/steps'
import { logicalMinuteOf } from '@shared/time/day'
import { addDays } from '@shared/time/zone'
import type { DayModel } from '../../store/day'
import { blockColor, blockKind, blockMarks, blockName, type Names } from './blockView'
import type { EnergyTrack, TimelineItem, TimelineMarker } from './Timeline'

/**
 * The lines of the boundary (approved – solid; else the proposal – dashed) and of the maximum. At the same hour they are one line with one
 * label – „propozycja · maksimum 19:00” – instead of two labels over each other (D5 of the UX review). `lm`: the engine's minute on the axis.
 */
export function boundaryMarkers(b: { proposal: number | null; approved: number | null; max: number }, lm: (n: number) => number): TimelineMarker[] {
  const at = b.approved ?? b.proposal
  const max: TimelineMarker = { at: lm(b.max), label: `maksimum ${logicalClock(lm(b.max))}`, tone: 'rose', dashed: true }
  if (at == null) return [max]
  const approved = b.approved != null
  if (lm(at) === lm(b.max)) return [{ at: lm(at), label: `${approved ? 'granica' : 'propozycja'} · maksimum ${logicalClock(lm(at))}`, tone: 'lamp', also: 'maksimum', ...(approved ? {} : { dashed: true as const }) }]
  return [{ at: lm(at), label: `${approved ? 'granica' : 'propozycja granicy'} ${logicalClock(lm(at))}`, tone: 'lamp', ...(approved ? {} : { dashed: true as const }) }, max]
}

export interface DayAxis {
  items: TimelineItem[]
  markers: TimelineMarker[]
  energy: EnergyTrack | null
  from: number
  to: number
}

/**
 * A block done (D477, D484, T1106): the engine says it – `BlockFact.finished`, the end's `fin` (an older end told by its `done`
 * and rule, `facts.ts`). The axis only reads it and puts ✓ before the name.
 */
export const finishedBlock = (f: { endedAt: number | null; finished: boolean } | undefined): boolean => f?.endedAt != null && f.finished

/**
 * `today` – the logical day of the window (D409): the block of a task shows the task's due date badge, from `today` on (a day
 * gone by – none); null (the templates, the wizard) – none. `planCosts` – the axis of „Szablony” (D512): every block's cost as
 * planned on the tile, its window open (the page says which tiles are its own).
 */
export function dayAxis(model: DayModel, names: Names, now: number | null, today: string | null = null, planCosts = false): DayAxis {
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
  // D501: the changes of begun blocks' costs, once for the day.
  const changes = costChangesOf(ctx, state.facts)
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
    // D478: a block a start swapped with waits, paused, where the forecast puts the rest of it (the clicked block's place).
    const swapped = f != null && now != null && pausedPlaceOf(f) != null && placed.has(p.id)
    if (swapped) {
      from = placed.get(p.id)!.from
      to = placed.get(p.id)!.to
    } else if (f?.startedAt != null) {
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
      marks: [...blockMarks(p, { afterWork: info.afterWorkMark, fromYesterday: p.movedFrom === yesterday }), ...(f?.startedAt != null && f.endedAt == null && !swapped ? ['biegnie'] : [])],
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
      // D501: the cost per hour on the tile – for a day's window (`today` given) and the templates' axis (`planCosts`, D512), not the wizard's;
      // a begun block's as the engine counts it now (its start, its changes from a minute on), another's as planned (own, routine, variant,
      // category – `blockCosts`); `costEditable` – whether it may be changed.
      ...(today != null
        ? {
            cost: {
              ...(f?.startedAt != null ? begunCosts(ctx, state, info, changes) : blockCosts(info, state.settings.categories, info.rules)),
              edit: costEditable(f, model.date < today, f?.startedAt == null && nowIdx != null && to <= nowIdx)
            }
          }
        : planCosts
          ? { cost: { ...blockCosts(info, state.settings.categories, info.rules), edit: true } }
          : {}),
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
    // D478: swapped with a start, it waits where the forecast puts the rest of it – as a block of the plan does.
    const swappedAt = now != null && pausedPlaceOf(f) != null ? placed.get(info.id) : undefined
    const from = swappedAt?.from ?? f.startedAt
    const to = swappedAt?.to ?? f.endedAt ?? Math.max(nowIdx ?? f.startedAt, plannedEndOf(state, info, f))
    // Named as everywhere (`namedById`); with its own name its category beside its hours, as „Tydzień” has it (`BlockBox`).
    const named = namedById(info.id, naming)
    const kind = named ? blockKind(named, names) : null
    items.push({
      id: info.id,
      ...logicalSpan(g, from, Math.max(to, from + 1)),
      title: named ? blockName(named, names) : 'blok',
      ...(kind ? { kind } : {}),
      marks: f.endedAt == null && !swappedAt ? ['poza planem', 'biegnie'] : ['poza planem'],
      color: blockColor(info.categoryId, names),
      categoryId: info.categoryId,
      background: false,
      dim: f.endedAt != null,
      ...(finishedBlock(f) ? { finished: true } : {}),
      // D501: begun outside the plan – its cost as the engine counts it now; changed from now on until it ends.
      ...(today != null ? { cost: { ...begunCosts(ctx, state, info, changes), edit: costEditable(f, model.date < today, false) } } : {}),
      waits: false
    })
  }
  const markers: TimelineMarker[] = []
  markers.push({ at: lm(state.wake), label: `pobudka ${logicalClock(lm(state.wake))}`, tone: 'muted' })
  markers.push(...boundaryMarkers(state.boundary, lm))
  if (!state.hardEnd.unreachable && state.hardEnd.at < state.bedtime.forecast) markers.push({ at: lm(state.hardEnd.at), label: `twardy koniec ${logicalClock(lm(state.hardEnd.at))}`, tone: 'sea', dashed: true })
  markers.push({ at: lm(state.bedtime.forecast), label: `pora snu ${logicalClock(lm(state.bedtime.forecast))}`, tone: 'muted' })
  if (nowIdx != null && nowIdx >= 0 && nowIdx <= g.length) markers.push({ at: lm(nowIdx), label: `teraz ${logicalClock(lm(nowIdx))}`, tone: 'fg', now: true })

  // The one sampling of the curve (`energyTrack` – the columns of „Tydzień” and „3 dni” draw the same, D417). Today without its
  // check-in (none yet, skipped) and a day to come: from the assumed check-in, for the drawing only (T2430) – never in the log.
  const assumed = today != null && model.date >= today && !model.energy.known && model.energy.enabled
  const energy = assumed ? assumedEnergy(ctx, state, true) : energyTrack(model.date, g, model.energy)
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
  return daySummaryParts(model).map((p) => p.text)
}

/** What each part of the line over the axis means (D7: a hint under the pointer). */
export const DAY_SUMMARY_HINTS = {
  budget: 'Praca zaplanowana i już zrobiona tego dnia wobec dziennego budżetu pracy typu dnia.',
  minimum: 'Tyle regeneracji musi zmieścić się przed porą snu.',
  pool: 'Ile czasu na projekty zostało: mniejsza z dwóch wartości – dzienny limit projektów pomniejszony o to, co już zrobiłeś, i czas do twardego końca bez zaplanowanej regeneracji i bloków życia.'
} as const

/** The parts of the day's summary, each with its hint. */
export function daySummaryParts(model: DayModel): Array<{ text: string; hint: string }> {
  const s = model.state
  const out: Array<{ text: string; hint: string }> = [
    { text: `budżet pracy ${durationLabel(s.budgetUsedMin + s.budget.forecastMin)} z ${durationLabel(s.budget.limitMin)}`, hint: DAY_SUMMARY_HINTS.budget },
    { text: `minimum regeneracji ${durationLabel(s.regen.requiredMin)}`, hint: DAY_SUMMARY_HINTS.minimum }
  ]
  if (!s.hardEnd.unreachable) out.push({ text: `pula projektów ${durationLabel(Math.max(0, s.pool.min))}`, hint: DAY_SUMMARY_HINTS.pool })
  return out
}
