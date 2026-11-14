/**
 * D492 in the window without a DOM: the right part of a tile (40 %, without its top and bottom 4 px) takes a dropped block – the
 * rest of it is a move to that hour – overlapping tiles stand side by side (D476), a block dropped onto another in „Dziś” stands beside its group – the
 * preview and the edit of the drop are one count, the blocks after the group are pushed apart – and the columns of „Tydzień” and
 * „3 dni” say the same before the drop.
 */
import { describe, expect, it } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { putBlock, type Raw } from '@shared/data/dayEdits'
import type { HorizonBlock } from '@shared/engine/week'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { putChange } from '@renderer/features/today/dayActions'
import { axisEndOf, changedPlan, dragChange, parallelChange, parallelHint } from '@renderer/features/today/dayPush'
import { inParallelZone, tileLanes } from '@renderer/features/plan/parallelDrag'
import { sameDrop, weekOnto } from '@renderer/features/week/weekViews'
import { block, lm, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-28'
const flex = (id: string, at: string, min: number): PlanBlock => block({ id, cat: 'inne', at, min, origin: 'user' })
const span = (from: string, to: string) => ({ startMin: lm(from), endMin: lm(to) })

function day(plan: PlanBlock[]) {
  const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
  const ctx = s.contextAt(s.at('08:00'))
  return { ctx, state: computeDay(ctx) }
}
const nameOf = (b: PlanBlock) => `blok ${b.id}`

describe('D492 – prawa część kafelka przyjmuje upuszczenie', () => {
  it('prawe 40 % (bez 4 px z góry i z dołu) – tak; reszta (przeciąganie za nazwę albo środek kolumny), brzegi i kafelek niższy niż 12 px – nie', () => {
    const r = { left: 0, right: 200, top: 0, bottom: 66 }
    expect(inParallelZone(150, 20, r)).toBe(true)
    expect(inParallelZone(120, 4, r)).toBe(true)
    expect(inParallelZone(100, 20, r)).toBe(false)
    expect(inParallelZone(40, 20, r)).toBe(false)
    expect(inParallelZone(150, 3, r)).toBe(false)
    expect(inParallelZone(150, 63, r)).toBe(false)
    expect(inParallelZone(201, 20, r)).toBe(false)
    expect(inParallelZone(150, 5, { ...r, bottom: 10 })).toBe(false)
  })

  it('D476 – kafelki, które nachodzą (z najniższą wysokością kafelka), stoją obok siebie; reszta ma całą szerokość', () => {
    const lanes = tileLanes(
      [
        { id: 'a', ...span('10:00', '10:30') },
        { id: 'b', ...span('10:00', '11:00') },
        { id: 'c', ...span('11:00', '11:05') },
        { id: 'd', ...span('11:10', '11:30') }
      ],
      18
    )
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 })
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 })
    // c (5 min) is drawn 18 min high: it meets d.
    expect(lanes.get('c')).toEqual({ lane: 0, lanes: 2 })
    expect(lanes.get('d')).toEqual({ lane: 1, lanes: 2 })
  })
})

describe('D492 – upuszczenie na blok w „Dziś”', () => {
  const plan = [flex('a', '10:00', 30), flex('c', '10:30', 30), flex('b', '13:00', 60)]

  it('B (60 min) na A: start A, własna długość, „Równolegle z …”; C za grupą przesunięty – podgląd i zapis to te same godziny', () => {
    const d = day(plan)
    const c = parallelChange(d, 'b', 'a', 3, axisEndOf(d, true), nameOf, true)
    if (!c || c === 'same') throw new Error('bez zmiany')
    expect(c.kind).toBe('join')
    expect(c.patch).toEqual({ startMin: lm('10:00'), anchor: null, alongside: 'a' })
    expect(c.text).toBe('Równolegle z blok a')
    expect(c.pushed.map((p) => [p.id, p.startMin])).toEqual([['c', lm('11:00')]])
    const hint = parallelHint(d, c, span('13:00', '14:00'), 'forecast')!
    expect(hint.span).toEqual(span('10:00', '11:00'))
    expect(hint.pushed).toEqual(new Map([['c', span('11:00', '11:30')]]))
  })

  it('grupa pełna: B staje zaraz po grupie jako własny blok, z notą o limicie', () => {
    const d = day([...plan, { ...flex('e', '10:00', 45), alongside: 'a' }])
    const c = parallelChange(d, 'b', 'a', 2, axisEndOf(d, true), nameOf, true)
    if (!c || c === 'same') throw new Error('bez zmiany')
    expect(c.kind).toBe('full')
    expect(c.patch).toEqual({ startMin: lm('10:45'), anchor: null, alongside: null })
    expect(c.text).toBe('Najwyżej 2 bloki naraz – zmienisz w Ustawieniach')
  })

  it('na blok własnej grupy – bez zmian; blok spoza planu – nie przyjmuje', () => {
    const d = day([...plan, { ...flex('e', '10:00', 45), alongside: 'a' }])
    expect(parallelChange(d, 'e', 'a', 3, axisEndOf(d, true), nameOf, true)).toBe('same')
    expect(parallelHint(d, 'same', span('10:00', '10:45'), 'forecast')).toMatchObject({ same: true, span: span('10:00', '10:45') })
    expect(parallelChange(d, 'b', 'brak', 3, axisEndOf(d, true), nameOf, true)).toBeNull()
  })

  it('przeciągnięcie bloku grupy w inne miejsce wyjmuje go z grupy; pierwszy blok grupy – reszta zostaje razem', () => {
    const grouped = [flex('a', '10:00', 30), { ...flex('e', '10:00', 45), alongside: 'a' }, flex('c', '12:00', 30)]
    const d = day(grouped)
    const out = dragChange(d, 'e', span('15:00', '15:45'), null, span('10:00', '10:45'), true)!
    expect(out.patch).toEqual({ startMin: lm('15:00'), alongside: null })
    const root = dragChange(d, 'a', span('15:00', '15:30'), null, span('10:00', '10:30'), true)!
    expect(root.others).toEqual([{ id: 'e', patch: { alongside: null, startMin: lm('10:00'), anchor: null } }])
    expect(changedPlan(grouped, root).find((b) => b.id === 'e')).toMatchObject({ alongside: null, startMin: lm('10:00') })
  })

  it('zapis: blok i reszta jego grupy jednym wpisem, każdy na bloku z pliku', () => {
    const grouped = [flex('a', '10:00', 30), { ...flex('e', '10:00', 45), alongside: 'a' }]
    const d = day(grouped)
    const c = dragChange(d, 'a', span('15:00', '15:30'), null, span('10:00', '10:30'), true)!
    const raw: Raw = grouped.reduce<Raw>((r, b) => putBlock(r, b), { schema: 1, date: DATE })
    const file = dayFileFrom(putChange(raw, DATE, grouped, c), DATE)
    expect(file.blocks.map((b) => [b.id, b.startMin, b.alongside])).toEqual([
      ['a', lm('15:00'), null],
      ['e', lm('10:00'), null]
    ])
  })
})

describe('D492 – kolumny „Tygodnia” i „3 dni”', () => {
  const hb = (id: string, from: string, to: string, extra: Partial<HorizonBlock> = {}): HorizonBlock => ({ id, named: { categoryId: 'inne' } as HorizonBlock['named'], categoryId: 'inne', ...span(from, to), state: 'planned', outsidePlan: false, background: false, ...extra })
  const col = [hb('a', '10:00', '10:30'), hb('e', '10:00', '10:45', { alongside: 'a' }), hb('x', '12:00', '13:00'), hb('r', '08:00', '09:00', { state: 'ran' })]
  const name = (b: HorizonBlock) => `blok ${b.id}`

  it('na blok grupy: start jej pierwszego bloku i „Równolegle z <pierwszy>”; pełna – po grupie z notą; własna – bez zmian', () => {
    expect(weekOnto(col, 'x', 'e', 3, name)).toEqual({ target: 'e', startMin: lm('10:00'), text: 'Równolegle z blok a', same: false })
    expect(weekOnto(col, 'x', 'a', 2, name)).toEqual({ target: 'a', startMin: lm('10:45'), text: 'Najwyżej 2 bloki naraz – zmienisz w Ustawieniach', same: false })
    expect(weekOnto(col, 'e', 'a', 3, name)).toMatchObject({ same: true })
  })

  it('blok skończony, poza planem albo sam przeciągany nie przyjmuje upuszczenia', () => {
    expect(weekOnto(col, 'x', 'r', 3, name)).toBeNull()
    expect(weekOnto([...col, hb('o', '14:00', '15:00', { outsidePlan: true })], 'x', 'o', 3, name)).toBeNull()
    expect(weekOnto(col, 'x', 'x', 3, name)).toBeNull()
  })

  it('upuszczenie na blok to inne miejsce niż ruch na tę samą godzinę (podgląd rysuje się od nowa)', () => {
    const plain = { index: 0, startMin: lm('10:00'), denied: false }
    expect(sameDrop(plain, { ...plain, onto: weekOnto(col, 'x', 'a', 3, name)! })).toBe(false)
  })
})
