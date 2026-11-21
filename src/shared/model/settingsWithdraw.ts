/**
 * „Wycofaj” of a planned change of the shared settings (UX14, E2): the change taken out of rd.json „settings”, so from its date the
 * settings are what they would be without it – what was in force before it, every later change as it was. Only a change that waits
 * for its date (from a day after today, not „od dziś”): a day whose date came – counted, frozen – keeps what it counted by. A change of
 * the layer of sessions (the move to the templates, D511 – its own changes and the ones it emptied) is not taken back here: the
 * templates hold those sessions, and the settings without it would bring them back beside them.
 */
import { isMoveChange, setsLayer } from './sessionMigration'
import { changeFrom, isPlain, type SettingsChange } from './settings'

/** A change that waits for its date: from a day after `today`, from the start of that day (an „od dziś” change is in force). */
export const isPlannedChange = (c: Pick<SettingsChange, 'from' | 'at'>, today: string): boolean => c.from > today && c.at == null

/** Why a change is not withdrawn: no longer there (withdrawn elsewhere, unreadable), its date came, a change of the sessions' layer. */
export type WithdrawRefusal = 'gone' | 'inForce' | 'sessions'

/** Why `c` cannot be withdrawn on `today`; null – it can. */
export function withdrawRefusal(c: SettingsChange, today: string): Exclude<WithdrawRefusal, 'gone'> | null {
  if (!isPlannedChange(c, today)) return 'inForce'
  return isMoveChange(c) || setsLayer(c) ? 'sessions' : null
}

/**
 * rd.json without the change `id` (the record is not changed in place), with the change as it was (for „Cofnij” and its words);
 * a refusal – nothing to write. The edit of the two is one field of the list (`settings.#id`, its base the change): changed
 * elsewhere meanwhile it is a question, withdrawn elsewhere it is nothing.
 */
export function withdrawnRd(raw: Record<string, unknown>, id: string, today: string): { raw: Record<string, unknown>; change: SettingsChange } | { refused: WithdrawRefusal; change?: SettingsChange } {
  const list: unknown[] = Array.isArray(raw.settings) ? raw.settings : []
  const item = list.find((x) => isPlain(x) && x.id === id)
  const change = item ? changeFrom(item) : null
  if (!change) return { refused: 'gone' }
  const refused = withdrawRefusal(change, today)
  if (refused) return { refused, change }
  return { raw: { ...raw, settings: list.filter((x) => x !== item) }, change }
}
