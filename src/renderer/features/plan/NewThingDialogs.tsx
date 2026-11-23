/**
 * „+ Nowa…” in the lists of a block's panel (D463): „Rutyna”, „Wariant” and „Podkategoria” each open a window in the middle of the
 * screen with all the fields of that thing – a routine's name and its usual and worse steps with their times (`RoutineSteps`, the
 * very editor of „Rutyny”), a variant's name and its cost (three numbers or „jak podkategoria”, as in „Kategorie”), a subcategory's
 * category (that of the block's subcategory by default, D510), class, costs, place, colour, calendar and the properties the rules
 * read (as „Kategorie”). „Zapisz” makes it through the same path as those screens and hands it
 * to the panel, which chooses it in the block; „Anuluj” and Esc leave everything as it was. A variant and a category are new
 * for every day – they are saved from today on („od dziś”), whatever the screen of the settings has chosen (nothing earlier
 * can use them; the panel of a day gone by does not offer them). They are handed to the panel once its data have them (`has`):
 * what the panel's change reaches (the exchange of a new work block in „Dziś”) counts with the new rules.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { paths } from '@shared/data/paths'
import { newId } from '@shared/model/ids'
import { calendarOfCategory, DEFAULT_CALENDAR_ID, setCategoryCalendarRaw } from '@shared/model/calendars'
import type { Costs } from '@shared/model/categories'
import { addVariant, OTHER_GROUP, VARIANT_NAME_MAX } from '@shared/model/categoryTree'
import { ROUTINE_SCHEMA, routineFrom, type Routine, type RoutineVersion } from '@shared/model/routines'
import { Choice, TextField } from '../../components/fields'
import { Dialog } from '../../components/Dialog'
import { Field, Toggle } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { commitActiveField } from '../../lib/commit'
import { isSaved, saveRecord, useData } from '../../store/data'
import { saveCalendars } from '../settings/calendarEdits'
import { ColorSwatches, CostNumbers, createCategory, FLAGS, NEW_CATEGORY_COSTS, PLACE_OPTIONS, VARIANT_PLACE_OPTIONS, VARIANT_PLACE_SAME } from '../settings/categoryFields'
import { saveSettingsFrom } from '../settings/settingsStore'
import { saveVariants } from '../settings/categoryTreeEdits'
import { RoutineSteps } from '../routines/RoutineSteps'
import { CLASS_NAMES } from './blockView'
import { WideCostWarning } from './CostInput'
import { cleanSteps, type CategoryForm, type RoutineForm, type VariantForm } from './thingForms'

/** The fields as they are now: a field left by the click on „Zapisz” has told its value before the click is handled (a ref beside the state). */
export function useForm<T>(initial: T): readonly [T, (patch: Partial<T> | ((now: T) => Partial<T>)) => void, { current: T }] {
  const ref = useRef(initial)
  const [shown, setShown] = useState(initial)
  const set = (patch: Partial<T> | ((now: T) => Partial<T>)) => {
    ref.current = { ...ref.current, ...(typeof patch === 'function' ? patch(ref.current) : patch) }
    setShown(ref.current)
  }
  return [shown, set, ref] as const
}

/** How long a window waits for the panel's data to show the thing it made (the view read again) before handing it on anyway. */
export const HAND_ON_MS = 2000

/**
 * The thing made is handed on by the newest `onCreated` – never the one of the render the click on „Zapisz” came from – once the
 * panel's data have it (`has`, read in a render after the save): the screen's code it reaches counts with the new thing, not
 * with the data from before it (a new category without rules there – no exchange for a new work block). Data that do not show
 * it within `HAND_ON_MS` – handed on anyway; the window gone meanwhile – never.
 */
function useHandOn(onCreated: (id: string) => void, has: (id: string) => boolean): (id: string) => Promise<void> {
  const latest = useRef({ onCreated, has })
  latest.current = { onCreated, has }
  const waiting = useRef<{ id: string; finish: (hand: boolean) => void } | null>(null)
  // After every render: the data of this render may be the first to have it.
  useEffect(() => {
    const w = waiting.current
    if (w && latest.current.has(w.id)) w.finish(true)
  })
  useEffect(() => () => waiting.current?.finish(false), [])
  return (id) =>
    new Promise<void>((resolve) => {
      const finish = (hand: boolean) => {
        clearTimeout(timer)
        waiting.current = null
        if (hand) latest.current.onCreated(id)
        resolve()
      }
      const timer = setTimeout(() => finish(true), HAND_ON_MS)
      waiting.current = { id, finish }
      if (latest.current.has(id)) finish(true)
    })
}

export function SaveButtons({ busy, ok, onSave, onClose }: { busy: boolean; ok: boolean; onSave: () => void; onClose: () => void }) {
  return (
    <>
      <button type="button" className="btn" onClick={onClose} data-testid="new-thing-cancel">
        Anuluj
      </button>
      <button type="button" className="btn btn-accent" disabled={busy || !ok} onClick={onSave} data-testid="new-thing-save">
        Zapisz
      </button>
    </>
  )
}

type SetForm<T> = (patch: Partial<T> | ((now: T) => Partial<T>)) => void

/**
 * The fields of a routine – its name and the two versions of steps (the very editor of „Rutyny”); shared by „Nowa rutyna” and „Rutyna <nazwa>”
 * (D514). `cost` – the field of its cost under the name (the window ✎, T1397: `RoutineCostField`, as „Rutyny”).
 */
export function RoutineFields({ form, set, onEnter, cost }: { form: RoutineForm; set: SetForm<RoutineForm>; onEnter: () => void; cost?: ReactNode }) {
  return (
    <>
      <Field label="Nazwa" labelWidth={70}>
        <TextField value={form.name} onCommit={(name) => set({ name })} onEnter={onEnter} max={80} autoFocus errorPlacement="below" aria-label="Nazwa rutyny" data-testid="new-routine-name" />
      </Field>
      {cost}
      <div className="grid grid-cols-2 gap-3">
        {(['normal', 'worse'] as RoutineVersion[]).map((v) => (
          <RoutineSteps key={v} version={v} steps={form[v]} onChange={(fn) => set((now) => ({ [v]: fn(now[v]) }))} />
        ))}
      </div>
      <p className="text-[12px] text-muted">Wersja na gorsze dni bez kroków znaczy: jak zwykła. Kroki bez nazwy nie zostaną zapisane.</p>
    </>
  )
}

/** A new routine: its name and the two versions of steps; the routine made is handed on (the block takes it with its length – its steps are shown from the routine, never copied, D480). */
export function NewRoutineDialog({ onCreated, onClose }: { onCreated: (r: Routine) => void; onClose: () => void }) {
  const [form, set, ref] = useForm<RoutineForm>({ name: '', normal: [{ id: newId(10), name: '', min: 5 }], worse: [] })
  const [busy, run] = useBusy()
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      const name = d.name.trim()
      if (!name) return
      const id = newId()
      const record = { schema: ROUTINE_SCHEMA, id, name, normal: cleanSteps(d.normal), worse: cleanSteps(d.worse), archived: false }
      if (!isSaved(await saveRecord(paths.record('routine', id), null, record))) return
      const r = routineFrom(record)
      if (r) onCreated(r)
    })
  return (
    <Dialog title="Nowa rutyna" onClose={onClose} wide centered data-testid="new-routine" actions={<SaveButtons busy={busy} ok={form.name.trim() !== ''} onSave={() => void save()} onClose={onClose} />}>
      <RoutineFields form={form} set={set} onEnter={() => void save()} />
    </Dialog>
  )
}

/** The fields of a variant: name, cost („jak podkategoria” or three numbers) and – `withPlace` (the edit, D514) – the place. */
export function VariantFields({ form, set, onEnter, withPlace }: { form: VariantForm; set: SetForm<VariantForm>; onEnter: () => void; withPlace?: boolean }) {
  return (
    <>
      <Field label="Nazwa" labelWidth={70}>
        <TextField value={form.name} onCommit={(name) => set({ name })} onEnter={onEnter} max={VARIANT_NAME_MAX} autoFocus errorPlacement="below" aria-label="Nazwa wariantu" data-testid="new-variant-name" />
      </Field>
      <Toggle checked={form.same} onChange={(same) => set({ same })} label="koszt jak podkategoria" data-testid="new-variant-same" />
      {!form.same && <CostFields costs={form.costs} onChange={(c) => set((now) => ({ costs: { ...now.costs, ...c } }))} />}
      {withPlace && (
        <Field label="Miejsce" labelWidth={70}>
          <Choice value={form.place} options={[...VARIANT_PLACE_OPTIONS]} onChange={(place) => set({ place })} className="w-[240px]" aria-label="Miejsce wariantu" data-testid="new-variant-place" />
        </Field>
      )}
    </>
  )
}

/**
 * A new variant of a subcategory: its name and its cost – „jak podkategoria” (the subcategory's, also after it changes) or three numbers an
 * hour of its own (D510; a variant has no other fields here). `has` – whether the panel's data have the variant made (it is handed on then).
 */
export function NewVariantDialog({ categoryId, costs, onCreated, has, onClose }: { categoryId: string; costs: Costs; onCreated: (variantId: string) => void; has: (variantId: string) => boolean; onClose: () => void }) {
  const today = useData((s) => s.view?.today ?? '')
  const [form, set, ref] = useForm<VariantForm>({ name: '', same: true, costs, place: VARIANT_PLACE_SAME })
  const [busy, run] = useBusy()
  const handOn = useHandOn(onCreated, has)
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      const name = d.name.trim()
      if (!name || !today) return
      const id = newId(10)
      // „Od dziś”; the list is whole in a change – made in the turn of the save from the variants in force then, the new one after them.
      if (!(await saveVariants(categoryId, (now) => addVariant(now, { id, name, ...(d.same ? {} : { costs: d.costs }) }), { from: today, at: Date.now() }))) return
      await handOn(id)
    })
  return (
    <Dialog title="Nowy wariant" onClose={onClose} centered data-testid="new-variant" actions={<SaveButtons busy={busy} ok={form.name.trim() !== ''} onSave={() => void save()} onClose={onClose} />}>
      <VariantFields form={form} set={set} onEnter={() => void save()} />
    </Dialog>
  )
}

export function CostFields({ costs, onChange }: { costs: Costs; onChange: (c: Partial<Costs>) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <CostNumbers wheel="step" costs={costs} named label={(pool) => `Koszt: ${pool}`} onCommit={(p, v) => onChange({ [p]: v })} testId={(p) => `new-cost-${p}`} />
      </div>
      <span className="text-[11.5px] text-muted">Koszty: głowa, emocje, bodźce, ciało na godzinę (ujemne oddają energię).</span>
      <WideCostWarning costs={[costs]} testId="new-cost-old" />
    </div>
  )
}

/**
 * The fields of a subcategory (as its row in „Kategorie”): name, its category, class, costs, place, colour, calendar, the properties.
 * Shared by „Nowa podkategoria” and „Podkategoria <nazwa>” (D514); `groups` – the categories to choose from.
 */
export function CategoryFields({ form, set, groups, onEnter }: { form: CategoryForm; set: SetForm<CategoryForm>; groups: ReadonlyArray<{ id: string; name: string }>; onEnter: () => void }) {
  const rd = useData((s) => s.rd)
  return (
    <>
      <Field label="Nazwa" labelWidth={90}>
        <TextField value={form.name} onCommit={(name) => set({ name })} onEnter={onEnter} max={60} autoFocus errorPlacement="below" aria-label="Nazwa podkategorii" data-testid="new-category-name" />
      </Field>
      <Field label="Kategoria" labelWidth={90}>
        <Choice value={form.group} options={groups.map((g) => ({ value: g.id, label: g.name }))} onChange={(group) => set({ group })} className="w-[200px]" aria-label="Kategoria podkategorii" data-testid="new-category-group" />
      </Field>
      <Field label="Klasa" labelWidth={90}>
        <Choice value={form.cls} options={(['work', 'life', 'free'] as const).map((v) => ({ value: v, label: CLASS_NAMES[v] }))} onChange={(cls) => set({ cls })} className="w-[160px]" aria-label="Klasa" data-testid="new-category-class" />
      </Field>
      <Field label="Koszty" labelWidth={90}>
        <CostFields costs={form.costs} onChange={(c) => set((now) => ({ costs: { ...now.costs, ...c } }))} />
      </Field>
      <Field label="Miejsce" labelWidth={90}>
        <Choice value={form.place} options={[...PLACE_OPTIONS]} onChange={(place) => set({ place })} className="w-[240px]" aria-label="Miejsce" data-testid="new-category-place" />
      </Field>
      <Field label="Kolor" labelWidth={90}>
        <div className="flex flex-wrap items-center gap-2">
          <ColorSwatches value={form.color} onPick={(color) => set({ color })} />
        </div>
      </Field>
      {rd.calendars.length > 1 && (
        <Field label="Kalendarz" labelWidth={90}>
          <Choice value={form.calendar} options={rd.calendars.map((c) => ({ value: c.id, label: c.name }))} onChange={(calendar) => set({ calendar })} className="w-[200px]" aria-label="Kalendarz podkategorii" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {FLAGS.map(([k, label]) => (
          <Toggle key={k} checked={form.flags[k] === true} onChange={(v) => set((now) => ({ flags: { ...now.flags, [k]: v } }))} label={label} />
        ))}
      </div>
    </>
  )
}

/**
 * A new subcategory (D510): the fields of its row in „Kategorie” (name, its category – `defaultGroup`, that of the block's subcategory, unless
 * it is gone or archived –, class, costs, place, colour, calendar, the properties). `has` – whether the panel's data have the subcategory made
 * (it is handed on then).
 */
export function NewCategoryDialog({ defaultGroup, onCreated, has, onClose }: { defaultGroup: string; onCreated: (categoryId: string) => void; has: (categoryId: string) => boolean; onClose: () => void }) {
  const today = useData((s) => s.view?.today ?? '')
  const rd = useData((s) => s.rd)
  const groups = rd.categoryGroups.filter((g) => !g.archived)
  const [form, set, ref] = useForm<CategoryForm>({ name: '', group: groups.some((g) => g.id === defaultGroup) ? defaultGroup : OTHER_GROUP, cls: 'work', place: 'computer', color: null, calendar: DEFAULT_CALENDAR_ID, costs: NEW_CATEGORY_COSTS, flags: {} })
  const [busy, run] = useBusy()
  const handOn = useHandOn(onCreated, has)
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      const name = d.name.trim()
      if (!name || !today) return
      const id = newId(10)
      const rules = { cls: d.cls, kind: 'other', place: d.place, costs: d.costs, ...Object.fromEntries(FLAGS.map(([k]) => [k, d.flags[k] === true])) }
      // As „Kategorie” makes one (its rules first, then its name and category), from today on.
      if (!(await createCategory((patch) => saveSettingsFrom(patch, { from: today, at: Date.now() }), id, rules, { name, color: d.color, group: d.group }))) return
      if (d.calendar !== DEFAULT_CALENDAR_ID && calendarOfCategory(useData.getState().rd, id) !== d.calendar) await saveCalendars((raw) => setCategoryCalendarRaw(raw, id, d.calendar))
      await handOn(id)
    })
  return (
    <Dialog title="Nowa podkategoria" onClose={onClose} wide centered data-testid="new-category" actions={<SaveButtons busy={busy} ok={form.name.trim() !== ''} onSave={() => void save()} onClose={onClose} />}>
      <CategoryFields form={form} set={set} groups={groups} onEnter={() => void save()} />
    </Dialog>
  )
}
