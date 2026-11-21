/**
 * „Zaplanowane zmiany” (UX14, E2): what waits for its date, as „co → od kiedy” – each change with the fields it changes and
 * their new values. The slot `action` draws what a row does: on the settings page „Wycofaj” (`WithdrawAction`; `PlannedChange.id` is
 * the id of the change in rd.json „settings”).
 */
import type { ReactNode } from 'react'
import { plDate } from '@shared/format'
import { useBusy } from '../../lib/busy'
import { useData } from '../../store/data'
import { plannedChanges, type PlannedChange } from './plannedChanges'
import { withdrawPlanned } from './plannedWithdraw'

export function PlannedChanges({ action }: { action?: (change: PlannedChange) => ReactNode }) {
  const rd = useData((s) => s.rd)
  const today = useData((s) => s.view?.today ?? '')
  const names: Record<string, string> = {}
  for (const [id, meta] of Object.entries(rd.categories)) names[id] = meta.name
  const list = today ? plannedChanges(rd.settings, today, { categories: names }) : []
  if (!list.length) return null
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-2.5" data-testid="settings-planned">
      <h2 className="mb-1.5 text-[12.5px] font-medium text-fg">Zaplanowane zmiany</h2>
      <ul className="flex flex-col gap-2">
        {list.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-[12.5px]" data-testid={`settings-planned-${c.id}`}>
            <span className="num min-w-[96px] text-fg">od {plDate(c.from)}</span>
            <ul className="min-w-0 flex-1">
              {c.items.map((i) => (
                <li key={i.label} className="text-muted">
                  {i.label}
                  {i.value ? `: ${i.value}` : ''}
                </li>
              ))}
            </ul>
            {action?.(c)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * „Wycofaj” of a row (one save; the toast says how it went, with „Cofnij”). A change of the layer of sessions has none – the templates
 * hold those sessions (D511) – the row says where they change.
 */
export function WithdrawAction({ change }: { change: PlannedChange }) {
  const [busy, run] = useBusy()
  if (!change.withdrawable) return <span className="text-[12px] text-muted">sesje są w szablonach – zmień je w „Szablonach”</span>
  return (
    <button type="button" className="btn" disabled={busy} onClick={() => void run(() => withdrawPlanned(change.id))} data-testid={`settings-withdraw-${change.id}`}>
      Wycofaj
    </button>
  )
}
