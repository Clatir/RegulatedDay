/**
 * „Wstaw regenerację tutaj” in the window (N3, D599, T2647–T2649): the proposal of the day (`regenHere` of the engine), counted
 * outside the render and remembered by the day's key as the cheapest swap (`proposalMemory`, T2632–T2643), its words, and its
 * action – the block of regeneration and the blocks it pushes apart as one edit of the day's file (the way of „Dodaj” with
 * rozsuwanie, D367: `pushDayBlocks`), said by the window with „Cofnij” (one: the bar gets the marker's trigger only, as „Dodaj” of
 * the week, D400). Without a DOM (tests in `tests/web`).
 *
 * For the hint of the tile at the cause (N20): `regenHereCached(day, regenHereKeyOf(day))` gives the proposal of a day counted as
 * `DayModel`, `insertRegen(date, file, plan, proposal, …)` puts it in – the same action, by the day's date, from any view.
 */
import type { EditEntry, EditOutcome, RawRecord } from '@shared/api'
import { putBlock } from '@shared/data/dayEdits'
import { POOL_TEXT } from '@shared/engineView'
import { newUserBlock } from '@shared/engine/planEdit'
import { pushedText } from '@shared/engine/pushApart'
import { idxOfLogical } from '@shared/engine/grid'
import { regenHere, type RegenHere } from '@shared/engine/regenHere'
import { REGEN_CATEGORY, type CategoryRules } from '@shared/model/categories'
import { newId } from '@shared/model/ids'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { hiddenBlocksAmong } from '../calendars/calendarFilter'
import { isSaved } from '../../store/data'
import { toast } from '../../store/ui'
import { cheapestSwapKeyOf, countedPlanStands, PLAN_CHANGED_TEXT, pushDayBlocks, undoEditToast } from './dayActions'
import { pushedStarts } from './dayPush'
import { proposalMemory, type ProposalDay } from './proposalMemory'

/**
 * The proposal by its words (T2647): the pool, the block it stands before and the way – once put in before that block, the day
 * does not propose it again there (also at the block's new place after the push), until its save fails or its „Cofnij”.
 */
export const regenSignature = (r: Pick<RegenHere, 'pool' | 'beforeId' | 'variantId'>): string => `${r.pool}|${r.beforeId}|${r.variantId ?? ''}`

/**
 * The memory of „Wstaw regenerację tutaj” (`proposalMemory`): each search gives its block an id of its own, written with it (T2872:
 * equal starts are ordered by the ids – the plan written is the one counted). Held while a new key is counted only with its block in
 * the plan and its start still to come (T2873).
 */
export const regenMemory = proposalMemory<RegenHere>({
  what: 'Wstaw regenerację tutaj',
  search: (m) => regenHere(m.ctx, m.state, m.energy, { id: newId() }),
  signature: regenSignature,
  holds: (m, r) => m.ctx.plan.some((b) => b.id === r.beforeId) && idxOfLogical(m.state.grid, r.startMin) > m.state.now
})

/**
 * What the proposal of a day depends on (T2648): the same as the cheapest swap (the warning of the reserve, the plan, the snapshot,
 * the routines' costs, the log, the energy, the forecast's places, the clock in steps of 5 min – `cheapestSwapKeyOf`).
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

/**
 * The toast with the blocks it pushed (D367): „· przesunięto 2 bloki”, those of an unchecked calendar among them said (D428 –
 * `openId`: the block whose panel is open is not hidden, D427). Nothing pushed – the words alone.
 */
export function regenToastText(text: string, pushed: readonly { block: PlanBlock }[], openId: string | null = null): string {
  if (!pushed.length) return text
  const said = pushedText(pushed.length, hiddenBlocksAmong(pushed.map((p) => p.block), openId))
  return `${text} · ${said.charAt(0).toLowerCase()}${said.slice(1)}`
}

/**
 * „Wstaw regenerację tutaj” (N3, D599, T2649): the block of regeneration (the proposal's id – the plan written is the one counted;
 * `rules` – its category's in the day) and the starts of the blocks the proposal pushes (each over the block as the file holds it
 * then) as one edit of the day `date` in its turn (`pushDayBlocks`, as „Dodaj” with rozsuwanie) – only while the plan it was counted
 * on stands in the file (`countedPlanStands`: every pushed block at the start it was counted from, the block it stands before as the
 * window knew it, T2870); not – nothing written, „Plan zmienił się…” (a swap saved a moment before, another computer's change). The
 * proposal is done before the save starts (no line shows it meanwhile, T2643) and back when nothing is saved or its „Cofnij” takes it
 * back. Saved – the window says „Wstawiono regenerację: … · przesunięto N bloków” for 10 s with „Cofnij” (the edit taken back while
 * the file stands as it left it, `undoEditToast`: the block goes, the pushed blocks come back); the bar gets only the marker's trigger
 * (`line` false – one „Cofnij”). `way` – the way's name in the toast. Today and days to come; nothing is blocked (D72).
 */
export async function insertRegen(
  date: string,
  seen: RawRecord | null,
  plan: readonly PlanBlock[],
  r: RegenHere,
  o: { way: string; rules: CategoryRules | undefined; openId?: string | null }
): Promise<{ out: EditOutcome[] | null; saved: boolean; id: string }> {
  const signature = regenSignature(r)
  regenMemory.done(date, signature)
  const block = newUserBlock(REGEN_CATEGORY, r.startMin, r.durationMin, o.rules, { id: r.id, variantId: r.variantId })
  const pushed = pushedStarts(plan, r)
  const before = plan.find((b) => b.id === r.beforeId)
  // Counted on a plan without the block (neither the window's nor the file's – a second click), with every pushed block and the block
  // it stands before in it.
  const stands = (raw: RawRecord) =>
    before != null && pushed.length === r.pushed.length && !plan.some((b) => b.id === r.id) && !dayFileFrom(raw, date).blocks.some((b) => b.id === r.id) && countedPlanStands(raw, date, seen, pushed, [before])
  const sent: { entry: EditEntry | null; made: RawRecord | null; changed?: boolean } = { entry: null, made: null }
  const out = await pushDayBlocks(date, seen, (raw) => putBlock(raw, block), pushed, sent, false, stands)
  const saved = isSaved(out) && sent.entry != null
  if (saved) undoEditToast(date, sent.entry!, sent.made, regenToastText(regenDoneText(o.way, r), pushed, o.openId ?? null), () => regenMemory.back(date, signature))
  else regenMemory.back(date, signature)
  if (sent.changed) toast(PLAN_CHANGED_TEXT, 'info', 6000)
  return { out, saved, id: block.id }
}
