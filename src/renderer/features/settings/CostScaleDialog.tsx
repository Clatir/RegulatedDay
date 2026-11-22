/**
 * The window „Przelicz koszty ×N” (D566, D567): the factor (0,5–3 by 0,25, ×2 at first, or „Własny…” – a number of your own above 0
 * with a comma or a point – `parseScaleFactor`, T2431; while it is not one, no preview and „Przelicz” off), the pools (G · E · B · C, all at first), what it
 * touches (subcategories, variants, routines, the own costs of blocks – the days planned from the change's date and the series –, templates;
 * all at first), and the preview „przed → po” of every cost that changes (one that stays is not listed; one clipped to the range of a cost, ±100 – D568, is marked). The
 * date is the bar's („od jutra / od dziś / od daty”); a routine has one cost without dates – changed at once, the window says so. „Przelicz”
 * – one save (`applyCostScale`), off while nothing changes; Esc and „Anuluj” leave everything as it was.
 */
import { useEffect, useMemo, useState } from 'react'
import { plDate } from '@shared/format'
import { COST_MAX, COST_MIN, costNumber, costsText } from '@shared/model/blockCosts'
import { WideCostWarning } from '../plan/CostInput'
import { POOL_LETTER, POOLS, type Pool } from '@shared/model/categories'
import { COST_SCALE_FACTORS, DEFAULT_SCALE, parseScaleFactor, SCALE_SCOPES, scaleLabel, type ScaleItem, type ScaleKind, type ScaleOptions, type ScalePlan, type ScaleScope } from '@shared/engine/costScale'
import { addDays } from '@shared/time/zone'
import { Choice } from '../../components/fields'
import { Dialog } from '../../components/Dialog'
import { useBusy } from '../../lib/busy'
import { useData } from '../../store/data'
import { applyCostScale, costScalePreview, costsCount, type ScaleFrom } from './costScale'
import { changeFrom } from './settingsStore'

const POOL_NAMES: Record<Pool, string> = { head: 'głowa', emotions: 'emocje', senses: 'bodźce', body: 'ciało' }
const SCOPE_NAMES: Record<ScaleScope, string> = { categories: 'podkategorie', variants: 'warianty (własny koszt)', routines: 'rutyny', blocks: 'własne koszty bloków (dni i serie)', templates: 'szablony' }
const KIND_NAMES: Record<ScaleKind, string> = { category: 'podkategoria', variant: 'wariant', routine: 'rutyna', day: 'blok', template: 'szablon', series: 'seria' }

/** When the change applies, as the window says it. */
export function fromText(f: ScaleFrom, today: string): string {
  if (f.at != null) return 'od dziś'
  return f.from === addDays(today, 1) ? 'od jutra' : `od ${plDate(f.from)}`
}

/** Where an item is: a day's block – its date; a version of a template or series – „od” its date. */
const whereOf = (it: ScaleItem): string => (it.kind === 'day' ? ` · ${plDate(it.date!)}` : it.kind === 'template' || it.kind === 'series' ? ` · od ${plDate(it.date!)}` : '')

/** The choice „Własny…” of the factor's list. */
const CUSTOM = 'custom'
/** Why the factor typed is not one (T2431). */
export const CUSTOM_FACTOR_HINT = 'Podaj liczbę większą od 0, np. 1,3.'
/** A factor as the field shows it: a decimal comma. */
const factorText = (n: number): string => String(n).replace('.', ',')

const toggled = <T,>(list: readonly T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/** The preview's first line: how many costs change and how many are clipped, or why it cannot be told. */
function countText(plan: ScalePlan | null, error: string | null, factor: number | null): string {
  if (factor == null) return 'Podaj mnożnik, żeby zobaczyć podgląd.'
  if (error) return `Nie da się teraz policzyć podglądu – ${error}.`
  if (!plan) return 'Liczę…'
  if (!plan.items.length) return 'Nic się nie zmienia.'
  const clipped = plan.items.filter((i) => i.clipped.length).length
  return `Zmieni się ${costsCount(plan.items.length)}${clipped ? ` · przycięte do ±${COST_MAX}: ${clipped}` : ''}`
}

/** One cost of the preview: what it is, its name, the pools that change, „przed → po”, clipped. */
function PreviewItem({ it }: { it: ScaleItem }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2" data-testid="cost-scale-item" data-key={it.key}>
      <span className="text-muted">{KIND_NAMES[it.kind]}</span>
      <span>
        {it.name}
        {whereOf(it)}
      </span>
      <span className="text-muted">{it.pools.map((p) => POOL_LETTER[p]).join(' · ')}</span>
      <span className="ml-auto tabular-nums" data-testid="cost-scale-change">
        {costsText(it.before)} → {costsText(it.after)}
      </span>
      {it.clipped.length > 0 && (
        <span className="text-rose" data-testid="cost-scale-clipped">
          przycięte ({it.clipped.map((p) => POOL_LETTER[p]).join(', ')})
        </span>
      )}
    </li>
  )
}

export function CostScaleDialog({ onClose }: { onClose: () => void }) {
  const today = useData((s) => s.view?.today ?? '')
  const stamp = useData((s) => s.stamp)
  // The bar's date as the window opened.
  const [from] = useState<ScaleFrom>(() => changeFrom(today))
  const [n, setN] = useState(DEFAULT_SCALE)
  // „Własny…”: the text as typed; the factor – `parseScaleFactor` of it (null: not a factor yet).
  const [custom, setCustom] = useState<string | null>(null)
  const factor = custom == null ? n : parseScaleFactor(custom)
  const [pools, setPools] = useState<readonly Pool[]>(POOLS)
  const [scope, setScope] = useState<readonly ScaleScope[]>(SCALE_SCOPES)
  // The preview with the options it was counted for: shown only while they are still the window's (another factor – „Liczę…”).
  const [counted, setCounted] = useState<{ opts: ScaleOptions; plan: ScalePlan | null; error: string | null } | null>(null)
  const [busy, run] = useBusy()
  const opts = useMemo(() => (factor == null ? null : { n: factor, pools, scope }), [factor, pools, scope])
  // The preview for the options, read again when the data change (another computer, a save of the window).
  useEffect(() => {
    // Not a factor yet: nothing to read (the window shows no preview – `items`, `countText`).
    if (!opts) return
    let alive = true
    costScalePreview(from, opts).then(
      (p) => {
        if (alive) setCounted({ opts, plan: p, error: null })
      },
      (e: unknown) => {
        if (alive) setCounted({ opts, plan: null, error: e instanceof Error ? e.message : String(e) })
      }
    )
    return () => {
      alive = false
    }
  }, [from, opts, stamp])
  const current = counted != null && counted.opts === opts ? counted : null
  const plan = current?.plan ?? null
  const error = current?.error ?? null
  const items = plan?.items ?? []
  const confirm = () =>
    run(async () => {
      if (!opts) return
      if ((await applyCostScale(from, opts, scaleLabel(opts.n))) != null) onClose()
    })
  const pick = (v: string) => {
    if (v !== CUSTOM) {
      setCustom(null)
      setN(Number(v))
    } else if (custom == null) setCustom(factorText(n))
  }
  return (
    <Dialog
      title="Przelicz koszty"
      onClose={onClose}
      wide
      data-testid="cost-scale-dialog"
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} data-testid="cost-scale-cancel">
            Anuluj
          </button>
          <button type="button" className="btn btn-accent" disabled={busy || !items.length} onClick={() => void confirm()} data-testid="cost-scale-apply">
            Przelicz
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-muted">
        Każdy zapisany koszt wybranych pul mnoży się przez N, zaokrągla do całości (połówki od zera) i przycina do {costNumber(COST_MIN)}…{COST_MAX}. Podkategorie, warianty i szablony – {fromText(from, today)} (pasek nad ustawieniami); bloki – w dniach od tej daty, dni minione i bloki już zaczęte zostają; rutyny – od razu.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <label className="flex items-center gap-2">
          Mnożnik
          <Choice
            value={custom == null ? String(n) : CUSTOM}
            options={[...COST_SCALE_FACTORS.map((f) => ({ value: String(f), label: scaleLabel(f) })), { value: CUSTOM, label: 'Własny…' }]}
            onChange={pick}
            className="w-[100px]"
            aria-label="Mnożnik"
            data-testid="cost-scale-factor"
          />
        </label>
        {custom != null && (
          <>
            <label className="flex items-center gap-1">
              ×
              <input
                className={`input w-[72px] ${factor == null ? 'border-rose' : ''}`}
                type="text"
                inputMode="decimal"
                autoFocus
                value={custom}
                onChange={(e) => setCustom(e.currentTarget.value)}
                aria-label="Własny mnożnik"
                aria-invalid={factor == null}
                aria-describedby={factor == null ? 'cost-scale-custom-error' : undefined}
                data-testid="cost-scale-custom"
              />
            </label>
            {factor == null && (
              <span id="cost-scale-custom-error" className="text-rose" role="alert" data-testid="cost-scale-custom-error">
                {CUSTOM_FACTOR_HINT}
              </span>
            )}
          </>
        )}
      </div>
      <fieldset className="flex flex-wrap items-center gap-3 text-[12.5px]" data-testid="cost-scale-pools">
        <legend className="mb-1 text-muted">Pule</legend>
        {POOLS.map((p) => (
          <label key={p} className="flex items-center gap-1.5">
            <input type="checkbox" checked={pools.includes(p)} onChange={() => setPools(toggled(pools, p))} data-testid={`cost-scale-pool-${p}`} />
            {POOL_LETTER[p]} – {POOL_NAMES[p]}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-3 text-[12.5px]" data-testid="cost-scale-scope">
        <legend className="mb-1 text-muted">Co przeliczyć</legend>
        {SCALE_SCOPES.map((s) => (
          <label key={s} className="flex items-center gap-1.5">
            <input type="checkbox" checked={scope.includes(s)} onChange={() => setScope(toggled(scope, s))} data-testid={`cost-scale-scope-${s}`} />
            {SCOPE_NAMES[s]}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1" data-testid="cost-scale-preview">
        <p className="text-[12.5px]" role="status" data-testid="cost-scale-count">
          {countText(plan, error, factor)}
        </p>
        {/* D568 (T2440): costs after the change past ±5 while a computer of an older version is in the folder. */}
        <WideCostWarning costs={items.map((it) => it.after)} testId="cost-scale-old" />
        {items.length > 0 && (
          <ul className="flex max-h-[40vh] flex-col gap-0.5 overflow-y-auto rounded border border-line p-2 text-[12px]">
            {items.map((it) => (
              <PreviewItem key={it.key} it={it} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

