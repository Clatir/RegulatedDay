/**
 * „Zastosuj” of „Wstałeś później?” (D488, D490): first the starts the app made by itself while you slept are taken back
 * („Cofnij” of each – its automatic end goes with it), then one edit of the day moves the morning and shortens the work,
 * and only when that is saved the blocks that do not fit are parked (A6-08). A block whose start could not be taken back
 * stays where it ran: it is neither moved nor counted twice (T1150).
 */
import type { EditOutcome, EventIn, RawRecord, TimerResult } from '@shared/api'
import { putBlock, setAsked } from '@shared/data/dayEdits'
import type { LateWake } from '@shared/engine/lateWake'
import type { PlanBlock } from '@shared/model/plan'
import { isSaved } from '../../store/data'
import { blockNow } from './dayActions'

export interface LateWakeDeps {
  undo: (target: string) => Promise<Pick<TimerResult, 'ok' | 'why'>>
  save: (edit: (raw: RawRecord) => RawRecord) => Promise<EditOutcome[] | null>
  park: (events: EventIn[]) => Promise<unknown>
}

export async function applyLateWake(lw: LateWake, date: string, deps: LateWakeDeps): Promise<{ saved: boolean; kept: PlanBlock[]; why: string | null }> {
  const kept: PlanBlock[] = []
  let why: string | null = null
  const moves: LateWake['shifts'] = []
  for (const s of lw.shifts) {
    if (s.undo) {
      const r = await deps.undo(s.undo)
      if (!r.ok) {
        kept.push(s.block)
        why = r.why ?? why
        continue
      }
    }
    moves.push(s)
  }
  const out = await deps.save((r) => {
    let next = r
    for (const s of moves) next = putBlock(next, { ...blockNow(next, date, s.block), startMin: s.toStartMin })
    for (const s of lw.shortens) next = putBlock(next, { ...blockNow(next, date, s.block), durationMin: s.toMin })
    return setAsked(next, 'lateWake', 'yes')
  })
  const saved = isSaved(out)
  if (saved && lw.parks.length) await deps.park(lw.parks.map((b) => ({ k: 'block.park', day: date, block: b.id, rule: 'lateWake' })))
  return { saved, kept, why }
}
