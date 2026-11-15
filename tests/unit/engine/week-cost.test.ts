/**
 * D501: the cost per hour a block of a day of „Tydzień” / „3 dni” carries for its tile (`HorizonBlock.cost`): its own, else its variant's, else its
 * category's; the window of the tile may open only for a block of the plan still to come (not begun, not passed, not outside the plan).
 */
import { describe, expect, it } from 'vitest'
import { horizonDay } from '@shared/engine/week'
import { dayEnd } from '@shared/time/day'
import { block, Scenario } from './dsl'

const DATE = '2026-11-03'
const plan = [
  block({ id: 'a', cat: 'analiza', at: '08:00', min: 60 }),
  { ...block({ id: 'own', cat: 'analiza', at: '10:00', min: 60 }), costs: { head: 5, emotions: 0, senses: -1, body: 2 } },
  block({ id: 'reg', cat: 'regeneracja', variant: 'cisza', at: '12:00', min: 30 }),
  block({ id: 'missed', cat: 'analiza', at: '14:00', min: 30 })
]

describe('koszt na kafelku widoków wielodniowych (D501)', () => {
  it('dzień przyszły: koszt kategorii, własny koszt wygrywa, regeneracja ujemna; wszystkie do zmiany', () => {
    const s = new Scenario({ date: DATE, plan })
    const d = horizonDay(s.contextAt(s.at('04:00')), 'future')
    const by = Object.fromEntries(d.blocks.map((b) => [b.id, b.cost]))
    expect(by.a).toEqual({ costs: { head: 3, emotions: 1, senses: 1, body: 0 }, base: { head: 3, emotions: 1, senses: 1, body: 0 }, own: false, edit: true })
    expect(by.own).toEqual({ costs: { head: 5, emotions: 0, senses: -1, body: 2 }, base: { head: 3, emotions: 1, senses: 1, body: 0 }, own: true, edit: true })
    expect(by.reg).toMatchObject({ costs: { head: -1, emotions: -2, senses: -3, body: -1 }, own: false, edit: true })
  })

  it('dziś: zaczęty blok (także poza planem) – koszt, którym silnik liczy teraz, z okienkiem; skończony – sam napis (reguła A)', () => {
    const s = new Scenario({ date: DATE, plan: plan.map((b) => ({ ...b })) })
    s.start('own', '10:00').start('x', '10:05', { cat: 'analiza', min: 20 }).ran('a', '08:05', '09:00')
    s.opts.plan[1] = { ...s.opts.plan[1]!, costs: { head: 1, emotions: 1, senses: 1, body: 1 } }
    const t = s.at('10:10')
    s.write([{ k: 'block.cost', block: 'x', at: t, costs: { head: 0, emotions: 0, senses: 0, body: 0 } }], t)
    const by = Object.fromEntries(horizonDay(s.contextAt(s.at('10:15')), 'today').blocks.map((b) => [b.id, b]))
    expect(by.own!.cost).toMatchObject({ costs: { head: 5, emotions: 0, senses: -1, body: 2 }, own: true, edit: true })
    expect(by.x).toMatchObject({ outsidePlan: true, cost: { costs: { head: 0, emotions: 0, senses: 0, body: 0 }, own: true, edit: true } })
    expect(by.a!.cost).toMatchObject({ edit: false })
  })

  it('koszt liczy się tylko dla kafelków („Tydzień”, „3 dni” – z krzywą); miesiąc, cele i „Agenda” (bez krzywej) go nie mają', () => {
    const s = new Scenario({ date: DATE, plan })
    const ctx = s.contextAt(s.at('04:00'))
    expect(horizonDay(ctx, 'future').blocks.every((b) => b.cost != null)).toBe(true)
    expect(horizonDay(ctx, 'future', null, { curve: false }).blocks.some((b) => b.cost != null)).toBe(false)
  })

  it('dzień miniony: koszt jest, zmienić go nie wolno (zaczęty, niezaczęty, poza planem)', () => {
    const s = new Scenario({ date: DATE, plan })
    s.ran('a', '08:05', '09:00')
    s.ran('x', '13:00', '13:20', { cat: 'analiza', min: 20 })
    const d = horizonDay(s.contextAt(dayEnd(DATE) + 3_600_000), 'past')
    const by = Object.fromEntries(d.blocks.map((b) => [b.id, b]))
    expect(by.a!.cost).toMatchObject({ costs: { head: 3, emotions: 1, senses: 1, body: 0 }, edit: false })
    expect(by.missed!.cost).toMatchObject({ edit: false })
    expect(by.x).toMatchObject({ outsidePlan: true, cost: { edit: false, own: false } })
  })
})
