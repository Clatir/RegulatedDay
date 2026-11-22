/**
 * „Cofnij” of a click of the bar (D564 P18, UX12): after „Dalej”, „Skończyłem”, „Koniec pracy”, „Zakończ teraz” and a signal or
 * a pool's assessment of „Sygnały ▸” the bar says „<akcja> · Cofnij” for a while; its „Cofnij” is an `undo` of each event that
 * click wrote (`ids` – what the write answered, never from a window), so the day folds as if the click never happened
 * (`foldFacts`, the energy – `liveEnergyEvent`). Judged on the day as it is now, like the click itself.
 */
import { compareEvents, isKnown, type AnyEvent } from '../model/events'
import type { DayState } from './day'
import type { TimerDraft } from './timer'

export const CLICK_UNDO_TEXT = {
  frozen: 'ten dzień jest już zamrożony',
  gone: 'tego kliknięcia nie ma już w logu dnia',
  undone: 'to kliknięcie jest już cofnięte',
  foreign: 'to nie są zdarzenia kliknięcia paska',
  later: 'tego już nie cofniesz – po kliknięciu zmieniło się coś w dniu'
} as const

/** What the bar's clicks with „Cofnij” write: the ends, the starts and the moves they bring, the parking of „Koniec pracy”, the anchors of energy. */
const CLICK_KINDS = new Set(['block.end', 'block.start', 'block.resume', 'block.pause', 'block.fg', 'block.park', 'work.end', 'energy.signal', 'energy.relative'])
/**
 * Later events the click's events depend on: what begins something (a block whose end is taken back would run beside it) and the end
 * of a request or of „Odcinam się” – it resumes what it held; a block taken back paused after it would wait paused for good.
 */
const DEPENDS = new Set(['block.start', 'block.resume', 'block.restart', 'request.start', 'request.end', 'disconnect.start', 'disconnect.end'])

const blockOf = (e: AnyEvent): string | null => {
  const b = (e as { block?: unknown }).block
  return typeof b === 'string' ? b : null
}

/**
 * The undos of a click (`ids`), or why not: on a frozen day (later events are outside its grade), for events not in the day's log or
 * not of such a click, a click undone already – and, for a click of the timer, when after it something began or ended that holds
 * blocks (a block, a request, „Odcinam się”), another „Koniec pracy” came or a block it touched changed (paused, ended, parked …): the click's blocks would stand
 * beside it. A signal or an assessment depends on nothing – only the energy's anchor goes. An event of it undone on its own is skipped.
 */
export function clickUndoEvents(state: DayState, events: readonly AnyEvent[], ids: readonly string[], at: number): TimerDraft[] | string {
  if (state.facts.frozen) return CLICK_UNDO_TEXT.frozen
  const byId = new Map<string, AnyEvent>()
  for (const e of events) if (isKnown(e)) byId.set(e.id, e)
  const found = [...new Set(ids)].map((id) => byId.get(id))
  if (!found.length || found.some((e) => !e)) return CLICK_UNDO_TEXT.gone
  const list = found as AnyEvent[]
  if (!list.every((e) => CLICK_KINDS.has(e.k))) return CLICK_UNDO_TEXT.foreign
  const undone = state.facts.undone
  const live = list.filter((e) => !undone.has(e.id))
  if (!live.length) return CLICK_UNDO_TEXT.undone
  if (list.some((e) => !e.k.startsWith('energy.'))) {
    const mine = new Set(list.map((e) => e.id))
    const last = list.reduce((a, b) => (compareEvents(a, b) >= 0 ? a : b))
    const blocks = new Set(list.map(blockOf).filter((b): b is string => b != null))
    const touches = (e: AnyEvent) => DEPENDS.has(e.k) || e.k === 'work.end' || (blockOf(e) != null && blocks.has(blockOf(e)!))
    if (events.some((e) => isKnown(e) && !mine.has(e.id) && !undone.has(e.id) && compareEvents(e, last) > 0 && touches(e))) return CLICK_UNDO_TEXT.later
  }
  return live.map((e): TimerDraft => ({ k: 'undo', at, target: e.id, reason: 'user' }))
}

/** An event of energy that counts: a signal or an assessment taken back by „Cofnij” of the bar is none (the check-in stays as written). */
export const liveEnergyEvent = (e: { id: string; k: string }, undone: ReadonlySet<string>): boolean => !((e.k === 'energy.signal' || e.k === 'energy.relative') && undone.has(e.id))
