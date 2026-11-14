/**
 * „Postaw na osi” (D464): the end typed makes the block as long as it says, the sprawa's estimate stays – without it the block is as
 * long as the estimate (as before).
 */
import { describe, expect, it } from 'vitest'
import { caseBlock, casePlan, type CasePlan } from '@shared/engine/cases'
import { DEFAULT_CATEGORIES } from '@shared/model/categories'
import { newRequest, newTask, requestFrom } from '@shared/model/requests'
import { placeLogical } from '@shared/time/day'

const DAY = '2026-11-12'
const rules = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, c]))
const task = newTask('t1', placeLogical(DAY, 12 * 60), DAY, { title: 'x', list: 'today', estimateMin: 45 })!
const request = newRequest('r1', 1, { person: null, estimateMin: 20, note: '' })

describe('długość bloku sprawy z godziny końca (D464)', () => {
  it('zadanie i prośba: blok tak długi, jak podano; bez podania – jak szacunek', () => {
    expect(caseBlock(requestFrom(task)!, 600, rules).durationMin).toBe(45)
    expect(caseBlock(requestFrom(task)!, 600, rules, 90).durationMin).toBe(90)
    expect(caseBlock(requestFrom(request)!, 600, rules).durationMin).toBe(20)
    expect(caseBlock(requestFrom(request)!, 600, rules, 75).durationMin).toBe(75)
  })

  it('`casePlan` niesie długość do zapisanego bloku; rekord sprawy zachowuje szacunek', () => {
    const p = casePlan({ record: task, date: DAY, startMin: 600, durationMin: 120, files: { [DAY]: null }, rules, at: placeLogical(DAY, 9 * 60), begun: () => false }) as CasePlan
    expect(p.block.durationMin).toBe(120)
    expect(requestFrom(p.record)!.estimateMin).toBe(45)
  })
})
