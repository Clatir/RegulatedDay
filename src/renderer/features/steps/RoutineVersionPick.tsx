/**
 * The version of a block's routine beside the heading „Kroki” (D473, T1101): „zwykła” / „na gorsze dni” – one click, as on the
 * routine's card (D93, D139); shown only while the list is the routine's (`routineVersionShown`).
 */
import type { RoutineSteps } from '@shared/model/routineSteps'
import { ROUTINE_VERSION_NAMES, ROUTINE_VERSIONS, type RoutineVersion } from '@shared/model/routines'
import { Segmented } from '../../components/ui'

/**
 * Whether the panel shows the switch (T1116, T1124): the list is the routine's, its routine is there (one removed – the list the
 * day keeps, nothing to pick), and the routine has a version for worse days – or the day keeps a list „na gorsze dni” the
 * routine no longer has (back to „zwykła”).
 */
export const routineVersionShown = (list: RoutineSteps | null | undefined): list is RoutineSteps =>
  !!list?.routine && (list.version === 'worse' || list.routine.worse.length > 0)

export function RoutineVersionPick({ version, onPick }: { version: RoutineVersion; onPick: (v: RoutineVersion) => void }) {
  return (
    <Segmented
      value={version}
      options={ROUTINE_VERSIONS.map((v) => ({ value: v, label: ROUTINE_VERSION_NAMES[v] }))}
      onChange={(v) => v !== version && onPick(v)}
      aria-label="Wersja rutyny"
      data-testid="steps-routine-version"
    />
  )
}
