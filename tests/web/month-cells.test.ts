// @vitest-environment jsdom
/**
 * A day of the month (D418, D422): up to three miniature bars, „+N” for everything else the day holds, the dot of the load in
 * three shades with the sentence under it; the colour of the day and the selection stay; a grid without the detail (the wizard's)
 * keeps the first all-day event's line.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { MonthBlock, MonthDay } from '@shared/engine/calendarViews'
import { allDayDraft, type AllDayEvent } from '@shared/model/allDay'
import { rdFrom } from '@shared/model/rd'
import { DEFAULT_SETTINGS } from '@shared/model/settings'
import { MonthGrid } from '@renderer/features/calendar/MonthGrid'
import { emptyMonthDay, monthCellView } from '@renderer/features/calendar/monthCellView'

const names = { rd: rdFrom({}), settings: DEFAULT_SETTINGS, routines: [], requests: [] }
const named = { categoryId: 'inne', variantId: null, routine: null, requests: [], note: '', origin: 'user' as const, sourceId: null }
const block = (id: string, startMin: number, o: Partial<MonthBlock> = {}): MonthBlock => ({ id, named, categoryId: 'inne', startMin, endMin: startMin + 60, fixed: false, session: false, state: 'planned', background: false, outsidePlan: false, ...o })
const month = (date: string, o: Partial<MonthDay>): MonthDay => ({ ...emptyMonthDay(date), read: 'full', dayType: 'roboczy', ...o })
const event = (id: string, title: string, date: string): AllDayEvent => ({ ...allDayDraft(id, date), title })

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const D = '2026-11-18'
async function mount(days: Record<string, MonthDay>, events: AllDayEvent[], withDetail = true, selected: string[] = []): Promise<void> {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      createElement(MonthGrid, {
        month: '2026-11',
        today: D,
        selected: new Set(selected),
        onSelect: () => undefined,
        cell: (d: string) => ({
          tone: 'rgb(10, 20, 30)',
          marks: null,
          events: events.filter((e) => e.startDate === d),
          detail: withDetail ? monthCellView(days[d] ?? emptyMonthDay(d), events, names, 1) : undefined
        })
      })
    )
  )
}
const q = (id: string) => host!.querySelector<HTMLElement>(`[data-testid="${id}"]`)

describe('komórka miesiąca z paskami (D418, D422)', () => {
  it('trzy paski, reszta dnia w „+N”', async () => {
    const blocks = [block('f1', 540, { fixed: true }), block('f2', 600, { fixed: true }), block('f3', 660, { fixed: true }), block('s1', 480, { fixed: true, session: true }), block('x1', 720), block('x2', 780)]
    await mount({ [D]: month(D, { blocks, load: 'low', workMin: 100, limitMin: 400 }) }, [event('e1', 'Konferencja', D)])
    expect(host!.querySelectorAll(`[data-testid="month-bar-${D}"]`)).toHaveLength(3)
    expect([...host!.querySelectorAll(`[data-testid="month-bar-${D}"]`)].map((b) => b.textContent)).toEqual(['Konferencja', 'Inne obowiązki', 'Inne obowiązki'])
    // 1 event + 6 blocks, 3 bars: „+N” is the other four (D422).
    expect(q(`month-more-${D}`)!.textContent).toBe('+4')
  })

  it('D429: po wydarzeniach i stałych paski mają nazwy bloków elastycznych, z godzinami w podpowiedzi', async () => {
    const flex = (id: string, startMin: number, categoryId: string): MonthBlock => block(id, startMin, { categoryId, named: { ...named, categoryId } })
    // The day's blocks come by the hour (`monthDayOf`).
    await mount({ [D]: month(D, { blocks: [flex('o', 540, 'inne'), flex('n', 600, 'nauka'), block('m', 840, { fixed: true })] }) }, [])
    const bars = [...host!.querySelectorAll<HTMLElement>(`[data-testid="month-bar-${D}"]`)]
    expect(bars.map((b) => b.textContent)).toEqual(['Inne obowiązki', 'Inne obowiązki', 'Nauka (NotebookLM)'])
    // The fixed one first (14:00), then the flexible ones by the hour (09:00, 10:00).
    expect(bars.map((b) => b.title)).toEqual(['Inne obowiązki · 14:00–15:00 · w planie', 'Inne obowiązki · 09:00–10:00 · w planie', 'Nauka (NotebookLM) · 10:00–11:00 · w planie'])
    expect(q(`month-more-${D}`)).toBeNull()
  })

  it('T1014: podpowiedź paska niesie stan bloku (jak w „Tygodniu”); niewykonany i w tle bez paska, w „+N”', async () => {
    const blocks = [
      block('m', 480, { state: 'missed' }),
      block('b', 510, { background: true }),
      block('r', 540, { state: 'ran' }),
      block('t', 600, { state: 'running', outsidePlan: true }),
      block('p', 660, { state: 'paused' })
    ]
    await mount({ [D]: month(D, { blocks }) }, [])
    const bars = [...host!.querySelectorAll<HTMLElement>(`[data-testid="month-bar-${D}"]`)]
    expect(bars.map((b) => b.title)).toEqual(['Inne obowiązki · 09:00–10:00 · zrobiony', 'Inne obowiązki · 10:00–11:00 · trwa · poza planem', 'Inne obowiązki · 11:00–12:00 · zapauzowany'])
    expect(q(`month-more-${D}`)!.textContent).toBe('+2')
  })

  it('dzień bez niczego: bez pasków i bez „+N”; numer dnia zostaje', async () => {
    await mount({ [D]: month(D, {}) }, [])
    expect(q(`month-bar-${D}`)).toBeNull()
    expect(q(`month-more-${D}`)).toBeNull()
    expect(q(`day-${D}`)!.textContent).toContain('18')
  })

  it('kropka obciążenia: trzy odcienie i zdanie „Praca … z …”', async () => {
    const days = {
      '2026-11-10': month('2026-11-10', { load: 'low', workMin: 120, limitMin: 400 }),
      '2026-11-11': month('2026-11-11', { load: 'mid', workMin: 340, limitMin: 400 }),
      '2026-11-12': month('2026-11-12', { load: 'high', workMin: 460, limitMin: 400 }),
      '2026-11-13': month('2026-11-13', { load: null, workMin: null, limitMin: null })
    }
    await mount(days, [])
    const dots = ['10', '11', '12'].map((n) => q(`month-load-2026-11-${n}`)!)
    expect(dots.map((d) => d.getAttribute('data-level'))).toEqual(['low', 'mid', 'high'])
    // The shade is the fill's alone; the edge (the ring) and the dot as a whole stay fully visible – even the lowest level shows.
    expect(dots.map((d) => d.style.background)).toEqual(['rgba(242, 182, 109, 0.3)', 'rgba(242, 182, 109, 0.65)', 'rgb(242, 182, 109)'])
    expect(dots.map((d) => d.style.opacity)).toEqual(['', '', ''])
    expect(dots[0]!.className).toContain('ring-lamp')
    expect(dots[0]!.title).toBe('Praca 2 h z 6 h 40 min')
    expect(dots[2]!.getAttribute('aria-label')).toBe('Praca 7 h 40 min z 6 h 40 min')
    expect(q('month-load-2026-11-13')).toBeNull()
  })

  it('kolor dnia i zaznaczenie zostają', async () => {
    await mount({ [D]: month(D, {}) }, [], true, [D])
    const cell = q(`day-${D}`)!
    expect(cell.style.background).toBe('rgb(10, 20, 30)')
    expect(cell.getAttribute('aria-pressed')).toBe('true')
    expect(q('day-2026-11-19')!.getAttribute('aria-pressed')).toBe('false')
  })

  it('podpowiedź komórki wylicza wydarzenia całodniowe dnia', async () => {
    await mount({ [D]: month(D, {}) }, [event('e1', 'Konferencja', D), event('e2', 'Obiad', D)])
    expect(q(`day-${D}`)!.title).toContain('Konferencja')
    expect(q(`day-${D}`)!.title).toContain('Obiad')
  })

  it('siatka bez szczegółów (kreator): jak dotąd – pierwsze wydarzenie i „+N”', async () => {
    await mount({}, [event('e1', 'Konferencja', D), event('e2', 'Obiad', D)], false)
    expect(q(`day-events-${D}`)!.textContent).toBe('Konferencja+1')
    expect(q(`month-bar-${D}`)).toBeNull()
  })
})
