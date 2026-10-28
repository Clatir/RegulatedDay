/**
 * Edits of a day's file (days/RRRR/RRRR-MM-DD.json – only your changes, spec „Przyszłe dni przechowują tylko Twoje
 * zmiany”) as new versions of its raw JSON: fields this version does not know stay, every change touches only its own
 * field (a block by its id, a cancel and a move by the block's id), so the queue sends field edits that merge with a
 * change of another field on another computer.
 */
import { planBlockFrom, type PlanBlock } from '../model/plan'
import { deepEqual } from './merge'

export type Raw = Record<string, unknown>

const isPlain = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)

/** The day's raw file, or a new one (schema and date). */
export function dayRaw(raw: Raw | null | undefined, date: string): Raw {
  return isPlain(raw) ? { ...raw } : { schema: 1, date }
}

/**
 * A block as written: the file's block with only the fields you changed (A3-16) – a value this version cannot show (a
 * newer `tag`, a newer shape of `costs`) reads as its default and, untouched, stays as the file holds it; fields this
 * version does not know stay too.
 */
export function blockJson(b: PlanBlock, before?: Raw): Raw {
  if (!before) return { ...b }
  const was = planBlockFrom(before, typeof before.origin === 'string' ? (before.origin as PlanBlock['origin']) : 'user') as unknown as Raw | null
  const out: Raw = { ...before }
  for (const [k, v] of Object.entries(b)) if (!was || !(k in before) || !deepEqual(was[k], v)) out[k] = v
  return out
}

/** The block put into the day (replacing one with its id, keeping its unknown fields). */
export function putBlock(raw: Raw, b: PlanBlock): Raw {
  const list = Array.isArray(raw.blocks) ? (raw.blocks as unknown[]) : isPlain(raw.blocks) ? Object.values(raw.blocks) : []
  const i = list.findIndex((x) => isPlain(x) && x.id === b.id)
  const next = [...list]
  if (i >= 0) next[i] = blockJson(b, list[i] as Raw)
  else next.push(blockJson(b))
  return { ...raw, blocks: next }
}

/** A block of your own taken out of the file (a new block you added and then removed). */
export function takeBlock(raw: Raw, id: string): Raw {
  const list = Array.isArray(raw.blocks) ? (raw.blocks as unknown[]) : isPlain(raw.blocks) ? Object.values(raw.blocks) : []
  return { ...raw, blocks: list.filter((x) => !(isPlain(x) && x.id === id)) }
}

/** The map of cancelled blocks (a list written by E1 becomes the map, id → true). */
function cancelledMap(raw: Raw): Raw {
  if (Array.isArray(raw.cancelled)) return Object.fromEntries(raw.cancelled.filter((x): x is string => typeof x === 'string').map((id) => [id, true]))
  return isPlain(raw.cancelled) ? { ...raw.cancelled } : {}
}

/** A block of the snapshot cancelled for this day (or back again). */
export function setCancelled(raw: Raw, id: string, on: boolean): Raw {
  const m = cancelledMap(raw)
  if (on) m[id] = true
  else delete m[id]
  return { ...raw, cancelled: m }
}

/** A block moved to another day (or back). */
export function setMovedTo(raw: Raw, id: string, date: string | null): Raw {
  const m = isPlain(raw.movedTo) ? { ...raw.movedTo } : {}
  if (date) m[id] = date
  else delete m[id]
  return { ...raw, movedTo: m }
}

/** A session of the layer kept („yes”) or not („no”) on this day, or the layer's own choice again (null). */
export function setSessionAnswer(raw: Raw, sessionId: string, answer: 'yes' | 'no' | null): Raw {
  const m = isPlain(raw.sessions) ? { ...raw.sessions } : {}
  if (answer) m[sessionId] = answer
  else delete m[sessionId]
  return { ...raw, sessions: m }
}

/** A question asked once for this day, answered. */
export function setAsked(raw: Raw, key: string, answer: string): Raw {
  const m = isPlain(raw.asked) ? { ...raw.asked } : {}
  m[key] = answer
  return { ...raw, asked: m }
}

/** A field of the day (its type, its wake), or the default again (null). */
export function setDayField(raw: Raw, key: 'dayType' | 'wakeMin', value: unknown): Raw {
  const next = { ...raw }
  if (value == null) delete next[key]
  else next[key] = value
  return next
}
