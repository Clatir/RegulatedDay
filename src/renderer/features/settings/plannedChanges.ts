/**
 * The changes of the shared settings that wait for their date (UX14, E2): „co → od kiedy” – the fields each one changes, with
 * the value they will have, in the words of the fields' own labels. A change from today or „od dziś” is already in force, a
 * past one too – only those from a day after today are planned. No DOM: the list on the settings page draws it.
 */
import { DAY_TYPE_NAMES, isPlain, type SettingsChange } from '@shared/model/settings'
import { NUMBER_FIELDS, TOGGLE_FIELDS, formatField } from '@shared/model/fields'
import { isPlannedChange, withdrawRefusal } from '@shared/model/settingsWithdraw'

export interface PlannedItem {
  label: string
  value: string
}

export interface PlannedChange {
  /** The id of the change in rd.json „settings” – what „Wycofaj” takes back. */
  id: string
  from: string
  items: PlannedItem[]
  /** „Wycofaj” takes it back (`withdrawRefusal`); false – a change of the layer of sessions, which the templates hold (D511). */
  withdrawable: boolean
}

/** The names of the subcategories (id → name) – a plan never shows an id. */
export interface PlannedNames {
  categories: Readonly<Record<string, string>>
}

const WEEKDAY_SHORT = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd']

const typeName = (t: unknown): string => (typeof t === 'string' && t in DAY_TYPE_NAMES ? DAY_TYPE_NAMES[t as keyof typeof DAY_TYPE_NAMES].toLowerCase() : '?')

/** The fields a patch touches, nested like RulesSettings (lists whole): a label and the value as the field shows it. */
function itemsOf(patch: Record<string, unknown>, names: PlannedNames): PlannedItem[] {
  const out: PlannedItem[] = []
  const walk = (node: Record<string, unknown>, path: string[]) => {
    for (const [key, value] of Object.entries(node)) {
      const at = [...path, key]
      const joined = at.join('.')
      const number = NUMBER_FIELDS.find((f) => f.path.join('.') === joined)
      const toggle = TOGGLE_FIELDS.find((f) => f.path.join('.') === joined)
      if (number && typeof value === 'number') out.push({ label: number.label, value: `${formatField(number, value)}${number.unit && number.kind === 'integer' ? ` ${number.unit}` : ''}` })
      else if (toggle && typeof value === 'boolean') out.push({ label: toggle.label, value: value ? 'włączone' : 'wyłączone' })
      else if (joined === 'weekTypes' && Array.isArray(value)) out.push({ label: 'Typy dni tygodnia', value: value.map((t, i) => `${WEEKDAY_SHORT[i] ?? '?'} ${typeName(t)}`).join(' · ') })
      else if (at[0] === 'categories' && at.length === 2) out.push({ label: names.categories[key] != null ? `Podkategoria „${names.categories[key]}”` : 'Podkategoria usunięta', value: 'koszt i właściwości' })
      else if (isPlain(value)) walk(value, at)
      else out.push({ label: 'Inne ustawienie', value: '' })
    }
  }
  walk(patch, [])
  // One line for what we cannot name, however many such fields the change has.
  return out.filter((i, at) => i.label !== 'Inne ustawienie' || out.findIndex((x) => x.label === i.label) === at)
}

/** The changes from a day after `today`, the nearest first (the order they were made in within a day). */
export function plannedChanges(settings: readonly SettingsChange[], today: string, names: PlannedNames): PlannedChange[] {
  return settings
    .filter((c) => isPlannedChange(c, today))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : (a.made ?? 0) - (b.made ?? 0)))
    .map((c) => ({ id: c.id, from: c.from, items: itemsOf(c.patch, names), withdrawable: withdrawRefusal(c, today) == null }))
}
