/**
 * The editing panel of a block (D293: on the right of the plan): its own name (D430: „Nazwa” on top – empty, it is named as
 * before; a new block has the cursor in it), its category and variant, its start or the block it
 * follows („po sesji NY”), its end („Koniec”, D464: typed – the length changes; „ok. HH:MM” of the forecast after a block) and length, fixed or flexible, in the foreground or the background (no marks of a second
 * shift or a weekly analysis any more, D467), its routine, the computer recording a lecture, „Powtarzaj” (`repeat`, D381: a slot of the day's panel),
 * its list „Kroki” (`steps`, D440 – a slot of the screen, above the note), its note (a live Markdown editor, D388), its
 * attachments (`place`, D410). Every field saves on leaving it (spec „Edycja pól”); the panel changes nothing by itself.
 * A block of a series (`inSeries`, also the one edited in the list of „Szablony”) has its own hour and no marks: no „po bloku” (D401).
 * D480 (replaces the copy of D460): choosing a routine only points at it – its length goes with it, its steps never: a block
 * without steps of its own shows the routine's (D473, `model/routineSteps.ts`) until its day ticks one; a list of the block's own
 * (also a copy made by 1.20–1.21) stays as it is; „bez rutyny” leaves the steps.
 * D463: the lists „Podkategoria” (one list with a header for each category of the tree, D510), „Wariant” and „Rutyna” end with „+ Nowa…” – a window in the middle of the screen with all the fields of the thing
 * (`NewThingDialogs`); once saved, the new one is chosen in the block like one picked from the list (a field committed, D461) – a
 * variant and a category once the panel's data (`names`) have it. A variant and a category are made from today on, so a block
 * of a day gone by offers no „+ Nowa…” for them (its day would not have the new one); a routine is not dated – always.
 * D514: beside those lists ✎ (`edit-category`, `edit-variant`, `edit-routine`) once something is chosen – the same window filled with the thing
 * (`EditThingDialogs`), saved from today on; offered where „+ Nowa…” is (so not on a day gone by for a subcategory and a variant, nor in a panel
 * that cannot change), a routine's always; a subcategory and a variant only once they are there today (T1330: one of a later date is not
 * offered – the window shows and saves the settings of now). The window is the thing's it was opened for: a change of the block's choice
 * while it is open (another computer) closes it (T1332).
 * N6 (D625): under „Długość” – „zwykle trwa 45 min · Przyjmij” when the blocks of its subcategory finished in 90 days ran otherwise
 * (`useDurationHint`); „Przyjmij” is the change of the field. Also in „Szablony” and a series – the same panel.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { durationLabel, logicalClock } from '@shared/format'
import { groupOfCategory } from '@shared/model/categoryTree'
import { BLOCK_NAME_MAX, isSessionEntry, type PlanBlock } from '@shared/model/plan'
import { isBuffer } from '@shared/engine/decompress'
import { routineMinutes, type Routine } from '@shared/model/routines'
import type { SessionDef } from '@shared/model/settings'
import { SESSION_ANCHOR } from '@shared/engine/createDay'
import { olderComputers } from '@shared/model/note'
import { ownerToAdd, type BlockPlace } from '@shared/model/attachment'
import { forecastEndText } from '@shared/blockEnd'
import { blockSamples } from '@shared/durationHint'
import { Choice, DurationField, EndField, TextField, TimeField } from '../../components/fields'
import { HistoryButton } from '../../components/HistoryButton'
import { cx, Field, Segmented, SIDE_PANEL_WIDTH } from '../../components/ui'
import { useEscapeLayer } from '../../lib/escape'
import { useData, type SaveAnswer } from '../../store/data'
import { useDurationHint } from '../../store/durationHistory'
import { DurationHintLine } from './DurationHint'
import { useAttachDrop } from '../attachments/attachDrop'
import { AttachmentsSection } from '../attachments/AttachmentsSection'
import { blockHistoryRel } from '../history/historyTarget'
import { NoteEditor } from '../note/NoteEditor'
import { anchorCandidates, blockName, groupedCategoryOptions, type Names } from './blockView'
import { EditCategoryDialog, EditRoutineDialog, EditVariantDialog, useSettingsNow } from './EditThingDialogs'
import { NewCategoryDialog, NewRoutineDialog, NewVariantDialog } from './NewThingDialogs'

/** The last item of the lists „Podkategoria”, „Wariant”, „Rutyna” (D463): it makes a new one in a window and chooses it. */
const NEW_THING = '__new__'
const NEW_OPTION = { value: NEW_THING, label: '+ Nowa…' }

/** ✎ beside a list (D514): opens the window of „+ Nowa…” filled with what is chosen. */
function EditButton({ label, testId, onClick }: { label: string; testId: string; onClick: () => void }) {
  return (
    <button type="button" className="shrink-0 rounded border border-line px-1.5 py-1 text-[12px] leading-none text-muted hover:bg-hover hover:text-fg" aria-label={label} title={label} onClick={onClick} data-testid={testId}>
      ✎
    </button>
  )
}

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
  session,
  steps,
  inSeries,
  place,
  newBlock,
  focusName,
  forecastEnd,
  forecastStart,
  onEscape,
  day,
  dayNotes,
  historyOf,
  begun
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
  /** „Według czasu” and „pytaj rano” of a template's session (D511, `SessionFields`), above „Powtarzaj”. */
  session?: ReactNode
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
   * Enter only commits the name. `discards: false` – Esc would not throw it away (a field touched, a save started: `escapeDraft`), the
   * line under the heading then says only that it saves itself (D4).
   */
  newBlock?: { add: (name: string | null) => boolean | void; discards?: boolean }
  /** A block just made and saved at once (a click or a range on the axis of „Szablony”): the cursor starts in „Nazwa” too (D431). */
  focusName?: boolean
  /** Where the forecast ends a block that follows another („po bloku”, D464): its „Koniec” says „ok. HH:MM”; left out – no forecast (templates, series). */
  forecastEnd?: number | null
  /** Where the forecast starts a block that follows another (A2): „o godzinie” after „po bloku” keeps the block there; left out – 9:00. A day's axis and a template's give it. */
  forecastStart?: number | null
  /** Esc (the second one, after a field's own): left out – `onClose`. A new block not saved yet throws itself away by it (D461), „Zamknij” saves it. */
  onEscape?: () => void
  /**
   * The day of the block (a day's panel, also a new block's not saved yet): a day gone by has no „+ Nowa…” for a variant and a
   * category. Left out – the day of `place`, else none (a template, a series: used from today on).
   */
  day?: string
  /**
   * What the side panel says of the day (the warnings, a routine waiting – D3, D8) while this panel stands in its place: under the heading;
   * left out – nothing (templates, series).
   */
  dayNotes?: ReactNode
  /** The file of the record „Historia” opens when the place does not say it (a series: the part edited – `series/<id>.json`, UX18); a day's block has its day's plan. */
  historyOf?: string
  /** The block has begun (a day's panel: running, paused or over) – its length is a measure now, no hint from the history (T2933). */
  begun?: boolean
}) {
  useEscapeLayer(true, onEscape ?? onClose)
  const owner = place ? ownerToAdd(block, place) : null
  const drop = useAttachDrop(owner)
  const rules = names.settings.categories[block.categoryId]
  const variants = (rules?.variants ?? []).filter((v) => !v.archived || v.id === block.variantId)
  const set = (patch: Partial<PlanBlock>): void | Promise<SaveAnswer> => (readOnly ? undefined : onChange(patch))
  // D461: a new block saves itself at its first committed field – also one typed with the value it showed already (the start of a
  // draft put by „+ Blok” at the very hour you type).
  const commitSame = newBlock != null
  // A block of a series has its own hour (T707): nothing to follow.
  const anchors = inSeries
    ? []
    : [
        ...(sessions ?? []).map((s) => ({ value: `${SESSION_ANCHOR}${s.id}`, label: `po sesji ${s.name}` })),
        ...anchorCandidates(plan, block.id).map((b) => ({ value: b.id, label: `po: ${blockName(b, names)}${b.startMin != null ? ` (${logicalClock(b.startMin)})` : ''}` }))
      ]
  const routine = block.routine ? names.routines.find((r) => r.id === block.routine) : undefined
  const [making, setMaking] = useState<'routine' | 'variant' | 'category' | null>(null)
  const today = useData((s) => s.view?.today ?? '')
  const blockDay = day ?? (place?.scope === 'day' ? place.date : null)
  const historyRel = newBlock ? null : (historyOf ?? blockHistoryRel(place, day))
  // A variant and a category are made „od dziś”: a day gone by would not have them (T1067).
  const newDated = blockDay == null || (today !== '' && blockDay >= today)
  const newOption = (dated: boolean) => (readOnly || (dated && !newDated) ? [] : [NEW_OPTION])
  // D514: ✎ where „+ Nowa…” is, once something is chosen (a subcategory and a variant are edited from today on – none on a day gone by),
  // and only for a subcategory and a variant there are today (T1330): the panel's settings (a day to come, a template) may have one of a later date.
  const rulesNow = useSettingsNow().categories[block.categoryId]
  const canEdit = {
    category: !readOnly && newDated && rules != null && rulesNow != null,
    variant: !readOnly && newDated && block.variantId != null && variants.some((v) => v.id === block.variantId) && rulesNow?.variants.some((v) => v.id === block.variantId) === true,
    routine: !readOnly && routine != null
  }
  // T1332: the window ✎ opened is the thing's chosen then – once the block's choice is another (a change from another computer), it closes.
  const chosen = { category: block.categoryId, variant: block.variantId ? `${block.categoryId}/${block.variantId}` : null, routine: block.routine }
  const [editing, setEditing] = useState<{ kind: keyof typeof chosen; id: string } | null>(null)
  const edit = (kind: keyof typeof chosen) => {
    const id = chosen[kind]
    if (id) setEditing({ kind, id })
  }
  const editingNow = editing && chosen[editing.kind] === editing.id ? editing : null
  useEffect(() => {
    if (editing && !editingNow) setEditing(null)
  }, [editing, editingNow])
  const stopEditing = () => setEditing(null)
  // D480: the routine and its length – its steps are never copied (the block shows the routine's while it has none of its own).
  const pickRoutine = (r: Routine | undefined) => void set({ routine: r ? r.id : null, ...(r && routineMinutes(r) > 0 ? { durationMin: routineMinutes(r) } : {}) })
  // N6 (D625): „zwykle trwa … · Przyjmij” – not in a panel that cannot change, nor for a block of a day gone by (T2912: its length is history
  // too), nor one begun, a buffer of decompression (its length is the settings') or one whose length its schedule gives – a session, a
  // lecture, a class of a „zjazd”, a session's entry of a template (T2933).
  const scheduled = isBuffer(block) || block.origin === 'session' || block.origin === 'lecture' || block.origin === 'zjazd' || isSessionEntry(block)
  const durationHint = useDurationHint((h) => blockSamples(h, block.categoryId), block.durationMin, !readOnly && newDated && !begun && !scheduled)
  return (
    <aside className={cx('flex shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-panel p-3', SIDE_PANEL_WIDTH)} data-testid="block-editor" {...drop.bind}>
      <div className="flex items-center gap-2">
        {/* D4: a new block not saved yet is a draft – the heading says so (it is the block's name once saved). */}
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{newBlock ? 'Nowy blok' : blockName(block, names)}</h3>
        {/* UX18 (E7): the history of the record the block is in (its day, template or series); a block not saved yet has none. */}
        {historyRel && <HistoryButton rel={historyRel} className="text-[12px] text-muted hover:text-fg" />}
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={onClose} data-testid="block-editor-close">
          Zamknij
        </button>
      </div>
      {newBlock && (
        <p className="-mt-1 text-[11.5px] text-muted" data-testid="block-draft-hint">
          {newBlock.discards === false ? 'Zapisze się, gdy opuścisz panel' : 'Zapisze się, gdy opuścisz panel · Esc – odrzuć'}
        </p>
      )}
      {dayNotes}
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
      <Field label="Podkategoria" labelWidth={92}>
        <div className="flex items-center gap-1.5">
          <Choice
            value={block.categoryId}
            groups={groupedCategoryOptions(names, block.categoryId)}
            options={newOption(true)}
            onChange={(categoryId) => (categoryId === NEW_THING ? setMaking('category') : set({ categoryId, variantId: null }))}
            className="min-w-0 flex-1"
            aria-label="Podkategoria"
            data-testid="block-category"
          />
          {canEdit.category && <EditButton label="Edytuj podkategorię" testId="edit-category" onClick={() => edit('category')} />}
        </div>
      </Field>
      {variants.length > 0 && (
        <Field label="Wariant" labelWidth={92}>
          <div className="flex items-center gap-1.5">
            <Choice
              value={block.variantId ?? '-'}
              options={[{ value: '-', label: 'bez wariantu' }, ...variants.map((v) => ({ value: v.id, label: v.name })), ...newOption(true)]}
              onChange={(v) => (v === NEW_THING ? setMaking('variant') : set({ variantId: v === '-' ? null : v }))}
              className="min-w-0 flex-1"
              aria-label="Wariant"
              data-testid="block-variant"
            />
            {canEdit.variant && <EditButton label="Edytuj wariant" testId="edit-variant" onClick={() => edit('variant')} />}
          </div>
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
            onChange={(v) => (v === 'at' ? set({ anchor: null, startMin: block.startMin ?? forecastStart ?? 9 * 60 }) : set({ anchor: anchors[0]!.value, startMin: null }))}
            aria-label="Początek"
          />
          {block.anchor ? (
            <Choice value={block.anchor} options={anchors} onChange={(anchor) => set({ anchor })} aria-label="Po bloku" data-testid="block-anchor" />
          ) : (
            <TimeField value={block.startMin} onCommit={(startMin) => set({ startMin })} commitSame={commitSame} aria-label="Godzina początku" errorPlacement="below" data-testid="block-start" />
          )}
        </div>
      </Field>
      <Field label="Koniec" labelWidth={92}>
        {block.anchor || block.startMin == null ? (
          <span className="num text-[12.5px] text-muted" data-testid="block-end-forecast">
            {forecastEndText(forecastEnd) ?? '—'}
          </span>
        ) : (
          <EndField startMin={block.startMin} durationMin={block.durationMin} onCommit={(durationMin) => set({ durationMin })} commitSame={commitSame} aria-label="Godzina końca" errorPlacement="below" data-testid="block-end" />
        )}
      </Field>
      <Field label="Długość" labelWidth={92} hint={routine ? `Rutyna: ${durationLabel(routineMinutes(routine))} (zwykła), ${durationLabel(routineMinutes(routine, 'worse'))} (na gorsze dni).` : undefined}>
        <DurationField value={block.durationMin} onCommit={(durationMin) => set({ durationMin })} commitSame={commitSame} aria-label="Długość" errorPlacement="below" data-testid="block-duration" />
        {/* N6 (D625): how long the blocks of its subcategory really ran – „Przyjmij” is the change of the field. */}
        {durationHint && <DurationHintLine hint={durationHint} onAccept={(durationMin) => void set({ durationMin })} className="mt-1" />}
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
          <div className="flex items-center gap-1.5">
            <Choice
              value={block.routine ?? '-'}
              options={[{ value: '-', label: 'bez rutyny' }, ...names.routines.filter((r) => !r.archived || r.id === block.routine).map((r) => ({ value: r.id, label: r.name })), ...newOption(false)]}
              onChange={(v) => (v === NEW_THING ? setMaking('routine') : pickRoutine(names.routines.find((x) => x.id === v)))}
              className="min-w-0 flex-1"
              aria-label="Rutyna"
              data-testid="block-routine"
            />
            {canEdit.routine && <EditButton label="Edytuj rutynę" testId="edit-routine" onClick={() => edit('routine')} />}
          </div>
        </Field>
      )}
      {rules?.kind === 'lecture' && (
        <Field label="Nagrywa" labelWidth={92}>
          <Choice value={block.recorder ?? '-'} options={[{ value: '-', label: 'nie wskazano' }, ...computers.map((c) => ({ value: c.id, label: c.name }))]} onChange={(v) => set({ recorder: v === '-' ? null : v })} aria-label="Komputer nagrywający" />
        </Field>
      )}
      {session}
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
          costs={rules?.costs ?? { head: 1, emotions: 1, senses: 1, body: 0 }}
          has={(variantId) => (names.settings.categories[block.categoryId]?.variants ?? []).some((v) => v.id === variantId)}
          onClose={() => setMaking(null)}
          onCreated={(variantId) => {
            setMaking(null)
            void set({ variantId })
          }}
        />
      )}
      {making === 'category' && (
        <NewCategoryDialog
          defaultGroup={groupOfCategory(names.rd, block.categoryId)}
          has={(categoryId) => names.settings.categories[categoryId] != null}
          onClose={() => setMaking(null)}
          onCreated={(categoryId) => {
            setMaking(null)
            void set({ categoryId, variantId: null })
          }}
        />
      )}
      {/* D514: the same windows filled with the thing chosen – a change changes no choice of the block; one window a thing (its key, T1332). */}
      {editingNow?.kind === 'routine' && block.routine && <EditRoutineDialog key={editingNow.id} routineId={block.routine} onClose={stopEditing} />}
      {editingNow?.kind === 'variant' && block.variantId && <EditVariantDialog key={editingNow.id} categoryId={block.categoryId} variantId={block.variantId} onClose={stopEditing} />}
      {editingNow?.kind === 'category' && <EditCategoryDialog key={editingNow.id} categoryId={block.categoryId} onClose={stopEditing} />}
    </aside>
  )
}
