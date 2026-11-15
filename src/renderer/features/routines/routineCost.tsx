/**
 * A routine's own cost per hour (D512) – one field and one save for „Rutyny” and for the window ✎ „Rutyna <nazwa>” of a block's panel (D514,
 * T1397): the label and window of a tile's cost (`TileCost`), „własny koszt rutyny” or „jak podkategoria” beside it. The save writes the
 * routine's record and then, the record saved, reaches today's begun blocks of the routine from this moment on (T1395): one
 * `block.routineCost` for each block `routineCostTargets` finds in today's log as it is then – the engine counts the new cost from that
 * minute to the block's end, the minutes gone by by the old one; a block not begun takes the routine's cost at its start anyway.
 */
import type { EditOutcome } from '@shared/api'
import { paths } from '@shared/data/paths'
import { routineCostTargets } from '@shared/engine/costChange'
import type { TileCost as TileCostInfo } from '@shared/model/blockCosts'
import type { CategoryRules, Costs } from '@shared/model/categories'
import { routineFrom, type Routine } from '@shared/model/routines'
import { logicalDayOf } from '@shared/time/day'
import { Field } from '../../components/ui'
import { logEvents, storedAnswer, tryUpdateRecord, type SaveAnswer, type SendState } from '../../store/data'
import { plannedDay } from '../../store/day'
import { toast } from '../../store/ui'
import { TileCost } from '../plan/TileCost'

const NO_COSTS: Costs = { head: 0, emotions: 0, senses: 0 }

/** Said when the routine's cost was saved but today could not be read: its begun block keeps the cost it had (T1399). */
export const ROUTINE_BEGUN_KEPT_TEXT = 'Koszt rutyny zapisany. Zaczęty dziś blok tej rutyny liczy na razie dotychczasowy koszt – dzisiejszego dnia nie dało się teraz odczytać.'

/**
 * The cost of a routine as the field shows it (D512): its own, else – „jak podkategoria” – the cost of the category of routines (the first of
 * the kind „rutyna”, the block of a routine usually has it); the window's button gives the routine's own cost up.
 */
export function routineCostShown(routine: Pick<Routine, 'costs'>, categories: Readonly<Record<string, CategoryRules | undefined>>): TileCostInfo {
  const base = Object.values(categories).find((c) => c?.kind === 'routine')?.costs ?? NO_COSTS
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
 * Today's begun blocks of the routine count `costs` from now on (T1395): today read now, one `block.routineCost` for each of them (the main
 * process stamps the instant). Today not read – said, nothing written (the blocks keep the cost they had, T1399).
 */
async function followBegun(routine: string, costs: Costs | null, at: number): Promise<void> {
  const today = logicalDayOf(at)
  const day = await plannedDay(today, at)
  if (typeof day === 'string') {
    toast(ROUTINE_BEGUN_KEPT_TEXT, 'error', 8000)
    return
  }
  const blocks = routineCostTargets(day.ctx.plan, day.facts, day.ctx.snapshot.settings, routine)
  if (blocks.length) await logEvents(blocks.map((block) => ({ k: 'block.routineCost', day: today, block, costs })))
}

/**
 * The routine changed by `patch` over its record as it is when the change's turn comes (other fields of the file stay, T1368); a change of
 * its cost, once saved (written or waiting for the folder), reaches today's begun blocks of it (`followBegun`). `out` – as `tryUpdateRecord`,
 * `answer` – as `storedAnswer` (what a field of the cost needs).
 */
export async function saveRoutine(id: string, patch: RoutinePatch, at?: number): Promise<{ out: EditOutcome[] | null; answer: SaveAnswer }> {
  const state: SendState = { afterSend: false }
  const out = await tryUpdateRecord(paths.record('routine', id), (raw) => (routineFrom(raw) ? { ...raw, ...patch } : raw), state)
  const answer = storedAnswer(out, state)
  // Today as it is once the record is saved (`at` – tests).
  if (answer === true && patch.costs !== undefined) await followBegun(id, patch.costs, at ?? Date.now())
  return { out, answer }
}
