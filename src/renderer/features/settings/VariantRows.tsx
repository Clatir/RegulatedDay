/**
 * The variants of a subcategory in „Kategorie” (D510): each its name, its cost – three numbers, or „jak podkategoria” (the subcategory's, also
 * after it changes) –, its place – one of the three, or „jak podkategoria” –, „Usuń” (an archive: out of the choice, kept in the history) and
 * „+ Wariant”. The variants are dated settings: every change is made in the turn of the save from the settings in force from the date of
 * „Od kiedy” (`saveVariants`, T1310, T1314); a change that changes nothing writes nothing. The sections' „Sposoby regeneracji” of before D510
 * are the variants of „Regeneracja” here.
 */
import { useState } from 'react'
import type { CategoryRules, Place, Variant } from '@shared/model/categories'
import { addVariant, archiveVariant, changeVariant, VARIANT_NAME_MAX, type VariantEntry } from '@shared/model/categoryTree'
import { newId } from '@shared/model/ids'
import { Choice, TextField } from '../../components/fields'
import { Toggle, cx } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { saveVariants } from './categoryTreeEdits'
import { CostNumbers, VARIANT_PLACE_OPTIONS, VARIANT_PLACE_SAME } from './categoryFields'

function VariantRow({ categoryId, rules, v }: { categoryId: string; rules: CategoryRules; v: Variant }) {
  const edit = (change: (now: readonly Variant[]) => VariantEntry[] | null) => void saveVariants(categoryId, change)
  const own = v.costs ?? null
  return (
    <div className={cx('flex flex-wrap items-center gap-2 rounded border border-line px-2 py-1', v.archived && 'border-dashed')} data-testid="variant-row" data-variant={v.id}>
      <TextField value={v.name} onCommit={(name) => edit((now) => changeVariant(now, v.id, { name }))} required max={VARIANT_NAME_MAX} shellClassName="w-[200px]" aria-label="Nazwa wariantu" data-testid="variant-name" />
      <Toggle checked={own == null} onChange={(same) => edit((now) => changeVariant(now, v.id, { costs: same ? null : { ...rules.costs } }))} label="koszt jak podkategoria" data-testid="variant-costs-same" />
      {own && <CostNumbers costs={own} label={(pool) => `${v.name}: ${pool}`} onCommit={(p, value) => edit((now) => changeVariant(now, v.id, { costs: { ...(now.find((x) => x.id === v.id)?.costs ?? own), [p]: value } }))} />}
      <Choice
        value={v.place ?? VARIANT_PLACE_SAME}
        options={[...VARIANT_PLACE_OPTIONS]}
        onChange={(place) => edit((now) => changeVariant(now, v.id, { place: place === VARIANT_PLACE_SAME ? null : (place as Place) }))}
        className="w-[230px]"
        aria-label="Miejsce wariantu"
        data-testid="variant-place"
      />
      <span className="flex-1" />
      {v.archived ? (
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => edit((now) => archiveVariant(now, v.id, false))} data-testid="variant-restore">
          Przywróć
        </button>
      ) : (
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={() => edit((now) => archiveVariant(now, v.id))} data-testid="variant-remove">
          Usuń
        </button>
      )}
    </div>
  )
}

export function VariantRows({ categoryId, rules, showArchived }: { categoryId: string; rules: CategoryRules; showArchived: boolean }) {
  const [name, setName] = useState('')
  const [busy, run] = useBusy()
  // The name is taken at once (a second click adds no second variant); it comes back when nothing was saved.
  const add = () =>
    run(async () => {
      const n = name.trim()
      if (!n) return
      setName('')
      const id = newId(10)
      if (!(await saveVariants(categoryId, (now) => addVariant(now, { id, name: n })))) setName(n)
    })
  const list = rules.variants.filter((v) => showArchived || !v.archived)
  return (
    <div className="flex flex-col gap-1.5" data-testid="variants">
      <span className="text-[12px] text-muted">Warianty (koszt i miejsce „jak podkategoria”, dopóki nie ustawisz własnych)</span>
      {list.map((v) => (
        <VariantRow key={v.id} categoryId={categoryId} rules={rules} v={v} />
      ))}
      <div className="flex items-center gap-2">
        <input className="input w-[220px]" value={name} maxLength={VARIANT_NAME_MAX} placeholder="+ Wariant" onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} data-testid="variant-new" />
        <button type="button" className="btn" disabled={!name.trim() || busy} onClick={() => void add()} data-testid="variant-add">
          Dodaj
        </button>
      </div>
    </div>
  )
}
