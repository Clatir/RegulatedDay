/**
 * The editing panel of a block (D293: on the right of the plan): its own name (D430: „Nazwa” on top – empty, it is named as
 * before; a new block has the cursor in it), its category and variant, its start or the block it
 * follows („po sesji NY”), its end („Koniec”, D464: typed – the length changes; „ok. HH:MM” of the forecast after a block) and length, fixed or flexible, in the foreground or the background, the marks of the second
 * shift and the weekly analysis, its routine, the computer recording a lecture, „Powtarzaj” (`repeat`, D381: a slot of the day's panel),
 * its list „Kroki” (`steps`, D440 – a slot of the screen, above the note), its note (a live Markdown editor, D388), its
 * attachments (`place`, D410). Every field saves on leaving it (spec „Edycja pól”); the panel changes nothing by itself.
 * A block of a series (`inSeries`, also the one edited in the list of „Szablony”) has its own hour and no marks: no „po bloku”, no „Oznaczenie” (D401).
 * D460: choosing a routine copies its usual steps into „Kroki” in the same change (`routineStepsCopy`) – a block of a task
 * keeps its list (it goes with the task's, T792); „bez rutyny” leaves the steps.
 * D463: the lists „Kategoria”, „Wariant” and „Rutyna” end with „+ Nowa…” – a window in the middle of the screen with all the fields of the thing
 * (`NewThingDialogs`); once saved, the new one is chosen in the block like one picked from the list (a field committed, D461).
 */
import { useState, type ReactNode } from 'react'
import { durationLabel, logicalClock } from '@shared/format'
import { BLOCK_NAME_MAX, type PlanBlock } from '@shared/model/plan'
import { routineMinutes, type Routine } from '@shared/model/routines'
import { routineStepsCopy } from '@shared/model/steps'
import type { SessionDef } from '@shared/model/settings'
import { SESSION_ANCHOR } from '@shared/engine/createDay'
import { olderComputers } from '@shared/model/note'
import { ownerToAdd, type BlockPlace } from '@shared/model/attachment'
import { forecastEndText } from '@shared/blockEnd'
import { Choice, DurationField, EndField, TextField, TimeField } from '../../components/fields'
import { Field, Segmented } from '../../components/ui'
import { useEscapeLayer } from '../../lib/escape'
import type { SaveAnswer } from '../../store/data'
import { toast } from '../../store/ui'
import { useAttachDrop } from '../attachments/attachDrop'
import { routineCutText } from '../steps/stepsUi'
import { AttachmentsSection } from '../attachments/AttachmentsSection'
import { NoteEditor } from '../note/NoteEditor'
import { anchorCandidates, blockName, categoryOptions, type Names } from './blockView'
import { NewCategoryDialog, NewRoutineDialog, NewVariantDialog } from './NewThingDialogs'

/** The last item of the lists „Kategoria”, „Wariant”, „Rutyna” (D463): it makes a new one in a window and chooses it. */
const NEW_THING = '__new__'
const NEW_OPTION = { value: NEW_THING, label: '+ Nowa…' }

export function BlockEditor({
  block,
  plan,
  names,
  computers,
  sessions,
  onChange,
  onClose,
  actions,
  readOnly,
  repeat,
  steps,
  inSeries,
  place,
  newBlock,
  focusName,
  forecastEnd,
  onEscape
}: {
  block: PlanBlock
  plan: readonly PlanBlock[]
  names: Names
  computers: Array<{ id: string; name: string; appVersion?: string }>
  /** In a template a block may follow a session of the layer („po sesji NY”). */
  sessions?: readonly SessionDef[]
  /** The fields changed (over the block as it is when the change is saved – a change made a moment before stays); answers whether it was saved when it can say (the note puts back what it shows when it was not). */
  onChange: (patch: Partial<PlanBlock>) => void | Promise<SaveAnswer>
  onClose: () => void
  actions?: ReactNode
  readOnly?: boolean
  /** The field „Powtarzaj” (a series' fields), above the note. */
  repeat?: ReactNode
  /** The list „Kroki” (`StepsEditor`, D440), above the note – the screen saves its changes (a day's block, a template's, a series'). */
  steps?: ReactNode
  /** The block is an occurrence of a series (or the series' own block): it keeps its own hour and carries no mark. */
  inSeries?: boolean
  /**
   * Where the block is shown (the day with its template, a template, a series): its „Załączniki” (D410). Left out – none (a block
   * not saved yet has nothing to attach to). Files and links dropped on the panel go to it.
   */
  place?: BlockPlace
  /**
   * A new block not saved yet (before „Dodaj”): the cursor starts in „Nazwa” (D430), Enter there adds it as „Dodaj” does, with
   * the name typed (`add`, D431; `false` – refused, a save running: the cursor stays, T1028). Left out – an existing block:
   * Enter only commits the name.
   */
  newBlock?: { add: (name: string | null) => boolean | void }
  /** A block just made and saved at once (a click or a range on the axis of „Szablony”): the cursor starts in „Nazwa” too (D431). */
  focusName?: boolean
  /** Where the forecast ends a block that follows another („po bloku”, D464): its „Koniec” says „ok. HH:MM”; left out – no forecast (templates, series). */
  forecastEnd?: number | null
  /** Esc (the second one, after a field's own): left out – `onClose`. A new block not saved yet throws itself away by it (D461), „Zamknij” saves it. */
  onEscape?: () => void
}) {
  useEscapeLayer(true, onEscape ?? onClose)
  const owner = place ? ownerToAdd(block, place) : null
  const drop = useAttachDrop(owner)
  const rules = names.settings.categories[block.categoryId]
  const variants = (rules?.variants ?? []).filter((v) => !v.archived || v.id === block.variantId)
  const set = (patch: Partial<PlanBlock>): void | Promise<SaveAnswer> => (readOnly ? undefined : onChange(patch))
  // A block of a series has its own hour (T707): nothing to follow.
  const anchors = inSeries
    ? []
    : [
        ...(sessions ?? []).map((s) => ({ value: `${SESSION_ANCHOR}${s.id}`, label: `po sesji ${s.name}` })),
        ...anchorCandidates(plan, block.id).map((b) => ({ value: b.id, label: `po: ${blockName(b, names)}${b.startMin != null ? ` (${logicalClock(b.startMin)})` : ''}` }))
      ]
  const routine = block.routine ? names.routines.find((r) => r.id === block.routine) : undefined
  const [making, setMaking] = useState<'routine' | 'variant' | 'category' | null>(null)
  // D460: its steps with the routine, as one change of the block (the copy of the routine chosen before is replaced).
  const pickRoutine = (r: Routine | undefined) => {
    const was = block.routine ? names.routines.find((x) => x.id === block.routine) : null
    const copy = r && !block.task && r.normal.length ? routineStepsCopy(block.steps, was, r) : null
    const out = set({ routine: r ? r.id : null, ...(r && routineMinutes(r) > 0 ? { durationMin: routineMinutes(r) } : {}), ...(copy ? { steps: copy.steps } : {}) })
    if (copy?.cut) void Promise.resolve(out).then((saved) => saved !== false && toast(routineCutText(copy.cut), 'info', 6000))
  }
  return (
    <aside className="flex w-[320px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-panel p-3" data-testid="block-editor" {...drop.bind}>
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{blockName(block, names)}</h3>
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={onClose} data-testid="block-editor-close">
          Zamknij
        </button>
      </div>
      {/* D430: its own name, as the title of an event; empty – named as before (the placeholder says how). */}
      <Field label="Nazwa" labelWidth={92}>
        <TextField
          value={block.name ?? ''}
          max={BLOCK_NAME_MAX}
          placeholder={blockName({ ...block, name: null }, names)}
          onCommit={(v) => void set({ name: v || null })}
          readOnly={readOnly}
          autoFocus={newBlock != null || focusName === true}
          onEnter={newBlock ? (v) => newBlock.add(v || null) : undefined}
          errorPlacement="below"
          aria-label="Nazwa bloku"
          data-testid="block-name"
        />
      </Field>
      <Field label="Kategoria" labelWidth={92}>
        <Choice
          value={block.categoryId}
          options={[...categoryOptions(names, block.categoryId), ...(readOnly ? [] : [NEW_OPTION])]}
          onChange={(categoryId) => (categoryId === NEW_THING ? setMaking('category') : set({ categoryId, variantId: null }))}
          aria-label="Kategoria"
          data-testid="block-category"
        />
      </Field>
      {variants.length > 0 && (
        <Field label="Wariant" labelWidth={92}>
          <Choice
            value={block.variantId ?? '-'}
            options={[{ value: '-', label: 'bez wariantu' }, ...variants.map((v) => ({ value: v.id, label: v.name })), ...(readOnly ? [] : [NEW_OPTION])]}
            onChange={(v) => (v === NEW_THING ? setMaking('variant') : set({ variantId: v === '-' ? null : v }))}
            aria-label="Wariant"
            data-testid="block-variant"
          />
        </Field>
      )}
      <Field label="Początek" labelWidth={92}>
        <div className="flex flex-col gap-1.5">
          <Segmented
            value={block.anchor ? 'after' : 'at'}
            options={[
              { value: 'at', label: 'o godzinie' },
              { value: 'after', label: 'po bloku', disabled: anchors.length === 0 }
            ]}
            onChange={(v) => (v === 'at' ? set({ anchor: null, startMin: block.startMin ?? 9 * 60 }) : set({ anchor: anchors[0]!.value, startMin: null }))}
            aria-label="Początek"
          />
          {block.anchor ? (
            <Choice value={block.anchor} options={anchors} onChange={(anchor) => set({ anchor })} aria-label="Po bloku" data-testid="block-anchor" />
          ) : (
            <TimeField value={block.startMin} onCommit={(startMin) => set({ startMin })} aria-label="Godzina początku" errorPlacement="below" data-testid="block-start" />
          )}
        </div>
      </Field>
      <Field label="Koniec" labelWidth={92}>
        {block.anchor || block.startMin == null ? (
          <span className="num text-[12.5px] text-muted" data-testid="block-end-forecast">
            {forecastEndText(forecastEnd) ?? '—'}
          </span>
        ) : (
          <EndField startMin={block.startMin} durationMin={block.durationMin} onCommit={(durationMin) => set({ durationMin })} aria-label="Godzina końca" errorPlacement="below" data-testid="block-end" />
        )}
      </Field>
      <Field label="Długość" labelWidth={92} hint={routine ? `Rutyna: ${durationLabel(routineMinutes(routine))} (zwykła), ${durationLabel(routineMinutes(routine, 'worse'))} (na gorsze dni).` : undefined}>
        <DurationField value={block.durationMin} onCommit={(durationMin) => set({ durationMin })} aria-label="Długość" errorPlacement="below" data-testid="block-duration" />
      </Field>
      <Field label="Rodzaj" labelWidth={92} hint={block.fixed ? 'Stały: zaczyna się o swojej godzinie.' : 'Elastyczny: idzie za końcem poprzedniego bloku, nie wcześniej niż o swojej godzinie.'}>
        <Segmented
          value={block.fixed ? 'fixed' : 'flex'}
          options={[
            { value: 'flex', label: 'elastyczny' },
            { value: 'fixed', label: 'stały' }
          ]}
          onChange={(v) => set({ fixed: v === 'fixed' })}
          aria-label="Rodzaj"
          data-testid="block-fixed"
        />
      </Field>
      {(rules?.background || block.fixed) && (
        <Field label="Miejsce" labelWidth={92}>
          <Segmented
            value={(block.background ?? rules?.startsInBackground ?? false) ? 'bg' : 'fg'}
            options={[
              { value: 'fg', label: 'pierwszy plan' },
              { value: 'bg', label: 'w tle' }
            ]}
            onChange={(v) => set({ background: v === 'bg' })}
            aria-label="Miejsce"
          />
        </Field>
      )}
      {rules?.kind === 'routine' && (
        <Field label="Rutyna" labelWidth={92}>
          <Choice
            value={block.routine ?? '-'}
            options={[{ value: '-', label: 'bez rutyny' }, ...names.routines.filter((r) => !r.archived || r.id === block.routine).map((r) => ({ value: r.id, label: r.name })), ...(readOnly ? [] : [NEW_OPTION])]}
            onChange={(v) => (v === NEW_THING ? setMaking('routine') : pickRoutine(names.routines.find((x) => x.id === v)))}
            aria-label="Rutyna"
            data-testid="block-routine"
          />
        </Field>
      )}
      {rules?.kind === 'lecture' && (
        <Field label="Nagrywa" labelWidth={92}>
          <Choice value={block.recorder ?? '-'} options={[{ value: '-', label: 'nie wskazano' }, ...computers.map((c) => ({ value: c.id, label: c.name }))]} onChange={(v) => set({ recorder: v === '-' ? null : v })} aria-label="Komputer nagrywający" />
        </Field>
      )}
      {repeat}
      {steps}
      <NoteEditor value={block.note} onCommit={(note) => set({ note })} olderComputers={olderComputers(computers)} readOnly={readOnly} />
      {place && <AttachmentsSection block={block} place={place} owner={owner} dropOver={drop.over} />}
      {block.moves > 0 && <p className="text-[12px] text-muted">Przeniesiony {block.moves}×.</p>}
      {actions && <div className="flex flex-wrap gap-2 border-t border-line pt-3">{actions}</div>}
      {/* D463: the windows of „+ Nowa…” (over the page: `fixed`, in the middle of the screen). */}
      {making === 'routine' && (
        <NewRoutineDialog
          onClose={() => setMaking(null)}
          onCreated={(r) => {
            setMaking(null)
            pickRoutine(r)
          }}
        />
      )}
      {making === 'variant' && (
        <NewVariantDialog
          categoryId={block.categoryId}
          costs={rules?.costs ?? { head: 1, emotions: 1, senses: 1 }}
          onClose={() => setMaking(null)}
          onCreated={(variantId) => {
            setMaking(null)
            void set({ variantId })
          }}
        />
      )}
      {making === 'category' && (
        <NewCategoryDialog
          onClose={() => setMaking(null)}
          onCreated={(categoryId) => {
            setMaking(null)
            void set({ categoryId, variantId: null })
          }}
        />
      )}
    </aside>
  )
}
