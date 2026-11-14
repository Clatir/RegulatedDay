/**
 * A subcategory in „Kategorie” (D510): the row it always had – name, class, cost, „więcej” (its category, place, colour, calendar, the
 * properties the rules read, „Usuń” = the archive) – and under „więcej” its variants (`VariantRows`). Name, colour, category and archive apply
 * at once (rd.json), class, cost, place and properties are dated settings (`save`).
 */
import type { CategoryRules } from '@shared/model/categories'
import { calendarOfCategory, setCategoryCalendarRaw } from '@shared/model/calendars'
import { groupOfCategory, setCategoryGroupRaw, type CategoryGroup } from '@shared/model/categoryTree'
import type { RdFile } from '@shared/model/rd'
import type { RulesSettings } from '@shared/model/settings'
import { blockFill } from '@shared/theme'
import { Choice, TextField } from '../../components/fields'
import { Toggle, cx } from '../../components/ui'
import { useMachine } from '../../store/machine'
import { CLASS_NAMES, blockColor } from '../plan/blockView'
import { saveCalendars } from './calendarEdits'
import { ColorSwatches, CostNumbers, FLAGS, PLACE_OPTIONS, setMeta } from './categoryFields'
import { saveTree } from './categoryTreeEdits'
import { VariantRows } from './VariantRows'

export function CategoryRow({
  id,
  rules: c,
  rd,
  settings,
  groups,
  open,
  onToggle,
  save,
  showArchived
}: {
  id: string
  rules: CategoryRules
  rd: RdFile
  settings: RulesSettings
  /** The categories it can be moved to (those shown). */
  groups: readonly CategoryGroup[]
  open: boolean
  onToggle: () => void
  save: (patch: Record<string, unknown>) => Promise<boolean>
  showArchived: boolean
}) {
  const brightness = useMachine((x) => x.prefs.brightness)
  const meta = rd.categories[id]
  const color = blockColor(id, { rd, settings })
  const groupId = groupOfCategory(rd, id, { archived: true })
  // Its own category stays in the list also when it is in the archive (the archive view).
  const own = rd.categoryGroups.find((g) => g.id === groupId)
  const choices = own && !groups.some((g) => g.id === groupId) ? [...groups, own] : groups
  return (
    <div className={cx('flex flex-col gap-2 rounded border border-line px-2.5 py-1.5', meta?.archived && 'border-dashed')} data-testid="category-row" data-category={id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: blockFill(color, brightness), border: `1px solid ${color}` }} />
        <TextField value={meta?.name ?? ''} onCommit={(n) => void setMeta(id, { name: n })} required max={60} shellClassName="w-[200px]" aria-label="Nazwa podkategorii" />
        <Choice value={c.cls} options={(['work', 'life', 'free'] as const).map((v) => ({ value: v, label: CLASS_NAMES[v] }))} onChange={(cls) => save({ categories: { [id]: { cls } } })} className="w-[130px]" aria-label="Klasa" />
        <CostNumbers costs={c.costs} label={(pool) => `${meta?.name}: ${pool}`} onCommit={(p, v) => void save({ categories: { [id]: { costs: { [p]: v } } } })} />
        <span className="flex-1" />
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={onToggle} data-testid="category-more">
          {open ? 'mniej' : 'więcej'}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted">Kategoria</span>
            <Choice
              value={groupId}
              options={choices.map((g) => ({ value: g.id, label: g.name }))}
              onChange={(group) => void saveTree((raw) => setCategoryGroupRaw(raw, id, group))}
              className="w-[200px]"
              aria-label="Kategoria podkategorii"
              data-testid="category-group"
            />
            <span className="ml-3 text-[12px] text-muted">Miejsce</span>
            <Choice value={c.place} options={[...PLACE_OPTIONS]} onChange={(place) => save({ categories: { [id]: { place } } })} className="w-[220px]" aria-label="Miejsce" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted">Kolor</span>
            <ColorSwatches value={meta?.color ?? null} onPick={(col) => void setMeta(id, { color: col })} />
            <span className="ml-3 text-[12px] text-muted">Kalendarz</span>
            <Choice
              value={calendarOfCategory(rd, id)}
              options={rd.calendars.map((cal) => ({ value: cal.id, label: cal.name }))}
              onChange={(cal) => void saveCalendars((raw) => setCategoryCalendarRaw(raw, id, cal))}
              className="w-[200px]"
              aria-label="Kalendarz podkategorii"
              data-testid="category-calendar"
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {FLAGS.map(([k, label]) => (
              <Toggle key={k} checked={c[k] as boolean} onChange={(v) => save({ categories: { [id]: { [k]: v } } })} label={label} />
            ))}
          </div>
          <VariantRows categoryId={id} rules={c} showArchived={showArchived} />
          <button type="button" className="self-start text-[12px] text-muted hover:text-fg" onClick={() => void setMeta(id, { archived: !meta?.archived })} data-testid={meta?.archived ? 'category-restore' : 'category-remove'}>
            {meta?.archived ? 'Przywróć z archiwum' : 'Usuń podkategorię (znika z wyboru, zostaje w historii)'}
          </button>
        </div>
      )}
    </div>
  )
}
