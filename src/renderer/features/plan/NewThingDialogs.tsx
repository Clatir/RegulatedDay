/**
 * „+ Nowa…” in the lists of a block's panel (D463): „Rutyna”, „Wariant” and „Kategoria” each open a window in the middle of the
 * screen with all the fields of that thing – a routine's name and its usual and worse steps with their times (`RoutineSteps`, the
 * very editor of „Rutyny”), a variant's name and costs (as „Sposoby regeneracji”), a category's class, costs, place, colour,
 * calendar and the properties the rules read (as „Kategorie”). „Zapisz” makes it through the same path as those screens and hands it
 * to the panel, which chooses it in the block; „Anuluj” and Esc leave everything as it was. A variant and a category are new
 * for every day – they are saved from today on („od dziś”), whatever the screen of the settings has chosen (nothing earlier
 * can use them).
 */
import { useRef, useState } from 'react'
import { paths } from '@shared/data/paths'
import { newId } from '@shared/model/ids'
import { calendarOfCategory, DEFAULT_CALENDAR_ID, setCategoryCalendarRaw } from '@shared/model/calendars'
import type { Costs, Variant } from '@shared/model/categories'
import { CATEGORY_COLORS } from '@shared/model/rd'
import { ROUTINE_SCHEMA, routineFrom, type Routine, type RoutineStep, type RoutineVersion } from '@shared/model/routines'
import { RANGES, settingsOn } from '@shared/model/settings'
import { blockFill } from '@shared/theme'
import { Choice, TextField } from '../../components/fields'
import { Dialog } from '../../components/Dialog'
import { Field, Toggle, cx } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { commitActiveField } from '../../lib/commit'
import { isSaved, saveRecord, useData } from '../../store/data'
import { useMachine } from '../../store/machine'
import { saveCalendars } from '../settings/calendarEdits'
import { FLAGS, PLACE_OPTIONS, POOLS, setMeta } from '../settings/CategoriesSection'
import { SettingNumber } from '../settings/SettingNumber'
import { saveSettingsFrom } from '../settings/settingsStore'
import { RoutineSteps } from '../routines/RoutineSteps'
import { CLASS_NAMES } from './blockView'

/** The fields as they are now: a field left by the click on „Zapisz” has told its value before the click is handled (a ref beside the state). */
function useForm<T>(initial: T): readonly [T, (patch: Partial<T> | ((now: T) => Partial<T>)) => void, { current: T }] {
  const ref = useRef(initial)
  const [shown, setShown] = useState(initial)
  const set = (patch: Partial<T> | ((now: T) => Partial<T>)) => {
    ref.current = { ...ref.current, ...(typeof patch === 'function' ? patch(ref.current) : patch) }
    setShown(ref.current)
  }
  return [shown, set, ref] as const
}

function SaveButtons({ busy, ok, onSave, onClose }: { busy: boolean; ok: boolean; onSave: () => void; onClose: () => void }) {
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

/** A new routine: its name and the two versions of steps; the routine made is handed on (the block takes it and its steps, D460). */
export function NewRoutineDialog({ onCreated, onClose }: { onCreated: (r: Routine) => void; onClose: () => void }) {
  const [form, set, ref] = useForm<{ name: string; normal: RoutineStep[]; worse: RoutineStep[] }>({ name: '', normal: [{ id: newId(10), name: '', min: 5 }], worse: [] })
  const [busy, run] = useBusy()
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      const name = d.name.trim()
      if (!name) return
      const clean = (steps: RoutineStep[]) => steps.filter((s) => s.name.trim()).map((s) => ({ ...s, name: s.name.trim() }))
      const id = newId()
      const record = { schema: ROUTINE_SCHEMA, id, name, normal: clean(d.normal), worse: clean(d.worse), archived: false }
      if (!isSaved(await saveRecord(paths.record('routine', id), null, record))) return
      const r = routineFrom(record)
      if (r) onCreated(r)
    })
  return (
    <Dialog title="Nowa rutyna" onClose={onClose} wide centered data-testid="new-routine" actions={<SaveButtons busy={busy} ok={form.name.trim() !== ''} onSave={() => void save()} onClose={onClose} />}>
      <Field label="Nazwa" labelWidth={70}>
        <TextField value={form.name} onCommit={(name) => set({ name })} onEnter={() => void save()} max={80} autoFocus errorPlacement="below" aria-label="Nazwa rutyny" data-testid="new-routine-name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {(['normal', 'worse'] as RoutineVersion[]).map((v) => (
          <RoutineSteps key={v} version={v} steps={form[v]} onChange={(fn) => set((now) => ({ [v]: fn(now[v]) }))} />
        ))}
      </div>
      <p className="text-[12px] text-muted">Wersja na gorsze dni bez kroków znaczy: jak zwykła. Kroki bez nazwy nie zostaną zapisane.</p>
    </Dialog>
  )
}

/** A new variant of a category: its name and the cost of each pool an hour (as „Sposoby regeneracji”, a variant has no other fields). */
export function NewVariantDialog({ categoryId, costs, onCreated, onClose }: { categoryId: string; costs: Costs; onCreated: (variantId: string) => void; onClose: () => void }) {
  const today = useData((s) => s.view?.today ?? '')
  const [form, set, ref] = useForm<{ name: string; costs: Costs }>({ name: '', costs })
  const [busy, run] = useBusy()
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      const name = d.name.trim()
      if (!name || !today) return
      const at = Date.now()
      // The list is whole in a change: the variants in force now, and the new one after them.
      const now = settingsOn(useData.getState().rd.settings, today, at).categories[categoryId]?.variants ?? []
      const variant: Variant = { id: newId(10), name, costs: d.costs }
      if (!(await saveSettingsFrom({ categories: { [categoryId]: { variants: [...now, variant] } } }, { from: today, at }))) return
      onCreated(variant.id)
    })
  return (
    <Dialog title="Nowy wariant" onClose={onClose} centered data-testid="new-variant" actions={<SaveButtons busy={busy} ok={form.name.trim() !== ''} onSave={() => void save()} onClose={onClose} />}>
      <Field label="Nazwa" labelWidth={70}>
        <TextField value={form.name} onCommit={(name) => set({ name })} onEnter={() => void save()} max={80} autoFocus errorPlacement="below" aria-label="Nazwa wariantu" data-testid="new-variant-name" />
      </Field>
      <CostFields costs={form.costs} onChange={(c) => set((now) => ({ costs: { ...now.costs, ...c } }))} />
    </Dialog>
  )
}

function CostFields({ costs, onChange }: { costs: Costs; onChange: (c: Partial<Costs>) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        {POOLS.map(([p, label]) => (
          <label key={p} className="flex items-center gap-1.5 text-[12.5px] text-muted">
            {label}
            <SettingNumber field={{ kind: 'integer', range: RANGES.cost, label: `Koszt: ${label}` }} value={costs[p]} onCommit={(v) => onChange({ [p]: v })} className="w-[52px]" data-testid={`new-cost-${p}`} />
          </label>
        ))}
      </div>
      <span className="text-[11.5px] text-muted">Koszty: głowa, emocje, bodźce na godzinę (ujemne oddają energię).</span>
    </div>
  )
}

type CategoryForm = {
  name: string
  cls: 'work' | 'life' | 'free'
  place: 'computer' | 'passive' | 'away'
  color: string | null
  calendar: string
  costs: Costs
  flags: Record<string, boolean>
}

/** A new category: the fields of its row in „Kategorie” (name, class, costs, place, colour, calendar, the properties). */
export function NewCategoryDialog({ onCreated, onClose }: { onCreated: (categoryId: string) => void; onClose: () => void }) {
  const today = useData((s) => s.view?.today ?? '')
  const rd = useData((s) => s.rd)
  const brightness = useMachine((s) => s.prefs.brightness)
  const [form, set, ref] = useForm<CategoryForm>({ name: '', cls: 'work', place: 'computer', color: null, calendar: DEFAULT_CALENDAR_ID, costs: { head: 1, emotions: 1, senses: 1 }, flags: {} })
  const [busy, run] = useBusy()
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      const name = d.name.trim()
      if (!name || !today) return
      const id = newId(10)
      const rules = { cls: d.cls, kind: 'other', place: d.place, costs: d.costs, ...Object.fromEntries(FLAGS.map(([k]) => [k, d.flags[k] === true])) }
      // Its rules first (as „Kategorie”): a change refused leaves no category without rules.
      if (!(await saveSettingsFrom({ categories: { [id]: rules } }, { from: today, at: Date.now() }))) return
      await setMeta(id, { name: name.slice(0, 60), color: d.color, archived: false })
      if (d.calendar !== DEFAULT_CALENDAR_ID && calendarOfCategory(useData.getState().rd, id) !== d.calendar) await saveCalendars((raw) => setCategoryCalendarRaw(raw, id, d.calendar))
      onCreated(id)
    })
  return (
    <Dialog title="Nowa kategoria" onClose={onClose} wide centered data-testid="new-category" actions={<SaveButtons busy={busy} ok={form.name.trim() !== ''} onSave={() => void save()} onClose={onClose} />}>
      <Field label="Nazwa" labelWidth={90}>
        <TextField value={form.name} onCommit={(name) => set({ name })} onEnter={() => void save()} max={60} autoFocus errorPlacement="below" aria-label="Nazwa kategorii" data-testid="new-category-name" />
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
          {[null, ...CATEGORY_COLORS].map((col) => (
            <button
              key={col ?? 'class'}
              type="button"
              className={cx('h-5 w-5 rounded-sm border', form.color === col ? 'ring-1 ring-lamp' : '')}
              style={{ background: col ? blockFill(col, brightness) : 'transparent', borderColor: col ?? 'var(--color-line-strong)' }}
              onClick={() => set({ color: col })}
              aria-label={col ? `kolor ${col}` : 'kolor klasy'}
              aria-pressed={form.color === col}
            />
          ))}
        </div>
      </Field>
      {rd.calendars.length > 1 && (
        <Field label="Kalendarz" labelWidth={90}>
          <Choice value={form.calendar} options={rd.calendars.map((c) => ({ value: c.id, label: c.name }))} onChange={(calendar) => set({ calendar })} className="w-[200px]" aria-label="Kalendarz kategorii" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {FLAGS.map(([k, label]) => (
          <Toggle key={k} checked={form.flags[k] === true} onChange={(v) => set((now) => ({ flags: { ...now.flags, [k]: v } }))} label={label} />
        ))}
      </div>
    </Dialog>
  )
}
