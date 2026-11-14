/**
 * The version of a block's routine beside the heading „Kroki” (D473, T1101): „zwykła” / „na gorsze dni” – one click, as on the
 * routine's card (D93, D139); shown only while the list is the routine's and the routine has a version for worse days.
 */
import { ROUTINE_VERSION_NAMES, ROUTINE_VERSIONS, type RoutineVersion } from '@shared/model/routines'
import { Segmented } from '../../components/ui'

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
