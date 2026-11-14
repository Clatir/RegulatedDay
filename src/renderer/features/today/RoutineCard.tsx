/**
 * Ticking a routine off in „Dziś” (D328, spec „Rutyna”): a card for each routine of today begun and not ticked off –
 * its steps one by one with the version („zwykła” or „gorsze dni”), „✓ Wszystkie” and „Zapisz zaznaczone”. The same
 * click as the bar's line (`routineDone`), so a save in either place closes both; „Cofnij” takes it back.
 *
 * One state with the panel „Kroki” (D473, D479, T1108): the card shows the block's list as its day has it – the version
 * picked for the block (the switch writes it into the day, as the panel's), each box the day's tick (`tickBlockStep`, seen in
 * the panel at once); the last box ticked saves the routine and ends a block that runs (D474), as the panel's does.
 */
import { routinesDue, type RoutineDue } from '@shared/engine/routineCheck'
import { durationLabel } from '@shared/format'
import type { PlanBlock } from '@shared/model/plan'
import { ROUTINE_VERSION_NAMES, ROUTINE_VERSIONS } from '@shared/model/routines'
import { Segmented } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { useData } from '../../store/data'
import type { DayModel } from '../../store/day'
import { pickRoutineVersion, tickBlockStep } from '../../store/steps'
import { blockName, type Names } from '../plan/blockView'
import { finishBySteps, saveRoutine } from '../steps/stepsFinish'

/** „Cofnij” of a routine saved (as the card's since D328; `steps/stepsFinish.ts`). */
export { undoRoutine } from '../steps/stepsFinish'

export function RoutineCards({ model, names }: { model: DayModel; names: Names }) {
  const routines = useData((s) => s.routines)
  const due = routinesDue(model.ctx, model.state, routines, model.dayFile)
  if (!due.length) return null
  return (
    <>
      {due.map((r) => {
        const block = model.ctx.plan.find((p) => p.id === r.block)
        return block ? <RoutineCard key={r.block} model={model} due={r} block={block} name={blockName(block, names)} /> : null
      })}
    </>
  )
}

function RoutineCard({ model, due, block, name }: { model: DayModel; due: RoutineDue; block: PlanBlock; name: string }) {
  const [busy, run] = useBusy()
  const date = model.date
  const raw = model.data.dayFile
  const steps = due.steps
  const ticked = steps.filter((s) => s.done).map((s) => s.id)
  const tick = (id: string, done: boolean) =>
    run(async () => {
      const r = await tickBlockStep(date, block, id, done, raw)
      if (r.finished) await finishBySteps(date, block, name, { version: due.version, steps: r.steps.map((s) => s.id) })
    })
  const save = (ids: string[]) =>
    run(async () => {
      if (ids.length) await saveRoutine(date, block, name, due.version, ids, steps.length, raw)
    })
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line px-4 py-3 text-[12.5px]" data-testid="routine-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-fg">{name} – odhacz kroki</span>
        {due.worse.length > 0 && (
          <Segmented
            value={due.version}
            options={ROUTINE_VERSIONS.map((v) => ({ value: v, label: ROUTINE_VERSION_NAMES[v] }))}
            onChange={(v) => void (v !== due.version && run(() => pickRoutineVersion(date, block, v, raw)))}
            aria-label="Wersja rutyny"
            data-testid="routine-card-version"
          />
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {steps.map((s) => (
          <li key={s.id}>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={s.done} disabled={busy} onChange={(e) => void tick(s.id, e.currentTarget.checked)} data-testid={`routine-card-step-${s.id}`} />
              <span>{s.title}</span>
              {s.min !== undefined && <span className="text-muted">{durationLabel(s.min)}</span>}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void save(steps.map((s) => s.id))} data-testid="routine-card-all">
          ✓ Wszystkie
        </button>
        <button type="button" className="btn" disabled={busy || !ticked.length} onClick={() => void save(ticked)} data-testid="routine-card-save">
          Zapisz zaznaczone{ticked.length ? ` (${ticked.length})` : ''}
        </button>
      </div>
    </section>
  )
}
