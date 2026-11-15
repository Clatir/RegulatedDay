/**
 * The edit of the move of sessions into the templates (D511, D515, `model/sessionMigration.ts`), from the records as they
 * were read – each once: every field edit has the value it was made from as its base, so a change made meanwhile on this
 * computer or another is a question of the queue, never written over (T1358). One edit: the templates the move changes and
 * makes (each with `sessionsMoved`, over its file – the fields, versions and blocks this version cannot read stay), after
 * them rd.json's changes (`after`) – till they are laid the days keep the layer. No day's file and no attachment: the move
 * keeps every id (T1401). Pure: the folder reads, the queue writes.
 */
import type { EditEntry } from '@shared/api'
import { recordEdit } from '@shared/data/merge'
import { paths } from '@shared/data/paths'
import { templateJson } from '@shared/model/defaults'
import { templateFrom, type Template } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { moveSessions } from '@shared/model/sessionMigration'

type Raw = Record<string, unknown>

export interface MoveInput {
  rd: Raw
  /** The templates' files as this computer sees them (with its queued edits). */
  templates: readonly Raw[]
  today: string
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
  const entries: EditEntry[] = []
  for (const t of move.changed) {
    const rel = paths.record('template', t.id)
    const base = rawOf.get(t.id)!
    const e = recordEdit(rel, base, templateJson(t, base))
    if (e) entries.push(e)
  }
  for (const t of move.made) {
    const e = recordEdit(paths.record('template', t.id), null, templateJson(t))
    if (e) entries.push(e)
  }
  const list = Array.isArray(inp.rd.settings) ? inp.rd.settings : []
  const settings = recordEdit(paths.settings, inp.rd, { ...inp.rd, settings: [...list, ...move.changes] })
  if (settings) entries.push({ ...settings, after: entries.map((_, i) => i) })
  return entries
}
