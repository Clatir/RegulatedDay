/**
 * The edit of the move of sessions into the templates (D511, `model/sessionMigration.ts`), from the records as they were
 * read – each once: every field edit has the value it was made from as its base, so a change made meanwhile on this computer
 * or another is a question of the queue, never written over. One edit: the templates (each with the date of the move,
 * `MOVED`; a copy of a split over its original's file – the fields, versions and blocks this version cannot read stay), the
 * days from the move's date whose ids of blocks change (`dayIdMap`; today only while it is not made – a made day keeps its
 * snapshot's ids) and their attachments, after all of them rd.json's changes – the first with the list of the records a day
 * of the move waits for (`expect`, `folder.sessionsReady`). Pure: the folder reads, the queue writes.
 */
import type { EditEntry } from '@shared/api'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { defaultDayType } from '@shared/engine/createDay'
import { templateJson } from '@shared/model/defaults'
import { dayFileFrom, templateFrom, type DayFile, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { dayIdMap, moveSessions, withIds } from '@shared/model/sessionMigration'
import { settingsOn } from '@shared/model/settings'
import { isIsoDate } from '@shared/time/zone'

type Raw = Record<string, unknown>

/** The field of a record the move wrote: the date of the move. */
export const MOVED = 'sessionsMoved'

export interface MoveInput {
  rd: Raw
  templates: readonly Raw[]
  /** The files of the days from today on (by date). */
  days: ReadonlyMap<string, Raw>
  attachments: readonly Raw[]
  today: string
  /** Today's day is made already (its snapshot in the log). */
  todayMade: boolean
}

/** The entries of the move's edit, null when there is nothing to move (made already). */
export function sessionMoveEdits(inp: MoveInput): EditEntry[] | null {
  const changes = rdFrom(inp.rd).settings
  const rawOf = new Map<string, Raw>()
  const before: Template[] = []
  for (const raw of inp.templates) {
    const t = templateFrom(raw)
    if (!t) continue
    rawOf.set(t.id, raw)
    before.push(t)
  }
  const move = moveSessions(changes, before, inp.today)
  if (!move) return null
  const from = move.from
  const entries: EditEntry[] = []
  const expect: string[] = []
  for (const t of move.changed) {
    const rel = paths.record('template', t.id)
    const base = rawOf.get(t.id)!
    const e = recordEdit(rel, base, { ...templateJson(t, base), [MOVED]: from })
    if (e) (entries.push(e), expect.push(rel))
  }
  for (const { template: t, copyOf } of move.made) {
    const rel = paths.record('template', t.id)
    // A copy of a split: its original's file under its own id (the record's stamp of its last save – not the copy's).
    const original = copyOf ? rawOf.get(copyOf) : undefined
    const { updatedAt: _a, updatedBy: _b, [MOVED]: _m, ...base } = original ?? {}
    const e = recordEdit(rel, null, { ...templateJson(t, original ? base : null), [MOVED]: from })
    if (e) (entries.push(e), expect.push(rel))
  }
  const templates = entries.map((_, i) => i)
  const typeOf = (date: string, file: DayFile | null) => file?.dayType ?? defaultDayType(date, settingsOn(changes, date))
  const skip = (date: string) => date < from || (date === inp.today && inp.todayMade)
  const files = new Map<string, DayFile>()
  for (const [date, raw] of [...inp.days].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (skip(date)) continue
    const file = dayFileFrom(raw, date)
    files.set(date, file)
    const map = dayIdMap(move, before, date, typeOf(date, file))
    if (!map.size) continue
    const rel = paths.day(date)
    const e = recordEdit(rel, raw, { ...(withIds(raw, map) as Raw), [MOVED]: from })
    if (e) (entries.push({ ...e, after: templates }), expect.push(rel))
  }
  for (const raw of inp.attachments) {
    const owner = raw.owner as Raw | undefined
    if (!owner || owner.scope !== 'day' || !isIsoDate(owner.date) || skip(owner.date) || typeof owner.blockId !== 'string' || typeof raw.id !== 'string') continue
    const to = dayIdMap(move, before, owner.date, typeOf(owner.date, files.get(owner.date) ?? null)).get(owner.blockId)
    const e = to ? recordEdit(paths.record('attachment', raw.id), raw, { ...raw, owner: { ...owner, blockId: to } }) : null
    if (e) entries.push({ ...e, after: templates })
  }
  const list = Array.isArray(inp.rd.settings) ? inp.rd.settings : []
  const [first, ...rest] = move.changes
  const settings = recordEdit(paths.settings, inp.rd, { ...inp.rd, settings: [...list, { ...first, expect }, ...rest] })
  if (settings) entries.push({ ...settings, after: entries.map((_, i) => i) })
  return entries
}
