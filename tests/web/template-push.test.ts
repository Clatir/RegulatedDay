/**
 * D367, D372 – rozsuwanie on the axis of a template without a DOM: a block of the version dragged by its body or its
 * bottom edge, or a new one from the grid, on a taken place pushes the flexible blocks of the version after it apart –
 * counted on the day the version makes, written in the template's hours (also in the weeks the sessions start an hour
 * earlier and the day's wake moves the morning).
 */
import { describe, expect, it } from 'vitest'
import { planBlock, type PlanBlock, type Template, type TemplateVersion } from '@shared/model/plan'
import { rdFrom } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import { templateAdd, templateDrag, withTemplateChange } from '@renderer/features/templates/templatePush'
import { countDay } from '@renderer/store/day'
import { lm } from '../unit/engine/dsl'

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
    expect(c.preview).toEqual(
      new Map([
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
    expect(c.preview).toEqual(new Map([['n', span('04:45', '05:15')]]))
    expect(starts(withTemplateChange(version, c))).toEqual({ m: lm('05:15'), n: lm('05:45') })
  })
})
