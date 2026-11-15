/**
 * The forms of the windows „+ Nowa…” (D463) and ✎ (D514) of a block's panel – a routine's, a variant's, a subcategory's – and the steps as
 * they are saved: plain data shared by the windows (`NewThingDialogs`, `EditThingDialogs`) and what an edit changes (`editChanges`), so
 * that no module without a component imports one (T1338).
 */
import type { Costs } from '@shared/model/categories'
import type { RoutineStep } from '@shared/model/routines'

export type RoutineForm = { name: string; normal: RoutineStep[]; worse: RoutineStep[] }

/** The place: one of the three, or `VARIANT_PLACE_SAME` (`settings/categoryFields`) – „miejsce jak podkategoria”. */
export type VariantForm = { name: string; same: boolean; costs: Costs; place: string }

export type CategoryForm = {
  name: string
  /** Its category of the tree (D510). */
  group: string
  cls: 'work' | 'life' | 'free'
  place: 'computer' | 'passive' | 'away'
  color: string | null
  calendar: string
  costs: Costs
  flags: Record<string, boolean>
}

/** The steps as they are saved: a step without a name falls out. */
export const cleanSteps = (steps: readonly RoutineStep[]): RoutineStep[] => steps.filter((s) => s.name.trim()).map((s) => ({ ...s, name: s.name.trim() }))
