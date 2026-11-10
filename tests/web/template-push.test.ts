/**
 * D367, D372 – rozsuwanie on the axis of a template without a DOM: a block of the version dragged by its body or its
 * bottom edge, or a new one from the grid, on a taken place pushes the flexible blocks of the version after it apart –
 * counted on the day the version makes, written in the template's hours (also in the weeks the sessions start an hour
 * earlier and the day's wake moves the morning).
 */
import { describe, expect, it } from 'vitest'
import { dayPlan, firstFixedStart } from '@shared/engine/createDay'
import { computeDay } from '@shared/engine/day'
import { PLAN_MAX, planBlock, type PlanBlock, type Template, type TemplateVersion } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import { templateAdd, templateDrag, withTemplateChange } from '@renderer/features/templates/templatePush'
import { countDay } from '@renderer/store/day'
import { lm, Scenario } from '../unit/engine/dsl'

const tb = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => planBlock({ id, categoryId: 'inne', startMin: lm(at), durationMin: min, origin: 'template', ...o })

/** The day a version of the ordinary day's template makes on `date` – as the page of templates counts it. */
function templateDay(date: string, blocks: PlanBlock[]) {
  const version: TemplateVersion = { from: '2000-01-01', blocks, budgetMin: null, maxMin: null }
  const t: Template = { id: 'zwykly', name: 'Dzień zwykły', dayType: 'zwykly', weekdays: [], versions: [version], archived: false }
  const day = countDay(date, { date, dayFile: { schema: 1, date, dayType: 'zwykly' }, nextFile: null, prevFile: null, events: [], complete: true, unknown: false, away: false }, { changes: rdFrom(undefined).settings, templates: [t], lectures: [] }, placeLogical(date, 4 * 60), false)
  return { day, version }
}
const span = (from: string, to: string) => ({ startMin: lm(from), endMin: lm(to) })
const starts = (blocks: readonly PlanBlock[]) => Object.fromEntries(blocks.map((b) => [b.id, b.startMin]))

// A Sunday: no sessions, so nothing fixed stands in the evening.
const SUNDAY = '2026-11-15'
const EVENING = [tb('a', '18:00', 60), tb('b', '19:00', 60), tb('c', '20:00', 60)]

describe('D367, D372 – rozsuwanie w „Szablonach”', () => {
  it('przeciągnięcie bloku na zajęty: kolejne bloki szablonu dostają nowe godziny w jednej zmianie wersji', () => {
    const { day, version } = templateDay(SUNDAY, EVENING)
    const c = templateDrag(day, 'a', span('19:00', '20:00'), null, span('18:00', '19:00'))!
    expect(c.pushed).toBe(2)
    // The dragged block itself where it will stand, and the pushed ones.
    expect(c.preview).toEqual(
      new Map([
        ['a', span('19:00', '20:00')],
        ['b', span('20:00', '21:00')],
        ['c', span('21:00', '22:00')]
      ])
    )
    expect(starts(withTemplateChange(version, c))).toEqual({ a: lm('19:00'), b: lm('20:00'), c: lm('21:00') })
  })

  it('wydłużenie dolną krawędzią: długość bloku i przesunięte kolejne', () => {
    const { day, version } = templateDay(SUNDAY, EVENING)
    const c = templateDrag(day, 'a', span('18:00', '19:30'), 'end', span('18:00', '19:00'))!
    const blocks = withTemplateChange(version, c)
    expect(blocks.find((b) => b.id === 'a')!.durationMin).toBe(90)
    expect(starts(blocks)).toEqual({ a: lm('18:00'), b: lm('19:30'), c: lm('20:30') })
  })

  it('nowy blok z siatki na zajęte miejsce: dopisany do wersji, kolejne przesunięte', () => {
    const { day, version } = templateDay(SUNDAY, EVENING)
    const c = templateAdd(day, tb('x', '18:00', 30))
    expect(c.pushed).toBe(3)
    const blocks = withTemplateChange(version, c)
    expect(starts(blocks)).toEqual({ a: lm('18:30'), b: lm('19:30'), c: lm('20:30'), x: lm('18:00') })
    expect(blocks.find((b) => b.id === 'x')).toMatchObject({ origin: 'template', sourceId: null, durationMin: 30 })
  })

  it('stały blok szablonu zostaje, elastyczny przeskakuje go; w wolne miejsce – bez przesunięć', () => {
    const { day, version } = templateDay(SUNDAY, [tb('a', '18:00', 60), tb('b', '19:00', 45), tb('f', '20:00', 60, { fixed: true, categoryId: 'posilek' })])
    const c = templateDrag(day, 'a', span('18:30', '19:30'), null, span('18:00', '19:00'))!
    // b (45 min) after a would hit f at 20:00: behind it, 5 min of transition (another category).
    expect(starts(withTemplateChange(version, c))).toEqual({ a: lm('18:30'), b: lm('21:05'), f: lm('20:00') })
    expect(templateDrag(day, 'a', span('16:00', '17:00'), null, span('18:00', '19:00'))!.pushed).toBe(0)
  })

  it('tydzień, w którym sesje zaczynają się godzinę wcześniej: oś pokazuje poranek godzinę wcześniej, zapis idzie w godzinach szablonu', () => {
    // 10.03.2026: New York is on summer time, Warsaw not yet – the day's wake an hour before the template's.
    const { day, version } = templateDay('2026-03-10', [tb('m', '05:00', 30), tb('n', '05:30', 30)])
    expect(day.snapshot.wakeMin - day.snapshot.templateWakeMin).toBe(-60)
    const shown = (id: string) => day.ctx.plan.find((b) => b.sourceId === id)!.startMin
    expect([shown('m'), shown('n')]).toEqual([lm('04:00'), lm('04:30')])
    // m dragged on the axis from 04:00 to 04:15 pushes n to 04:45 – in the template 05:15 and 05:45.
    const c = templateDrag(day, 'm', span('04:15', '04:45'), null, span('04:00', '04:30'))!
    expect(c.preview).toEqual(
      new Map([
        ['m', span('04:15', '04:45')],
        ['n', span('04:45', '05:15')]
      ])
    )
    expect(starts(withTemplateChange(version, c))).toEqual({ m: lm('05:15'), n: lm('05:45') })
  })
})

describe('D372 – szablon w tygodniu przesunięcia sesji: miejsce tuż przed pierwszym stałym', () => {
  // 10.03.2026: the day's wake an hour early – the morning's blocks show an hour before their hours in the template, so
  // the hour before the first fixed block (the London session at 07:00) can show none of them.
  const DATE = '2026-03-10'
  const planned = (blocks: PlanBlock[], id: string) => templateDay(DATE, blocks).day.ctx.plan.find((b) => b.sourceId === id)!.startMin

  it('nowy blok kliknięty w tej godzinie dostaje pierwsze miejsce po niej, które dzień pokaże (start stałego) – nie godzinę wcześniej', () => {
    const { day, version } = templateDay(DATE, [tb('m', '05:00', 30)])
    expect(firstFixedStart(day.ctx.plan)).toBe(lm('07:00'))
    const c = templateAdd(day, tb('x', '06:30', 30))
    const blocks = withTemplateChange(version, c)
    expect(starts(blocks).x).toBe(lm('07:00'))
    expect(planned(blocks, 'x')).toBe(lm('07:00'))
  })

  it('blok przesunięty w tę godzinę staje tam, gdzie dzień go pokaże – podgląd to miejsce po zapisie', () => {
    const { day, version } = templateDay(DATE, [tb('m', '05:00', 60), tb('n', '06:40', 30)])
    // m (shown 04:00) dragged to 05:30 onto n (shown 05:40): n behind it would start at 06:30 – a place no morning block shows at.
    const c = templateDrag(day, 'm', span('05:30', '06:30'), null, span('04:00', '05:00'))!
    const blocks = withTemplateChange(version, c)
    expect(starts(blocks).m).toBe(lm('06:30'))
    expect(planned(blocks, 'm')).toBe(lm('05:30'))
    expect(c.preview.get('n')!.startMin).toBeGreaterThanOrEqual(lm('07:00'))
    expect(planned(blocks, 'n')).toBe(c.preview.get('n')!.startMin)
  })
})

describe('D372 – runda 2 przeglądu J3: brzegi przesunięcia pobudki w „Szablonach”', () => {
  const DATE = '2026-03-10'
  const recount = (blocks: PlanBlock[]) => templateDay(DATE, blocks).day.ctx.plan
  const shownOf = (blocks: PlanBlock[], id: string) => {
    const b = recount(blocks).find((x) => x.sourceId === id)!
    return span(clockOf(b.startMin!), clockOf(b.startMin! + b.durationMin))
  }
  const clockOf = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

  it('górna krawędź w godzinie, której dzień nie pokaże: koniec zostaje, blok ma co najmniej 5 min – start cofa się, a podpowiedź i podgląd to zapis', () => {
    // m: in the template 06:40–07:10, shown 05:40–06:10. Its top edge to 06:00 (end 06:10): the day can show it from 07:00 only – past its end.
    const { day, version } = templateDay(DATE, [tb('m', '06:40', 30)])
    const c = templateDrag(day, 'm', span('06:00', '06:10'), 'top', span('05:40', '06:10'))!
    expect(c.span).toEqual(span('05:55', '06:10'))
    expect(c.durationMin).toBe(15)
    expect(c.preview.get('m')).toEqual(c.span)
    const blocks = withTemplateChange(version, c)
    expect(blocks.find((b) => b.id === 'm')).toMatchObject({ startMin: lm('06:55'), durationMin: 15 })
    expect(shownOf(blocks, 'm')).toEqual(c.span)
  })

  it('przeciągnięty blok w tę godzinę: miejsce po niej (start stałego) – tam go trzyma oś i tam stoi po zapisie', () => {
    const { day, version } = templateDay(DATE, [tb('m', '05:00', 30)])
    const c = templateDrag(day, 'm', span('06:30', '07:00'), null, span('04:00', '04:30'))!
    expect(c.span).toEqual(span('07:00', '07:30'))
    expect(c.preview.get('m')).toEqual(c.span)
    expect(shownOf(withTemplateChange(version, c), 'm')).toEqual(c.span)
  })

  it('dwa bloki przesunięte w tę godzinę dostają kolejne miejsca w kolejności osi (nie ten sam start stałego, który rozstrzygałby identyfikator)', () => {
    // m (shown 04:00) dragged to 05:30 onto zn (05:40) and ao (05:50): both would go to the hour before 07:00.
    const { day, version } = templateDay(DATE, [tb('m', '05:00', 60), tb('zn', '06:40', 10), tb('ao', '06:50', 10)])
    const c = templateDrag(day, 'm', span('05:30', '06:30'), null, span('04:00', '05:00'))!
    const blocks = withTemplateChange(version, c)
    expect(c.preview.get('zn')!.startMin).toBeLessThan(c.preview.get('ao')!.startMin)
    expect(shownOf(blocks, 'zn')).toEqual(c.preview.get('zn'))
    expect(shownOf(blocks, 'ao')).toEqual(c.preview.get('ao'))
  })

  it('stały blok szablonu przeciągnięty przez poranek: bloki, które przez to przestają się przesuwać z pobudką, są w podglądzie tam, gdzie staną', () => {
    // f (fixed, 06:00 in the template) is the first fixed block: m (05:30) before it shows at 04:30. f dragged to 05:00 –
    // m is no longer before the first fixed block: the day shows it at 05:30 (its hour in the template), nothing written.
    const { day, version } = templateDay(DATE, [tb('f', '06:00', 30, { fixed: true, categoryId: 'posilek' }), tb('m', '05:30', 30)])
    expect(shownOf(version.blocks, 'm')).toEqual(span('04:30', '05:00'))
    const c = templateDrag(day, 'f', span('05:00', '05:30'), null, span('06:00', '06:30'))!
    const blocks = withTemplateChange(version, c)
    expect(blocks.find((b) => b.id === 'm')!.startMin).toBe(lm('05:30'))
    expect(c.preview.get('m')).toEqual(shownOf(blocks, 'm'))
    expect(c.preview.get('m')).toEqual(span('05:30', '06:00'))
  })
})

describe('D372 – runda 3 przeglądu J3', () => {
  const DATE = '2026-03-10'
  const clockOf = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
  const shownOf = (date: string, blocks: PlanBlock[], id: string) => {
    const b = templateDay(date, blocks).day.ctx.plan.find((x) => x.sourceId === id)!
    return span(clockOf(b.startMin!), clockOf(b.startMin! + b.durationMin))
  }

  it('górna krawędź w godzinie, której dzień nie pokaże: zawsze wcześniejsze miejsce, koniec zostaje (05:30–07:30, krawędź na 06:20 → 05:55–07:30)', () => {
    // b: 06:30–08:30 in the template, shown an hour earlier (before the first fixed block, London at 07:00).
    const { day, version } = templateDay(DATE, [tb('b', '06:30', 120)])
    expect(shownOf(DATE, version.blocks, 'b')).toEqual(span('05:30', '07:30'))
    const c = templateDrag(day, 'b', span('06:20', '07:30'), 'top', span('05:30', '07:30'))!
    expect(c.span).toEqual(span('05:55', '07:30'))
    const blocks = withTemplateChange(version, c)
    expect(blocks.find((x) => x.id === 'b')).toMatchObject({ startMin: lm('06:55'), durationMin: 95 })
    expect(shownOf(DATE, blocks, 'b')).toEqual(c.span)
  })

  it('blok zakotwiczony do przesuniętego: w podglądzie tam, gdzie stanie (za swoją kotwicą)', () => {
    const { day, version } = templateDay(SUNDAY, [tb('a', '18:00', 60), tb('po', '18:00', 30, { anchor: 'a', startMin: null }), tb('c', '19:00', 60)])
    const c = templateDrag(day, 'a', span('18:30', '19:30'), null, span('18:00', '19:00'))!
    expect(c.preview.get('po')).toEqual(span('19:30', '20:00'))
    const after = templateDay(SUNDAY, withTemplateChange(version, c)).day.ctx.plan
    expect(after.find((b) => b.sourceId === 'c')!.startMin).toBe(c.preview.get('c')!.startMin)
  })
})

describe('D372 – runda 3: dolna krawędź przy końcu doby, gdy pobudka przesuwa poranek', () => {
  /** A day whose wake (05:00) is an hour before its template's (06:00) and with no fixed block: every flexible block of the template moves. */
  function earlyDay(blocks: PlanBlock[]) {
    const s = new Scenario({ date: SUNDAY, plan: blocks.map((b) => ({ ...b, sourceId: b.id })), wake: '05:00' })
    const raw = s.contextAt(s.at('04:00'))
    const ctx = { ...raw, plan: dayPlan(s.snapshot, null) }
    return { ctx, state: computeDay(ctx), snapshot: s.snapshot }
  }

  it('wydłużony blok, którego dzień nie pokaże tak późno w całości: start z długością po zmianie – `c.span` to miejsce po zapisie', () => {
    // m: 02:40 (+1) in the template, 30 min – shown at 01:40. Its bottom edge to 04:20: 160 min – the day shows a moved block
    // at 03:59 less its length at the latest: from 01:19.
    const m = tb('m', '02:40', 30)
    const day = earlyDay([m])
    expect(day.ctx.plan[0]!.startMin).toBe(lm('01:40'))
    const c = templateDrag(day, 'm', { startMin: lm('01:40'), endMin: lm('01:40') + 160 }, 'end', { startMin: lm('01:40'), endMin: lm('02:10') })!
    expect(c.durationMin).toBe(160)
    const blocks = withTemplateChange({ from: '2000-01-01', blocks: [m], budgetMin: null, maxMin: null }, c)
    const shown = dayPlan({ ...day.snapshot, blocks: blocks.map((b) => ({ ...b, sourceId: b.id })) }, null)[0]!
    expect(c.span).toEqual({ startMin: shown.startMin!, endMin: shown.startMin! + shown.durationMin })
    expect(c.span.startMin).toBe(PLAN_MAX - 160)
  })
})
