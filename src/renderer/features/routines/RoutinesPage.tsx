/**
 * Rutyny (spec „Rutyna”): a sequence of steps with the time of each, in two versions – the usual one and one for worse
 * days. You set the order here; the app never changes it, at most it moves the whole routine in time. A block of the
 * plan points at its routine (the panel of a block of the „Rutyny” category). Ctrl+N makes a new routine. D512: the routine's own cost
 * per hour – the label and window of a tile's cost (`TileCost`), or none („jak podkategoria”).
 */
import { useEffect, useMemo, useState } from 'react'
import { paths } from '@shared/data/paths'
import { durationLabel } from '@shared/format'
import type { TileCost as TileCostInfo } from '@shared/model/blockCosts'
import type { CategoryRules, Costs } from '@shared/model/categories'
import { newId } from '@shared/model/ids'
import { ROUTINE_SCHEMA, routineFrom, routineMinutes, type Routine, type RoutineVersion } from '@shared/model/routines'
import { settingsOn } from '@shared/model/settings'
import { TextField } from '../../components/fields'
import { EmptyState, Field, cx } from '../../components/ui'
import { TileCost } from '../plan/TileCost'
import { RoutineSteps } from './RoutineSteps'
import { saveRecord, storedAnswer, tryRemoveRecord, tryUpdateRecord, updateRecord, useData, type SaveAnswer, type SendState } from '../../store/data'
import { useNewShortcut } from '../../lib/escape'
import { removeTarget, useDeleteResolver } from '../../lib/deleteKey'
import { takeFoundPick, undoToast, useUi } from '../../store/ui'

/** The routine leaves (with „Cofnij”): the one code of „Usuń” and of Del (D462). */
async function removeRoutine(routine: Routine): Promise<boolean> {
  const rel = paths.record('routine', routine.id)
  const { saved, before } = await tryRemoveRecord(rel)
  if (!saved) return false
  undoToast(`Usunięta rutyna: ${routine.name}`, () => void saveRecord(rel, null, before))
  return true
}

const NO_COSTS: Costs = { head: 0, emotions: 0, senses: 0 }

/**
 * The cost of a routine as „Rutyny” shows it (D512): its own, else – „jak podkategoria” – the cost of the category of routines (the first of
 * the kind „rutyna”, the block of a routine usually has it); the window's button gives the routine's own cost up.
 */
export function routineCostShown(routine: Pick<Routine, 'costs'>, categories: Readonly<Record<string, CategoryRules | undefined>>): TileCostInfo {
  const base = Object.values(categories).find((c) => c?.kind === 'routine')?.costs ?? NO_COSTS
  return { costs: routine.costs ?? base, base, own: routine.costs != null, edit: true }
}

export function RoutinesPage() {
  const routines = useData((s) => s.routines)
  const [selected, setSelected] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const create = async () => {
    const id = newId()
    await saveRecord(paths.record('routine', id), null, { schema: ROUTINE_SCHEMA, id, name: 'Nowa rutyna', normal: [{ id: newId(10), name: '', min: 5 }], worse: [], archived: false })
    setSelected(id)
  }
  useNewShortcut(() => void create())
  // A routine picked in the search (Ctrl K): open for editing once (an archived one shows with the archive).
  const pick = useUi((s) => s.pick)
  useEffect(() => {
    const p = takeFoundPick((x) => x.kind === 'routine', (x) => routines.some((r) => r.id === x.id), 'Tej rutyny nie ma już.')
    if (!p) return
    setSelected(p.id)
    if (routines.find((r) => r.id === p.id)?.archived) setShowArchived(true)
  }, [pick, routines])
  const list = routines.filter((r) => showArchived || !r.archived).sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  const current = routines.find((r) => r.id === selected) ?? null
  // D462: Del on the selected routine (its row of the list, clicked) removes it, as „Usuń” does; a row only focused (Tab) is
  // not selected – nothing.
  const targetOf = (r: Routine) => removeTarget(r.name, async () => void ((await removeRoutine(r)) && setSelected((now) => (now === r.id ? null : now))))
  useDeleteResolver('routine', (id) => {
    const r = id === selected ? routines.find((x) => x.id === id) : undefined
    return r ? targetOf(r) : null
  })
  return (
    <div className="flex min-h-0 flex-1" data-testid="routines">
      <div className="flex w-[280px] shrink-0 flex-col gap-2 border-r border-line p-3">
        <button type="button" className="btn btn-accent" onClick={() => void create()} data-testid="routine-new">
          + Rutyna
        </button>
        {list.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelected(r.id)}
            data-del={`routine:${r.id}`}
            className={cx('flex flex-col rounded border px-2.5 py-1.5 text-left', selected === r.id ? 'border-lamp bg-lamp-soft' : 'border-line hover:bg-hover', r.archived && 'border-dashed text-muted')}
            data-testid="routine-item"
          >
            <span>{r.name}</span>
            <span className="text-[11.5px] text-muted">
              {durationLabel(routineMinutes(r))}
              {r.worse.length ? ` · na gorsze dni ${durationLabel(routineMinutes(r, 'worse'))}` : ''}
              {r.archived ? ' · w archiwum' : ''}
            </span>
          </button>
        ))}
        {routines.some((r) => r.archived) && (
          <button type="button" className="text-left text-[12px] text-muted hover:text-fg" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Ukryj archiwum' : 'Pokaż archiwum'}
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {current ? <Editor routine={current} onRemoved={() => setSelected(null)} /> : <EmptyState why={routines.length ? 'Wybierz rutynę z listy.' : 'Nie ma jeszcze rutyn. Rutyna to kroki z czasem każdego – np. poranna: woda, karmienie kota, prysznic.'} action={{ label: '+ Rutyna', run: () => void create() }} />}
      </div>
    </div>
  )
}

function Editor({ routine, onRemoved }: { routine: Routine; onRemoved: () => void }) {
  const rel = paths.record('routine', routine.id)
  const rd = useData((s) => s.rd)
  const today = useData((s) => s.view?.today ?? '')
  const categories = useMemo(() => settingsOn(rd.settings, today).categories, [rd.settings, today])
  /** D512: the routine's own cost (null – none, „jak podkategoria”) over the record as it is when the change's turn comes; what became of it. */
  const saveCosts = (costs: Costs | null): Promise<SaveAnswer> => {
    const state: SendState = { afterSend: false }
    return tryUpdateRecord(rel, (raw) => (routineFrom(raw) ? { ...raw, costs } : raw), state).then((out) => storedAnswer(out, state))
  }
  /** The routine changed by `fn` from what it is when the change's turn comes (A6-01). */
  const change = (fn: (r: Routine) => Partial<Routine>) =>
    void updateRecord(rel, (raw) => {
      const r = routineFrom(raw)
      return r ? { ...raw, ...fn(r) } : raw
    })
  const save = (patch: Partial<Routine>) => change(() => patch)
  const remove = async () => {
    if (await removeRoutine(routine)) onRemoved()
  }
  return (
    <div className="flex max-w-[860px] flex-col gap-4" data-testid="routine-editor">
      <div className="flex items-center gap-2">
        <TextField value={routine.name} onCommit={(name) => save({ name })} required max={80} shellClassName="max-w-[320px]" className="text-[14px]" aria-label="Nazwa rutyny" data-testid="routine-name" />
        <span className="flex-1" />
        <button type="button" className="btn" onClick={() => save({ archived: !routine.archived })}>
          {routine.archived ? 'Przywróć z archiwum' : 'Archiwizuj'}
        </button>
        <button type="button" className="btn" onClick={() => void remove()} data-testid="routine-remove">
          Usuń
        </button>
      </div>
      <Field label="Koszt na godzinę" labelWidth={120} hint="Blok z tą rutyną kosztuje tyle, chyba że ma własny koszt. Bez kosztu rutyny – jak podkategoria (albo wariant) bloku.">
        <div className="flex items-center gap-2">
          <TileCost cost={routineCostShown(routine, categories)} id={`routine:${routine.id}`} testId="routine-cost" onChange={(costs) => saveCosts(costs)} />
          <span className="text-[12px] text-muted" data-testid="routine-cost-from">
            {routine.costs ? 'własny koszt rutyny' : 'jak podkategoria'}
          </span>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        {(['normal', 'worse'] as RoutineVersion[]).map((v) => (
          <RoutineSteps key={v} version={v} steps={routine[v]} onChange={(fn) => change((r) => ({ [v]: fn(r[v]) }))} />
        ))}
      </div>
      <p className="text-[12px] text-muted">Kroki odhaczasz po powrocie do komputera – w pasku („✓ Wszystkie · Kroki ▸ · gorsze dni”) albo na karcie w „Dziś”; tam jednym kliknięciem wybierasz też wersję. Wersja na gorsze dni bez kroków znaczy: jak zwykła.</p>
    </div>
  )
}
