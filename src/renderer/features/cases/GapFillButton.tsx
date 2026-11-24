/**
 * „Rozłóż w luki” (D624, N5) – the button of the morning plan's step of sprawy: shown while „Dziś” has a sprawa without a block (`gapCases`);
 * a click puts them into today's free gaps (`spreadInGaps`) and „Dziś” says what it did in its line. `busy` – the step's runner, so the button
 * and „Dodaj do planu” never write at once.
 */
import type { CaseItem } from '@shared/engine/cases'
import { useBusy } from '../../lib/busy'
import type { DayModel } from '../../store/day'
import { spreadInGaps } from './gapFill'

export const GAP_FILL_TITLE = 'Niezaplanowane sprawy z „Dziś” w kolejności listy – każda w pierwszej wolnej luce dnia, która mieści jej szacunek (od teraz do maksimum, bez przesuwania bloków)'

export function GapFillButton({ model, items, busy: shared }: { model: DayModel; items: readonly CaseItem[]; busy?: ReturnType<typeof useBusy> }) {
  const own = useBusy()
  const [busy, run] = shared ?? own
  if (!items.length) return null
  return (
    <button type="button" className="btn self-start" disabled={busy} onClick={() => void run(() => spreadInGaps(model, items))} title={GAP_FILL_TITLE} data-testid="queue-gaps">
      Rozłóż w luki
    </button>
  )
}
