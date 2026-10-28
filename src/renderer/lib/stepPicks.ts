/**
 * Ticking a routine's steps (D328) – one set of rules for the bar's „Kroki ▸” and the card in „Dziś”: the version
 * picked (a worse days' version that became empty meanwhile falls back to the usual one), the steps ticked one by one,
 * nothing ticked after a change of the version.
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

export function useStepPicks(routine: { normal: readonly Step[]; worse: readonly Step[] }) {
  const [picked, setPicked] = useState<RoutineVersion>('normal')
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())
  const version = versionOf(picked, routine.worse)
  const steps = routine[version]
  return {
    version,
    steps,
    done,
    setVersion: (v: RoutineVersion) => {
      setPicked(v)
      setDone(new Set())
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
