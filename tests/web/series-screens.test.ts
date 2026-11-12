/**
 * The screens of series (D381, D401, T711): the occurrence of a series is marked ↻ on the axis of the day (not a block of
 * the template or of yours); what the window says of a result of the series API – a refusal with its reason, a question that
 * waits, a success with „Cofnij” that sends the files back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeriesResult } from '@shared/api'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { rdFrom } from '@shared/model/rd'
import { dayAxis } from '@renderer/features/plan/dayItems'
import { resultAnswer } from '@renderer/features/series/seriesActions'
import { closeToast, useUi } from '@renderer/store/ui'
import type { DayModel } from '@renderer/store/day'
import { block, Scenario } from '../unit/engine/dsl'

const DATE = '2026-11-18'

describe('znak ↻ na osi dnia', () => {
  it('tylko wystąpienie serii go ma; blok szablonu i własny – nie', () => {
    const plan = [
      block({ id: 'occ', cat: 'inne', at: '10:00', min: 60, origin: 'series', source: 's1' }),
      block({ id: 'tpl', cat: 'inne', at: '12:00', min: 60, origin: 'template' }),
      block({ id: 'mine', cat: 'inne', at: '14:00', min: 60, origin: 'user' })
    ]
    const s = new Scenario({ date: DATE, plan }).observe('07:00', null)
    const ctx = s.contextAt(s.at('08:00'))
    const state = computeDay(ctx)
    const model = { date: DATE, ctx, state, energy: computeEnergy(ctx, state) } as unknown as DayModel
    const names = { rd: rdFrom({}), settings: s.settings, routines: [], requests: [] }
    const items = dayAxis(model, names, s.at('08:00')).items
    expect(items.map((i) => [i.id, i.series === true])).toEqual([
      ['occ', true],
      ['tpl', false],
      ['mine', false]
    ])
  })
})

const result = (o: Partial<SeriesResult> = {}): SeriesResult => ({ ok: true, error: null, code: null, seriesId: 's1', outcomes: [], undo: [{ rel: 'series/s1.json', before: null, after: { id: 's1' } }], ...o })

beforeEach(() => {
  // The store commits the active field first; there is no document in this environment.
  Object.assign(globalThis, { document: { activeElement: null }, HTMLElement: class {}, HTMLInputElement: class {}, HTMLTextAreaElement: class {} })
  for (const x of useUi.getState().toasts) closeToast(x.id)
})

describe('co okno mówi o wyniku zmiany serii', () => {
  it('odmowa: powód w toaście, nic nie zapisano', () => {
    const undo = vi.fn()
    expect(resultAnswer(result({ ok: false, error: 'Ta seria już się zakończyła.', code: 'ended', undo: [] }), 'Seria zmieniona', undo)).toBe(false)
    expect(useUi.getState().toasts.map((t) => [t.text, t.kind])).toEqual([['Ta seria już się zakończyła.', 'error']])
    expect(undo).not.toHaveBeenCalled()
  })

  it('zapisano: toast „Cofnij” oddaje pliki', () => {
    const undo = vi.fn()
    const r = result()
    expect(resultAnswer(r, 'Seria zmieniona', undo)).toBe(true)
    const [t] = useUi.getState().toasts
    expect(t).toMatchObject({ text: 'Seria zmieniona', action: { label: 'Cofnij' } })
    t!.action!.run()
    expect(undo).toHaveBeenCalledWith(r)
  })

  it('zmiana bez plików (nic do zapisania) – zapisano, bez „Cofnij”', () => {
    expect(resultAnswer(result({ undo: [] }), 'Seria zmieniona', vi.fn())).toBe(true)
    expect(useUi.getState().toasts).toEqual([])
  })

  it('pytanie po konflikcie: czeka na odpowiedź, nie udaje sukcesu', () => {
    const answer = resultAnswer(result({ ok: false, outcomes: [{ status: 'conflict' }], undo: [] }), 'Seria zmieniona', vi.fn())
    expect(answer).toBe('asked')
    expect(useUi.getState().toasts[0]?.text).toMatch(/pytanie u góry okna/)
  })

  it('plik uszkodzony: odmowa', () => {
    expect(resultAnswer(result({ ok: false, outcomes: [{ status: 'broken' }], undo: [] }), 'x', vi.fn())).toBe(false)
  })
})
