/**
 * The fields of a category shared by „Kategorie” (`CategoriesSection`) and the window of a new one made from a block's list
 * (`NewCategoryDialog`, D463): the properties the rules read (`FLAGS`), the pools of the costs (`POOLS`, `CostNumbers`), the place
 * (`PLACE_OPTIONS`; a variant's – `VARIANT_PLACE_OPTIONS`), the colour (`ColorSwatches`) and the one way a category is made (`createCategory`: its rules first, then its
 * name and colour – a change refused leaves no category without rules).
 */
import type { CategoryRules, Costs } from '@shared/model/categories'
import { OTHER_GROUP } from '@shared/model/categoryTree'
import { CATEGORY_COLORS } from '@shared/model/rd'
import { RANGES } from '@shared/model/settings'
import { blockFill } from '@shared/theme'
import { cx } from '../../components/ui'
import { saveRd } from '../../store/data'
import { useMachine } from '../../store/machine'
import { SettingNumber, type WheelMode } from './SettingNumber'

export const FLAGS: Array<[keyof CategoryRules, string]> = [
  ['background', 'może biec w tle'],
  ['startsInBackground', 'zaczyna się w tle'],
  ['protected', 'chroniony (warianty go nie skracają)'],
  ['noMoveTomorrow', 'nie przenosić na jutro'],
  ['noSleep', 'nie usypiaj komputera'],
  ['contact', 'kontakt z ludźmi'],
  ['classMode', 'tryb zajęć'],
  ['keepsRegen', 'nie przerywa regeneracji'],
  ['afterWorkAsProject', 'po końcu pracy jak projekt']
]
export const POOLS = [
  ['head', 'głowa'],
  ['emotions', 'emocje'],
  ['senses', 'bodźce'],
  ['body', 'ciało']
] as const

export const PLACE_OPTIONS = [
  { value: 'computer', label: 'przy komputerze' },
  { value: 'passive', label: 'pasywnie przy komputerze' },
  { value: 'away', label: 'poza komputerem' }
] as const

/** A variant's place „jak podkategoria” in its list (no place of its own) – „Kategorie” and the windows of a block's panel (T1338). */
export const VARIANT_PLACE_SAME = '-'
/** The list of a variant's place: „miejsce jak podkategoria”, then the three places. */
export const VARIANT_PLACE_OPTIONS = [{ value: VARIANT_PLACE_SAME, label: 'miejsce jak podkategoria' }, ...PLACE_OPTIONS] as const

/** The costs of a category made new (the head, emotions and senses 1 an hour, the body 0 – D523: your own subcategories start with no body cost). */
export const NEW_CATEGORY_COSTS: Costs = { head: 1, emotions: 1, senses: 1, body: 0 }

/** The name, colour and archive of a category (rd.json – at once, not dated). */
export const setMeta = (id: string, patch: Record<string, unknown>) =>
  saveRd((raw) => {
    const cats = raw.categories && typeof raw.categories === 'object' ? (raw.categories as Record<string, Record<string, unknown>>) : {}
    return { ...raw, categories: { ...cats, [id]: { ...(cats[id] ?? {}), ...patch } } }
  })

/**
 * A new category `id` (a subcategory of the tree, D510): its rules by `save` (the settings' change – dated as the caller says), then its
 * name, colour and – `group` – the category of the tree it is in (none, or „Inne”: no field, it is in „Inne”; a group named is a change of
 * the tree – the save writes `tree.change`, T1391). False – the rules were refused: nothing else is written.
 */
export async function createCategory(save: (patch: Record<string, unknown>) => Promise<boolean>, id: string, rules: Record<string, unknown>, meta: { name: string; color: string | null; group?: string }): Promise<boolean> {
  if (!(await save({ categories: { [id]: rules } }))) return false
  const group = meta.group && meta.group !== OTHER_GROUP ? meta.group : null
  await setMeta(id, { name: meta.name.slice(0, 60), color: meta.color, archived: false, ...(group ? { group } : {}) })
  return true
}

/** The colours a category may have – the first, none: the colour of its class. */
export function ColorSwatches({ value, onPick }: { value: string | null; onPick: (color: string | null) => void }) {
  const brightness = useMachine((s) => s.prefs.brightness)
  return (
    <>
      {[null, ...CATEGORY_COLORS].map((col) => (
        <button
          key={col ?? 'class'}
          type="button"
          className={cx('h-5 w-5 rounded-sm border', value === col ? 'ring-1 ring-lamp' : '')}
          style={{ background: col ? blockFill(col, brightness) : 'transparent', borderColor: col ?? 'var(--color-line-strong)' }}
          onClick={() => onPick(col)}
          aria-label={col ? `kolor ${col}` : 'kolor klasy'}
          aria-pressed={value === col}
        />
      ))}
    </>
  )
}

/**
 * The cost of each pool an hour (`RANGES.cost`, −100…100 – D568): `label` names a field for the reader, `named` puts the pool's name before it (a form);
 * `testId` – each field's; `wheel` – how the mouse wheel saves (T2551): `'step'` every turn at once (a form with its own state, `CostFields`), `'gesture'` once per gesture (Settings).
 */
export function CostNumbers({ costs, onCommit, label, named, testId, wheel }: { wheel: WheelMode; costs: Costs; onCommit: (pool: keyof Costs, v: number) => void; label: (pool: string) => string; named?: boolean; testId?: (pool: keyof Costs) => string }) {
  return (
    <>
      {POOLS.map(([p, name]) => {
        const field = <SettingNumber key={p} field={{ kind: 'integer', range: RANGES.cost, label: label(name) }} value={costs[p]} onCommit={(v) => onCommit(p, v)} className="w-[52px]" wheel={wheel} data-testid={testId?.(p)} />
        return named ? (
          <label key={p} className="flex items-center gap-1.5 text-[12.5px] text-muted">
            {name}
            {field}
          </label>
        ) : (
          field
        )
      })}
    </>
  )
}
