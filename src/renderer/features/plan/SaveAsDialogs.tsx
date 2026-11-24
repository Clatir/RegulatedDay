/**
 * The windows of „Zapisz jako szablon…” and „Zapisz jako rutynę…” (N15, D615–D619): from the menu „Zmień N bloków” (the blocks selected, of one day)
 * and from the menu of a day („⋯” of „Dziś”, the right button on a day's heading in „Tydzień” and „3 dni” – the whole plan). The window counts
 * the day as the screens do (`useDay`) to say what goes and what stays out; the save reads and counts it again in its turn (`saveAs.ts`).
 *
 * Szablon: the template (grouped by the type of day – the day's own template first chosen, else its type's), „Zastąp bloki szablonu” (default) or
 * „Dołóż”, „Od” (default tomorrow – the day after the day saved when that is later, D616; never before tomorrow – today is made already), what goes,
 * what is left out and – when the day saved would take the blocks from the template itself – that it would have them twice (D72: said, not refused).
 * Rutyna: its name (the first block's) and its steps – the editor of „Rutyny”, filled with the blocks' names and planned lengths in the order of their
 * start; the blocks themselves do not change.
 */
import { useMemo, useState } from 'react'
import { dayTemplateAfter, saveAsFrom, savedDayTwice, savedTemplate, routineStepsOf, templateBlocksOf, wakeFrameOf, type SaveAsMode } from '@shared/engine/saveAs'
import { plDate, plDayMonth } from '@shared/format'
import { groupCount } from '@shared/groupText'
import { newId } from '@shared/model/ids'
import { templateVersionOn, type Template } from '@shared/model/plan'
import { DAY_TYPE_NAMES, DAY_TYPES } from '@shared/model/settings'
import { addDays } from '@shared/time/zone'
import { Choice, DateField } from '../../components/fields'
import { Dialog } from '../../components/Dialog'
import { Field, Segmented } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { commitActiveField } from '../../lib/commit'
import { useData } from '../../store/data'
import { dayTypeNow, useDay, type DayModel } from '../../store/day'
import type { GroupView } from '../../store/groupLine'
import { blockName, type Names } from './blockView'
import { RoutineFields, SaveButtons, useForm } from './NewThingDialogs'
import { pickOf, saveAsRoutine, saveAsTemplate, skippedNote } from './saveAs'
import type { RoutineForm } from './thingForms'

/** What a window is opened for: the blocks of one day (`ids` – the selection; null – the whole plan). */
export interface SaveAsOpen {
  kind: 'template' | 'routine'
  date: string
  ids: readonly string[] | null
}

/** The window of `open`, counting its day (one place for the menus of the blocks and of the day). */
export function SaveAsWindow({ open, view, onClose }: { open: SaveAsOpen; view: GroupView; onClose: () => void }) {
  const model = useDay(open.date)
  const today = useData((s) => s.view?.today ?? '')
  return open.kind === 'template' ? <SaveAsTemplateDialog model={model} open={open} today={today} view={view} onClose={onClose} /> : <SaveAsRoutineDialog model={model} open={open} view={view} onClose={onClose} />
}

/** The templates a save may go to (not archived), as „Szablony” lists them – by the type of day. */
const choosable = (templates: readonly Template[]): Template[] => DAY_TYPES.flatMap((type) => templates.filter((t) => t.dayType === type && !t.archived))

/** The template chosen at the start: the one that made the day, else the first of the day's type, else the first one. */
export function startTemplate(templates: readonly Template[], model: DayModel | null): string | null {
  const list = choosable(templates)
  if (!model) return null
  const own = list.find((t) => t.id === model.snapshot.templateId)
  const type = dayTypeNow(model)
  return (own ?? list.find((t) => t.dayType === type) ?? list[0])?.id ?? null
}

export function SaveAsTemplateDialog({ model, open, today, view, onClose }: { model: DayModel | null; open: SaveAsOpen; today: string; view: GroupView; onClose: () => void }) {
  const templates = useData((s) => s.templates)
  const list = useMemo(() => choosable(templates), [templates])
  const tomorrow = addDays(today, 1)
  const [chosen, setChosen] = useState<string | null>(null)
  const templateId = chosen ?? startTemplate(templates, model)
  const template = list.find((t) => t.id === templateId) ?? null
  const [mode, setMode] = useState<SaveAsMode>('replace')
  const [chosenFrom, setFrom] = useState(() => saveAsFrom(open.date, today))
  // Never before tomorrow – also when the window stood open past 04:00 (today moved on): the write says the same (`saveAsTemplate`).
  const from = chosenFrom < tomorrow ? tomorrow : chosenFrom
  const [busy, run] = useBusy()
  const pick = useMemo(() => (model ? pickOf(model, open.ids) : null), [model, open.ids])
  // What the save would make on the day as the window has it (the write counts again in its turn): how many go, how many the template has already.
  const preview = useMemo(
    () =>
      model && pick && template
        ? templateBlocksOf(pick.take, model.ctx.plan, { date: open.date, templateId: template.id, version: templateVersionOn(template, from), mode, newId: () => newId(10), wake: wakeFrameOf(model.snapshot, model.dayFile) })
        : null,
    [model, pick, template, from, mode, open.date]
  )
  const going = preview?.blocks.length ?? 0
  // The day saved would take the template's copies of its blocks: the template makes it after the save (also one that becomes its template by it).
  const twice = useMemo(
    () => (model && template && preview ? savedDayTwice(open.date, from, dayTemplateAfter(templates, savedTemplate(template, from, preview.blocks, mode), dayTypeNow(model), open.date), template.id) : false),
    [model, template, preview, templates, from, mode, open.date]
  )
  const save = () =>
    run(async () => {
      commitActiveField()
      if (!template || !going) return
      const done = await saveAsTemplate({ date: open.date, ids: open.ids, templateId: template.id, from, mode, view })
      // Not saved (refused, a question, unreadable – the corner says why): the window stays, with what you chose.
      if (done.saved || done.unchanged) onClose()
    })
  // The blocks of the day the window is for (an id of the selection no longer in the plan is not one of them).
  const count = pick ? pick.take.length + pick.skipped.length : (open.ids?.length ?? 0)
  const title = open.ids ? `Zapisz ${groupCount(count, 'block')} jako szablon` : `Zapisz dzień ${plDate(open.date)} jako szablon`
  return (
    <Dialog
      title={title}
      onClose={onClose}
      wide
      data-testid="save-template"
      actions={
        <>
          <button type="button" className="btn btn-accent" disabled={busy || !template || !going} onClick={() => void save()} data-autofocus data-testid="save-template-apply">
            Zapisz
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
        </>
      }
    >
      {!model ? (
        <p className="text-[12.5px] text-muted" data-testid="save-template-wait">
          Liczę dzień…
        </p>
      ) : !list.length ? (
        <p className="text-[12.5px] text-muted" data-testid="save-template-none">
          Nie ma szablonów – dodasz je w „Szablonach”.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          <Field label="Szablon" labelWidth={110}>
            <Choice
              value={templateId}
              groups={DAY_TYPES.flatMap((type) => {
                const of = list.filter((t) => t.dayType === type)
                return of.length ? [{ label: DAY_TYPE_NAMES[type], options: of.map((t) => ({ value: t.id, label: t.name })) }] : []
              })}
              onChange={setChosen}
              aria-label="Szablon"
              data-testid="save-template-which"
            />
          </Field>
          <Field label="Bloki" labelWidth={110}>
            <Segmented
              value={mode}
              options={[
                { value: 'replace', label: 'Zastąp bloki szablonu' },
                { value: 'add', label: 'Dołóż' }
              ]}
              onChange={setMode}
              aria-label="Bloki szablonu"
              data-testid="save-template-mode"
            />
          </Field>
          <Field label="Od" labelWidth={110} hint="Dni przed tą datą się nie zmieniają.">
            <DateField today={today} value={from} onCommit={(d) => setFrom(d < tomorrow ? tomorrow : d)} shellClassName="w-[130px]" aria-label="Od" data-testid="save-template-from" />
          </Field>
          <p className="text-[12.5px]" data-testid="save-template-going">
            {going ? `Do szablonu „${template?.name ?? ''}” od ${plDayMonth(from)}: ${groupCount(going, 'block')}` : 'Nie ma bloków do zapisania.'}
            {mode === 'replace' && going > 0 ? ' – zastąpią bloki szablonu (jego sesje zostają).' : going > 0 ? ' – dojdą do bloków szablonu.' : ''}
          </p>
          {preview && preview.inTemplate > 0 && (
            <p className="text-[12px] text-muted" data-testid="save-template-in">
              {groupCount(preview.inTemplate, 'block')} już w szablonie – nie dojdą drugi raz.
            </p>
          )}
          {pick && skippedNote([...pick.skipped, ...(preview?.left ?? [])]) && (
            <p className="text-[12px] text-muted" data-testid="save-template-skipped">
              {skippedNote([...pick.skipped, ...(preview?.left ?? [])])}.
            </p>
          )}
          {twice && going > 0 && (
            <p className="rounded border border-line-strong bg-raised px-2.5 py-1.5 text-[12px]" role="status" data-testid="save-template-twice">
              Dzień {plDate(open.date)} też powstaje z tego szablonu od tej daty – jego bloki staną w nim drugi raz. Wybierz „Od” po tym dniu ({plDate(addDays(open.date, 1))}).
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}

/** The routine's form at the start (D618): the first block's name, the steps of the blocks that go. */
export function routineStart(model: Pick<DayModel, 'date' | 'state' | 'ctx'>, ids: readonly string[] | null, names: Names): { form: RoutineForm; clipped: number; cut: number; skipped: string | null } {
  const pick = pickOf(model, ids)
  const r = routineStepsOf(pick.take, (b) => blockName(b, names), () => newId(10))
  return { form: { name: r.steps[0]?.name ?? '', normal: r.steps, worse: [] }, clipped: r.clipped, cut: r.cut, skipped: skippedNote(pick.skipped) }
}

export function SaveAsRoutineDialog({ model, open, view, onClose }: { model: DayModel | null; open: SaveAsOpen; view: GroupView; onClose: () => void }) {
  const { rd, routines, requests } = useData()
  if (!model) {
    return (
      <Dialog title="Zapisz jako rutynę" onClose={onClose} wide centered data-testid="save-routine" actions={<SaveButtons busy ok={false} onSave={() => undefined} onClose={onClose} />}>
        <p className="text-[12.5px] text-muted">Liczę dzień…</p>
      </Dialog>
    )
  }
  const names: Names = { rd, settings: model.state.settings, routines, requests }
  return <RoutineSaveForm key={model.date} model={model} ids={open.ids} names={names} view={view} onClose={onClose} />
}

function RoutineSaveForm({ model, ids, names, view, onClose }: { model: DayModel; ids: readonly string[] | null; names: Names; view: GroupView; onClose: () => void }) {
  // Counted once, when the window opens: the form starts from it, and the notes beside it say what it started from (the day counted again every 30 s does not change them).
  const [start] = useState(() => routineStart(model, ids, names))
  const [form, set, ref] = useForm<RoutineForm>(start.form)
  const [busy, run] = useBusy()
  const save = () =>
    run(async () => {
      commitActiveField()
      const d = ref.current
      if (await saveAsRoutine({ name: d.name, normal: d.normal, worse: d.worse, view })) onClose()
    })
  const ok = form.name.trim() !== '' && form.normal.some((s) => s.name.trim())
  return (
    <Dialog title="Zapisz jako rutynę" onClose={onClose} wide centered data-testid="save-routine" actions={<SaveButtons busy={busy} ok={ok} onSave={() => void save()} onClose={onClose} />}>
      <div className="flex flex-col gap-2.5">
        <RoutineFields form={form} set={set} onEnter={() => void save()} />
        {start.skipped && <p className="text-[12px] text-muted" data-testid="save-routine-skipped">{start.skipped}.</p>}
        {start.clipped > 0 && <p className="text-[12px] text-muted">Krok ma najwyżej 4 h – {groupCount(start.clipped, 'block')} dłuższe dostały 4 h.</p>}
        {start.cut > 0 && <p className="text-[12px] text-muted">Rutyna ma najwyżej 40 kroków – pominięto {groupCount(start.cut, 'block')}.</p>}
        <p className="text-[12px] text-muted">Bloki dnia zostają, jakie są – rutynę wybierzesz w bloku w polu „Rutyna”.</p>
      </div>
    </Dialog>
  )
}
