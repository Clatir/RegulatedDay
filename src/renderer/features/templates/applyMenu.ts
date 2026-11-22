/**
 * „Zastosuj szablon ▸” in the menus of days (UX19, D565 P28): the Calendar's menu of the selected days and the menu of a day's heading in „Tydzień” /
 * „3 dni”. The submenu lists the templates that are not archived, in the order of the page „Szablony” (by the type of day), each with its type;
 * a pick hands the template to the screen, which applies it to its days through `useApplyFlow` (the same questions as „Zastosuj do…”). Pure.
 */
import { DAY_TYPE_NAMES, DAY_TYPES } from '@shared/model/settings'
import type { Template } from '@shared/model/plan'
import type { MenuEntry } from '../../components/ContextMenu'

/** The reason while a save runs (as the other menus say it). */
const BUSY_WHY = 'Zapisuję…'

/** The templates a day can take, as the page „Szablony” lists them (archived ones are left out). */
export const appliableTemplates = (templates: readonly Template[]): Template[] => DAY_TYPES.flatMap((type) => templates.filter((t) => t.dayType === type && !t.archived))

/** The entry „Zastosuj szablon” with its submenu; `testId` – the entry's, a template's is `<testId>-<id>`. */
export function applyTemplateEntry(templates: readonly Template[], busy: boolean, pick: (template: Template) => void, testId: string): MenuEntry {
  const list = appliableTemplates(templates)
  if (busy) return { label: 'Zastosuj szablon', disabled: BUSY_WHY, testId }
  if (!list.length) return { label: 'Zastosuj szablon', disabled: 'Nie ma szablonów do zastosowania – dodasz je w „Szablonach”', testId }
  return {
    label: 'Zastosuj szablon',
    testId,
    submenu: list.map((t): MenuEntry => ({ label: `${t.name} · ${DAY_TYPE_NAMES[t.dayType]}`, onPick: () => pick(t), testId: `${testId}-${t.id}` }))
  }
}
