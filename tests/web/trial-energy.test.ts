// @vitest-environment jsdom
/**
 * Energy live in the window (N19, T2579): the trial is counted off the pointer's path – only the newest change, once it has stayed the newest
 * for `TRIAL_DELAY_MS` (a dropped one is never built), a change counted once on a day remembered by its key, another count of the day counts
 * again (the last result stands meanwhile, not fresh), no trial (Esc, the drop) – nothing at once. And the drag's change of „Dziś”
 * (`dragChange`, D367) as a trial: the plan after it with the pushed starts – what the preview shows is what is counted.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeDay } from '@shared/engine/day'
import { computeEnergy } from '@shared/engine/energy'
import { trialLowest, type TrialChange, type TrialDay, type TrialLowest } from '@shared/engine/trialEnergy'
import type { Answer } from '@shared/model/events'
import type { Pool } from '@shared/model/categories'
import type { PlanBlock } from '@shared/model/plan'
import { changeTrial, TRIAL_DELAY_MS, TrialRunner, useTrialLowest, type Trial, type TrialShown } from '@renderer/features/plan/trialEnergy'
import { dragChange, planAfter, pushedSpans } from '@renderer/features/today/dayPush'
import { block, lm, Scenario } from '../unit/engine/dsl'

const DATE = '2026-10-28'
const ZERO: Record<Pool, [Answer, Answer]> = { head: [0, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] }
const flex = (id: string, at: string, min: number, o: Partial<PlanBlock> = {}): PlanBlock => ({ ...block({ id, cat: 'inne', at, min, origin: 'user' }), ...o })
const PLAN = [
  flex('drogi', '08:00', 120, { categoryId: 'analiza' }),
  flex('regen', '10:00', 120, { categoryId: 'regeneracja', fixed: true }),
  flex('praca', '14:00', 120, { categoryId: 'analiza' })
]
const span = (from: string, to: string) => ({ startMin: lm(from), endMin: lm(to) })

function counted(plan = PLAN): TrialDay {
  const s = new Scenario({ date: DATE, plan, wake: '06:30', settings: { transitionBufferMin: 0 } }).observe('06:30', null).checkin('07:00', ZERO)
  const ctx = s.contextAt(s.at('07:30'))
  const state = computeDay(ctx)
  return { ctx, state, energy: computeEnergy(ctx, state, { moduleOn: true }) }
}

/** A day stand-in (the runner only compares days by identity) and a count that says which change it counted. */
const fakeDay = (): TrialDay => ({}) as TrialDay
const lowest = (after: number): TrialLowest => ({ before: 60, after, pool: 'head', beforePool: 'head', assumed: false })
function fakeCount() {
  const counted: number[] = []
  const count = (_day: TrialDay, change: TrialChange) => {
    const after = (change as { after: number }).after
    counted.push(after)
    return lowest(after)
  }
  return { counted, count }
}
/** A trial whose building is counted too (a dropped change is never built). */
function trialOf(after: number, built: number[]): Trial {
  return {
    key: `k${after}`,
    change: () => {
      built.push(after)
      return { after } as unknown as TrialChange
    }
  }
}

describe('N19 – `TrialRunner`: najnowsza zmiana wygrywa, nic w trakcie ruchu', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('zmiany jedna po drugiej szybciej niż opóźnienie – policzona tylko ostatnia, porzucone nawet niezbudowane', () => {
    const { counted, count } = fakeCount()
    const built: number[] = []
    const r = new TrialRunner(TRIAL_DELAY_MS, count)
    const day = fakeDay()
    for (const after of [50, 49, 48, 47]) {
      r.ask(day, trialOf(after, built))
      vi.advanceTimersByTime(TRIAL_DELAY_MS - 1)
    }
    expect(r.snapshot()).toBeNull()
    vi.advanceTimersByTime(1)
    expect(built).toEqual([47])
    expect(counted).toEqual([47])
    expect(r.snapshot()).toEqual({ ...lowest(47), fresh: true })
  })

  it('ta sama zmiana drugi raz (powrót nad to samo miejsce) – od razu z pamięci, bez liczenia; w czasie liczenia nowej – poprzedni wynik, nieświeży', () => {
    const { counted, count } = fakeCount()
    const built: number[] = []
    const r = new TrialRunner(TRIAL_DELAY_MS, count)
    const day = fakeDay()
    r.ask(day, trialOf(50, built))
    vi.advanceTimersByTime(TRIAL_DELAY_MS)
    r.ask(day, trialOf(40, built))
    expect(r.snapshot()).toEqual({ ...lowest(50), fresh: false })
    vi.advanceTimersByTime(TRIAL_DELAY_MS)
    expect(r.snapshot()).toEqual({ ...lowest(40), fresh: true })
    r.ask(day, trialOf(50, built))
    expect(r.snapshot()).toEqual({ ...lowest(50), fresh: true })
    vi.advanceTimersByTime(TRIAL_DELAY_MS * 3)
    expect(counted).toEqual([50, 40])
  })

  it('dzień, który właśnie doszedł (był null) – próba liczona od razu (`onArrival`); bez tej opcji, i przy kolejnej zmianie, po opóźnieniu', () => {
    const { counted, count } = fakeCount()
    const r = new TrialRunner(TRIAL_DELAY_MS, count)
    r.ask(null, null)
    r.ask(fakeDay(), trialOf(50, []), true)
    expect(counted).toEqual([50])
    expect(r.snapshot()).toEqual({ ...lowest(50), fresh: true })
    // The next change on that day waits for a rest as ever.
    const day = fakeDay()
    const r2 = new TrialRunner(TRIAL_DELAY_MS, count)
    r2.ask(null, null)
    r2.ask(day, trialOf(40, []))
    expect(r2.snapshot()).toBeNull()
    vi.advanceTimersByTime(TRIAL_DELAY_MS)
    expect(r2.snapshot()?.after).toBe(40)
    r.ask(r['day'], trialOf(30, []), true)
    expect(counted).toEqual([50, 40])
    vi.advanceTimersByTime(TRIAL_DELAY_MS)
    expect(counted).toEqual([50, 40, 30])
  })

  it('brak próby (Esc, upuszczenie, zamknięte okienko) – od razu nic, czekająca porzucona', () => {
    const { counted, count } = fakeCount()
    const r = new TrialRunner(TRIAL_DELAY_MS, count)
    const day = fakeDay()
    r.ask(day, trialOf(50, []))
    vi.advanceTimersByTime(TRIAL_DELAY_MS)
    r.ask(day, trialOf(40, []))
    r.ask(day, null)
    expect(r.snapshot()).toBeNull()
    vi.advanceTimersByTime(TRIAL_DELAY_MS * 3)
    expect(counted).toEqual([50])
    expect(r.snapshot()).toBeNull()
  })

  it('nowe policzenie dnia (zegar, dane) – ta sama zmiana liczona od nowa; do tego czasu stary wynik, nieświeży', () => {
    const { counted, count } = fakeCount()
    const r = new TrialRunner(TRIAL_DELAY_MS, count)
    const t = trialOf(50, [])
    r.ask(fakeDay(), t)
    vi.advanceTimersByTime(TRIAL_DELAY_MS)
    r.ask(fakeDay(), t)
    expect(r.snapshot()).toEqual({ ...lowest(50), fresh: false })
    vi.advanceTimersByTime(TRIAL_DELAY_MS)
    expect(counted).toEqual([50, 50])
    expect(r.snapshot()?.fresh).toBe(true)
  })

  it('próba bez zmiany (null) albo z błędem – bez podpisu, przeciąganie trwa', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const r = new TrialRunner(TRIAL_DELAY_MS, () => {
      throw new Error('nie')
    })
    const day = fakeDay()
    r.ask(day, { key: 'pusta', change: () => null })
    vi.advanceTimersByTime(TRIAL_DELAY_MS)
    expect(r.snapshot()).toBeNull()
    r.ask(day, { key: 'zła', change: () => ({}) })
    expect(() => vi.advanceTimersByTime(TRIAL_DELAY_MS)).not.toThrow()
    expect(r.snapshot()).toBeNull()
    warn.mockRestore()
  })
})

describe('N19 – `useTrialLowest` w komponencie', () => {
  let root: Root | null = null
  let host: HTMLElement | null = null
  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    vi.useRealTimers()
  })

  it('przeciągnięcie drogiego bloku (`dragChange` + `changeTrial`) – spadek po opóźnieniu, Esc (brak próby) – nic', () => {
    const day = counted()
    const seen: Array<TrialShown | null> = []
    function Caption({ trial }: { trial: Trial | null }) {
      seen.push(useTrialLowest(day, trial))
      return null
    }
    const drag: Trial = { key: 'drogi:body:960', change: () => changeTrial(day, dragChange(day, 'drogi', span('16:00', '18:00'), null, span('08:00', '10:00'), true)!) }
    act(() => root!.render(createElement(Caption, { trial: drag })))
    expect(seen.at(-1)).toBeNull()
    act(() => vi.advanceTimersByTime(TRIAL_DELAY_MS))
    const shown = seen.at(-1)!
    expect(shown.fresh).toBe(true)
    expect(shown.after).toBeLessThan(shown.before)
    expect(shown.pool).toBe('head')
    act(() => root!.render(createElement(Caption, { trial: null })))
    expect(seen.at(-1)).toBeNull()
  })
})

describe('N19 – zmiana przeciągnięcia jako próba: ten sam plan co podgląd osi (D367)', () => {
  it('rozsunięty blok stoi w próbie tam, gdzie pokazuje go podgląd; drogi blok przed pracą popołudniową – niżej', () => {
    const day = counted()
    const c = dragChange(day, 'drogi', span('13:00', '15:00'), null, span('08:00', '10:00'), true)!
    const trial = changeTrial(day, c)
    expect(trial.plan?.find((b) => b.id === 'praca')?.startMin).toBe(pushedSpans(day, c, 'forecast')?.get('praca')?.startMin)
    expect(trial.plan).toEqual(planAfter(day.ctx.plan, c))
    const t = trialLowest(day, trial)!
    expect(t.after).toBeLessThan(t.before)
  })

  it('dolna krawędź (D365): dłuższy blok – niżej', () => {
    const day = counted()
    const c = dragChange(day, 'praca', span('14:00', '18:00'), 'end', span('14:00', '16:00'), true)!
    const t = trialLowest(day, changeTrial(day, c))!
    expect(t.after).toBeLessThan(t.before)
  })
})
