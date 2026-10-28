// adapted from FI src/shared/merge.ts @ 130345b
/**
 * Field-level differences and three-way merges of records (JSON values).
 * - Objects are compared key by key; arrays of objects with a string `id` (split lines, categories,
 *   accounts…) item by item; any other array, and scalars, as one value.
 * - merge3(base, mine, theirs): a field changed on one side only takes that side; changed on both sides to different
 *   values it is a conflict (`choose` decides, by default "mine"). Bookkeeping fields (updatedAt, updatedBy,
 *   schemaVersion, computed) never conflict: the newer / theirs wins.
 * Changed against FI: the labels for the interface stay in FI (this app shows conflicts from E3 on), `setAt` added for
 * the queue of edits; the bookkeeping fields of this app (`updatedAt`, `updatedBy`, `schema`).
 */
import type { EditEntry } from '../api'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type Path = Array<string>

export interface FieldChange {
  path: Path
  before: unknown
  after: unknown
}

export interface MergeConflict {
  path: Path
  base: unknown
  mine: unknown
  theirs: unknown
}

export type Side = 'mine' | 'theirs'

/** Never shown nor in conflict: written by the app on every save. */
export const BOOKKEEPING: ReadonlySet<string> = new Set(['updatedAt', 'updatedBy', 'schema', 'schemaVersion'])

const isObject = (v: unknown): v is Record<string, unknown> => v != null && typeof v === 'object' && !Array.isArray(v)
const isIdArray = (v: unknown): v is Array<{ id: string }> =>
  Array.isArray(v) && v.every((x) => isObject(x) && typeof x.id === 'string')

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a == null || b == null) return a === b || (a == null && b == null)
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => deepEqual(x, b[i]))
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) if (!deepEqual(a[k], b[k])) return false
    return true
  }
  return false
}

/** The same content, the save stamps aside (`BOOKKEEPING` at the top level). */
export function sameContentAs(a: unknown, b: unknown): boolean {
  if (!isObject(a) || !isObject(b)) return deepEqual(a, b)
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!BOOKKEEPING.has(k) && !deepEqual(a[k], b[k])) return false
  return true
}

export const pathKey = (p: Path) => p.join('\u0001')

/** Leaf-level changes from `a` to `b` (bookkeeping fields at the top level are left out). */
export function diffRecords(a: unknown, b: unknown, path: Path = []): FieldChange[] {
  if (deepEqual(a, b)) return []
  if (isObject(a) && isObject(b)) {
    const out: FieldChange[] = []
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (path.length === 0 && BOOKKEEPING.has(k)) continue
      out.push(...diffRecords(a[k], b[k], [...path, k]))
    }
    return out
  }
  if (isIdArray(a) && isIdArray(b) && (a.length || b.length)) {
    const ma = byIds(a)
    const mb = byIds(b)
    // The order changed (the steps of a routine moved up): item by item it would be no change at all – the whole array
    // is the change (A6-02).
    if (!deepEqual(commonOrder(a, mb), commonOrder(b, ma))) return [{ path, before: a, after: b }]
    const out: FieldChange[] = []
    const ids = [...new Set([...a.map((x) => x.id), ...b.map((x) => x.id)])]
    for (const id of ids) {
      const x = ma.get(id)
      const y = mb.get(id)
      // The same item (an array of thousands – the import's rules – changed in one place): nothing to look into (W36).
      if (x && y) {
        if (x !== y) out.push(...diffRecords(x, y, [...path, `#${id}`]))
      } else out.push({ path: [...path, `#${id}`], before: x, after: y })
    }
    return out
  }
  return [{ path, before: a, after: b }]
}

/** An array's items by id – the first of an id, as `find` would (W36: one map, not a pass over the array per id). */
function byIds<T extends { id: string }>(arr: readonly T[]): Map<string, T> {
  const out = new Map<string, T>()
  for (const x of arr) if (!out.has(x.id)) out.set(x.id, x)
  return out
}

/** The order of the ids of `arr` that `other` has too. */
function commonOrder(arr: ReadonlyArray<{ id: string }>, other: ReadonlyMap<string, unknown>): string[] {
  return [...new Set(arr.map((x) => x.id))].filter((id) => other.has(id))
}

interface MergeResult<T> {
  merged: T
  conflicts: MergeConflict[]
}

/**
 * Three-way merge. `base` = the version both sides started from (undefined when unknown: then every difference
 * between mine and theirs is a conflict).
 */
export function merge3<T>(base: unknown, mine: T, theirs: T, choose: (conflict: MergeConflict) => Side = () => 'mine'): MergeResult<T> {
  const conflicts: MergeConflict[] = []
  const merged = mergeAt(base, mine, theirs, [], conflicts, choose) as T
  return { merged, conflicts }
}

const ABSENT = undefined
/** A key the known base did not have (B47): unlike an unknown base, a side that adds it alone is no conflict. */
const MISSING = Symbol('missing')

function mergeAt(rawBase: unknown, mine: unknown, theirs: unknown, path: Path, conflicts: MergeConflict[], choose: (c: MergeConflict) => Side): unknown {
  if (deepEqual(mine, theirs)) return mine
  const known = rawBase !== ABSENT
  const base = rawBase === MISSING ? undefined : rawBase
  if (known && deepEqual(base, mine)) return theirs
  if (known && deepEqual(base, theirs)) return mine
  if (isObject(mine) && isObject(theirs)) {
    const b = isObject(base) ? base : undefined
    const out: Record<string, unknown> = {}
    const keys = [...new Set([...Object.keys(theirs), ...Object.keys(mine)])]
    for (const k of keys) {
      if (path.length === 0 && BOOKKEEPING.has(k)) {
        out[k] = theirs[k] ?? mine[k]
        continue
      }
      const v = mergeAt(b ? (k in b ? b[k] : MISSING) : ABSENT, mine[k], theirs[k], [...path, k], conflicts, choose)
      if (v !== undefined) out[k] = v
    }
    return out
  }
  if (isIdArray(mine) && isIdArray(theirs)) {
    const b = isIdArray(base) ? base : !known ? undefined : []
    const mm = byIds(mine)
    const tm = byIds(theirs)
    const bm = b ? byIds(b) : undefined
    // Order: theirs, then items only I added (in my order) – mine first when only I changed the order (A6-02).
    const all = new Map([...mm, ...tm].filter(([id]) => mm.has(id) && tm.has(id) && (!bm || bm.has(id))))
    const mineOrders = !!b && bm !== undefined && deepEqual(commonOrder(b, all), commonOrder(theirs, all)) && !deepEqual(commonOrder(b, all), commonOrder(mine, all))
    const ids = mineOrders ? [...mine.map((x) => x.id), ...theirs.map((x) => x.id).filter((id) => !mm.has(id))] : [...theirs.map((x) => x.id), ...mine.map((x) => x.id).filter((id) => !tm.has(id))]
    const out: unknown[] = []
    for (const id of ids) {
      const m = mm.get(id)
      const t = tm.get(id)
      const bi = bm?.get(id)
      const p = [...path, `#${id}`]
      if (m && t) {
        out.push(mergeAt(bi, m, t, p, conflicts, choose))
      } else if (m && !t) {
        // Theirs removed it (it was in base) or I added it.
        if (!bi && b !== undefined) out.push(m)
        else if (bi && deepEqual(bi, m)) continue
        else if (pick({ path: p, base: bi, mine: m, theirs: undefined }, conflicts, choose) === 'mine') out.push(m)
      } else if (t && !m) {
        if (!bi && b !== undefined) out.push(t)
        else if (bi && deepEqual(bi, t)) continue
        else if (pick({ path: p, base: bi, mine: undefined, theirs: t }, conflicts, choose) === 'theirs') out.push(t)
      }
    }
    // Removals on both sides, or of an item only in base: nothing to add.
    return out
  }
  return pick({ path, base: known ? base : undefined, mine, theirs }, conflicts, choose) === 'mine' ? mine : theirs
}

function pick(c: MergeConflict, conflicts: MergeConflict[], choose: (c: MergeConflict) => Side): Side {
  conflicts.push(c)
  return choose(c)
}

/** The value at a path of `merge3` / `diffRecords` (a `#id` part = the array item of that id); undefined = none. */
export function valueAt(root: unknown, path: Path): unknown {
  let v: unknown = root
  for (const part of path) {
    if (part.startsWith('#') && isIdArray(v)) v = v.find((x) => x.id === part.slice(1))
    else if (isObject(v)) v = v[part]
    else return undefined
    if (v === undefined) return undefined
  }
  return v
}

/** Choices keyed by the conflict path (from a dialog) as a `choose` function; unknown paths take `fallback`. */
export function chooser(choices: ReadonlyMap<string, Side> | Record<string, Side>, fallback: Side = 'mine'): (c: MergeConflict) => Side {
  const get = (k: string) => (choices instanceof Map ? choices.get(k) : (choices as Record<string, Side>)[k])
  return (c) => get(pathKey(c.path)) ?? fallback
}

/**
 * `root` with `value` at `path` (a `#id` part = the array item of that id; objects made on the way); undefined removes the
 * field (or the array item). The root is not changed.
 */
export function setAt(root: unknown, path: Path, value: unknown): unknown {
  if (!path.length) return value
  const [part, ...rest] = path as [string, ...string[]]
  if (part.startsWith('#')) {
    const id = part.slice(1)
    const arr = Array.isArray(root) ? root : []
    const i = arr.findIndex((x) => isObject(x) && x.id === id)
    const next = setAt(i >= 0 ? arr[i] : undefined, rest, value)
    const out = [...arr]
    if (next === undefined) {
      if (i >= 0) out.splice(i, 1)
    } else if (i >= 0) out[i] = next
    else out.push(next)
    return out
  }
  const obj = isObject(root) ? root : {}
  const next = setAt(obj[part], rest, value)
  const out: Record<string, unknown> = { ...obj }
  if (next === undefined) delete out[part]
  else out[part] = next
  return out
}

/**
 * The edit that turns `before` into `after` (the window's writes and the bar's variants): the fields that differ, each
 * with its value before (its base); a new record – every field; none after – the record removed.
 */
export function recordEdit(rel: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null): EditEntry | null {
  if (!after) return before ? { rel, remove: true, edits: [] } : null
  if (!before) return { rel, create: true, edits: Object.entries(after).map(([k, v]) => ({ path: [k], base: undefined, value: v })) }
  const edits = diffRecords(before, after).map((c) => ({ path: c.path, base: c.before, value: c.after }))
  return edits.length ? { rel, edits } : null
}
