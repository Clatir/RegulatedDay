/**
 * Saving a change of the tree of categories (D510) – the window's API for „Kategorie” in the settings and the quick edits of a block's
 * panel. The categories (groups) and the place of a subcategory are rd.json's and work at once (`saveTree` with a function of
 * `model/categoryTree.ts`: `addGroupRaw`, `updateGroupRaw`, `setCategoryGroupRaw`, `removeGroupRaw`), each made from the record as it is in
 * the turn of the save (T517); „Cofnij” turns the edit over (`undoTree`). A subcategory's variants are dated settings (`saveVariants` with
 * `addVariant`, `changeVariant`, `archiveVariant`): the list is made in the turn of the save from the settings in force from the change's
 * date – „od kiedy” of the screen, or the date given (the quick edits: from today, D514).
 *
 * Every change saved also writes `tree.change` to today's log (T1313): an older version on another computer, which shows no tree, takes it
 * for an unknown event of the timer and installs the new version without the 24 h. The event is only that hint – a failure to write it is
 * not said (the change itself is saved).
 */
import type { EditEntry, EditOutcome, RawRecord } from '@shared/api'
import { editStands, inverseEdit } from '@shared/data/merge'
import type { Variant } from '@shared/model/categories'
import { variantsPatch, type VariantEntry } from '@shared/model/categoryTree'
import { rdFrom } from '@shared/model/rd'
import { settingsOn } from '@shared/model/settings'
import { isSaved, rawRecord, trySaveWith, useData, type SendState } from '../../store/data'
import { saveCalendars } from './calendarEdits'
import { changeFrom, saveSettingsFrom } from './settingsStore'

/** `tree.change` in today's log (T1313); false – no day known now, or the log refused it (never said: only a hint for an older version). */
export async function logTreeChange(): Promise<boolean> {
  const today = useData.getState().view?.today
  if (!today) return false
  try {
    await window.rd.logEvents([{ k: 'tree.change', day: today }])
    return true
  } catch {
    return false
  }
}

/**
 * rd.json changed by a function of the tree, in its turn (`saveCalendars`: an unreadable rd.json sends nothing and says so); `entry` – what
 * was sent (for „Cofnij”), null when nothing changed or nothing was sent. A change saved writes `tree.change`.
 */
export async function saveTree(fn: (raw: RawRecord) => RawRecord, state?: SendState): Promise<{ out: EditOutcome[] | null; entry: EditEntry | null }> {
  const r = await saveCalendars(fn, state)
  if (r.entry && isSaved(r.out)) await logTreeChange()
  return r
}

/** How a „Cofnij” went: done, the file changed since (it stays as it is), rd.json unreadable now, or the save failed. */
export type TreeUndo = 'undone' | 'changed' | 'unreadable' | 'failed'

/**
 * „Cofnij” of a change of the tree (a group removed with its subcategories moved or archived): the edit turned over (`inverseEdit`), only
 * while rd.json still stands as the change left it – a field changed since (on another computer) is never overwritten.
 */
export async function undoTree(entry: EditEntry): Promise<TreeUndo> {
  let problem: 'changed' | 'unreadable' | null = null
  const out = await trySaveWith(() => {
    const now = rawRecord('rd.json')
    problem = null
    if (!now) problem = 'unreadable'
    else if (!editStands(entry, now, null)) problem = 'changed'
    return problem || !now ? [] : [inverseEdit(entry, now, null)]
  })
  if (problem) return problem
  if (!isSaved(out)) return 'failed'
  await logTreeChange()
  return 'undone'
}

/**
 * A change of a subcategory's variants (dated settings): `change` gets the variants in force from the change's date (`f`; left out – „od
 * kiedy” of the settings screen) as rd.json is in the turn of the save and gives the list to write (null – nothing, nothing saved). True once
 * saved; „od dziś” writes the day's snapshot too (`saveSettingsFrom`).
 */
export async function saveVariants(categoryId: string, change: (now: readonly Variant[]) => VariantEntry[] | null, f?: { from: string; at: number | null }): Promise<boolean> {
  const today = useData.getState().view?.today
  if (!today) return false
  const when = f ?? changeFrom(today)
  const ok = await saveSettingsFrom((raw) => {
    const rules = settingsOn(rdFrom(raw).settings, when.from, when.at).categories[categoryId]
    const list = rules ? change(rules.variants) : null
    return list ? variantsPatch(categoryId, list) : null
  }, when)
  if (ok) await logTreeChange()
  return ok
}
