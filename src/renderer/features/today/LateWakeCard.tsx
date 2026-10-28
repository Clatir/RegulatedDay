/**
 * Getting up later (spec „Późne wstanie”, D199): „Wstałeś później? · Tak · Nie”; „Tak” shows the routines, care and
 * meals moved by the delay and the work shortened or parked so the day fits the boundary again – the plan changes only
 * after „Zastosuj”. Asked once a day (the answer is the day's, on every computer).
 */
import { useState } from 'react'
import { putBlock, setAsked } from '@shared/data/dayEdits'
import type { LateWake } from '@shared/engine/lateWake'
import { durationLabel, logicalClock } from '@shared/format'
import { useBusy } from '../../lib/busy'
import { isSaved, logEvents } from '../../store/data'
import type { DayModel } from '../../store/day'
import { blockName, type Names } from '../plan/blockView'
import { blockNow, saveDay } from './dayActions'

export function LateWakeCard({ model, lw, names }: { model: DayModel; lw: LateWake; names: Names }) {
  const [stage, setStage] = useState<'ask' | 'proposal'>('ask')
  const date = model.date
  const raw = model.data.dayFile
  const answer = (a: string) => saveDay(date, raw, (r) => setAsked(r, 'lateWake', a))
  const [busy, run] = useBusy()
  // The blocks are parked only when the moves were saved (A6-08).
  const apply = () =>
    run(async () => {
      const out = await saveDay(date, raw, (r) => {
        let next = r
        for (const s of lw.shifts) next = putBlock(next, { ...blockNow(next, date, s.block), startMin: s.toStartMin })
        for (const s of lw.shortens) next = putBlock(next, { ...blockNow(next, date, s.block), durationMin: s.toMin })
        return setAsked(next, 'lateWake', 'yes')
      })
      if (isSaved(out) && lw.parks.length) await logEvents(lw.parks.map((b) => ({ k: 'block.park', day: date, block: b.id, rule: 'lateWake' })))
    })
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-lamp/50 bg-lamp-soft px-4 py-3 text-[12.5px]" data-testid="late-wake">
      {stage === 'ask' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1">
            Wstałeś później? Pierwsze użycie komputera o {logicalClock(lw.routineEndMin + lw.delayMin)}, {durationLabel(lw.delayMin)} po planowanym końcu porannej rutyny.
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
                {blockName(s.block, names)}: {logicalClock(s.block.startMin!)} → {logicalClock(s.toStartMin)}
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
                {blockName(b, names)} ({logicalClock(b.startMin!)}) minął przed pierwszym użyciem – do potwierdzenia
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
