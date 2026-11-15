/**
 * A routine's own cost per hour (D512) – one field and one save for „Rutyny” and for the window ✎ „Rutyna <nazwa>” of a block's panel (D514,
 * T1397): the label and window of a tile's cost (`TileCost`), „własny koszt rutyny” or „jak podkategoria” beside it. The save writes the
 * routine's record only: the main process, writing it with another cost, writes the day's `routine.cost` (T1430) – the engine counts the new
 * cost in today's begun blocks of the routine from that minute to their end, the minutes gone by by the old one; a block not begun takes the
 * routine's cost at its start anyway. The window neither reads the day nor writes events for it.
 */
import type { EditOutcome } from '@shared/api'
import { paths } from '@shared/data/paths'
import type { TileCost as TileCostInfo } from '@shared/model/blockCosts'
import type { CategoryRules, Costs } from '@shared/model/categories'
import { routineCostApplies, routineFrom, type Routine } from '@shared/model/routines'
import { Field } from '../../components/ui'
import { storedAnswer, tryUpdateRecord, type SaveAnswer, type SendState } from '../../store/data'
import { TileCost } from '../plan/TileCost'

const NO_COSTS: Costs = { head: 0, emotions: 0, senses: 0 }

/**
 * The cost of a routine as the field shows it (D512): its own, else – „jak podkategoria” – the cost of the category of routines (the first of
 * the kind „rutyna”, the block of a routine usually has it); the window's button gives the routine's own cost up.
 */
export function routineCostShown(routine: Pick<Routine, 'costs'>, categories: Readonly<Record<string, CategoryRules | undefined>>): TileCostInfo {
  const kind = Object.keys(categories).find((id) => routineCostApplies(categories, id))
  const base = (kind != null ? categories[kind]?.costs : undefined) ?? NO_COSTS
  return { costs: routine.costs ?? base, base, own: routine.costs != null, edit: true }
}

/**
 * The field „Koszt na godzinę” of a routine: `costs` – its own (null – none); `onChange` – what a click of the window does with the new one
 * (as `TileCost`: what became of its save; nothing – taken as written).
 */
export function RoutineCostField({ id, costs, categories, onChange }: { id: string; costs: Costs | null; categories: Readonly<Record<string, CategoryRules | undefined>>; onChange: (costs: Costs | null) => void | Promise<SaveAnswer> }) {
  return (
    <Field label="Koszt na godzinę" labelWidth={120} hint="Blok z tą rutyną kosztuje tyle, chyba że ma własny koszt. Bez kosztu rutyny – jak podkategoria (albo wariant) bloku.">
      <div className="flex items-center gap-2">
        <TileCost cost={routineCostShown({ costs }, categories)} id={id} testId="routine-cost" onChange={(c) => onChange(c)} />
        <span className="text-[12px] text-muted" data-testid="routine-cost-from">
          {costs ? 'własny koszt rutyny' : 'jak podkategoria'}
        </span>
      </div>
    </Field>
  )
}

export type RoutinePatch = Partial<Pick<Routine, 'name' | 'normal' | 'worse' | 'costs'>>

/**
 * The routine changed by `patch` over its record as it is when the change's turn comes (other fields of the file stay, T1368). A change of
 * its cost reaches today's begun blocks of it when the main process writes the record (`routine.cost`, T1430: also after an answer to a
 * question of a conflict, or once the folder is back). `out` – as `tryUpdateRecord`, `answer` – as `storedAnswer` (what a field of the cost
 * needs).
 */
export async function saveRoutineRecord(id: string, patch: RoutinePatch): Promise<{ out: EditOutcome[] | null; answer: SaveAnswer }> {
  const state: SendState = { afterSend: false }
  const out = await tryUpdateRecord(paths.record('routine', id), (raw) => (routineFrom(raw) ? { ...raw, ...patch } : raw), state)
  return { out, answer: storedAnswer(out, state) }
}
