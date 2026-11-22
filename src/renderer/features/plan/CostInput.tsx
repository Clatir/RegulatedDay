/**
 * One pool's cost an hour typed in (D568): a whole number in `RANGES.cost` (−100…100), „−” / „-” both taken; a refused text says why
 * under the field and the saved value comes back (the common handling of `SettingNumber`). The windows of a tile's cost and of a group's
 * cost put it between their „−” and „+”.
 */
import { RANGES } from '@shared/model/settings'
import { WIDE_COST_FROM, wideCostWarning } from '@shared/model/blockCosts'
import type { Costs, Pool } from '@shared/model/categories'
import { olderComputers } from '@shared/model/note'
import { useData } from '../../store/data'
import { SettingNumber } from '../settings/SettingNumber'
import { POOL_NAME } from './energyDraw'

/** The field of a pool's cost: an integer in the schema's range. */
export const COST_FIELD = { kind: 'integer', range: RANGES.cost } as const

export function CostInput({ pool, value, onCommit, onRefused, testId }: { pool: Pool; value: number; onCommit: (v: number) => void; onRefused?: (refused: boolean) => void; testId: string }) {
  return (
    <SettingNumber
      field={{ ...COST_FIELD, label: `${POOL_NAME[pool]}: koszt na godzinę` }}
      value={value}
      onCommit={onCommit}
      onReject={onRefused && (() => onRefused(true))}
      onAccept={onRefused && (() => onRefused(false))}
      className="w-[52px]"
      data-testid={testId}
    />
  )
}

/**
 * Under costs past ±5 while a computer of an older version is in the folder (D568, T2440 – like a long note, `LONG_NOTE_FROM`): it reads
 * such a cost as none and an edit there may write the default over it (a subcategory's variants go as a whole list).
 */
export function WideCostWarning({ costs, testId }: { costs: readonly Costs[]; testId: string }) {
  const computers = useData((s) => s.view?.computers)
  const text = wideCostWarning(olderComputers(computers ?? [], WIDE_COST_FROM), costs)
  return text ? (
    <p role="note" className="text-[11px] leading-snug text-lamp" data-testid={testId}>
      {text}
    </p>
  ) : null
}
