/**
 * What a quick edit from a block's panel changes (D514): the form of the window against the thing as it was when the window opened – only
 * the fields that differ are written (a field left alone is never rewritten, so nothing is dated or noted for it), and `what` tells the
 * count of blocks (`editScope.ts`) what kind of change it is: `costs` – only costs, `all` – anything else, null – nothing.
 */
import type { Costs, Place } from '@shared/model/categories'
import { deepEqual } from '@shared/data/merge'
import { sameCosts } from '@shared/model/blockCosts'
import { FLAGS, POOLS, VARIANT_PLACE_SAME } from '../settings/categoryFields'
import type { EditWhat } from './editScope'
import { cleanSteps, type CategoryForm, type RoutineForm, type VariantForm } from './thingForms'

export interface CategoryChange {
  /** The dated settings (class, place, the properties, only the costs of a pool that changed) – saved from now on; null – none. */
  patch: Record<string, unknown> | null
  /** The name and colour of rd.json (at once, not dated); null – none. */
  meta: { name?: string; color?: string | null } | null
  group: string | null
  calendar: string | null
  what: EditWhat | null
}

export function categoryChange(was: CategoryForm, now: CategoryForm): CategoryChange {
  const patch: Record<string, unknown> = {}
  if (now.cls !== was.cls) patch.cls = now.cls
  if (now.place !== was.place) patch.place = now.place
  for (const [k] of FLAGS) if ((now.flags[k] === true) !== (was.flags[k] === true)) patch[k] = now.flags[k] === true
  const costs: Partial<Costs> = {}
  for (const [p] of POOLS) if (now.costs[p] !== was.costs[p]) costs[p] = now.costs[p]
  const costsChanged = Object.keys(costs).length > 0
  const otherDated = Object.keys(patch).length > 0
  if (costsChanged) patch.costs = costs
  const meta: NonNullable<CategoryChange['meta']> = {}
  const name = now.name.trim()
  if (name && name !== was.name) meta.name = name
  if (now.color !== was.color) meta.color = now.color
  const hasMeta = Object.keys(meta).length > 0
  const group = now.group !== was.group ? now.group : null
  const calendar = now.calendar !== was.calendar ? now.calendar : null
  const undated = hasMeta || group != null || calendar != null
  return {
    patch: Object.keys(patch).length ? patch : null,
    meta: hasMeta ? meta : null,
    group,
    calendar,
    what: otherDated || undated ? 'all' : costsChanged ? 'costs' : null
  }
}

export interface VariantChange {
  /** The fields to change in the variant's list (`changeVariant`); null – none. */
  patch: { name?: string; costs?: Costs | null; place?: Place | null } | null
  what: EditWhat | null
}

const ownCosts = (f: VariantForm): Costs | null => (f.same ? null : f.costs)

export function variantChange(was: VariantForm, now: VariantForm): VariantChange {
  const patch: NonNullable<VariantChange['patch']> = {}
  const name = now.name.trim()
  if (name && name !== was.name) patch.name = name
  if (now.place !== was.place) patch.place = now.place === VARIANT_PLACE_SAME ? null : (now.place as Place)
  const [a, b] = [ownCosts(was), ownCosts(now)]
  const costsChanged = (a == null) !== (b == null) || (a != null && b != null && !sameCosts(a, b))
  if (costsChanged) patch.costs = b
  const other = patch.name !== undefined || patch.place !== undefined
  return { patch: Object.keys(patch).length ? patch : null, what: other ? 'all' : costsChanged ? 'costs' : null }
}

export interface RoutineChange {
  /** The fields of the routine's record to write; `costs` (D512) – its own cost, null – „jak podkategoria”. */
  patch: { name?: string; normal?: RoutineForm['normal']; worse?: RoutineForm['worse']; costs?: Costs | null } | null
  what: EditWhat | null
}

export function routineChange(was: RoutineForm, now: RoutineForm): RoutineChange {
  const patch: NonNullable<RoutineChange['patch']> = {}
  const name = now.name.trim()
  if (name && name !== was.name) patch.name = name
  const [normal, worse] = [cleanSteps(now.normal), cleanSteps(now.worse)]
  if (!deepEqual(normal, was.normal)) patch.normal = normal
  if (!deepEqual(worse, was.worse)) patch.worse = worse
  const other = Object.keys(patch).length > 0
  const [a, b] = [was.costs ?? null, now.costs ?? null]
  const costsChanged = (a == null) !== (b == null) || (a != null && b != null && !sameCosts(a, b))
  if (costsChanged) patch.costs = b
  return { patch: Object.keys(patch).length ? patch : null, what: other ? 'all' : costsChanged ? 'costs' : null }
}
