/**
 * Dragging blocks on the axis of a day (D305): which blocks may be dragged, and by how many minutes a drag moves one.
 */
import { describe, expect, it } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { rdFrom } from '@shared/model/rd'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { DRAG_STEP_MIN, draggedStart } from '@renderer/features/plan/Timeline'
import type { DayModel } from '@renderer/store/day'
import { block, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-21'

function axisOf(s: Scenario, now: string | null) {
  const ctx = s.contextAt(s.at(now ?? '04:00'))
  const state = computeDay(ctx)
  const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
  const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
  return new Map(dayAxis(model, names, now ? s.at(now) : null).items.map((i) => [i.id, i.movable]))
}

describe('przeciąganie bloków na osi (D305)', () => {
  const plan = [
    block({ id: 'rano', cat: 'inne-obowiazki', at: '08:00', min: 60 }),
    block({ id: 'po', cat: 'inne-obowiazki', after: 'rano', min: 30 }),
    block({ id: 'potem', cat: 'inne-obowiazki', at: '13:00', min: 60, fixed: true }),
    block({ id: 'wyklad', cat: 'inne-obowiazki', at: '15:00', min: 90, origin: 'lecture' }),
    block({ id: 'sesja', cat: 'inne-obowiazki', at: '16:30', min: 60, origin: 'session' }),
    block({ id: 'wieczor', cat: 'inne-obowiazki', at: '19:00', min: 30 })
  ]

  it('blok z własną godziną: tak; po innym bloku, wykład i sesja: nie', () => {
    const m = axisOf(new Scenario({ date: DATE, plan }), null)
    expect(m.get('rano')).toBe(true)
    expect(m.get('potem')).toBe(true)
    expect(m.get('po')).toBe(false)
    expect(m.get('wyklad')).toBe(false)
    expect(m.get('sesja')).toBe(false)
  })

  it('zaczęty, miniony, zaparkowany albo odwołany blok: nie', () => {
    const s = new Scenario({ date: DATE, plan }).ran('rano', '08:00', '09:00')
    s.raw({ k: 'block.park', at: s.at('12:00'), block: 'wieczor', rule: 'exchange' }, '12:00')
    const m = axisOf(s, '14:30')
    expect(m.get('rano')).toBe(false)
    // A fixed block 13:00–14:00 passed without a start (a flexible one the forecast moves on, still to come).
    expect(m.get('potem')).toBe(false)
    expect(m.get('wieczor')).toBe(false)
  })

  it('start pod górą bloku, na siatce 5 min (1,1 px na minutę)', () => {
    expect(DRAG_STEP_MIN).toBe(5)
    expect(draggedStart(600, 2.7)).toBe(600)
    expect(draggedStart(600, 2.8)).toBe(605)
    expect(draggedStart(600, 33)).toBe(630)
    expect(draggedStart(600, -66)).toBe(540)
    // A block the forecast moved off the grid (10:17): dragged from where it is shown, onto the grid.
    expect(draggedStart(617, -5.5)).toBe(610)
    expect(draggedStart(617, 5.5)).toBe(620)
  })
})
