/**
 * „Sprawy” after the third review of L2 (T769): a sprawa's old block is taken out of its day only on a day today or later
 * and only when the day's log says it has not begun – a day gone by is history, never rewritten (the morning's step and a
 * drop alike, one rule `oldBlockTakeable`); the morning's step gives the days it changed (`days`), nothing else.
 */
import { describe, expect, it } from 'vitest'
import { casePlan, morningPlan, oldBlockTakeable } from '@shared/engine/cases'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { dayFileFrom } from '@shared/model/plan'
import { newTask } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'

const TODAY = '2026-11-12'
const YESTERDAY = '2026-11-11'
const at = (date: string, hh = 12) => placeLogical(date, hh * 60)
const rules = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]))
const old = { id: 'old', categoryId: 'inne', startMin: 600, durationMin: 30, origin: 'user', task: 't1' }
const task = (day: string) => ({ ...newTask('t1', at(day), day, { title: 'x', list: 'today' })!, day, block: 'old', state: 'planned' })

describe('stary blok sprawy: tylko dziś i później, niezaczęty według logu (T769)', () => {
  it('reguła: dzień miniony – nigdy; dziś i później – tylko gdy log mówi „niezaczęty”; nieznane – nie', () => {
    expect(oldBlockTakeable(YESTERDAY, TODAY, false)).toBe(false)
    expect(oldBlockTakeable(TODAY, TODAY, false)).toBe(true)
    expect(oldBlockTakeable('2026-11-13', TODAY, false)).toBe(true)
    expect(oldBlockTakeable(TODAY, TODAY, true)).toBe(false)
    expect(oldBlockTakeable(TODAY, TODAY, undefined)).toBe(false)
  })

  it('plan poranny: zaparkowany blok wczorajszy zostaje we wczorajszym pliku – historii się nie przepisuje', () => {
    const out = morningPlan({ date: TODAY, dayFile: null, requests: [], tasks: [task(YESTERDAY)], startMin: 600, rules, at: at(TODAY, 8), files: { [YESTERDAY]: { schema: 1, date: YESTERDAY, blocks: [old] } }, goneOf: (d) => (d === YESTERDAY ? new Set(['old']) : undefined) })
    expect(out.blocks).toHaveLength(1)
    expect(Object.keys(out.days)).toEqual([TODAY])
    expect('day' in out).toBe(false)
  })

  it('plan poranny: zaparkowany blok dzisiejszy wychodzi z dnia', () => {
    const out = morningPlan({ date: TODAY, dayFile: { schema: 1, date: TODAY, blocks: [old] }, requests: [], tasks: [task(TODAY)], startMin: 720, rules, at: at(TODAY, 8), goneOf: () => new Set(['old']) })
    expect(dayFileFrom(out.days[TODAY], TODAY).blocks.map((b) => [b.task, b.startMin])).toEqual([['t1', 720]])
  })

  it('upuszczenie: stary blok dziś, „zaczęty” nieznany (log niepełny) – odmowa z powodem, nic nie liczone (T774)', () => {
    const p = casePlan({ record: task(TODAY), date: '2026-11-13', startMin: 700, files: { '2026-11-13': null, [TODAY]: { schema: 1, date: TODAY, blocks: [old] } }, rules, at: at(TODAY, 9), begun: () => undefined })
    expect(p).toEqual({ refused: 'begunUnknown' })
    // Someone else's block under that id, or a day gone by: nothing to take – no refusal.
    expect(casePlan({ record: task(YESTERDAY), date: TODAY, startMin: 700, files: { [TODAY]: null, [YESTERDAY]: { schema: 1, date: YESTERDAY, blocks: [old] } }, rules, at: at(TODAY, 9), begun: () => undefined })).toHaveProperty('block')
  })

  it('upuszczenie: blok dnia minionego zostaje, choćby log mówił „niezaczęty”', () => {
    const p = casePlan({ record: task(YESTERDAY), date: TODAY, startMin: 700, files: { [TODAY]: null, [YESTERDAY]: { schema: 1, date: YESTERDAY, blocks: [old] } }, rules, at: at(TODAY, 9), begun: () => false })
    expect(p && 'days' in p ? Object.keys(p.days) : p).toEqual([TODAY])
  })
})
