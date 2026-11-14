/**
 * Getting up later (spec „Późne wstanie”, D488 – the day's first block moved later): „Wstałeś później? · Tak · Nie”; „Tak”
 * shows the routines, care and meals moved by the delay and the work shortened or parked so the day fits the boundary again – the plan changes only
 * after „Zastosuj”. Asked once a day (the answer is the day's, on every computer).
 */
import { useState } from 'react'
import { setAsked } from '@shared/data/dayEdits'
import type { LateWake } from '@shared/engine/lateWake'
import { durationLabel, logicalClock } from '@shared/format'
import { useBusy } from '../../lib/busy'
import { logEvents } from '../../store/data'
import type { DayModel } from '../../store/day'
import { blockName, type Names } from '../plan/blockView'
import { saveDay } from './dayActions'
import { applyLateWake } from './lateWakeApply'
import { toast } from '../../store/ui'

export function LateWakeCard({ model, lw, names }: { model: DayModel; lw: LateWake; names: Names }) {
  const [stage, setStage] = useState<'ask' | 'proposal'>('ask')
  const date = model.date
  const raw = model.data.dayFile
  const answer = (a: string) => saveDay(date, raw, (r) => setAsked(r, 'lateWake', a))
  const [busy, run] = useBusy()
  // The starts the app made while you slept are taken back first (D490); the blocks are parked only when the moves were
  // saved (A6-08).
  const apply = () =>
    run(async () => {
      const r = await applyLateWake(lw, date, {
        undo: (target) => window.rd.timer({ a: 'undo', target, day: date }).catch((e: unknown) => ({ ok: false, why: e instanceof Error ? e.message : String(e) })),
        save: (edit) => saveDay(date, raw, edit),
        park: (events) => logEvents(events)
      })
      if (r.kept.length) toast(`Nie cofnięto startu: ${r.kept.map((b) => blockName(b, names)).join(', ')} – ${r.why ?? ''}`, 'error', 8000)
    })
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-lamp/50 bg-lamp-soft px-4 py-3 text-[12.5px]" data-testid="late-wake">
      {stage === 'ask' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1">
            Wstałeś później? {blockName(lw.first, names)} stoi o {logicalClock(lw.movedMin)}, {durationLabel(lw.delayMin)} później niż w planie.
          </span>
          <button type="button" className="btn" onClick={() => setStage('proposal')} data-testid="late-wake-yes">
            Tak
          </button>
          <button type="button" className="btn" onClick={() => void answer('no')} data-testid="late-wake-no">
            Nie
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span>Propozycja – plan zmieni się dopiero po „Zastosuj”; granica zostaje.</span>
          <ul className="list-disc pl-5">
            {lw.shifts.map((s) => (
              <li key={s.block.id}>
                {blockName(s.block, names)}: {s.toStartMin === s.block.startMin ? logicalClock(s.toStartMin) : `${logicalClock(s.block.startMin!)} → ${logicalClock(s.toStartMin)}`}
                {s.undo ? ' (zaczął się sam – start zostanie cofnięty)' : ''}
              </li>
            ))}
            {lw.shortens.map((s) => (
              <li key={s.block.id}>
                {blockName(s.block, names)} krócej: {durationLabel(s.block.durationMin)} → {durationLabel(s.toMin)}
              </li>
            ))}
            {lw.parks.map((b) => (
              <li key={b.id}>{blockName(b, names)}: zaparkowany</li>
            ))}
            {lw.passed.map((b) => (
              <li key={b.id} className="text-muted">
                {blockName(b, names)} ({logicalClock(b.startMin!)}) minął przed {logicalClock(lw.movedMin)} – do potwierdzenia
              </li>
            ))}
            {!lw.shifts.length && !lw.shortens.length && !lw.parks.length && <li>Plan mieści się bez zmian.</li>}
          </ul>
          <div className="flex gap-2">
            <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void apply()} data-testid="late-wake-apply">
              Zastosuj
            </button>
            <button type="button" className="btn" onClick={() => void answer('kept')}>
              Zostaw bez zmian
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
