/**
 * Today's type „Wolne” after „Tak” on the question of an all-day event (D406): today, the day already made, changes its
 * type as by hand – the same dialog of the change during the day (`TypeChangeDialog`) with „Wolne” chosen, its proposals to
 * accept, no „Cofnij” (as for the change by hand). Mounted by the strip; closing the dialog changes nothing.
 */
import { useMemo } from 'react'
import { useData } from '../../store/data'
import { useDay } from '../../store/day'
import type { Names } from '../plan/blockView'
import { TypeChangeDialog } from '../today/TypeChangeDialog'

export function FreeTodayDialog({ today, onClose }: { today: string; onClose: () => void }) {
  const { rd, routines, requests } = useData()
  const model = useDay(today)
  const names: Names | null = useMemo(() => (model ? { rd, settings: model.state.settings, routines, requests } : null), [model, rd, routines, requests])
  if (!model || !names) return null
  return <TypeChangeDialog model={model} names={names} isToday initialTo="wolne" onClose={onClose} />
}
