/**
 * The editing panel of a block (D293: on the right of the plan): its category and variant, its start or the block it
 * follows („po sesji NY”), its length, fixed or flexible, in the foreground or the background, the marks of the second
 * shift and the weekly analysis, its routine, the computer recording a lecture, its note. Every field saves on leaving
 * it (spec „Edycja pól”); the panel changes nothing by itself.
 */
import type { ReactNode } from 'react'
import { durationLabel, logicalClock } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import { routineMinutes } from '@shared/model/routines'
import type { SessionDef } from '@shared/model/settings'
import { SESSION_ANCHOR } from '@shared/engine/createDay'
import { Choice, DurationField, TextField, TimeField } from '../../components/fields'
import { Field, Segmented } from '../../components/ui'
import { useEscapeLayer } from '../../lib/escape'
import { anchorCandidates, blockName, categoryOptions, type Names } from './blockView'

export function BlockEditor({
  block,
  plan,
  names,
  computers,
  sessions,
  onChange,
  onClose,
  actions,
  readOnly
}: {
  block: PlanBlock
  plan: readonly PlanBlock[]
  names: Names
  computers: Array<{ id: string; name: string }>
  /** In a template a block may follow a session of the layer („po sesji NY”). */
  sessions?: readonly SessionDef[]
  /** The fields changed (over the block as it is when the change is saved – a change made a moment before stays). */
  onChange: (patch: Partial<PlanBlock>) => void
  onClose: () => void
  actions?: ReactNode
  readOnly?: boolean
}) {
  useEscapeLayer(true, onClose)
  const rules = names.settings.categories[block.categoryId]
  const variants = (rules?.variants ?? []).filter((v) => !v.archived || v.id === block.variantId)
  const set = (patch: Partial<PlanBlock>) => !readOnly && onChange(patch)
  const anchors = [
    ...(sessions ?? []).map((s) => ({ value: `${SESSION_ANCHOR}${s.id}`, label: `po sesji ${s.name}` })),
    ...anchorCandidates(plan, block.id).map((b) => ({ value: b.id, label: `po: ${blockName(b, names)}${b.startMin != null ? ` (${logicalClock(b.startMin)})` : ''}` }))
  ]
  const routine = block.routine ? names.routines.find((r) => r.id === block.routine) : undefined
  return (
    <aside className="flex w-[320px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-panel p-3" data-testid="block-editor">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{blockName(block, names)}</h3>
        <button type="button" className="text-[12px] text-muted hover:text-fg" onClick={onClose} data-testid="block-editor-close">
          Zamknij
        </button>
      </div>
      <Field label="Kategoria" labelWidth={92}>
        <Choice value={block.categoryId} options={categoryOptions(names, block.categoryId)} onChange={(categoryId) => set({ categoryId, variantId: null })} aria-label="Kategoria" data-testid="block-category" />
      </Field>
      {variants.length > 0 && (
        <Field label="Wariant" labelWidth={92}>
          <Choice
            value={block.variantId ?? '-'}
            options={[{ value: '-', label: 'bez wariantu' }, ...variants.map((v) => ({ value: v.id, label: v.name }))]}
            onChange={(v) => set({ variantId: v === '-' ? null : v })}
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
            <TimeField value={block.startMin} onCommit={(startMin) => set({ startMin })} aria-label="Godzina początku" data-testid="block-start" />
          )}
        </div>
      </Field>
      <Field label="Długość" labelWidth={92} hint={routine ? `Rutyna: ${durationLabel(routineMinutes(routine))} (zwykła), ${durationLabel(routineMinutes(routine, 'worse'))} (na gorsze dni).` : undefined}>
        <DurationField value={block.durationMin} onCommit={(durationMin) => set({ durationMin })} aria-label="Długość" data-testid="block-duration" />
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
      {rules?.cls === 'work' && (
        <Field label="Oznaczenie" labelWidth={92} hint={block.tag ? 'Czeka na „Zacznij”.' : undefined}>
          <div className="flex flex-col gap-1.5">
            <Segmented
              value={block.tag ?? 'none'}
              options={[
                { value: 'none', label: 'brak' },
                { value: 'secondShift', label: 'druga zmiana' },
                { value: 'weeklyAnalysis', label: 'analiza tygodniowa' }
              ]}
              onChange={(v) => set({ tag: v === 'none' ? null : v, waitUntilMin: v === 'weeklyAnalysis' ? (block.waitUntilMin ?? 15 * 60) : null })}
              aria-label="Oznaczenie"
              data-testid="block-tag"
            />
            {block.tag === 'weeklyAnalysis' && (
              <label className="flex items-center gap-2 text-[12px] text-muted">
                czeka do
                <TimeField value={block.waitUntilMin} onCommit={(waitUntilMin) => set({ waitUntilMin })} aria-label="Czeka do" className="w-[90px]" />
              </label>
            )}
          </div>
        </Field>
      )}
      {rules?.kind === 'routine' && (
        <Field label="Rutyna" labelWidth={92}>
          <Choice
            value={block.routine ?? '-'}
            options={[{ value: '-', label: 'bez rutyny' }, ...names.routines.filter((r) => !r.archived || r.id === block.routine).map((r) => ({ value: r.id, label: r.name }))]}
            onChange={(v) => {
              const r = names.routines.find((x) => x.id === v)
              set({ routine: r ? r.id : null, ...(r && routineMinutes(r) > 0 ? { durationMin: routineMinutes(r) } : {}) })
            }}
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
      <Field label="Notatka" labelWidth={92}>
        <TextField value={block.note} onCommit={(note) => set({ note })} max={2000} multiline aria-label="Notatka" data-testid="block-note" />
      </Field>
      {block.moves > 0 && <p className="text-[12px] text-muted">Przeniesiony {block.moves}×.</p>}
      {actions && <div className="flex flex-wrap gap-2 border-t border-line pt-3">{actions}</div>}
    </aside>
  )
}
