/**
 * ✎ beside the lists „Podkategoria”, „Wariant” and „Rutyna” of a block's panel (D514): the very window of „+ Nowa…” (`NewThingDialogs`,
 * same fields, centred) filled with the thing chosen – „Podkategoria <nazwa>”, „Wariant <nazwa>”, „Rutyna <nazwa>”. „Zapisz” (Enter in
 * the name) writes only what changed, from today on whatever „Od kiedy” of the settings says: the dated settings (class, costs, place,
 * the properties of a subcategory; a variant's list) from this moment („od dziś”: a block begun counts its new cost from then on, the
 * minutes gone by as they were, D501), the rest (a name, a colour, a category, a calendar, a routine) at once as „Kategorie” and „Rutyny”
 * save them. „Anuluj” and Esc change nothing. The window says how many blocks it changes (`editScope.ts`, T1325) – the days' files read once,
 * at the first change (T1337). The values shown are the settings in force now (not the panel's day – an edit is made from now on), so ✎ is
 * only offered for a thing there is now (T1330). A variant's save refused says why in the window (T1331). A routine's window has the field of
 * its cost of „Rutyny” (T1397: the form holds it until „Zapisz”, saved with the record by `saveRoutineRecord` – a begun block of the routine
 * counts the new cost from then on, T1430).
 */
import { useEffect, useMemo, useState } from 'react'
import { calendarOfCategory, setCategoryCalendarRaw } from '@shared/model/calendars'
import type { CategoryRules } from '@shared/model/categories'
import { changeVariant, groupOfCategory, setCategoryGroupRaw } from '@shared/model/categoryTree'
import { categoryName } from '@shared/model/rd'
import { routineCostsOf } from '@shared/model/routines'
import { settingsOn, type RulesSettings } from '@shared/model/settings'
import { Dialog } from '../../components/Dialog'
import { useBusy } from '../../lib/busy'
import { commitActiveField } from '../../lib/commit'
import { isSaved, useData } from '../../store/data'
import { plannedDay } from '../../store/day'
import { saveCalendars } from '../settings/calendarEdits'
import { FLAGS, setMeta, VARIANT_PLACE_SAME } from '../settings/categoryFields'
import { saveTree, saveVariants } from '../settings/categoryTreeEdits'
import { saveSettingsFrom } from '../settings/settingsStore'
import { RoutineCostField, saveRoutineRecord } from '../routines/routineCost'
import { categoryChange, routineChange, variantChange } from './editChanges'
import { begunToday, countScope, overriddenFrom, scopeDates, scopeDetail, scopeText, type Counted, type EditTarget, type EditWhat, type ScopeCount } from './editScope'
import { CategoryFields, RoutineFields, SaveButtons, VariantFields, useForm } from './NewThingDialogs'
import type { CategoryForm, RoutineForm, VariantForm } from './thingForms'

type Files = Record<string, Record<string, unknown> | null>
interface Today {
  ended: ReadonlySet<string>
  begun: ReadonlyMap<string, Counted>
}
const NONE: Today = { ended: new Set(), begun: new Map() }

/**
 * Today's blocks from today's log (`plannedDay`): the ended ones (a change of the cost only does not reach them, D501) and the begun ones as
 * the engine counts them now (`begunToday`, T1434); a log not read whole, a file that cannot be read – none known.
 */
async function todayOf(today: string, at = Date.now()): Promise<Today> {
  const day = await plannedDay(today, at)
  if (typeof day === 'string') return NONE
  return { ended: new Set([...day.facts.blocks.values()].filter((f) => f.endedAt != null).map((f) => f.id)), begun: begunToday(day.ctx, day.facts, at) }
}

/**
 * The blocks the edit reaches: the days' files and today's log (a change of the cost only does not reach today's blocks ended – of a routine
 * too, T1398) are read once, at the first change (`what` no longer null) – a window opened and closed reads nothing; the count follows the
 * fields. `until` – `overriddenFrom`. Null – nothing changed, or still being counted.
 */
function useScope(target: EditTarget, what: EditWhat | null, categories: Readonly<Record<string, CategoryRules | undefined>>, until: string | null): ScopeCount | null {
  const today = useData((s) => s.view?.today ?? '')
  const templates = useData((s) => s.templates)
  const series = useData((s) => s.seriesPlans)
  // The routines' costs now: a block whose routine has one costs that before its variant's and subcategory's (D512).
  const routines = useData((s) => s.routines)
  const routineCosts = useMemo(() => routineCostsOf(routines), [routines])
  // Set once and never put back: going back to „nothing changed” and changing again reads nothing more.
  const [wanted, setWanted] = useState(false)
  useEffect(() => {
    if (what) setWanted(true)
  }, [what])
  const [read, setRead] = useState<({ files: Files } & Today) | null>(null)
  useEffect(() => {
    if (!wanted || !today) return
    let alive = true
    void Promise.all([window.rd.dayFiles(scopeDates(today)).catch((): Files => ({})), todayOf(today)]).then(([files, day]) => {
      if (alive) setRead({ files, ...day })
    })
    return () => {
      alive = false
    }
  }, [wanted, today])
  const key = JSON.stringify(target)
  return useMemo(
    () => (read && what ? countScope({ today, files: read.files, templates, series, target, what, categories, routineCosts, ended: read.ended, begun: read.begun, until }) : null),
    // `target` by its key: a new object of the same thing counts nothing again.
    [read, what, today, templates, series, key, categories, routineCosts, until]
  )
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

/** The settings in force at this moment – what an edit starting now changes (and what ✎ is offered for, T1330). */
export function useSettingsNow(): RulesSettings {
  const today = useData((s) => s.view?.today ?? '')
  const changes = useData((s) => s.rd.settings)
  return useMemo(() => settingsOn(changes, today, Date.now()), [changes, today])
}

/** A change of the dated settings from today on: the date a later entry writes over all of it (T1336); null – none, or nothing dated. */
function useUntil(written: Record<string, unknown> | null): string | null {
  const today = useData((s) => s.view?.today ?? '')
  const changes = useData((s) => s.rd.settings)
  // `written` by its key: a new object of the same change counts nothing again.
  const key = written ? JSON.stringify(written) : null
  return useMemo(() => (written && today ? overriddenFrom(changes, today, written) : null), [changes, today, key])
}

/** Why a variant's save was refused (T1331) – said in the window, which stays open until „Anuluj” or Esc. */
export const VARIANT_GONE_TEXT = 'Nie zapisano: tego wariantu już nie ma.'
export const VARIANT_SAME_TEXT = 'Nic nie zapisano: wariant jest już taki, jak w oknie – zmieniono go w międzyczasie.'
export const VARIANT_FAILED_TEXT = 'Nie zapisano zmiany wariantu. Spróbuj jeszcze raz albo zamknij okno.'

function SaveError({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p className="text-[12.5px] text-rose" role="alert" data-testid="edit-error">
      {text}
    </p>
  )
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
  const undated = change.meta != null || change.group != null || change.calendar != null
  // A field without a date reaches every block for good: no entry of the settings writes over it.
  const until = useUntil(change.patch && !undated ? { categories: { [categoryId]: change.patch } } : null)
  const count = useScope({ kind: 'category', id: categoryId }, change.what, settings.categories, until)
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
  // The list of variants is written whole: an entry of a later date with a list writes over the change (T1328).
  const until = useUntil(change.patch ? { categories: { [categoryId]: { variants: [] } } } : null)
  const count = useScope({ kind: 'variant', categoryId, id: variantId }, change.what, settings.categories, until)
  const [error, setError] = useState<string | null>(null)
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      if (!d.name.trim() || !today) return
      const ch = variantChange(initial, d)
      if (!ch.patch) return onClose()
      const patch = ch.patch
      setError(null)
      // What the turn of the save found (the list is not made when the subcategory is not there then).
      const turn: { found: 'gone' | 'same' | 'made' | null } = { found: null }
      // The list is whole in a change: made in the turn of the save from the variants in force from now on.
      const saved = await saveVariants(
        categoryId,
        (now) => {
          if (!now.some((v) => v.id === variantId)) {
            turn.found = 'gone'
            return null
          }
          const list = changeVariant(now, variantId, patch)
          turn.found = list ? 'made' : 'same'
          return list
        },
        { from: today, at: Date.now() }
      )
      if (saved) return onClose()
      const state = useData.getState()
      const gone = turn.found === 'gone' || (turn.found == null && !settingsOn(state.rd.settings, state.view?.today ?? today, Date.now()).categories[categoryId])
      // Not saved for another reason (the day not read, the folder, a question): its toast says why.
      setError(gone ? VARIANT_GONE_TEXT : turn.found === 'same' ? VARIANT_SAME_TEXT : VARIANT_FAILED_TEXT)
    })
  return (
    <Dialog title={`Wariant ${initial.name}`} onClose={onClose} centered data-testid="edit-variant-window" actions={<SaveButtons busy={busy} ok={form.name.trim() !== ''} onSave={() => void save()} onClose={onClose} />}>
      <VariantFields form={form} set={set} onEnter={() => void save()} withPlace />
      <ScopeNote count={count} what={change.what} />
      <SaveError text={error} />
    </Dialog>
  )
}

export function EditRoutineDialog({ routineId, onClose }: { routineId: string; onClose: () => void }) {
  const routine = useData((s) => s.routines.find((r) => r.id === routineId))
  const settings = useSettingsNow()
  const [initial] = useState<RoutineForm>(() => ({ name: routine?.name ?? '', normal: routine?.normal ?? [], worse: routine?.worse ?? [], costs: routine?.costs ?? null }))
  const [form, set, ref] = useForm<RoutineForm>(initial)
  const [busy, run] = useBusy()
  const change = routineChange(initial, form)
  const count = useScope({ kind: 'routine', id: routineId }, change.what, settings.categories, null)
  // The name and the steps have no date (they change in the days gone by too); the cost reaches what is begun from now on (T1430).
  const undated = change.patch != null && (change.patch.name !== undefined || change.patch.normal !== undefined || change.patch.worse !== undefined)
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      if (!d.name.trim()) return
      const ch = routineChange(initial, d)
      if (!ch.patch) return onClose()
      // The save of „Rutyny” (T1397): the record – its cost changed, today's begun blocks of the routine count it from now on (T1430).
      const { out } = await saveRoutineRecord(routineId, ch.patch)
      if (isSaved(out)) onClose()
    })
  return (
    <Dialog title={`Rutyna ${initial.name}`} onClose={onClose} wide centered data-testid="edit-routine-window" actions={<SaveButtons busy={busy} ok={form.name.trim() !== ''} onSave={() => void save()} onClose={onClose} />}>
      <RoutineFields
        form={form}
        set={set}
        onEnter={() => void save()}
        // The window's clicks change the form only: nothing is saved before „Zapisz” („Anuluj” and Esc change nothing).
        cost={
          <RoutineCostField
            id={`edit-routine:${routineId}`}
            costs={form.costs ?? null}
            categories={settings.categories}
            onChange={(costs) => set({ costs })}
          />
        }
      />
      <ScopeNote count={count} what={change.what} note={undated ? 'Rutyna nie ma daty: nazwa i kroki zmieniają się od razu, także w dniach minionych.' : undefined} />
    </Dialog>
  )
}
