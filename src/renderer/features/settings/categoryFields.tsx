/**
 * The fields of a category shared by „Kategorie” (`CategoriesSection`) and the window of a new one made from a block's list
 * (`NewCategoryDialog`, D463): the properties the rules read (`FLAGS`), the pools of the costs (`POOLS`, `CostNumbers`), the place
 * (`PLACE_OPTIONS`), the colour (`ColorSwatches`) and the one way a category is made (`createCategory`: its rules first, then its
 * name and colour – a change refused leaves no category without rules).
 */
import type { CategoryRules, Costs } from '@shared/model/categories'
import { CATEGORY_COLORS } from '@shared/model/rd'
import { RANGES } from '@shared/model/settings'
import { blockFill } from '@shared/theme'
import { cx } from '../../components/ui'
import { saveRd } from '../../store/data'
import { useMachine } from '../../store/machine'
import { SettingNumber } from './SettingNumber'

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
  ['senses', 'bodźce']
] as const

export const PLACE_OPTIONS = [
  { value: 'computer', label: 'przy komputerze' },
  { value: 'passive', label: 'pasywnie przy komputerze' },
  { value: 'away', label: 'poza komputerem' }
] as const

/** The costs of a category made new (each pool 1 an hour). */
export const NEW_CATEGORY_COSTS: Costs = { head: 1, emotions: 1, senses: 1 }

/** The name, colour and archive of a category (rd.json – at once, not dated). */
export const setMeta = (id: string, patch: Record<string, unknown>) =>
  saveRd((raw) => {
    const cats = raw.categories && typeof raw.categories === 'object' ? (raw.categories as Record<string, Record<string, unknown>>) : {}
    return { ...raw, categories: { ...cats, [id]: { ...(cats[id] ?? {}), ...patch } } }
  })

/**
 * A new category `id`: its rules by `save` (the settings' change – dated as the caller says), then its name and colour. False –
 * the rules were refused: nothing else is written.
 */
export async function createCategory(save: (patch: Record<string, unknown>) => Promise<boolean>, id: string, rules: Record<string, unknown>, meta: { name: string; color: string | null }): Promise<boolean> {
  if (!(await save({ categories: { [id]: rules } }))) return false
  await setMeta(id, { name: meta.name.slice(0, 60), color: meta.color, archived: false })
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
 * The cost of each pool an hour (−5…5): `label` names a field for the reader, `named` puts the pool's name before it (a form);
 * `testId` – each field's.
 */
export function CostNumbers({ costs, onCommit, label, named, testId }: { costs: Costs; onCommit: (pool: keyof Costs, v: number) => void; label: (pool: string) => string; named?: boolean; testId?: (pool: keyof Costs) => string }) {
  return (
    <>
      {POOLS.map(([p, name]) => {
        const field = <SettingNumber key={p} field={{ kind: 'integer', range: RANGES.cost, label: label(name) }} value={costs[p]} onCommit={(v) => onCommit(p, v)} className="w-[52px]" data-testid={testId?.(p)} />
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
