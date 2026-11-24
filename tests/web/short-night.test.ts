// @vitest-environment jsdom
/**
 * The hint of a short night in the check-in (D571, N2): yesterday's logs (read the way the window reads every day – `dayData`)
 * with input until 01:40 past the bedtime 22:00 – at „Spałem krócej niż zwykle?” the line „Wczoraj przy komputerze do 01:40
 * (pora snu 22:00)” and „tak” chosen beforehand; your answer wins; nothing is written before „Zapisz”; the hint taken once for the
 * showing (a read of yesterday that cannot be used now or says otherwise does not take „tak” back by itself).
 */
import { act, createElement, Fragment, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Checkin } from '@renderer/features/today/MorningPlan'
import { checkinAnswersOf, shownAnswers, shortNightNote } from '@renderer/features/today/checkinLogic'
import { nightDataKey, nightKept, nightOf, useCheckinHint, useShortNight } from '@renderer/features/today/shortNight'
import { logEvents, useData } from '@renderer/store/data'
import { useDayData, type DayModel } from '@renderer/store/day'
import { useUi } from '@renderer/store/ui'
import type { DataView, DayData, RdApi } from '@shared/api'
import { computeDay } from '@shared/engine/day'
import { RULES_VERSION } from '@shared/model/events'
import { rdFrom } from '@shared/model/rd'
import { placeLogical } from '@shared/time/day'
import { addDays } from '@shared/time/zone'

vi.mock('@renderer/store/data', async (orig) => ({ ...(await orig<typeof import('@renderer/store/data')>()), logEvents: vi.fn(async () => true) }))
vi.mock('@shared/engine/day', async (orig) => {
  const m = await orig<typeof import('@shared/engine/day')>()
  return { ...m, computeDay: vi.fn(m.computeDay) }
})

const MIN = 60_000

/** Yesterday's log of one computer: observed 21:00–02:00 (alive every 5 min), the gap in input and in use from `idleFrom`. */
function logOf(day: string, idleFrom: number, computer = 'pcb'): unknown[] {
  let n = 0
  const ev = (k: string, at: number, extra: Record<string, unknown> = {}) => ({ id: `${computer}-${n}`, c: computer, n: n++, t: at, l: at, v: RULES_VERSION, day, dom: 'meta', k, ...extra })
  const from = placeLogical(day, 21 * 60)
  const to = placeLogical(day, 26 * 60)
  const out: unknown[] = [ev('observe.from', from, { at: from, why: 'start' })]
  for (let t = from + 5 * MIN; t < to; t += 5 * MIN) out.push(ev('observe.alive', t, { at: t }))
  for (const kind of ['input', 'use']) out.push(ev('gap.open', idleFrom + 2 * MIN, { gap: `${computer}-${kind}`, kind, from: idleFrom, lastOutside: idleFrom }))
  out.push(ev('observe.to', to, { at: to, why: 'quit' }))
  return out
}
const dataOf = (date: string, events: unknown[], o: Partial<DayData> = {}): DayData => ({ date, dayFile: null, nextFile: null, prevFile: null, events, complete: true, unknown: false, away: false, ...o })
const INPUTS = { changes: rdFrom({}).settings, templates: [], lectures: [], series: [], routines: [] }

let root: Root | null = null
let host: HTMLElement | null = null
let days: Record<string, DayData> = {}
/** The dates the window asked `dayData` for. */
let asked: string[] = []
let stamp = 1
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  vi.mocked(logEvents).mockClear().mockResolvedValue(true)
  useUi.setState({ checkinAnswers: null, checkinSaved: null, checkinSkipped: null })
  useData.setState({ rd: rdFrom({}), templates: [], lectures: [], seriesPlans: [], routines: [], stamp: stamp++, view: { status: 'open', computers: [] } as unknown as DataView })
  days = {}
  asked = []
  vi.stubGlobal('rd', {
    dayData: async (d: string) => (asked.push(d), days[d] ?? dataOf(d, []))
  } satisfies Partial<RdApi>)
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  vi.unstubAllGlobals()
})

/**
 * The check-in step as the morning plan gives it: the short night from `useShortNight`, the hint of the showing from `useCheckinHint`
 * (kept above the card's fold – `morning-toggle` here folds it as the card's header does), the check-in with it.
 */
function Step({ date }: { date: string }) {
  const night = useShortNight(date, true)
  const answered = checkinAnswersOf(useUi((u) => u.checkinAnswers), date)[1] != null
  const hint = useCheckinHint(date, night, answered)
  const [open, setOpen] = useState(true)
  return createElement(Fragment, null, createElement('button', { 'data-testid': 'morning-toggle', onClick: () => setOpen(!open) }), open ? createElement(Checkin, { model: { date } as DayModel, hint }) : null)
}

/** The check-in of `date` with yesterday's log given (a fresh date per test: the window keeps the days it read). */
async function show(date: string, yesterday: DayData | null) {
  if (yesterday) days[yesterday.date] = yesterday
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(Step, { date })))
  await act(async () => undefined)
}
/** The screen left and come back (the window keeps what it read). */
async function leaveAndBack(date: string) {
  act(() => root!.unmount())
  host!.remove()
  await show(date, null)
}
/** The window reads the days again (a change in the data folder, or the read every 30 s). */
async function reread(yesterday: DayData) {
  days[yesterday.date] = yesterday
  await act(async () => useData.setState({ stamp: stamp++ }))
  await act(async () => undefined)
}
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const picked = () => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => q(`checkin-${i}`)!.querySelector('[aria-checked="true"]')!.textContent)
const pick = (i: number, label: string) => act(async () => [...q(`checkin-${i}`)!.querySelectorAll<HTMLElement>('[role="radio"]')].find((b) => b.textContent === label)!.click())
const lateOf = (y: string, o: Partial<DayData> = {}) => dataOf(y, logOf(y, placeLogical(y, 25 * 60 + 40)), o)
const late = (date: string) => lateOf(addDays(date, -1))
/** Yesterday quiet from 22:10 – 10 min past the default bedtime 22:00 (on a weekend before it); another computer's log (its own ids). */
const quietOf = (y: string) => dataOf(y, logOf(y, placeLogical(y, 22 * 60 + 10), 'pcq'))

describe('podpowiedź krótkiej nocy w check-inie (D571)', () => {
  it('pisanie do 01:40 (pora snu 22:00): dopisek przy „Spałem krócej niż zwykle?” i „tak” wybrane wstępnie – nic nie zapisane', async () => {
    await show('2026-11-18', late('2026-11-18'))
    expect(asked).toContain('2026-11-17')
    expect(q('checkin-short-night')?.textContent).toBe('Wczoraj przy komputerze do 01:40 (pora snu 22:00)')
    // The line stands at the question it is about.
    expect(q('checkin-1')!.closest('[data-checkin-row]')!.contains(q('checkin-short-night'))).toBe(true)
    expect(picked()).toEqual(['nie', 'tak', 'nie', 'nie', 'nie', 'nie', 'nie', 'nie'])
    // „tak” beforehand is the form's state: nothing in the log, nothing kept as your answer.
    expect(logEvents).not.toHaveBeenCalled()
    expect(useUi.getState().checkinAnswers).toBeNull()
  })

  it('„Zapisz” bez zmiany zapisuje „tak” z podpowiedzi (głowa [0, 2])', async () => {
    await show('2026-11-19', late('2026-11-19'))
    await act(async () => q('checkin-save')!.click())
    expect(logEvents).toHaveBeenCalledWith([{ k: 'energy.checkin', day: '2026-11-19', answers: { head: [0, 2], emotions: [0, 0], senses: [0, 0], body: [0, 0] } }])
  })

  it('Twoja odpowiedź wygrywa: „nie” zostaje „nie” i tak się zapisuje; inna odpowiedź nie zdejmuje wstępnego „tak”', async () => {
    await show('2026-11-20', late('2026-11-20'))
    expect(asked).toContain('2026-11-19')
    expect(picked()[1]).toBe('tak')
    await pick(0, 'tak')
    expect(picked().slice(0, 2)).toEqual(['tak', 'tak'])
    await pick(1, 'nie')
    expect(picked().slice(0, 2)).toEqual(['tak', 'nie'])
    // The line stays: it is what the logs say, not a choice.
    expect(q('checkin-short-night')).not.toBeNull()
    await act(async () => q('checkin-save')!.click())
    expect(logEvents).toHaveBeenCalledWith([{ k: 'energy.checkin', day: '2026-11-20', answers: { head: [2, 0], emotions: [0, 0], senses: [0, 0], body: [0, 0] } }])
  })

  it('odpowiedź dana wcześniej w tym check-inie (inny ekran i powrót) – bez wstępnego „tak” i bez dopisku (r2: podpowiedź nie przychodzi do danej odpowiedzi)', async () => {
    await show('2026-11-21', late('2026-11-21'))
    await pick(1, 'trochę')
    // In the same showing the line stays at your answer.
    expect(q('checkin-short-night')?.textContent).toBe('Wczoraj przy komputerze do 01:40 (pora snu 22:00)')
    asked = []
    await leaveAndBack('2026-11-21')
    expect(asked).toContain('2026-11-20')
    expect(picked()[1]).toBe('trochę')
    expect(q('checkin-short-night')).toBeNull()
  })

  it('zwinięcie i rozwinięcie karty planu porannego to nie powrót: dopisek zostaje przy danej odpowiedzi', async () => {
    await show('2026-11-25', late('2026-11-25'))
    await pick(1, 'trochę')
    await act(async () => q('morning-toggle')!.click())
    expect(q('checkin')).toBeNull()
    await act(async () => q('morning-toggle')!.click())
    expect(picked()[1]).toBe('trochę')
    expect(q('checkin-short-night')?.textContent).toBe('Wczoraj przy komputerze do 01:40 (pora snu 22:00)')
  })

  it('po „Zapisz” formularz zostaje jak zapisany do zniknięcia check-inu: bez powrotu wstępnego „tak”, drugie „Zapisz” nic nie zapisuje', async () => {
    await show('2026-11-24', late('2026-11-24'))
    await pick(1, 'nie')
    await act(async () => q('checkin-save')!.click())
    expect(logEvents).toHaveBeenCalledTimes(1)
    expect(useUi.getState().checkinAnswers).toBeNull()
    await act(async () => undefined)
    expect(picked()[1]).toBe('nie')
    await act(async () => q('checkin-save')!.click())
    expect(logEvents).toHaveBeenCalledTimes(1)
  })

  it('po „Zapisz”, zanim dzień ma check-in: zwinięcie i rozwinięcie karty oraz inny ekran i powrót – formularz dalej zamrożony, drugie „Zapisz” nic nie pisze', async () => {
    await show('2026-11-26', late('2026-11-26'))
    await pick(1, 'nie')
    await act(async () => q('checkin-save')!.click())
    expect(logEvents).toHaveBeenCalledTimes(1)
    await act(async () => q('morning-toggle')!.click())
    await act(async () => q('morning-toggle')!.click())
    expect(picked()[1]).toBe('nie')
    expect((q('checkin-save') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => q('checkin-save')!.click())
    await leaveAndBack('2026-11-26')
    expect(picked()[1]).toBe('nie')
    expect((q('checkin-skip') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => q('checkin-save')!.click())
    expect(logEvents).toHaveBeenCalledTimes(1)
  })

  it('komputer włączony do 02:00 bez wejścia od 22:10 (pora snu 22:00) – bez dopisku, wszystko „nie” (wczoraj przeczytane)', async () => {
    await show('2026-11-22', quietOf('2026-11-21'))
    expect(asked).toContain('2026-11-21')
    expect(q('checkin-short-night')).toBeNull()
    expect(picked()).toEqual(Array(8).fill('nie'))
  })

  it('wczoraj nieczytelne – bez podpowiedzi (nigdy błąd)', async () => {
    await show('2026-11-23', lateOf('2026-11-22', { unknown: true, complete: false }))
    expect(asked).toContain('2026-11-22')
    expect(q('checkin-short-night')).toBeNull()
    expect(picked()[1]).toBe('nie')
  })
})

describe('podpowiedź przyjęta raz na pokazanie check-inu (T2525, T2526)', () => {
  it('ponowny odczyt wczoraj z `complete: false` (synchronizacja logu) – „tak” i dopisek zostają', async () => {
    await show('2026-12-01', late('2026-12-01'))
    expect(picked()[1]).toBe('tak')
    await reread(lateOf('2026-11-30', { complete: false }))
    expect(picked()[1]).toBe('tak')
    expect(q('checkin-short-night')).not.toBeNull()
  })

  it('odczyt niepełny po powrocie na ekran – podpowiedź z ostatniego pewnego odczytu', async () => {
    await show('2026-12-02', late('2026-12-02'))
    days['2026-12-01'] = lateOf('2026-12-01', { complete: false })
    await leaveAndBack('2026-12-02')
    expect(picked()[1]).toBe('tak')
    expect(q('checkin-short-night')).not.toBeNull()
  })

  it('nowy pewny odczyt bez krótkiej nocy nie zdejmuje „tak” sam z ekranu', async () => {
    await show('2026-12-03', late('2026-12-03'))
    await reread(quietOf('2026-12-02'))
    expect(picked()[1]).toBe('tak')
  })

  it('podpowiedź z późniejszego pewnego odczytu dochodzi, póki nie odpowiedziałeś', async () => {
    await show('2026-12-04', lateOf('2026-12-03', { complete: false }))
    expect(picked()[1]).toBe('nie')
    expect(q('checkin-short-night')).toBeNull()
    await reread(lateOf('2026-12-03'))
    expect(picked()[1]).toBe('tak')
    expect(q('checkin-short-night')).not.toBeNull()
  })

  it('po Twojej odpowiedzi późniejszy pewny odczyt podpowiedzi już nie dodaje', async () => {
    await show('2026-12-05', lateOf('2026-12-04', { complete: false }))
    await pick(1, 'nie')
    await reread(lateOf('2026-12-04'))
    expect(picked()[1]).toBe('nie')
    expect(q('checkin-short-night')).toBeNull()
  })

  it('powrót na ekran: podpowiedź z poprzedniego pokazania nie wraca przed odczytem, pewny odczyt bez krótkiej nocy – bez niej', async () => {
    await show('2026-12-07', late('2026-12-07'))
    expect(picked()[1]).toBe('tak')
    days['2026-12-06'] = quietOf('2026-12-06')
    await leaveAndBack('2026-12-07')
    expect(picked()[1]).toBe('nie')
    expect(q('checkin-short-night')).toBeNull()
  })

  it('odczyt co 30 s z tą samą treścią nie liczy wczoraj od nowa (T2527)', async () => {
    await show('2026-12-06', late('2026-12-06'))
    const counted = vi.mocked(computeDay).mock.calls.length
    await reread(late('2026-12-06'))
    await reread(late('2026-12-06'))
    expect(vi.mocked(computeDay).mock.calls.length).toBe(counted)
    // Another content – counted again.
    await reread(quietOf('2026-12-05'))
    expect(vi.mocked(computeDay).mock.calls.length).toBe(counted + 1)
  })
})

describe('podpowiedź idzie za świeżymi danymi, póki nie odpowiedziałeś (T2526, r2)', () => {
  /** Another screen read yesterday earlier (the window keeps that read in its memory of days). */
  async function readEarlier(y: DayData) {
    days[y.date] = y
    const h = document.createElement('div')
    document.body.append(h)
    const r = createRoot(h)
    function Other() {
      useDayData(y.date)
      return null
    }
    await act(async () => r.render(createElement(Other)))
    await act(async () => undefined)
    act(() => r.unmount())
    h.remove()
  }

  it('stary odczyt wczoraj w pamięci okna (z krótką nocą) i świeży bez niej – bez podpowiedzi: liczą się tylko odczyty zrobione dla check-inu', async () => {
    await readEarlier(lateOf('2026-12-09'))
    await show('2026-12-10', quietOf('2026-12-09'))
    expect(picked()[1]).toBe('nie')
    expect(q('checkin-short-night')).toBeNull()
  })

  it('zmiana pobudki dziś przed Twoją odpowiedzią: pora snu w dopisku idzie za danymi (22:00 → 21:00), „tak” zostaje', async () => {
    await show('2026-12-11', late('2026-12-11'))
    expect(q('checkin-short-night')?.textContent).toBe('Wczoraj przy komputerze do 01:40 (pora snu 22:00)')
    // Today's wake 05:00: yesterday's bedtime 05:00 − 8 h = 21:00.
    await reread(lateOf('2026-12-10', { nextFile: { schema: 1, date: '2026-12-11', wakeMin: 5 * 60 } }))
    expect(q('checkin-short-night')?.textContent).toBe('Wczoraj przy komputerze do 01:40 (pora snu 21:00)')
    expect(picked()[1]).toBe('tak')
  })

  it('po Twojej odpowiedzi podpowiedź się nie zmienia', async () => {
    await show('2026-12-12', late('2026-12-12'))
    await pick(1, 'trochę')
    await reread(lateOf('2026-12-11', { nextFile: { schema: 1, date: '2026-12-12', wakeMin: 5 * 60 } }))
    expect(q('checkin-short-night')?.textContent).toBe('Wczoraj przy komputerze do 01:40 (pora snu 22:00)')
    expect(picked()[1]).toBe('trochę')
  })

  it('powrót na ekran po odpowiedzi „nie”, a w międzyczasie nowy log z krótką nocą – bez dopisku i bez „tak”', async () => {
    await show('2026-12-13', quietOf('2026-12-12'))
    await pick(1, 'nie')
    await reread(lateOf('2026-12-12'))
    await leaveAndBack('2026-12-13')
    expect(picked()[1]).toBe('nie')
    expect(q('checkin-short-night')).toBeNull()
  })
})

describe('liczenie z danych dnia (`nightOf`, `nightKept`, `checkinLogic`)', () => {
  const y = '2026-11-17'
  const events = logOf(y, placeLogical(y, 25 * 60 + 40))
  const at = placeLogical(y, 33 * 60)
  it('wczoraj czytelne: ostatnie wejście 01:40, pora snu 22:00', () => {
    expect(nightOf(y, dataOf(y, events), INPUTS, at)).toEqual({ lastInput: placeLogical(y, 25 * 60 + 40), bedtime: placeLogical(y, 22 * 60) })
  })
  it('dzień nieczytelny, niepełny, inny dzień, brak danych – null', () => {
    expect(nightOf(y, null, INPUTS, at)).toBeNull()
    expect(nightOf(y, dataOf(y, events, { unknown: true }), INPUTS, at)).toBeNull()
    expect(nightOf(y, dataOf(y, events, { complete: false }), INPUTS, at)).toBeNull()
    expect(nightOf(y, dataOf(y, events, { complete: false, away: true }), INPUTS, at)).not.toBeNull()
    expect(nightOf(y, dataOf('2026-11-16', events), INPUTS, at)).toBeNull()
  })
  it('`nightKept`: odczyt nieużywalny trzyma ostatnią podpowiedź dnia; pewny bez krótkiej nocy ją zdejmuje', () => {
    const d = '2026-10-10'
    const night = nightKept(d, lateOf(d), INPUTS, at)
    expect(night).not.toBeNull()
    expect(nightKept(d, lateOf(d, { complete: false }), INPUTS, at)).toEqual(night)
    // Not read yet (a return to the screen): nothing – never the hint of an earlier showing.
    expect(nightKept(d, null, INPUTS, at)).toBeNull()
    expect(nightKept(d, lateOf(d, { complete: false }), INPUTS, at)).toEqual(night)
    // Data of another day (a read for the day before) – nothing, never this day's kept night.
    expect(nightKept(d, lateOf('2026-10-09', { complete: false }), INPUTS, at)).toBeNull()
    expect(nightKept(d, lateOf('2026-10-09'), INPUTS, at)).toBeNull()
    expect(nightKept(d, quietOf(d), INPUTS, at)).toBeNull()
    expect(nightKept(d, lateOf(d, { complete: false }), INPUTS, at)).toBeNull()
  })
  it('`nightDataKey`: ta sama treść – ten sam klucz; więcej zdarzeń albo inny plik – inny', () => {
    expect(nightDataKey(dataOf(y, events))).toBe(nightDataKey(dataOf(y, [...events])))
    expect(nightDataKey(dataOf(y, [...events, ...events.slice(0, 1)]))).not.toBe(nightDataKey(dataOf(y, events)))
    expect(nightDataKey(dataOf(y, logOf(y, placeLogical(y, 23 * 60), 'pcq')))).not.toBe(nightDataKey(dataOf(y, events)))
    expect(nightDataKey(dataOf(y, events, { nextFile: { wakeMin: 420 } }))).not.toBe(nightDataKey(dataOf(y, events)))
    expect(nightDataKey(dataOf(y, events, { complete: false }))).not.toBe(nightDataKey(dataOf(y, events)))
  })
  it('dopisek: godziny zegara (sekundy ucięte)', () => {
    expect(shortNightNote({ lastInput: placeLogical(y, 25 * 60 + 40) + 37_000, bedtime: placeLogical(y, 23 * 60) })).toBe('Wczoraj przy komputerze do 01:40 (pora snu 23:00)')
  })
  it('odpowiedzi: Twoje wygrywają, brak odpowiedzi – wstępne', () => {
    const own = checkinAnswersOf(null, y)
    expect(own).toEqual(Array(8).fill(null))
    expect(shownAnswers(own, [0, 2, 0, 0, 0, 0, 0, 0])).toEqual([0, 2, 0, 0, 0, 0, 0, 0])
    expect(shownAnswers([1, 0, null, null, null, null, null, null], [0, 2, 0, 0, 0, 0, 0, 0])).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
    expect(checkinAnswersOf({ date: '2026-11-16', answers: [2, 2, 2, 2, 2, 2, 2, 2] }, y)).toEqual(Array(8).fill(null))
  })
})
