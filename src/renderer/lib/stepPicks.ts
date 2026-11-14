/**
 * Ticking a routine's steps in the bar's „Kroki ▸” (D328): the version picked (a worse days' version that became empty
 * meanwhile falls back to the usual one), the steps ticked one by one. It starts as the day has the block (T1108: the version
 * picked for it and its ticks – one state with the panel „Kroki” and the card in „Dziś”); another version starts with the day's
 * ticks of its steps.
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
  const version = versionOf(picked, routine.worse)
  const steps = routine[version]
  return {
    version,
    steps,
    done,
    setVersion: (v: RoutineVersion) => {
      setPicked(v)
      setDone(ticked(versionOf(v, routine.worse)))
    },
    flip: (id: string) =>
      setDone((s) => {
        const next = new Set(s)
        if (!next.delete(id)) next.add(id)
        return next
      }),
    /** The ticked steps of the version in force, in the routine's order. */
    ticked: () => steps.filter((s) => done.has(s.id))
  }
}
