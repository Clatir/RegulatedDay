/**
 * The label of today's all-day events on the desktop bar (D405, HKU1 part C): a dot in the colour of the first event and its
 * title cut to about 20 characters with „…”, with several the first one and „+N” (the order of `compareAllDay`), none
 * today – no label at all; the day is the logical one (04:00). Every title for the hover. The engine's view carries it.
 */
import { describe, expect, it } from 'vitest'
import { activityOf } from '@shared/engine/activity'
import { engineView } from '@shared/engineView'
import { ALL_DAY_COLORS, type AllDayEvent } from '@shared/model/allDay'
import { ALL_DAY_COLOR_HEX } from '@shared/theme'
import { barAllDay, BAR_ALL_DAY_CHARS, noFolderView, shortTitle } from '@shared/widget'
import { block, Scenario } from './engine/dsl'

const ev = (id: string, title: string, startDate: string, endDate = startDate, more: Partial<AllDayEvent> = {}): AllDayEvent => ({
  id,
  title,
  startDate,
  endDate,
  calendarId: null,
  color: ALL_DAY_COLORS[0],
  note: '',
  free: false,
  ...more
})

describe('podpis wydarzeń na pasku (barAllDay)', () => {
  it('brak wydarzeń dziś – brak podpisu (pasek bez pustego miejsca)', () => {
    expect(barAllDay([], '2026-11-19')).toBeNull()
    expect(barAllDay([ev('a', 'Wczoraj', '2026-11-18'), ev('b', 'Jutro', '2026-11-20', '2026-11-22')], '2026-11-19')).toBeNull()
  })

  it('jedno wydarzenie: kropka w jego kolorze i pełny krótki tytuł', () => {
    expect(barAllDay([ev('a', 'Konferencja', '2026-11-18', '2026-11-20', { color: 'teal' })], '2026-11-19')).toEqual({ color: ALL_DAY_COLOR_HEX.teal, text: 'Konferencja', full: 'Konferencja' })
  })

  it('tytuł dłuższy niż 20 znaków kończy się wielokropkiem (razem 20 znaków), tytuł dokładnie 20 – bez', () => {
    const long = 'Wielka konferencja branżowa w Krakowie'
    expect(shortTitle(long)).toBe('Wielka konferencja…')
    expect(Array.from(shortTitle(long)).length).toBeLessThanOrEqual(BAR_ALL_DAY_CHARS)
    expect(shortTitle('12345678901234567890')).toBe('12345678901234567890')
    expect(shortTitle('123456789012345678901')).toBe('1234567890123456789…')
    expect(barAllDay([ev('a', long, '2026-11-19')], '2026-11-19')?.full).toBe(long)
  })

  it('kilka wydarzeń: pierwsze według compareAllDay (wcześniejszy start, dłuższe, tytuł) i „+N”, kolor pierwszego, pełne tytuły w tej kolejności', () => {
    const events = [ev('c', 'Zebranie', '2026-11-19', '2026-11-19', { color: 'rose' }), ev('b', 'Urlop', '2026-11-18', '2026-11-19', { color: 'green' }), ev('a', 'Konferencja', '2026-11-18', '2026-11-20', { color: 'sky' })]
    expect(barAllDay(events, '2026-11-19')).toEqual({ color: ALL_DAY_COLOR_HEX.sky, text: 'Konferencja +2', full: 'Konferencja · Urlop · Zebranie' })
  })

  it('wydarzenie kończące się dziś i zaczynające dziś liczy się (końce włącznie)', () => {
    expect(barAllDay([ev('a', 'A', '2026-11-17', '2026-11-19')], '2026-11-19')?.text).toBe('A')
    expect(barAllDay([ev('a', 'A', '2026-11-19', '2026-11-21')], '2026-11-19')?.text).toBe('A')
  })
})

describe('widok paska z silnika niesie podpis (engineView.allDay)', () => {
  const DATE = '2026-10-28'
  const s = new Scenario({ date: DATE, plan: [block({ id: 'a', cat: 'inne', at: '08:00', min: 60 })] }).observe('07:00', null)
  const view = (time: string, allDay?: AllDayEvent[]) => {
    const t = s.at(time)
    const ctx = s.contextAt(t)
    const state = s.stateAt(t)
    return engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'Inne obowiązki', care: { waterOn: true, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }, modePrefs: { sessionMode: true, classMode: true }, pending: null, ...(allDay ? { allDay } : {}) })
  }

  it('dziś wydarzenie – podpis; bez wydarzeń, wydarzenie z innego dnia – null', () => {
    expect(view('07:50', [ev('a', 'Konferencja', DATE, '2026-10-30')]).allDay).toMatchObject({ text: 'Konferencja' })
    expect(view('07:50').allDay).toBeNull()
    expect(view('07:50', [ev('a', 'Jutro', '2026-10-29')]).allDay).toBeNull()
  })

  it('doba logiczna: po północy, przed 04:00, wciąż liczy się wczorajszy dzień', () => {
    const late = new Scenario({ date: DATE, plan: [] }).observe('07:00', null)
    const t = late.at('02:00')
    const ctx = late.contextAt(t)
    const state = late.stateAt(t)
    const v = engineView({ ctx, state, energy: null, activity: activityOf(ctx.events, state.grid.start, t, 'pca'), now: t, name: () => 'x', care: { waterOn: true, waterEveryMin: 45, breakAfterMin: 90, solitudeAfterMin: 30 }, modePrefs: { sessionMode: true, classMode: true }, pending: null, allDay: [ev('a', 'Wczoraj do rana', DATE), ev('b', 'Nowa doba', '2026-10-29')] })
    expect(v.allDay?.full).toBe('Wczoraj do rana')
  })

  it('widok bez folderu nie ma podpisu', () => {
    expect(noFolderView().allDay).toBeNull()
  })
})
