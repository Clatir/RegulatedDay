/**
 * „Ostatnio usunięte” in „Historia” (N24): what an edit of a day's file takes out of the day's plan – a block of yours taken
 * out of the file, a block of the day's snapshot cancelled for the day – found by comparing the file before and after the
 * edit (`dayRemovals`; a block moved to another day is no removal), and what „Przywróć” and its „Cofnij” write on the day's
 * file then: the very block put back where it stood (its hours, nothing pushed apart – D72 allows the overlap) or the
 * cancel taken back. Records (a sprawa, a routine …) are removed with a version in the history already.
 */
import { attachmentFrom, type Attachment } from '../model/attachment'
import { dayBlocks, isRaw, putRawBlock, setCancelled, takeBlock, type Raw } from './dayEdits'
import { classify } from './paths'

/** How long a removed record or block stays on the list: 30 days from its removal. */
export const REMOVED_DAYS = 30
export const REMOVED_MS = REMOVED_DAYS * 24 * 60 * 60 * 1000

/** The kinds of records on the list besides blocks (a series is removed by being archived – D381 – its record stays). */
export const REMOVED_KINDS = ['request', 'routine', 'template', 'series', 'allDay'] as const

/** A block an edit of its day took out of the plan: as the file held it (null – a block of the snapshot the file never changed). */
export interface DayRemoval {
  id: string
  block: Raw | null
  /** A block of the day's snapshot cancelled for the day (it comes back by taking the cancel back). */
  cancelled: boolean
}

/** The blocks of a day's file by id (a list or a map by id). */
function blocksById(raw: Raw | null): Map<string, Raw> {
  const out = new Map<string, Raw>()
  for (const b of raw ? dayBlocks(raw) : []) if (isRaw(b) && typeof b.id === 'string' && !out.has(b.id)) out.set(b.id, b)
  return out
}

/** The ids cancelled for the day: a list (E1) or a map id → true. */
function cancelledIds(raw: Raw | null): Set<string> {
  const c = raw?.cancelled
  if (Array.isArray(c)) return new Set(c.filter((x): x is string => typeof x === 'string'))
  return new Set(isRaw(c) ? Object.keys(c).filter((k) => c[k] === true) : [])
}

const movedIds = (raw: Raw | null): Set<string> => new Set(isRaw(raw?.movedTo) ? Object.keys(raw.movedTo) : [])

/**
 * The blocks `after` (a day's file as an edit leaves it) takes out of the plan `before` had: one of the file gone from it
 * (not moved to another day), one cancelled for the day that was not. (An edit that changes a series too writes none – the
 * caller, `RemovalMarks.series`.)
 */
export function dayRemovals(before: Raw | null, after: Raw): DayRemoval[] {
  const was = blocksById(before)
  const now = blocksById(after)
  const moved = movedIds(after)
  const wasCancelled = cancelledIds(before)
  const nowCancelled = cancelledIds(after)
  const out: DayRemoval[] = []
  for (const [id, block] of was) if (!now.has(id) && !moved.has(id) && !nowCancelled.has(id)) out.push({ id, block, cancelled: false })
  for (const id of nowCancelled) if (!wasCancelled.has(id) && !moved.has(id)) out.push({ id, block: now.get(id) ?? was.get(id) ?? null, cancelled: true })
  return out
}

/** What an edit's entry says about the removal it is part of: the attachments it takes with it, whether it changes a series too. */
export interface RemovalMarks {
  /** The attachments removed with this entry (those that go after it, T923): id → the `removedAt` written into each. */
  taken?: Record<string, number>
  /** Of those, the ones of a day's block: id → the block's id (known when the edit was queued). */
  takenBy?: Record<string, string>
  /**
   * The edit changes a series record too: none of its day's changes is a removal of yours – a series' change („Powtarzaj” makes
   * your block its first occurrence, an end or a removal takes its occurrences out) never removes a block of yours.
   */
  series?: true
}

/**
 * The marks of each entry of one edit (as the window or the main process sends it): an attachment soft-removed (`removedAt` set
 * to a time) that goes after entries (`after`) is theirs – a block's day, a template's, a series' record; `series` on
 * every entry when one of them is a series record. Kept with the entry in the queue, so the removal's note and version say
 * exactly what went – never guessed from a file's stamp.
 */
export function removalMarks(entries: ReadonlyArray<{ rel: string; edits: ReadonlyArray<{ path: readonly string[]; value: unknown }>; after?: readonly number[] }>, blockOf: (attachmentId: string) => string | null = () => null): RemovalMarks[] {
  const series = entries.some((e) => classify(e.rel)?.kind === 'series')
  const out: RemovalMarks[] = entries.map(() => (series ? { series: true } : {}))
  entries.forEach((e, i) => {
    const c = classify(e.rel)
    if (c?.kind !== 'attachment' || !c.id) return
    const set = e.edits.find((f) => f.path.length === 1 && f.path[0] === 'removedAt')
    if (!set || typeof set.value !== 'number') return
    // Every entry it goes with (a series' occurrence's: the series and its day) – each removal it is part of names it.
    const block = blockOf(c.id)
    for (const j of new Set(e.after ?? []))
      if (Number.isInteger(j) && j >= 0 && j < i) out[j] = { ...out[j], taken: { ...out[j]!.taken, [c.id]: set.value }, ...(block != null ? { takenBy: { ...out[j]!.takenBy, [c.id]: block } } : {}) }
  })
  return out
}

/** A removed block as „Przywróć” takes it: its id, the block as its file held it, whether it was cancelled. */
export interface RemovedBlockRef {
  id: string
  value: Raw | null
  cancelled: boolean
}

/** „Przywróć” on the day's file: the cancel taken back, or the very block put back (replacing one of its id). */
export function restoredDay(raw: Raw, r: RemovedBlockRef): Raw {
  if (r.cancelled) return setCancelled(raw, r.id, false)
  return r.value ? putRawBlock(raw, { ...r.value, id: r.id }) : raw
}

/** Its „Cofnij”: the block out of the plan again, as it was removed. */
export function removedAgain(raw: Raw, r: RemovedBlockRef): Raw {
  return r.cancelled ? setCancelled(raw, r.id, true) : takeBlock(raw, r.id)
}

/** What a removed thing is for the attachments its removal took: its kind, its id, when it was removed, its record. */
export interface RemovedOwner {
  kind: string
  id: string
  removedAt: number
  value: Raw | null
}

/**
 * The attachments the very removal of `item` took with it (D410 – soft) and that are still so: those its edit named (`taken` –
 * id → the `removedAt` it wrote, `removalMarks`) of its owner – a day's block by its id (as `ownAttachmentIds`, also one moved
 * here from another day; a group's note names the others' too), a template – its own and the days' its removal took, a series –
 * its own and its occurrences' – whose `removedAt` is still the one written then (one brought back and taken away again since
 * is another removal). Their instant of removal (one for the edit – `removalEdits`); null – none.
 */
export function removedWith(raws: readonly Raw[], item: RemovedOwner, taken: Readonly<Record<string, number>> | undefined): { ids: string[]; removedAt: number } | null {
  if (!taken) return null
  const root = item.kind === 'series' ? (typeof item.value?.root === 'string' && item.value.root ? item.value.root : item.id) : null
  const owns = (a: Attachment): boolean => {
    const o = a.owner
    if (item.kind === 'block') return o.scope === 'day' && o.blockId === item.id
    if (item.kind === 'template') return o.scope === 'template' ? o.templateId === item.id : o.scope === 'day'
    if (item.kind === 'series') return o.scope === 'series' ? o.root === root : o.scope === 'day'
    return false
  }
  const still = raws.map(attachmentFrom).filter((a): a is Attachment => !!a && a.removedAt != null && taken[a.id] === a.removedAt && owns(a))
  if (!still.length) return null
  const removedAt = still[0]!.removedAt!
  return { ids: still.filter((a) => a.removedAt === removedAt).map((a) => a.id), removedAt }
}
