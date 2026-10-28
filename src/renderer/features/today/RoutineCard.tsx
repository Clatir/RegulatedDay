/**
 * Ticking a routine off in „Dziś” (D328, spec „Rutyna”): a card for each routine of today begun and not ticked off –
 * its steps one by one with the version („zwykła” or „gorsze dni”), „✓ Wszystkie” and „Zapisz zaznaczone”. The same
 * click as the bar's line (`routineDone`), so a save in either place closes both; „Cofnij” takes it back.
 */
import { useState } from 'react'
import { routinesDue, type RoutineDue } from '@shared/engine/routineCheck'
import { durationLabel } from '@shared/format'
import { ROUTINE_VERSION_NAMES, type RoutineVersion } from '@shared/model/routines'
import { Segmented } from '../../components/ui'
import { useBusy } from '../../lib/busy'
import { useData } from '../../store/data'
import type { DayModel } from '../../store/day'
import { toast, undoToast } from '../../store/ui'
import { blockName, type Names } from '../plan/blockView'

export function RoutineCards({ model, names }: { model: DayModel; names: Names }) {
  const routines = useData((s) => s.routines)
  const due = routinesDue(model.ctx, model.state, routines)
  if (!due.length) return null
  return (
    <>
      {due.map((r) => (
        <RoutineCard key={r.block} model={model} due={r} name={blockName(model.ctx.plan.find((p) => p.id === r.block) ?? { categoryId: 'rutyny', variantId: null, routine: r.routine.id, requests: [], note: '' }, names)} />
      ))}
    </>
  )
}

function RoutineCard({ model, due, name }: { model: DayModel; due: RoutineDue; name: string }) {
  const [version, setVersion] = useState<RoutineVersion>('normal')
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())
  const [busy, run] = useBusy()
  const steps = due[version]
  const date = model.date
  const flip = (id: string) =>
    setDone((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const save = (ids: string[]) =>
    run(async () => {
      if (!ids.length) return
      try {
        const r = await window.rd.timer({ a: 'routineDone', block: due.block, version, steps: ids, day: date })
        if (!r.ok) return void toast(r.why ?? 'Rutyna nie zapisała się', 'info')
        undoToast(`Zapisano: ${name} (${ROUTINE_VERSION_NAMES[version]}) – ${ids.length} z ${steps.length}`, () => void window.rd.timer({ a: 'routineUndo', block: due.block, day: date }))
      } catch (e) {
        toast(`Nie zapisano rutyny: ${e instanceof Error ? e.message : String(e)}`, 'error', 8000)
      }
    })
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line px-4 py-3 text-[12.5px]" data-testid="routine-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-fg">{name} – odhacz kroki</span>
        {due.worse.length > 0 && (
          <Segmented
            value={version}
            options={(['normal', 'worse'] as const).map((v) => ({ value: v, label: ROUTINE_VERSION_NAMES[v] }))}
            onChange={(v) => {
              setVersion(v)
              setDone(new Set())
            }}
            aria-label="Wersja rutyny"
            data-testid="routine-card-version"
          />
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {steps.map((s, k) => (
          <li key={s.id}>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={done.has(s.id)} onChange={() => flip(s.id)} data-testid={`routine-card-step-${s.id}`} />
              <span>{s.name || `krok ${k + 1}`}</span>
              <span className="text-muted">{durationLabel(s.min)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void save(steps.map((s) => s.id))} data-testid="routine-card-all">
          ✓ Wszystkie
        </button>
        <button type="button" className="btn" disabled={busy || !done.size} onClick={() => void save(steps.filter((s) => done.has(s.id)).map((s) => s.id))} data-testid="routine-card-save">
          Zapisz zaznaczone{done.size ? ` (${done.size})` : ''}
        </button>
      </div>
    </section>
  )
}
