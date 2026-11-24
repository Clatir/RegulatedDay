/**
 * „Koszt na godzinę” of a selection in „Kategorie” (D609, the window of „Zmień 6 podkategorii”): each pool G · E · B · C with ✓ when all the
 * selected have the same value (shown) or „—” when they differ (the field empty); [−] [+] and the typed number (−100…100 – D568, as the
 * group window of blocks) set the pool for all – a pool with „—” starts from the first selected one's. „Zapisz” writes only the pools touched;
 * the others stay each as it is. „Zapisz” first commits the field being typed in (a number typed without Enter counts, T2711); a field that stands
 * refused (101, 1,5) – it writes nothing, the window stays (T2440); nothing changed (a pool moved and back to the common value too) – it only closes.
 */
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { COST_MAX, COST_MIN } from '@shared/model/blockCosts'
import { POOLS, type Costs, type Pool } from '@shared/model/categories'
import { checkField, formatField, parseField } from '@shared/model/fields'
import { commonPools } from '@shared/model/categoryGroup'
import { CommitField } from '../../components/fields'
import { commitActiveField } from '../../lib/commit'
import { Dialog } from '../../components/Dialog'
import { COST_FIELD, WideCostWarning } from '../plan/CostInput'
import { POOL_COLOR, POOL_NAME } from '../plan/energyDraw'
import { useWheelValue } from './SettingNumber'

/** A pool's field: the number all have, or empty with „—” (they differ); the wheel – every turn at once (a form, T2551), from the first one's value when empty. */
function PoolField({ pool, value, start, onCommit }: { pool: Pool; value: number | null; start: number; onCommit: (v: number) => void }) {
  const field = { ...COST_FIELD, label: `${POOL_NAME[pool]}: koszt na godzinę` }
  const commit = (v: number) => checkField(field, v).ok && onCommit(v)
  const turned = useWheelValue(value ?? start, field.range, commit, 'step')
  return (
    <CommitField<number>
      value={turned.shown ?? value}
      parse={(t) => parseField(field, t)}
      format={(v) => formatField(field, v)}
      onCommit={commit}
      onWheelStep={turned.step}
      placeholder="—"
      shellClassName="w-[52px]"
      aria-label={field.label}
      data-testid={`tree-cost-${pool}-value`}
    />
  )
}

export function TreeCostDialog({ title, costs, onClose, onApply }: { title: string; costs: readonly Costs[]; onClose: () => void; onApply: (costs: Partial<Costs>) => void }) {
  const [common] = useState(() => commonPools(costs))
  const [values, setValues] = useState<Record<Pool, number | null>>(common)
  const [touched, setTouched] = useState<ReadonlySet<Pool>>(new Set())
  const first = costs[0] ?? { head: 0, emotions: 0, senses: 0, body: 0 }
  // What the window holds now, also within one event (the field committed by „Zapisz” itself sets it before „Zapisz” reads it).
  const latest = useRef<{ values: Record<Pool, number | null>; touched: ReadonlySet<Pool> }>({ values, touched })
  const set = (p: Pool, v: number) => {
    const next = { values: { ...latest.current.values, [p]: Math.max(COST_MIN, Math.min(COST_MAX, Math.round(v))) }, touched: new Set(latest.current.touched).add(p) }
    latest.current = next
    setValues(next.values)
    setTouched(next.touched)
  }
  const step = (p: Pool, by: 1 | -1) => set(p, (latest.current.values[p] ?? first[p]) + by)
  const box = useRef<HTMLDivElement>(null)
  const apply = () => {
    // The field typed in is committed first (and a refusal of it drawn) – then read.
    flushSync(() => commitActiveField())
    if (box.current?.querySelector('[aria-invalid="true"]')) return
    const now = latest.current
    // A pool moved and back to the value all of them have is no change (T2721); nothing left – the window only closes.
    const out: Partial<Costs> = {}
    for (const p of POOLS) if (now.touched.has(p) && now.values[p] != null && now.values[p] !== common[p]) out[p] = now.values[p]!
    if (Object.keys(out).length === 0) return onClose()
    onApply(out)
  }
  // The costs the selected would have after „Zapisz” (the warning of an older version looks at them, D568).
  const chosen = Object.fromEntries(POOLS.filter((p) => touched.has(p) && values[p] != null).map((p) => [p, values[p]])) as Partial<Costs>
  const after = costs.map((c) => ({ ...c, ...chosen }))
  return (
    <Dialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-accent" onClick={apply} data-testid="tree-cost-apply">
            Zapisz
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
        </>
      }
      data-testid="tree-cost"
    >
      <div ref={box} className="num flex flex-col gap-1.5 text-[12px]">
        {POOLS.map((p) => {
          const v = values[p]
          return (
            <div key={p} className="flex items-center gap-2">
              <span className="w-[58px] shrink-0" style={{ color: POOL_COLOR[p] }}>
                {POOL_NAME[p]}
              </span>
              <button type="button" className="btn px-2 py-0" disabled={(v ?? first[p]) <= COST_MIN} onClick={() => step(p, -1)} aria-label={`${POOL_NAME[p]}: mniej`} data-testid={`tree-cost-${p}-minus`}>
                −
              </button>
              <PoolField pool={p} value={v} start={first[p]} onCommit={(x) => set(p, x)} />
              <button type="button" className="btn px-2 py-0" disabled={(v ?? first[p]) >= COST_MAX} onClick={() => step(p, 1)} aria-label={`${POOL_NAME[p]}: więcej`} data-testid={`tree-cost-${p}-plus`}>
                +
              </button>
              <span className="w-[14px] text-center text-muted" title={v == null ? 'Zaznaczone mają różne wartości – zostaną, jeśli nie zmienisz' : touched.has(p) ? 'Wszystkie dostaną tę wartość' : 'Wszystkie mają tę wartość'} data-testid={`tree-cost-${p}-state`}>
                {v == null ? '—' : '✓'}
              </span>
            </div>
          )
        })}
        <p className="text-[11.5px] text-muted">Zmieniasz tylko pule, które ruszysz; pozostałe zostają każdej, jakie są.</p>
        <WideCostWarning costs={after} testId="tree-cost-old" />
      </div>
    </Dialog>
  )
}
