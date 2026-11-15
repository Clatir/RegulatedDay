/**
 * A group of sprawy put on the axis of a day from the window (D530): „Zaplanuj…” of the menu (a day and a start) and the drop of the
 * selected sprawy from the panel „Sprawy” (the first where it is dropped, with Ctrl – copies, D513). Like `planOnAxis` for one, for
 * several: the blocks are counted one after another to say what they push apart together (D367), `planCases` writes the day's file
 * and the records in one edit. No toast and no line of the bar – the line of the change is the window's (T1541). Without a DOM.
 */
import type { RawRecord } from '@shared/api'
import { paths } from '@shared/data/paths'
import { dayPlan } from '@shared/engine/createDay'
import { caseBlock, ownTakenBlock, type CaseItem } from '@shared/engine/cases'
import { groupBlockMinutes, planSkip } from '@shared/engine/casesGroup'
import { computeDay, type DayContext, type DayState } from '@shared/engine/day'
import { shownOf } from '@shared/engine/energy'
import { lowestEnergy } from '@shared/engine/energyOrder'
import type { PlanBlock } from '@shared/model/plan'
import type { RequestRecord } from '@shared/model/requests'
import { planCases, type GroupPlanResult } from '../../store/casesGroup'
import type { CasePushed } from '../../store/cases'
import { useData } from '../../store/data'
import { countDay, type DayModel } from '../../store/day'
import { addChange, changedPlan } from '../today/dayPush'
import { nextFreeStart, type StartWhere } from './casesUi'

/** The sprawy of `items` that „Zaplanuj” puts on the axis, in their order: the done ones are left out (a copy takes every one; one already planned is planned again). */
export const plannableOf = (items: readonly CaseItem[], copy = false): CaseItem[] => items.filter((x) => planSkip(x, copy) == null)

/**
 * What putting `rs` on the axis of `model`'s day one after another from `startMin` pushes apart (D367): each block is added to
 * the day the ones before it made (and pushed), the blocks of the sprawy's own before – not begun – are out of the day (as for one,
 * `planningOf`); a day gone is history, nothing is pushed there. Returns the new blocks and the pushed ones with their last starts.
 */
export function planningOfGroup(model: DayModel, today: string, rs: readonly RequestRecord[], startMin: number, copy = false): { blocks: PlanBlock[]; pushed: CasePushed[] } {
  const own = new Set(
    copy
      ? []
      : rs.flatMap((r) => {
          const b = r.block ? model.ctx.plan.find((x) => x.id === r.block) : undefined
          return b && model.state.facts.blocks.get(b.id)?.startedAt == null && ownTakenBlock(b, r) ? [b.id] : []
        })
  )
  const without = own.size ? { ...model.ctx, plan: model.ctx.plan.filter((b) => !own.has(b.id)) } : null
  let day: { ctx: DayContext; state: DayState } = without ? { ctx: without, state: computeDay(without) } : model
  const pushes = model.date >= today
  const starts = new Map<string, number>()
  const blocks: PlanBlock[] = []
  let at = startMin
  for (const r of rs) {
    // D513: a copy is a new sprawa – it has no block of before.
    const block = caseBlock(copy ? { ...r, day: null, block: null } : r, at, model.state.settings.categories)
    const change = addChange(day, block, pushes)
    for (const p of change.pushed) starts.set(p.id, p.startMin)
    const plan = changedPlan(day.ctx.plan, change).map((b) => (starts.has(b.id) ? { ...b, startMin: starts.get(b.id)! } : b))
    const ctx = { ...day.ctx, plan }
    day = { ctx, state: computeDay(ctx) }
    blocks.push(block)
    at += block.durationMin
  }
  const pushed = [...starts].flatMap(([id, startMin]) => {
    const block = model.ctx.plan.find((b) => b.id === id)
    return block ? [{ block, startMin }] : []
  })
  return { blocks, pushed }
}

/** The lowest energy of the day before and after a change (D529), as shown – only for a day with a forecast of energy. */
export interface EnergyChange {
  from: number
  to: number
}

/**
 * The lowest energy of `model`'s day before and after its file became `after` (D529: „najniższa energia 52 → 44”): both counted now from the
 * same data (the plan's inputs of the window, the same instant); null – the day has no forecast of energy (not today, the module off, the day not
 * known) or the file did not change.
 */
export function lowestEnergyChange(model: DayModel, after: RawRecord | null | undefined, at = Date.now()): EnergyChange | null {
  if (after === undefined) return null
  const { rd, templates, lectures, seriesPlans, routines, view } = useData.getState()
  const inputs = { changes: rd.settings, templates, lectures, series: seriesPlans, routines }
  const lowest = (file: RawRecord | null): number | null => {
    const e = countDay(model.date, { ...model.data, dayFile: file }, inputs, at, rd.general.modules.energy, view?.calibration === true).energy
    const units = lowestEnergy(e)
    return units == null ? null : shownOf(units)
  }
  const from = lowest(model.data.dayFile)
  const to = lowest(after)
  return from != null && to != null ? { from, to } : null
}

/** What putting a group on the axis did, with the lowest energy of the day before and after (null – no forecast, nothing changed). */
export interface GroupAxisResult extends GroupPlanResult {
  energy: EnergyChange | null
}

/**
 * The sprawy `items` (in the order of the list) put on the axis of `model`'s day from `startMin`, one after another – a drop of the
 * group (`copy`: Ctrl) or „Zaplanuj…” (D530). The done ones are named in `skipped` by the write (a copy leaves nothing out); the pushed
 * blocks are counted without them and written while the day's plan after the change has them (`planCases`).
 */
export async function planGroupOnAxis(model: DayModel, today: string, items: readonly CaseItem[], startMin: number, copy = false): Promise<GroupAxisResult> {
  const { pushed } = planningOfGroup(model, today, plannableOf(items, copy).map((x) => x.record), startMin, copy)
  const r = await planCases(
    items.map((x) => x.record.id),
    model.date,
    startMin,
    { copy, push: { blocks: pushed, planOf: (file) => dayPlan(model.ctx.snapshot, file) }, seen: (date) => (date === model.date ? model.data.dayFile : undefined) }
  )
  return { ...r, energy: r.saved && r.changed > 0 ? lowestEnergyChange(model, r.undo.find((u) => u.rel === paths.day(model.date))?.after) : null }
}

/**
 * The start „Zaplanuj…” proposes (D530): the beginning of the nearest free place of the day from now that takes the whole group –
 * today from the next quarter after now (not before the wake), another day an hour after the wake (`nextFreeStart`, as for one).
 */
export const groupFreeStart = (model: DayModel, where: StartWhere, items: readonly CaseItem[]): number => nextFreeStart(model.state, where, groupBlockMinutes(plannableOf(items).map((x) => x.record)) || 60)
