/**
 * Ticking a routine's steps in the bar's „Kroki ▸” (D328): the version picked (a worse days' version that became empty
 * meanwhile falls back to the usual one), the steps ticked one by one. It starts as the day has the block (T1108: the version
 * picked for it and its ticks – one state with the panel „Kroki” and the card in „Dziś”); another version starts with the day's
 * ticks of its steps. Its save is the change against the day it started from (`change`, T1112).
 */
import { useState } from 'react'
import type { RoutineVersion } from '@shared/model/routines'

interface Step {
  id: string
  name: string
  min: number
}

/** The version in force: the worse days' one only while it has steps. */
export const versionOf = (picked: RoutineVersion, worse: readonly unknown[]): RoutineVersion => (picked === 'worse' && worse.length ? 'worse' : 'normal')

export function useStepPicks(routine: { normal: readonly Step[]; worse: readonly Step[]; version?: RoutineVersion; done?: readonly string[] }) {
  const ticked = (v: RoutineVersion) => new Set(routine[v].filter((s) => routine.done?.includes(s.id)).map((s) => s.id))
  const [picked, setPicked] = useState<RoutineVersion>(routine.version ?? 'normal')
  const [done, setDone] = useState<ReadonlySet<string>>(() => ticked(versionOf(routine.version ?? 'normal', routine.worse)))
  // What the day had ticked when the picks were made (T1112): the save sends the difference from it, never the whole state.
  const [base, setBase] = useState<ReadonlySet<string>>(() => new Set(routine.done ?? []))
  const version = versionOf(picked, routine.worse)
  const steps = routine[version]
  return {
    version,
    steps,
    done,
    setVersion: (v: RoutineVersion) => {
      setPicked(v)
      setDone(ticked(versionOf(v, routine.worse)))
      setBase(new Set(routine.done ?? []))
    },
    flip: (id: string) =>
      setDone((s) => {
        const next = new Set(s)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    /** The ticked steps of the version in force, in the routine's order. */
    ticked: () => steps.filter((s) => done.has(s.id)),
    /**
     * The change of each step of the version in force against the day when the picks were made (T1112): `a` ticked here, `r`
     * taken off here, `.` as it was – a tick made elsewhere meanwhile is no change of yours.
     */
    change: () => steps.map((s) => (done.has(s.id) === base.has(s.id) ? '.' : done.has(s.id) ? 'a' : 'r')).join('')
  }
}
