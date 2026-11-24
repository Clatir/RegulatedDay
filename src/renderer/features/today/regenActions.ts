/**
 * „Wstaw regenerację tutaj” in the window (N3, D599, T2647–T2649): the proposal of the day (`regenHere` of the engine), counted
 * outside the render and remembered by the day's key as the cheapest swap (`proposalMemory`, T2632–T2643), its words, and its
 * action – the block of regeneration and the blocks it pushes apart as one edit of the day's file (the way of „Dodaj” with
 * rozsuwanie, D367: `pushDayBlocks`; the buffers of decompression as „Dodaj” has them – D582, D583, T2877), said by the window with
 * „Cofnij” (one: the bar gets the marker's trigger only, as „Dodaj” of the week, D400). Without a DOM (tests in `tests/web`).
 *
 * For the hint of the tile at the cause (N20): `descentPlace` (the block), `regenHereCached(day)` (the proposal of a day counted as
 * `DayModel`) and `insertRegen(day, proposal, …)` – the same action, by the day, from any view.
 */
import type { EditEntry, EditOutcome, RawRecord } from '@shared/api'
import { putBlock } from '@shared/data/dayEdits'
import { POOL_TEXT } from '@shared/engineView'
import { replanned } from '@shared/engine/context'
import { idxOf, idxOfLogical } from '@shared/engine/grid'
import { newUserBlock } from '@shared/engine/planEdit'
import { pushedText } from '@shared/engine/pushApart'
import { regenHere, type RegenHere, type RegenOptions } from '@shared/engine/regenHere'
import { REGEN_CATEGORY } from '@shared/model/categories'
import { newId } from '@shared/model/ids'
import { dayFileFrom, type DayFile, type PlanBlock } from '@shared/model/plan'
import type { SettingsChange } from '@shared/model/settings'
import { hiddenBlocksAmong } from '../calendars/calendarFilter'
import { isSaved, useData } from '../../store/data'
import type { DayModel } from '../../store/day'
import { toast } from '../../store/ui'
import { cheapestSwapKeyOf, countedPlanStands, PLAN_CHANGED_TEXT, pushDayBlocks, undoEditToast, withTaken } from './dayActions'
import { bufferTakenBy, pushedStarts, withBufferPushes, type DayChange } from './dayPush'
import { proposalMemory, type ProposalDay } from './proposalMemory'

/**
 * The proposal by its words (T2647): the pool, the block it stands before and the way – once put in before that block, the day
 * does not propose it again there (also at the block's new place after the push), until its save fails or its „Cofnij”.
 */
export const regenSignature = (r: Pick<RegenHere, 'pool' | 'beforeId' | 'variantId'>): string => `${r.pool}|${r.beforeId}|${r.variantId ?? ''}`

/** The settings' changes the buffers of decompression are laid by (rd.json, as „Dodaj” in „Dziś” takes them). */
const changesNow = (): readonly SettingsChange[] => useData.getState().rd.settings

/** The day's file with the buffer a change takes cancelled (the next count lays the buffers without it). */
const goneWith = (m: Pick<ProposalDay, 'ctx' | 'dayFile'>, taken: PlanBlock | null): DayFile | null =>
  taken ? { ...(m.dayFile ?? dayFileFrom({}, m.ctx.date)), cancelled: [...(m.dayFile?.cancelled ?? []), taken.id] } : m.dayFile

/**
 * What the window adds to the engine's count of a day (T2872, T2877): an id of the block's own (written with it), the buffer of
 * decompression the block stands on (`bufferTakenBy`, D582 – as „Dodaj”), and the plan of the file after the change with the buffers
 * laid again (`replanned` by your settings – D583: the day counted as the next count after the write has it).
 */
export const regenOptionsOf = (m: Pick<ProposalDay, 'ctx' | 'state' | 'dayFile'>, changes: readonly SettingsChange[] = changesNow()): RegenOptions => ({
  id: newId(),
  taken: (b) => (b.startMin != null ? bufferTakenBy(m, b, { startMin: b.startMin, endMin: b.startMin + b.durationMin }) : null),
  replan: (base, taken) => replanned(m.ctx, base, changes, goneWith(m, taken))
})

/** The proposal's start is past by the live clock (`now` – tests): the window has not counted it again since (T2879, T2925). */
const pastStart = (m: Pick<ProposalDay, 'state'>, r: Pick<RegenHere, 'startMin'>, now = Date.now()): boolean => idxOfLogical(m.state.grid, r.startMin) <= idxOf(m.state.grid, now)

/**
 * The memory of „Wstaw regenerację tutaj” (`proposalMemory`): each search gives its block an id of its own, written with it (T2872:
 * equal starts are ordered by the ids – the plan written is the one counted). Held while a new key is counted only with its block in
 * the plan and its start still to come (T2873); a start past by the live clock – shown by no line (T2925).
 */
export const regenMemory = proposalMemory<RegenHere>({
  what: 'Wstaw regenerację tutaj',
  search: (m) => regenHere(m.ctx, m.state, m.energy, regenOptionsOf(m)),
  signature: regenSignature,
  holds: (m, r) => m.ctx.plan.some((b) => b.id === r.beforeId) && idxOfLogical(m.state.grid, r.startMin) > m.state.now,
  // T2925: a start past by the live clock (the window not counted again since) – no line shows it, nor its button.
  live: (m, r) => !pastStart(m, r)
})

/**
 * What the proposal of a day depends on (T2648): the same as the cheapest swap (the warning of the reserve, the plan – with its buffers,
 * the snapshot, the routines' costs, the log, the energy, the forecast's places, the clock in steps of 5 min – `cheapestSwapKeyOf`).
 */
export const regenHereKeyOf = (m: ProposalDay): string | null => cheapestSwapKeyOf(m)

/** The proposal of a day counted again only when its key changes (`regenMemory`); null – none. */
export const regenHereCached = (m: ProposalDay, key: string | null = regenHereKeyOf(m)): RegenHere | null => regenMemory.cached(m, key)

/** The memory emptied (tests). */
export const resetRegenCache = (): void => regenMemory.reset()

/** A pool in words, in a sentence (`POOL_TEXT` – the bar's, capitalised). */
const poolWord = (r: Pick<RegenHere, 'pool'>) => POOL_TEXT[r.pool].toLowerCase()

/** The line by the warning (T2647): „Leżenie, drzemka 15 min przed Analiza · głowa 12 → 14”. */
export const regenLineText = (way: string, before: string, r: Pick<RegenHere, 'pool' | 'durationMin' | 'before' | 'after'>): string =>
  `${way} ${r.durationMin} min przed ${before} · ${poolWord(r)} ${r.before} → ${r.after}`

/** The words of the toast after the insert: „Wstawiono regenerację: Leżenie, drzemka 15 min” (the pushed blocks said after it). */
export const regenDoneText = (way: string, r: Pick<RegenHere, 'durationMin'>): string => `Wstawiono regenerację: ${way} ${r.durationMin} min`

/** The note of a click on a proposal whose start has passed by the clock (T2879): nothing written, the line is counted again. */
export const REGEN_PAST_TEXT = 'Ta propozycja już minęła.'

/**
 * The toast with the blocks it pushed (D367): „· przesunięto 2 bloki”, those of an unchecked calendar among them said (D428 –
 * `openId`: the block whose panel is open is not hidden, D427). Nothing pushed – the words alone.
 */
export function regenToastText(text: string, pushed: readonly { block: PlanBlock }[], openId: string | null = null): string {
  if (!pushed.length) return text
  const said = pushedText(pushed.length, hiddenBlocksAmong(pushed.map((p) => p.block), openId))
  return `${text} · ${said.charAt(0).toLowerCase()}${said.slice(1)}`
}

/** The day a proposal is put into: as counted (`DayModel`) – its plan, its file as the window saw it. */
export type RegenDay = Pick<DayModel, 'date' | 'ctx' | 'state' | 'dayFile' | 'data'>

/**
 * „Wstaw regenerację tutaj” (N3, D599, T2649) on the day `m`: the block of regeneration (the proposal's id – the plan written is the one
 * counted; its category's rules in the day), the buffer of decompression it stands on cancelled (D582, `withTaken`) and the starts of
 * the blocks it pushes – with those the buffers laid again push (D583, `withBufferPushes`, T2877) – as one edit of the day's file in its
 * turn (`pushDayBlocks`, as „Dodaj” with rozsuwanie), each over the block as the file holds it then. Only while the plan it was counted on
 * stands in the file (`countedPlanStands`: every pushed block where the window's plan had it or already where this puts it, the block it
 * stands before unchanged, every block on those places still there, nothing new on them – the same proposal clicked on another computer,
 * T2870, T2878, T2920–T2924) and the buffer it takes is still one not begun of the plan (T2926); not – nothing written, „Plan zmienił
 * się…”. A start past by the clock (T2879) – nothing written, `REGEN_PAST_TEXT`, the line gone until the day is counted again (T2925).
 * The proposal is done before the save starts (no line shows it meanwhile, T2643) and back when nothing is saved or its „Cofnij” takes it
 * back. Saved – the window says „Wstawiono regenerację: … · przesunięto N bloków” for 10 s with „Cofnij” (the edit taken back while the
 * file stands as it left it, `undoEditToast`: the block goes, the pushed blocks and the buffer come back); the bar gets only the marker's
 * trigger (`line` false – one „Cofnij”). `way` – the way's name in the toast; `now` – the clock (tests). Today and days to come; nothing
 * is blocked (D72).
 */
export async function insertRegen(
  m: RegenDay,
  r: RegenHere,
  o: { way: string; openId?: string | null; changes?: readonly SettingsChange[]; now?: number }
): Promise<{ out: EditOutcome[] | null; saved: boolean; id: string }> {
  const { date, ctx } = m
  const plan = ctx.plan
  const block = newUserBlock(REGEN_CATEGORY, r.startMin, r.durationMin, ctx.snapshot.settings.categories[REGEN_CATEGORY], { id: r.id, variantId: r.variantId })
  if (pastStart(m, r, o.now)) {
    toast(REGEN_PAST_TEXT, 'info')
    // The lines look again: the live clock hides it (T2925).
    regenMemory.nudge()
    return { out: null, saved: false, id: block.id }
  }
  const signature = regenSignature(r)
  regenMemory.done(date, signature)
  const c: DayChange = { was: null, block, patch: block, others: [], pushed: r.pushed, takes: r.takes }
  const pushed = pushedStarts(plan, { pushed: withBufferPushes(m, c, o.changes ?? changesNow(), m.dayFile) })
  const before = plan.find((b) => b.id === r.beforeId)
  // The buffer it takes (T2926): still one of the plan, not begun, neither cancelled nor written to the file as yours since.
  const takenStands = (file: DayFile) =>
    !r.takes || (plan.some((b) => b.id === r.takes!.id) && m.state.facts.blocks.get(r.takes.id)?.startedAt == null && !file.cancelled.includes(r.takes.id) && !file.blocks.some((b) => b.id === r.takes!.id))
  // Counted on a plan without the block (neither the window's nor the file's – a second click), with every pushed block and the block
  // it stands before in it, nothing new in the file where it stands.
  const stands = (raw: RawRecord) => {
    const file = dayFileFrom(raw, date)
    return (
      before != null &&
      r.pushed.every((p) => plan.some((b) => b.id === p.id)) &&
      !plan.some((b) => b.id === r.id) &&
      !file.blocks.some((b) => b.id === r.id) &&
      takenStands(file) &&
      countedPlanStands(raw, date, { seen: m.data.dayFile, ctx, starts: pushed, kept: [before], spans: [{ startMin: r.startMin, endMin: r.startMin + r.durationMin }] })
    )
  }
  const sent: { entry: EditEntry | null; made: RawRecord | null; changed?: boolean } = { entry: null, made: null }
  const out = await pushDayBlocks(date, m.data.dayFile, (raw) => withTaken(putBlock(raw, block), r.takes), pushed, sent, false, stands)
  const saved = isSaved(out) && sent.entry != null
  if (saved) undoEditToast(date, sent.entry!, sent.made, regenToastText(regenDoneText(o.way, r), pushed, o.openId ?? null), () => regenMemory.back(date, signature))
  else regenMemory.back(date, signature)
  if (sent.changed) toast(PLAN_CHANGED_TEXT, 'info', 6000)
  return { out, saved, id: block.id }
}
