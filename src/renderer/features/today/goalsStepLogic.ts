/**
 * The logic of the morning's step „Cele na <miesiąc>” (D356, D360): when it shows, which numbers its fields start with, how
 * it closes. A goal blocks nothing (D72): „Pomiń” closes the step in this window whatever the save does (as „Strona B”
 * does, A6-15) – a folder that cannot be written only makes it come back tomorrow.
 */
import type { EditOutcome } from '@shared/api'
import { goalsStepShown } from '@shared/engine/goals'
import { GOAL_AREAS, goalRange, previousMonth, type GoalArea, type GoalsPatch, type MonthGoals } from '@shared/model/goals'
import { isSaved } from '../../store/data'
import type { GoalValues } from '../week/GoalFields'

/** The step shows: goals of the month not set, the step not skipped, not closed in this window, the plan not approved by you yet. */
export function goalsStepOpen(goals: MonthGoals | null | undefined, month: string, closedHere: string | null, approvedByYou: boolean): boolean {
  return !approvedByYou && closedHere !== month && goalsStepShown(goals)
}

/** The month before's goals taken over for `month`: a number above the new month's range is cut to it (29–31 days of regeneration). */
export function suggestedGoals(month: string, previous: Partial<Record<GoalArea, number | null>> | null | undefined): GoalValues {
  const out: GoalValues = { study: null, regen: null, trading: null }
  for (const area of GOAL_AREAS) {
    const v = previous?.[area]
    if (v != null) out[area] = Math.min(Math.max(v, goalRange(area, month)[0]), goalRange(area, month)[1])
  }
  return out
}

/** The same from the goals of every month as the window holds them (`rd.goals`): no count of a month's progress is needed. */
export const suggestedGoalsOf = (month: string, goals: Readonly<Record<string, MonthGoals>>): GoalValues => suggestedGoals(month, goals[previousMonth(month)])

/** What you changed in the fields, with the month it was changed for (another month's edits are not these fields'). */
export interface StepEdits {
  month: string
  values: Partial<GoalValues>
}

/** The fields' values: the month before's numbers, over them what you changed in this month's step. */
export function stepValues(month: string, goals: Readonly<Record<string, MonthGoals>>, edits: StepEdits | null): GoalValues {
  return { ...suggestedGoalsOf(month, goals), ...(edits?.month === month ? edits.values : {}) }
}

/** The numbers that are set (an empty field is no goal). */
export function stepPatch(values: GoalValues): GoalsPatch {
  const patch: GoalsPatch = {}
  for (const a of GOAL_AREAS) if (values[a] != null) patch[a] = values[a]
  return patch
}

interface StepIo {
  save: (month: string, patch: GoalsPatch) => Promise<EditOutcome[] | null>
}

/**
 * „Pomiń”: the step closes in this window at once, then the skip is saved for every computer; when it could not be saved,
 * you are told it comes back tomorrow. Returns whether it was saved.
 */
export async function skipGoals(month: string, io: StepIo & { close: (month: string) => void; notify: (text: string) => void }): Promise<boolean> {
  io.close(month)
  let saved = false
  try {
    saved = isSaved(await io.save(month, { skipped: true }))
  } catch {
    saved = false
  }
  if (!saved) io.notify('Nie zapisano pominięcia – krok „Cele” wróci jutro.')
  return saved
}

/** „Zapisz”: the numbers saved; false – not saved (the step stays, with „Pomiń” beside it). */
export async function saveGoalsStep(month: string, values: GoalValues, io: StepIo): Promise<boolean> {
  try {
    return isSaved(await io.save(month, stepPatch(values)))
  } catch {
    return false
  }
}
