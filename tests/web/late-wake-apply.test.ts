/**
 * „Zastosuj” of „Wstałeś później?” (D490, T1150): the app's own starts of the morning are taken back first, then one edit
 * moves the morning; a block whose start could not be taken back stays, the blocks that do not fit are parked only after
 * the edit is saved.
 */
import { describe, expect, it } from 'vitest'
import type { EditOutcome, EventIn, RawRecord } from '@shared/api'
import { dayFileFrom } from '@shared/model/plan'
import type { LateWake } from '@shared/engine/lateWake'
import { applyLateWake } from '@renderer/features/today/lateWakeApply'
import { block, lm } from '../unit/engine/dsl'

const DATE = '2026-10-21'
const ru = block({ id: 'ru', cat: 'rutyny', at: '09:30', min: 45 })
const po = block({ id: 'po', cat: 'posilek', at: '07:30', min: 30 })
const ob = block({ id: 'ob', cat: 'posilek', at: '08:00', min: 30 })
const an = block({ id: 'an', cat: 'analiza', at: '10:00', min: 120 })

const lw = (): LateWake => ({
  first: ru,
  plannedMin: lm('06:00'),
  movedMin: lm('09:30'),
  wakeMin: lm('06:00'),
  delayMin: 210,
  waitUntilMin: null,
  shifts: [
    { block: po, toStartMin: lm('11:00'), undo: 'auto-po' },
    { block: ob, toStartMin: lm('11:30'), undo: 'auto-ob' }
  ],
  shortens: [],
  parks: [an],
  passed: []
})

function run(okFor: (target: string) => boolean, saved = true) {
  const undone: string[] = []
  const parked: EventIn[][] = []
  let raw: RawRecord = { date: DATE, blocks: [] }
  return applyLateWake(lw(), DATE, {
    undo: async (target) => {
      undone.push(target)
      return okFor(target) ? { ok: true, why: null } : { ok: false, why: 'tego już nie cofniesz' }
    },
    save: async (edit) => {
      raw = edit(raw)
      return [{ status: saved ? 'applied' : 'failed' } as unknown as EditOutcome]
    },
    park: async (events) => {
      parked.push(events)
    }
  }).then((r) => ({ r, undone, parked, file: dayFileFrom(raw, DATE) }))
}

describe('„Zastosuj” po „Wstałeś później?” (D490)', () => {
  it('cofa automatyczne starty, potem przesuwa te bloki i parkuje to, co się nie mieści', async () => {
    const { r, undone, parked, file } = await run(() => true)
    expect(undone).toEqual(['auto-po', 'auto-ob'])
    expect(file.blocks.map((b) => [b.id, b.startMin])).toEqual([
      ['po', lm('11:00')],
      ['ob', lm('11:30')]
    ])
    expect(file.asked.lateWake).toBe('yes')
    expect(parked).toEqual([[{ k: 'block.park', day: DATE, block: 'an', rule: 'lateWake' }]])
    expect(r).toEqual({ saved: true, kept: [], why: null })
  })

  it('blok, którego startu nie dało się cofnąć, zostaje tam, gdzie biegł', async () => {
    const { r, file } = await run((t) => t !== 'auto-ob')
    expect(file.blocks.map((b) => b.id)).toEqual(['po'])
    expect(r.kept.map((b) => b.id)).toEqual(['ob'])
    expect(r.why).toBe('tego już nie cofniesz')
  })

  it('bez zapisanej edycji nic się nie parkuje', async () => {
    const { r, parked } = await run(() => true, false)
    expect(r.saved).toBe(false)
    expect(parked).toEqual([])
  })
})
