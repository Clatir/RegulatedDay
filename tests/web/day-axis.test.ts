/**
 * Dragging blocks on the axis of a day (D305): which blocks may be dragged, and by how many minutes a drag moves one.
 */
import { describe, expect, it } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { rdFrom } from '@shared/model/rd'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { edgePatch, resizeAnswer } from '@renderer/features/plan/edgeEdit'
import { DRAG_STEP_MIN, draggedEnd, draggedStart, draggedTopStart, dropSettled, type TimelineItem } from '@renderer/features/plan/Timeline'
import { planBlock } from '@shared/model/plan'
import type { DayModel } from '@renderer/store/day'
import { block, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-21'

/** The items of the axis counted at `now`: what each carries for the edge (D365). */
function itemsOf(s: Scenario, now: string) {
  const ctx = s.contextAt(s.at(now))
  const state = computeDay(ctx)
  const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
  const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
  return new Map(dayAxis(model, names, s.at(now)).items.map((i) => [i.id, i]))
}

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

  it('zajęcia z importu PDF zjazdów (D357): jak wykład – nieprzeciągalne', () => {
    const imported = block({ id: 'zajecia', cat: 'zajecia-zdalne', at: '10:00', min: 90, fixed: true, origin: 'zjazd' })
    const m = axisOf(new Scenario({ date: DATE, plan: [...plan.slice(0, 1), imported] }), null)
    expect(m.get('rano')).toBe(true)
    expect(m.get('zajecia')).toBe(false)
  })

  it('druga zmiana (tag secondShift, jak sesja – D192): nieprzeciągalna', () => {
    const second = block({ id: 'zmiana', cat: 'inne-obowiazki', at: '20:00', min: 60, fixed: true, tag: 'secondShift', origin: 'template' })
    const m = axisOf(new Scenario({ date: DATE, plan: [...plan.slice(0, 1), second] }), null)
    expect(m.get('rano')).toBe(true)
    expect(m.get('zmiana')).toBe(false)
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

  it('D365: dolna krawędź – koniec na siatce 5 min, najkrócej 5 min, najdłużej doba', () => {
    // 10:00–11:00; 1,1 px na minutę.
    expect(draggedEnd(600, 660, 0)).toBe(660)
    expect(draggedEnd(600, 660, 2.7)).toBe(660)
    expect(draggedEnd(600, 660, 2.8)).toBe(665)
    expect(draggedEnd(600, 660, 33)).toBe(690)
    expect(draggedEnd(600, 660, -33)).toBe(630)
    // Nie krócej niż 5 min (nawet przeciągnięte do góry krawędzi).
    expect(draggedEnd(600, 660, -200)).toBe(605)
    expect(draggedEnd(600, 660, -66)).toBe(605)
    // Blok pokazany poza siatką (prognoza: 10:17): koniec na siatce, najkrótszy – pierwsza minuta siatki za 5 min od startu.
    expect(draggedEnd(617, 660, -200)).toBe(625)
    // Najdłużej doba (schemat planu trzyma do 24 h).
    expect(draggedEnd(600, 660, 5000)).toBe(600 + 24 * 60)
    // Trwający blok: nie wcześniej niż granica podana przez wywołującego (teraz w górę do 5 min).
    expect(draggedEnd(600, 660, -66, 645)).toBe(645)
    expect(draggedEnd(600, 660, 11, 645)).toBe(670)
  })

  it('D365: górna krawędź – start na siatce 5 min przy tym samym końcu, blok najkrócej 5 min', () => {
    expect(draggedTopStart(600, 660, 0)).toBe(600)
    expect(draggedTopStart(600, 660, 2.8)).toBe(605)
    expect(draggedTopStart(600, 660, -33)).toBe(570)
    expect(draggedTopStart(617, 660, -5.5)).toBe(610)
    // Do dołu aż do 5 min przed końcem i nie dalej.
    expect(draggedTopStart(600, 660, 66)).toBe(655)
    expect(draggedTopStart(600, 660, 500)).toBe(655)
    expect(draggedTopStart(600, 663, 500)).toBe(655)
    // Najdłużej doba.
    expect(draggedTopStart(600, 660, -5000)).toBe(660 - 24 * 60)
  })

  it('D365: zapis krawędzi – jak pole „Długość”; górna krawędź zmienia też start (koniec zostaje)', () => {
    const b = planBlock({ id: 'a', categoryId: 'inne', startMin: 600, durationMin: 60 })
    expect(edgePatch(b, { startMin: 600, endMin: 690 }, 'end')).toEqual({ durationMin: 90 })
    expect(edgePatch(b, { startMin: 570, endMin: 660 }, 'top')).toEqual({ startMin: 570, durationMin: 90 })
    expect(edgePatch(b, { startMin: 655, endMin: 660 }, 'top')).toEqual({ startMin: 655, durationMin: 5 })
  })

  it('D365: upuszczony po zmianie długości blok czeka, aż oś pokaże nowy koniec', () => {
    const item = (endMin: number): TimelineItem => ({ id: 'a', startMin: 600, endMin, title: 'a', marks: [], color: '#fff', background: false })
    const drop = { id: 'a', from: 600, fromEnd: 660 }
    // Ten sam start i stary koniec – dzień jeszcze nie odczytał zmiany.
    expect(dropSettled([item(660)], drop)).toBe(false)
    expect(dropSettled([item(690)], drop)).toBe(true)
  })

  it('D365: trwający blok z własną godziną – tylko dolna krawędź, nie przed teraz (w górę do 5 min); sesja, wykład, niezaczęty i miniony – nie', () => {
    const own = [
      block({ id: 'a', cat: 'inne-obowiazki', at: '10:00', min: 60 }),
      block({ id: 'wyklad', cat: 'inne-obowiazki', at: '10:00', min: 90, origin: 'lecture', bg: true }),
      block({ id: 'sesja', cat: 'inne-obowiazki', at: '16:30', min: 60, origin: 'session' }),
      block({ id: 'potem', cat: 'inne-obowiazki', at: '15:00', min: 30 })
    ]
    const s = new Scenario({ date: DATE, plan: own }).observe('07:00', null).ran('wyklad', '10:00', '10:05', { bg: true })
    s.start('a', '10:00')
    const m = itemsOf(s, '10:12')
    expect(m.get('a')).toMatchObject({ resize: 'end', minEndMin: 10 * 60 + 15, movable: false })
    // Not begun: both edges (movable); a session, a lecture – none.
    expect(m.get('potem')).toMatchObject({ movable: true })
    expect(m.get('potem')?.resize).toBeUndefined()
    expect(m.get('sesja')?.resize).toBeUndefined()
    expect(m.get('wyklad')?.resize).toBeUndefined()
    // Ended: none.
    s.end('a', '10:30')
    expect(itemsOf(s, '10:40').get('a')?.resize).toBeUndefined()
  })

  it('D365: odpowiedź timera na upuszczenie – zapisane, koszt do potwierdzenia albo odmowa', () => {
    expect(resizeAnswer({ ok: true, why: null, confirm: null }, 30)).toEqual({ kind: 'done' })
    const cost = { block: 'a', minutes: 20, overrun: false, bedtime: false }
    expect(resizeAnswer({ ok: false, why: null, confirm: cost }, 60)).toEqual({ kind: 'confirm', text: 'Przedłuż +60: przedłużenie · −20 min puli' })
    expect(resizeAnswer({ ok: false, why: 'Stały blok.', confirm: null }, 5)).toEqual({ kind: 'refused', why: 'Stały blok.' })
  })
})
