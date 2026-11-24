/**
 * N7 (D386, D582, D583) in „Dziś” without a DOM: a block dragged onto a buffer of decompression takes its place – the save at once with the
 * buffer cancelled in the same edit, a block of work with the warning; a change that makes a buffer writes and counts the blocks it moves
 * („Przesunięto N”). The buffer's tile: the sea green, the cup, its words.
 */
import { describe, expect, it } from 'vitest'
import { marketDay } from '@shared/calendar/holidays'
import { dayContextOf, type PlanInputs } from '@shared/engine/context'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import type { DayModel } from '@renderer/store/day'
import { dayFileFrom, type PlanBlock } from '@shared/model/plan'
import { putChange, withTaken } from '@renderer/features/today/dayActions'
import { addChange, bufferTakenBy, copyChange, dragChange, dragTaken, panelTakes, pushedSpans, takenNotice, warnsOnBuffer, withBufferPushes } from '@renderer/features/today/dayPush'
import { parallelDrop } from '@shared/engine/parallel'
import { weekOnto } from '@renderer/features/week/weekViews'
import { anchorCandidates } from '@renderer/features/plan/blockView'
import { warnKeyOf } from '@renderer/features/plan/Timeline'
import { planningOf } from '@renderer/features/cases/planOnAxis'
import { pushedInto } from '@renderer/store/cases'
import { templateDayOf } from '@renderer/features/templates/templateDay'
import { dayPlan } from '@shared/engine/createDay'
import { newTask, requestFrom } from '@shared/model/requests'
import { templateFrom } from '@shared/model/plan'
import { DECOMPRESS_COLOR } from '@renderer/features/plan/blockView'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { block, lm } from '../unit/engine/dsl'
import { placeLogical } from '@shared/time/day'
import { rdFrom } from '@shared/model/rd'

/** A Saturday to come: its plan axis. */
const SAT = '2026-10-31'
const meeting: PlanBlock = { ...block({ id: 'meet', cat: 'inne', at: '10:00', min: 90, origin: 'user' }), costs: { head: 0, emotions: 4, senses: 0, body: 0 } }
const work = block({ id: 'w', cat: 'inne', at: '14:00', min: 30, origin: 'user' })
const meal = block({ id: 'm', cat: 'posilek', at: '15:00', min: 30, origin: 'user' })
const plan = [meeting, work, meal]
const raw = { schema: 1, date: SAT, dayType: 'weekend', blocks: plan }
const inputs: PlanInputs = { changes: [{ id: 'c1', from: '2026-10-01', at: null, made: 1, patch: { decompress: { on: true } } }], templates: [], lectures: [], series: [], routines: [] }

function day() {
  const ctx = dayContextOf(inputs, { date: SAT, events: [], dayFile: dayFileFrom(raw, SAT), nextFile: null }, marketDay, placeLogical('2026-10-30', lm('12:00')))
  return { ctx, state: computeDay(ctx) }
}
const span = (from: string, to: string) => ({ startMin: lm(from), endMin: lm(to) })
const bufferOf = (d: ReturnType<typeof day>) => d.ctx.plan.find((b) => b.origin === 'decompress')!

describe('D386 – blok pracy położony na buforze dekompresji', () => {
  it('przeciągnięty na bufor: ostrzeżenie o buforze, zapis od razu – bufor odwołany tą samą edycją', () => {
    const d = day()
    const buf = bufferOf(d)
    expect(buf.sourceId).toBe('meet')
    const c = dragChange(d, 'w', span('11:30', '12:00'), null, span('14:00', '14:30'), true)!
    expect(c.takes?.id).toBe(buf.id)
    const after = withTaken(putChange(raw, SAT, d.ctx.plan, c), c.takes)
    const file = dayFileFrom(after, SAT)
    expect(file.cancelled).toContain(buf.id)
    expect(file.blocks.find((b) => b.id === 'w')?.startMin).toBe(lm('11:30'))
    // The day counted again: no buffer, the block of work where you put it.
    const again = dayContextOf(inputs, { date: SAT, events: [], dayFile: file, nextFile: null }, marketDay, d.ctx.now)
    expect(again.plan.some((b) => b.origin === 'decompress')).toBe(false)
  })

  it('posiłek na buforze też zabiera mu miejsce, ale bez ostrzeżenia; blok obok bufora – nic', () => {
    const d = day()
    expect(bufferTakenBy(d, { ...meal, startMin: lm('11:30') }, span('11:30', '12:00'))?.id).toBe(bufferOf(d).id)
    expect(warnsOnBuffer(d, meal)).toBe(false)
    expect(warnsOnBuffer(d, work)).toBe(true)
    expect(bufferTakenBy(d, { ...work, startMin: lm('12:00') }, span('12:00', '12:30'))).toBeNull()
    expect(dragChange(d, 'w', span('13:00', '13:30'), null, span('14:00', '14:30'), true)!.takes).toBeNull()
  })

  it('D583: zmiana, która robi bufor, zapisuje i liczy bloki, które on przesuwa', () => {
    // A block of 40 min made 90 by its bottom edge (now costly enough): the block of work right after it pushed by the change, then by its buffer.
    const plan2 = [{ ...meeting, durationMin: 40 }, { ...work, startMin: lm('11:30') }]
    const raw2 = { schema: 1, date: SAT, dayType: 'weekend', blocks: plan2 }
    const ctx = dayContextOf(inputs, { date: SAT, events: [], dayFile: dayFileFrom(raw2, SAT), nextFile: null }, marketDay, placeLogical('2026-10-30', lm('12:00')))
    const d = { ctx, state: computeDay(ctx) }
    expect(ctx.plan.some((b) => b.origin === 'decompress')).toBe(false)
    const c = dragChange(d, 'meet', span('10:00', '11:30'), 'end', span('10:00', '10:40'), true)!
    const pushed = withBufferPushes(d, c, inputs.changes, dayFileFrom(raw2, SAT))
    expect(pushed.map((p) => [p.id, p.startMin])).toEqual([['w', lm('11:45')]])
    // Nothing that makes a buffer – only the change's own pushes.
    const other = dragChange(day(), 'w', span('16:00', '16:30'), null, span('14:00', '14:30'), true)!
    expect(withBufferPushes(day(), other, inputs.changes, dayFileFrom(raw, SAT))).toEqual(other.pushed)
  })

  it('kafelek bufora: zieleń morska, znak filiżanki (`decompress`), nazwa „Dekompresja”', () => {
    const d = day()
    const names = { rd: rdFrom(undefined), settings: d.ctx.snapshot.settings, routines: [], requests: [] }
    const model = { date: SAT, ctx: d.ctx, state: d.state, dayFile: dayFileFrom(raw, SAT), energy: computeEnergy(d.ctx, d.state) } as unknown as DayModel
    const tile = dayAxis(model, names, null).items.find((i) => i.id === bufferOf(d).id)!
    expect(tile).toMatchObject({ title: 'Dekompresja', decompress: true, color: DECOMPRESS_COLOR, startMin: lm('11:30'), endMin: lm('11:45') })
  })
})

describe('przegląd r1 (N7)', () => {
  /** The day with a flexible block right after the meeting (the buffer pushes it to 11:45). */
  const raw2 = { ...raw, blocks: [...plan, block({ id: 'x', cat: 'inne', at: '11:30', min: 30, origin: 'user' })] }
  const day2 = () => {
    const ctx = dayContextOf(inputs, { date: SAT, events: [], dayFile: dayFileFrom(raw2, SAT), nextFile: null }, marketDay, placeLogical('2026-10-30', lm('12:00')))
    return { ctx, state: computeDay(ctx) }
  }
  const asModel = (d: ReturnType<typeof day>) => ({ date: SAT, ctx: d.ctx, state: d.state, data: { dayFile: raw }, dayFile: dayFileFrom(raw, SAT) }) as unknown as DayModel

  it('1: „po bloku” nie proponuje wyliczonego bufora (kotwica do id spoza pliku zdjęłaby blok z planu)', () => {
    const d = day()
    expect(anchorCandidates(d.ctx.plan, 'w').map((b) => b.id)).not.toContain(bufferOf(d).id)
    expect(anchorCandidates(d.ctx.plan, 'w').map((b) => b.id)).toContain('meet')
  })

  it('2: upuszczenie ciałem (zakres zerowy, jak `onMove`) na pierwszej minucie bufora albo przykrycie go od wcześniej – zabiera bufor', () => {
    const d = day()
    expect(dragChange(d, 'w', span('11:30', '11:30'), null, span('14:00', '14:00'), true)!.takes?.id).toBe(bufferOf(d).id)
    expect(dragChange(d, 'w', span('11:10', '11:10'), null, span('14:00', '14:00'), true)!.takes?.id).toBe(bufferOf(d).id)
  })

  it('3: dzień bez pliku – zabrany bufor nie wraca w `withBufferPushes` i nic za niego nie przesuwa', () => {
    const d = day2()
    expect(d.ctx.plan.find((b) => b.id === 'x')?.startMin).toBe(lm('11:45'))
    const c = dragChange(d, 'w', span('11:30', '12:00'), null, span('14:00', '14:30'), true)!
    expect(c.takes?.id).toBe(bufferOf(d).id)
    expect(c.pushed.map((p) => [p.id, p.startMin])).toEqual([['x', lm('12:00')]])
    expect(withBufferPushes(d, c, inputs.changes, null)).toEqual(c.pushed)
  })

  it('4: sprawa postawiona na osi na buforze – bufor zabrany tą samą edycją (`taken` → `pushedInto` odwołuje go)', () => {
    const d = day()
    const r = requestFrom(newTask('t1', placeLogical('2026-10-30', lm('12:00')), '2026-10-30', { title: 'Raport' }))!
    const p = planningOf(asModel(d), '2026-10-30', r, lm('11:30'))
    expect(p.taken).toEqual([{ id: bufferOf(d).id, caseId: 't1' }])
    const after = pushedInto(raw, SAT, { blocks: p.pushed, planOf: (file) => dayPlan(d.ctx.snapshot, file), taken: p.taken })
    expect(dayFileFrom(after.next, SAT).cancelled).toContain(bufferOf(d).id)
  })

  it('8: edytor szablonów bez buforów (D583) – podgląd dnia szablonu nie liczy ich', () => {
    const t = templateFrom({ id: 'tw', name: 'Weekend', dayType: 'weekend', weekdays: [], versions: { '2020-01-01': { blocks: [meeting, work] } } })!
    const model = templateDayOf(t, t.versions[0]!, SAT, { changes: inputs.changes, lectures: [], routines: [] })
    expect(model.ctx.plan.some((b) => b.origin === 'decompress')).toBe(false)
  })

  it('10: podgląd rozsuwania bez zabranego bufora – kolejny blok tam, gdzie stanie po zapisie', () => {
    const d = day2()
    const c = dragChange(d, 'w', span('11:30', '12:00'), null, span('14:00', '14:30'), true)!
    const spans = pushedSpans(d, c, 'forecast')
    expect(spans?.get('x')).toEqual(span('12:00', '12:30'))
    expect(spans?.has(bufferOf(d).id) ?? false).toBe(false)
  })

  it('11: dymek po zapisie bloku pracy na buforze (także nowego – „Dodaj”, szkic, zakres), posiłek – bez dymku', () => {
    const d = day()
    const nameOf = (b: PlanBlock) => b.name ?? b.id
    expect(takenNotice(d, addChange(d, { ...work, id: 'n1', startMin: lm('11:30') }, true), nameOf)).toBe('Na miejscu dekompresji po meet')
    expect(takenNotice(d, addChange(d, { ...meal, id: 'n2', startMin: lm('11:30') }, true), nameOf)).toBeNull()
  })

  it('13: kopia (Ctrl) na buforze zabiera go jak każdy blok', () => {
    const d = day()
    const c = copyChange(d, { ...work, id: 'cp', startMin: lm('11:30') }, 'w', true)
    expect(c.takes?.id).toBe(bufferOf(d).id)
  })
})

describe('przegląd r2 (N7)', () => {
  it('3: dzień miniony w „Dziś” (bez rozsuwania – historia, D367) – `withBufferPushes` nie dokłada przesunięć buforów', () => {
    const plan2 = [{ ...meeting, durationMin: 40 }, { ...work, startMin: lm('11:30') }]
    const raw2 = { schema: 1, date: SAT, dayType: 'weekend', blocks: plan2 }
    const ctx = dayContextOf(inputs, { date: SAT, events: [], dayFile: dayFileFrom(raw2, SAT), nextFile: null }, marketDay, placeLogical('2026-10-30', lm('12:00')))
    const d = { ctx, state: computeDay(ctx) }
    const c = dragChange(d, 'meet', span('10:00', '11:30'), 'end', span('10:00', '10:40'), true)!
    expect(withBufferPushes(d, c, inputs.changes, dayFileFrom(raw2, SAT), false)).toEqual(c.pushed)
  })

  it('5: ostrzeżenie w trakcie przeciągania także dla kopii (Ctrl)', () => {
    const drag = { id: 'w', moved: true, onto: null, group: false, copy: true, dropped: false, edge: null, start: 690, end: 720, from: 840, fromEnd: 870 }
    expect(warnKeyOf(drag)).not.toBeNull()
  })

  it('6: „po bloku” nie proponuje też bufora zmienionego przez Ciebie (w pliku)', () => {
    const d = day()
    const mine = { ...bufferOf(d), decompress: undefined }
    expect(anchorCandidates([...d.ctx.plan.filter((b) => b.origin !== 'decompress'), mine], 'w').map((b) => b.id)).not.toContain(mine.id)
  })

  it('10: blok w tle położony na buforze go nie zabiera (biegną razem)', () => {
    const d = day()
    expect(bufferTakenBy(d, { ...work, startMin: lm('11:30'), background: true }, span('11:30', '12:00'))).toBeNull()
  })
})

describe('przegląd r3 (N7)', () => {
  /** A protected meal 11:35 – over the buffer (11:30–11:45) already: no change moves it. */
  const raw3 = { ...raw, blocks: [meeting, work, { ...meal, startMin: lm('11:35') }] }
  const day3 = () => {
    const ctx = dayContextOf(inputs, { date: SAT, events: [], dayFile: dayFileFrom(raw3, SAT), nextFile: null }, marketDay, placeLogical('2026-10-30', lm('12:00')))
    return { ctx, state: computeDay(ctx) }
  }

  it('2: krawędź bloku, który już leżał na buforze – bufor zostaje (zabiera tylko nowe położenie na nim)', () => {
    const d = day3()
    expect(d.ctx.plan.some((b) => b.origin === 'decompress')).toBe(true)
    expect(dragChange(d, 'm', span('11:35', '12:15'), 'end', span('11:35', '12:05'), true)!.takes ?? null).toBeNull()
  })

  it('2: panel – zmiana długości bloku na buforze nic nie zabiera; przeniesienie bloku na bufor – zabiera', () => {
    const d = day3()
    const m = d.ctx.plan.find((b) => b.id === 'm')!
    expect(panelTakes(d, m, { ...m, durationMin: 40 })).toBeNull()
    const w = d.ctx.plan.find((b) => b.id === 'w')!
    expect(panelTakes(d, w, { ...w, startMin: lm('11:30') })?.id).toBe(bufferOf(d).id)
  })

  it('5: blok upuszczony „obok” bufora – nie (bufor nie jest celem grupy) – także w „Tygodniu”', () => {
    const d = day()
    expect(parallelDrop(d.ctx.plan, 'w', bufferOf(d).id, 3, () => lm('11:45'))).toBeNull()
    const hb = (id: string, origin: PlanBlock['origin'], from: string, to: string) => ({ id, named: { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin }, categoryId: 'inne', startMin: lm(from), endMin: lm(to), state: 'planned' as const, outsidePlan: false, background: false })
    expect(weekOnto([hb('w', 'user', '14:00', '14:30'), hb('buf', 'decompress', '11:30', '11:45')], 'w', 'buf', 3, () => 'x')).toBeNull()
  })

  it('6: kopia bloku na jego własny bufor – podgląd ostrzega (zastępcze id kopii); klucz podglądu różni kopię od przeniesienia', () => {
    const d = day()
    const meet = d.ctx.plan.find((b) => b.id === 'meet')!
    const work10 = { ...meet, categoryId: 'inne' }
    expect(dragTaken(d, work10, span('11:30', '11:30'), null, span('10:00', '10:00'), true)?.id).toBe(bufferOf(d).id)
    expect(dragTaken(d, work10, span('11:30', '11:30'), null, span('10:00', '10:00'), false)).toBeNull()
    const drag = { id: 'w', moved: true, onto: null, group: false, dropped: false, edge: null, start: 690, end: 720, from: 840, fromEnd: 870 }
    expect(warnKeyOf({ ...drag, copy: true })).not.toBe(warnKeyOf({ ...drag, copy: false }))
  })

  it('8: dymek nazywa blok, za którym bufor stoi (kotwica), nie ten, z którego powstał', () => {
    const d = day()
    const moved = { ...bufferOf(d), anchor: 'w' }
    const nameOf = (b: PlanBlock) => b.id
    expect(takenNotice(d, { block: work, takes: moved }, nameOf)).toBe('Na miejscu dekompresji po w')
  })
})

describe('przegląd r4 (N7)', () => {
  it('2: blok na buforze A rozciągnięty krawędzią na bufor B – zabiera B (A zostaje)', () => {
    const second: PlanBlock = { ...meeting, id: 'meet2', startMin: lm('12:00') }
    const raw4 = { ...raw, blocks: [meeting, second, { ...meal, startMin: lm('11:35') }] }
    const ctx = dayContextOf(inputs, { date: SAT, events: [], dayFile: dayFileFrom(raw4, SAT), nextFile: null }, marketDay, placeLogical('2026-10-30', lm('12:00')))
    const d = { ctx, state: computeDay(ctx) }
    const [a, b] = ['meet', 'meet2'].map((src) => d.ctx.plan.find((x) => x.origin === 'decompress' && x.sourceId === src)!)
    const m = d.ctx.plan.find((x) => x.id === 'm')!
    // B after the second meeting (moved by A to 12:20): 13:50–14:05.
    const end = lm('14:00')
    expect(b!.startMin == null && a!.id !== b!.id).toBe(true)
    const c = dragChange(d, 'm', { startMin: m.startMin!, endMin: end }, 'end', { startMin: m.startMin!, endMin: m.startMin! + m.durationMin }, true)!
    expect(c.takes?.id).toBe(b!.id)
  })
})
