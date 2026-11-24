/**
 * „Uzupełnij ciało” (D623, N14): over the tree of „Kategorie” the line „6 podkategorii ma ciało 0 · Uzupełnij · ×” – the subcategories of yours and the variants
 * of yours with a cost of their own whose body cost is 0 (`bodyMissing`: what you added starts with 0, D523; the starting ones have their own and are not
 * offered). „×” hides the line for good (rd.json `bodyFillHidden` – on every computer, with „Cofnij” in the toast); more gaps later never bring it back.
 * „Uzupełnij” opens the window: each element with its G · E · B (read only) and the field C with [−] [+] (typed as in „Koszt…”, −100…100, D568);
 * „Zapisz” writes the C ≠ 0 of them in ONE change from the bar's date (`changeTreeGroup`, `costsEach`) – „Uzupełniono ciało: 3 podkategorie · Cofnij” in the line of
 * the section; the elements left at 0 stay as they are. „Zapisz” first commits the field being typed in (as T2711); a field that stands refused writes nothing.
 */
import { useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { EditEntry } from '@shared/api'
import { formatNumber } from '@shared/format'
import { COST_MAX, COST_MIN } from '@shared/model/blockCosts'
import { POOL_LETTER, POOLS, type Costs } from '@shared/model/categories'
import { bodyMissing, bodyMissingText, type BodyGap } from '@shared/model/categoryGroup'
import { categoryTree } from '@shared/model/categoryTree'
import type { RdFile } from '@shared/model/rd'
import type { RulesSettings } from '@shared/model/settings'
import { Dialog } from '../../components/Dialog'
import { useBusy } from '../../lib/busy'
import { commitActiveField } from '../../lib/commit'
import { saveAnswer } from '../../store/data'
import { toast, undoToast } from '../../store/ui'
import { WideCostWarning } from '../plan/CostInput'
import { POOL_COLOR } from '../plan/energyDraw'
import { changeTreeGroup } from './categoryGroupEdits'
import { saveTree, undoTree } from './categoryTreeEdits'
import { PoolField } from './TreeCostDialog'

/** „Cofnij” of the hiding: what it cannot do it says (the file is never overwritten); a question says nothing more – the banner asks. */
async function undoHide(entry: EditEntry): Promise<void> {
  const r = await undoTree(entry)
  const again = { label: 'Cofnij', run: () => void undoHide(entry) }
  if (r === 'changed') toast('Ustawienie zmieniło się od schowania – zostaje, jak jest teraz.', 'info', 6000)
  else if (r === 'unreadable') toast('Nie da się teraz cofnąć schowania – ustawień nie można odczytać. Spróbuj za chwilę.', 'error', 10_000, again)
  else if (r === 'failed') toast('Nie cofnięto schowania – zapis się nie udał. Spróbuj jeszcze raz.', 'error', 10_000, again)
}

/** The window: the elements as they were when it opened (a change from another computer meanwhile does not move its rows). */
function BodyFillDialog({ rows, onClose, onApply }: { rows: readonly BodyGap[]; onClose: () => void; onApply: (values: Record<string, Partial<Costs>>) => void }) {
  const [values, setValues] = useState<Record<string, number>>({})
  // What the window holds now, also within one event (the field committed by „Zapisz” itself sets it before „Zapisz” reads it).
  const latest = useRef<Record<string, number>>({})
  const set = (key: string, v: number) => {
    latest.current = { ...latest.current, [key]: Math.max(COST_MIN, Math.min(COST_MAX, Math.round(v))) }
    setValues(latest.current)
  }
  // ± 1 from what the window holds now, not from what was drawn: two clicks in one event count both (as `step` of „Koszt…”).
  const step = (key: string, by: 1 | -1) => set(key, (latest.current[key] ?? 0) + by)
  const box = useRef<HTMLDivElement>(null)
  const apply = () => {
    flushSync(() => commitActiveField())
    if (box.current?.querySelector('[aria-invalid="true"]')) return
    const out: Record<string, Partial<Costs>> = {}
    for (const r of rows) {
      const v = latest.current[r.key] ?? 0
      if (v !== 0) out[r.key] = { body: v }
    }
    // Everything left at 0 – nothing to write: the window only closes.
    if (Object.keys(out).length === 0) return onClose()
    onApply(out)
  }
  const after = rows.map((r) => ({ ...r.costs, body: values[r.key] ?? 0 }))
  return (
    <Dialog
      title="Uzupełnij ciało"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-accent" onClick={apply} data-testid="body-fill-apply">
            Zapisz
          </button>
          <button type="button" className="btn" onClick={onClose} data-testid="body-fill-cancel">
            Anuluj
          </button>
        </>
      }
      data-testid="body-fill"
    >
      <div ref={box} className="num flex flex-col gap-1.5 text-[12px]">
        <p className="text-[11.5px] text-muted">Ile ciała kosztuje godzina każdej z nich (−100…100). Zapisze się tylko to, co ustawisz inaczej niż 0 – reszta zostaje.</p>
        <div className="flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto pr-1">
          {rows.map((r, i) => {
            const v = values[r.key] ?? 0
            return (
              <div key={r.key} className="flex flex-wrap items-center gap-2" data-testid="body-fill-row" data-kind={r.item.kind}>
                <span className="min-w-[160px] flex-1 truncate" title={r.name}>
                  {r.name}
                </span>
                <span className="flex gap-2 text-muted" data-testid="body-fill-others">
                  {POOLS.filter((p) => p !== 'body').map((p) => (
                    <span key={p} style={{ color: POOL_COLOR[p] }}>
                      {POOL_LETTER[p]} {formatNumber(r.costs[p])}
                    </span>
                  ))}
                </span>
                <button type="button" className="btn px-2 py-0" disabled={v <= COST_MIN} onClick={() => step(r.key, -1)} aria-label={`${r.name}: ciało mniej`} data-testid={`body-fill-minus-${i}`}>
                  −
                </button>
                <PoolField pool="body" value={v} start={v} onCommit={(x) => set(r.key, x)} label={`${r.name}: ciało (uzupełnij)`} testId={`body-fill-value-${i}`} />
                <button type="button" className="btn px-2 py-0" disabled={v >= COST_MAX} onClick={() => step(r.key, 1)} aria-label={`${r.name}: ciało więcej`} data-testid={`body-fill-plus-${i}`}>
                  +
                </button>
              </div>
            )
          })}
        </div>
        <WideCostWarning costs={after} testId="body-fill-old" />
      </div>
    </Dialog>
  )
}

/** The line over the tree and its window (nothing when there is nothing to fill or the line is hidden for good). */
export function BodyFill({ s, rd }: { s: RulesSettings; rd: RdFile }) {
  // The tree without the archive (whatever the section shows): an archived subcategory is never one of the gaps.
  const rows = useMemo(() => bodyMissing(categoryTree(rd, s.categories), s, rd), [s, rd])
  const [filling, setFilling] = useState<readonly BodyGap[] | null>(null)
  const [busy, run] = useBusy()
  const hide = () =>
    run(async () => {
      const { out, entry } = await saveTree((raw) => ({ ...raw, bodyFillHidden: true }))
      if (!entry || saveAnswer(out) !== true) return
      undoToast('Schowano „Uzupełnij ciało” – już nie wróci.', () => void undoHide(entry))
    })
  return (
    <>
      {!rd.bodyFillHidden && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-panel px-3 py-1.5 text-[12.5px] text-muted" data-testid="body-fill-line">
          <span data-testid="body-fill-text">{bodyMissingText(rows)}</span>
          <span aria-hidden="true">·</span>
          <button type="button" className="btn py-0.5" onClick={() => setFilling(rows)} data-testid="body-fill-open">
            Uzupełnij
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className="px-1 text-[14px] leading-none hover:text-fg" disabled={busy} onClick={() => void hide()} aria-label="Schowaj na zawsze" title="Schowaj na zawsze" data-testid="body-fill-hide">
            ×
          </button>
        </div>
      )}
      {filling && (
        <BodyFillDialog
          rows={filling}
          onClose={() => setFilling(null)}
          onApply={(values) => {
            const keys = filling.map((r) => r.key).filter((k) => values[k])
            setFilling(null)
            void changeTreeGroup(keys, { kind: 'costsEach', values })
          }}
        />
      )}
    </>
  )
}
