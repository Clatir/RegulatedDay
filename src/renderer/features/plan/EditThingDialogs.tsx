/**
 * ✎ beside the lists „Podkategoria”, „Wariant” and „Rutyna” of a block's panel (D514): the very window of „+ Nowa…” (`NewThingDialogs`,
 * same fields, centred) filled with the thing chosen – „Podkategoria <nazwa>”, „Wariant <nazwa>”, „Rutyna <nazwa>”. „Zapisz” (Enter in
 * the name) writes only what changed, from today on whatever „Od kiedy” of the settings says: the dated settings (class, costs, place,
 * the properties of a subcategory; a variant's list) from this moment („od dziś”: a block begun counts its new cost from then on, the
 * minutes gone by as they were, D501), the rest (a name, a colour, a category, a calendar, a routine) at once as „Kategorie” and „Rutyny”
 * save them. „Anuluj” and Esc change nothing. The window says how many blocks it changes (`editScope.ts`, T1325). The values shown are the
 * settings in force now (not the panel's day – an edit is made from now on).
 */
import { useEffect, useMemo, useState } from 'react'
import { paths } from '@shared/data/paths'
import { calendarOfCategory, setCategoryCalendarRaw } from '@shared/model/calendars'
import type { CategoryRules } from '@shared/model/categories'
import { changeVariant, groupOfCategory, setCategoryGroupRaw } from '@shared/model/categoryTree'
import { categoryName } from '@shared/model/rd'
import { routineFrom } from '@shared/model/routines'
import { settingsOn } from '@shared/model/settings'
import { Dialog } from '../../components/Dialog'
import { useBusy } from '../../lib/busy'
import { commitActiveField } from '../../lib/commit'
import { isSaved, updateRecord, useData } from '../../store/data'
import { saveCalendars } from '../settings/calendarEdits'
import { FLAGS, setMeta } from '../settings/categoryFields'
import { saveTree, saveVariants } from '../settings/categoryTreeEdits'
import { saveSettingsFrom } from '../settings/settingsStore'
import { categoryChange, routineChange, variantChange } from './editChanges'
import { countScope, scopeDates, scopeDetail, scopeText, type EditTarget, type EditWhat, type ScopeCount } from './editScope'
import { CategoryFields, RoutineFields, SaveButtons, VARIANT_PLACE_SAME, VariantFields, useForm, type CategoryForm, type RoutineForm, type VariantForm } from './NewThingDialogs'

type Files = Record<string, Record<string, unknown> | null>

/** The blocks the edit reaches: the days' files are read once when the window opens (the count follows the fields); null – still being counted. */
function useScope(target: EditTarget, what: EditWhat | null, categories: Readonly<Record<string, CategoryRules | undefined>>): ScopeCount | null {
  const today = useData((s) => s.view?.today ?? '')
  const templates = useData((s) => s.templates)
  const series = useData((s) => s.seriesPlans)
  const [files, setFiles] = useState<Files | null>(null)
  useEffect(() => {
    let alive = true
    window.rd.dayFiles(scopeDates(today)).then(
      (f) => alive && setFiles(f),
      () => alive && setFiles({})
    )
    return () => {
      alive = false
    }
  }, [today])
  const key = JSON.stringify(target)
  return useMemo(() => (files && what ? countScope({ today, files, templates, series, target, what, categories }) : null), [files, what, today, templates, series, key, categories])
}

function ScopeNote({ count, what, note }: { count: ScopeCount | null; what: EditWhat | null; note?: string }) {
  if (!what) return <p className="text-[12px] text-muted" data-testid="edit-scope">Nic nie zmieniono.</p>
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[12.5px]" data-testid="edit-scope">
        {count ? scopeText(count) : 'Liczę bloki…'}
      </p>
      {count && (
        <p className="text-[11.5px] text-muted" data-testid="edit-scope-detail">
          {scopeDetail(count)}
        </p>
      )}
      {note && <p className="text-[11.5px] text-muted">{note}</p>}
    </div>
  )
}

/** The settings in force at this moment – what an edit starting now changes. */
function useSettingsNow() {
  const today = useData((s) => s.view?.today ?? '')
  const changes = useData((s) => s.rd.settings)
  return useMemo(() => settingsOn(changes, today, Date.now()), [changes, today])
}

export function EditCategoryDialog({ categoryId, onClose }: { categoryId: string; onClose: () => void }) {
  const today = useData((s) => s.view?.today ?? '')
  const rd = useData((s) => s.rd)
  const settings = useSettingsNow()
  const rules = settings.categories[categoryId]
  const groups = rd.categoryGroups.filter((g) => !g.archived)
  const [initial] = useState<CategoryForm>(() => ({
    name: categoryName(rd, categoryId),
    group: groupOfCategory(rd, categoryId),
    cls: rules?.cls ?? 'work',
    place: rules?.place ?? 'computer',
    color: rd.categories[categoryId]?.color ?? null,
    calendar: calendarOfCategory(rd, categoryId),
    costs: rules?.costs ?? { head: 1, emotions: 1, senses: 1 },
    flags: Object.fromEntries(FLAGS.map(([k]) => [k, rules?.[k] === true]))
  }))
  const [form, set, ref] = useForm<CategoryForm>(initial)
  const [busy, run] = useBusy()
  const change = categoryChange(initial, form)
  const count = useScope({ kind: 'category', id: categoryId }, change.what, settings.categories)
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      if (!d.name.trim() || !today) return
      const ch = categoryChange(initial, d)
      if (!ch.what) return onClose()
      // „Od dziś” whatever the screen of the settings has chosen; the rest of the changes only after the dated ones were saved.
      if (ch.patch && !(await saveSettingsFrom({ categories: { [categoryId]: ch.patch } }, { from: today, at: Date.now() }))) return
      if (ch.meta && !isSaved(await setMeta(categoryId, ch.meta))) return
      if (ch.group && !isSaved((await saveTree((raw) => setCategoryGroupRaw(raw, categoryId, ch.group!))).out)) return
      if (ch.calendar && !isSaved((await saveCalendars((raw) => setCategoryCalendarRaw(raw, categoryId, ch.calendar!))).out)) return
      onClose()
    })
  const undated = change.meta != null || change.group != null || change.calendar != null
  return (
    <Dialog title={`Podkategoria ${initial.name}`} onClose={onClose} wide centered data-testid="edit-category-window" actions={<SaveButtons busy={busy} ok={form.name.trim() !== ''} onSave={() => void save()} onClose={onClose} />}>
      <CategoryFields form={form} set={set} groups={groups} onEnter={() => void save()} />
      <ScopeNote count={count} what={change.what} note={undated ? 'Nazwa, kolor, kategoria i kalendarz zmieniają się od razu, także w dniach minionych.' : undefined} />
    </Dialog>
  )
}

export function EditVariantDialog({ categoryId, variantId, onClose }: { categoryId: string; variantId: string; onClose: () => void }) {
  const today = useData((s) => s.view?.today ?? '')
  const settings = useSettingsNow()
  const rules = settings.categories[categoryId]
  const variant = rules?.variants.find((v) => v.id === variantId)
  const [initial] = useState<VariantForm>(() => ({ name: variant?.name ?? '', same: variant?.costs == null, costs: variant?.costs ?? rules?.costs ?? { head: 1, emotions: 1, senses: 1 }, place: variant?.place ?? VARIANT_PLACE_SAME }))
  const [form, set, ref] = useForm<VariantForm>(initial)
  const [busy, run] = useBusy()
  const change = variantChange(initial, form)
  const count = useScope({ kind: 'variant', categoryId, id: variantId }, change.what, settings.categories)
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      if (!d.name.trim() || !today) return
      const ch = variantChange(initial, d)
      if (!ch.patch) return onClose()
      const patch = ch.patch
      // The list is whole in a change: made in the turn of the save from the variants in force from now on.
      if (await saveVariants(categoryId, (now) => changeVariant(now, variantId, patch), { from: today, at: Date.now() })) onClose()
    })
  return (
    <Dialog title={`Wariant ${initial.name}`} onClose={onClose} centered data-testid="edit-variant-window" actions={<SaveButtons busy={busy} ok={form.name.trim() !== ''} onSave={() => void save()} onClose={onClose} />}>
      <VariantFields form={form} set={set} onEnter={() => void save()} withPlace />
      <ScopeNote count={count} what={change.what} />
    </Dialog>
  )
}

export function EditRoutineDialog({ routineId, onClose }: { routineId: string; onClose: () => void }) {
  const routine = useData((s) => s.routines.find((r) => r.id === routineId))
  const settings = useSettingsNow()
  const [initial] = useState<RoutineForm>(() => ({ name: routine?.name ?? '', normal: routine?.normal ?? [], worse: routine?.worse ?? [] }))
  const [form, set, ref] = useForm<RoutineForm>(initial)
  const [busy, run] = useBusy()
  const change = routineChange(initial, form)
  const count = useScope({ kind: 'routine', id: routineId }, change.what, settings.categories)
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      if (!d.name.trim()) return
      const ch = routineChange(initial, d)
      if (!ch.patch) return onClose()
      const patch = ch.patch
      const out = await updateRecord(paths.record('routine', routineId), (raw) => (routineFrom(raw) ? { ...raw, ...patch } : raw))
      if (isSaved(out)) onClose()
    })
  return (
    <Dialog title={`Rutyna ${initial.name}`} onClose={onClose} wide centered data-testid="edit-routine-window" actions={<SaveButtons busy={busy} ok={form.name.trim() !== ''} onSave={() => void save()} onClose={onClose} />}>
      <RoutineFields form={form} set={set} onEnter={() => void save()} />
      <ScopeNote count={count} what={change.what} note="Rutyna nie ma daty: zmiana działa od razu, także w dniach minionych." />
    </Dialog>
  )
}
