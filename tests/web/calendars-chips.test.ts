// @vitest-environment jsdom
/**
 * Żetony kalendarzy nad widokiem (SNT2, D419): lista kalendarzy w ich kolorach, klik przełącza, „ukryte: N”; wybór
 * zapamiętany na tym komputerze (localStorage okna, nie folder danych); widok pokazuje bloki kalendarzy niewyłączonych.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CATEGORY_COLORS, rdFrom } from '@shared/model/rd'
import { CalendarChips } from '@renderer/features/calendars/CalendarChips'
import { loadHiddenCalendars, useCalendarFilter, useVisibleAllDay, useVisibleBlocks } from '@renderer/features/calendars/calendarFilter'
import { useData } from '@renderer/store/data'

const RD = rdFrom({
  schema: 1,
  calendars: [
    { id: 'praca', name: 'Praca', color: CATEGORY_COLORS[2] },
    { id: 'dom', name: 'Dom', color: CATEGORY_COLORS[4] }
  ],
  categories: { analiza: { name: 'Analiza', calendar: 'praca' }, sprawy: { name: 'Sprawy', calendar: 'dom' } }
})
const blocks = [{ categoryId: 'analiza' }, { categoryId: 'sprawy' }, { categoryId: 'sprawy' }, { categoryId: 'regeneracja' }]

let root: Root | null = null
let host: HTMLElement | null = null
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  localStorage.clear()
  useCalendarFilter.setState({ hidden: [] })
  useData.setState({ rd: RD })
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = host = null
  useData.setState({ rd: rdFrom(undefined) })
})

async function show(hiddenCount = 0) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root!.render(createElement(CalendarChips, { hiddenCount })))
  const chips = () => [...host!.querySelectorAll<HTMLElement>('[data-testid="calendar-chip"]')]
  return { chips, count: () => host!.querySelector('[data-testid="calendar-hidden-count"]')?.textContent ?? null, group: () => host!.querySelector('[data-testid="calendar-chips"]') }
}

describe('żetony kalendarzy', () => {
  it('po jednym na kalendarz, w kolejności i z kolorem; wszystkie włączone', async () => {
    const { chips } = await show()
    expect(chips().map((c) => [c.dataset.calendar, c.textContent, c.getAttribute('aria-pressed')])).toEqual([
      ['moje', 'Moje', 'true'],
      ['praca', 'Praca', 'true'],
      ['dom', 'Dom', 'true']
    ])
    expect(chips()[1]!.style.borderColor).not.toBe('')
  })

  it('klik wyłącza kalendarz, drugi włącza; stan w sklepie okna', async () => {
    const { chips } = await show()
    await act(async () => chips()[1]!.click())
    expect(chips()[1]!.getAttribute('aria-pressed')).toBe('false')
    expect(chips()[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(useCalendarFilter.getState().hidden).toEqual(['praca'])
    await act(async () => chips()[1]!.click())
    expect(useCalendarFilter.getState().hidden).toEqual([])
  })

  it('„ukryte: N” tylko gdy coś ukryte', async () => {
    const none = await show(0)
    expect(none.count()).toBeNull()
    act(() => root?.unmount())
    host?.remove()
    const some = await show(3)
    expect(some.count()).toBe('ukryte: 3')
  })

  it('jeden kalendarz („Moje”): żetonów nie ma – nie ma czym przełączać', async () => {
    useData.setState({ rd: rdFrom(undefined) })
    const { group } = await show(0)
    expect(group()).toBeNull()
  })
})

describe('pamięć na tym komputerze', () => {
  it('wybór zapisuje się w pamięci okna i wraca po ponownym uruchomieniu okna (nowy moduł czyta pamięć)', async () => {
    useCalendarFilter.getState().toggle('praca')
    useCalendarFilter.getState().toggle('dom')
    expect(JSON.parse(localStorage.getItem('rd.hiddenCalendars')!)).toEqual(['praca', 'dom'])
    vi.resetModules()
    const fresh = await import('@renderer/features/calendars/calendarFilter')
    expect(fresh.useCalendarFilter.getState().hidden).toEqual(['praca', 'dom'])
  })

  it('zepsuta albo niedostępna pamięć to brak pamięci, nie błąd', () => {
    localStorage.setItem('rd.hiddenCalendars', '{nie json')
    expect(loadHiddenCalendars()).toEqual([])
    localStorage.setItem('rd.hiddenCalendars', JSON.stringify(['a', 3, '', 'a', 'b']))
    expect(loadHiddenCalendars()).toEqual(['a', 'b'])
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('quota')
    }
    try {
      expect(() => useCalendarFilter.getState().toggle('praca')).not.toThrow()
      expect(useCalendarFilter.getState().hidden).toEqual(['praca'])
    } finally {
      Storage.prototype.setItem = real
    }
  })
})

describe('pamięć ukrycia przy jednym kalendarzu (T972)', () => {
  it('po wczytaniu danych z jednym kalendarzem zapamiętane ukrycie jest zapominane – dodanie drugiego kalendarza go nie przywraca (nie chowa „Moje”)', async () => {
    useCalendarFilter.setState({ hidden: ['moje'] })
    localStorage.setItem('rd.hiddenCalendars', JSON.stringify(['moje']))
    // Dane jeszcze nie wczytane (start, zmiana folderu, rd.json chwilowo nieczytelny: widok ma `rd: null`, lista – domyślna,
    // jeden kalendarz): nic nie jest zapominane, pamięć przeżywa restart.
    await act(async () => useData.setState({ view: null, rd: rdFrom(undefined) }))
    expect(useCalendarFilter.getState().hidden).toEqual(['moje'])
    await act(async () => useData.setState({ view: { status: 'opening', rd: null } as never, rd: rdFrom(undefined) }))
    expect(useCalendarFilter.getState().hidden).toEqual(['moje'])
    await act(async () => useData.setState({ view: { status: 'open', rd: null } as never, rd: rdFrom(undefined) }))
    expect(useCalendarFilter.getState().hidden).toEqual(['moje'])
    // rd.json wczytany i jeden kalendarz: zapomniane.
    await act(async () => useData.setState({ view: { status: 'open', rd: { schema: 1 } } as never, rd: rdFrom(undefined) }))
    expect(useCalendarFilter.getState().hidden).toEqual([])
    expect(JSON.parse(localStorage.getItem('rd.hiddenCalendars')!)).toEqual([])
    // Drugi kalendarz: „Moje” nadal widoczne.
    await act(async () => useData.setState({ rd: RD }))
    expect(useCalendarFilter.getState().hidden).toEqual([])
    expect(filterShown()).toBe(4)
    await act(async () => useData.setState({ view: null }))
  })
})

const filterShown = () => {
  let n = 0
  const View = () => {
    n = useVisibleBlocks(blocks).shown.length
    return null
  }
  const h = document.createElement('div')
  const r = createRoot(h)
  act(() => r.render(createElement(View)))
  act(() => r.unmount())
  return n
}

describe('widok pokazuje bloki kalendarzy niewyłączonych', () => {
  async function probe() {
    let seen: { shown: unknown[]; hiddenCount: number } = { shown: [], hiddenCount: -1 }
    const View = () => {
      seen = useVisibleBlocks(blocks)
      return null
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(View)))
    return () => seen
  }

  it('D425: przy jednym kalendarzu zapamiętane ukrycie nie działa (nie ma żetonów, żeby je cofnąć); nieistniejące id nic nie ukrywa', async () => {
    useCalendarFilter.setState({ hidden: ['moje', 'praca', 'zniknal'] })
    useData.setState({ rd: rdFrom(undefined) })
    const seen = await probe()
    expect(seen().hiddenCount).toBe(0)
    expect(seen().shown).toHaveLength(4)
    // Dwa kalendarze: znane id działa, nieznane – nie.
    await act(async () => useData.setState({ rd: RD }))
    expect(seen().hiddenCount).toBe(2)
    expect(seen().shown).toEqual([{ categoryId: 'sprawy' }, { categoryId: 'sprawy' }])
  })

  it('wydarzenia całodniowe: każde w swoim kalendarzu, chowają się razem z nim (D425)', async () => {
    const events = [{ calendarId: null }, { calendarId: 'praca' }, { calendarId: 'dom' }]
    let seen: { shown: unknown[]; hiddenCount: number } = { shown: [], hiddenCount: -1 }
    const View = () => {
      seen = useVisibleAllDay(events)
      return null
    }
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root!.render(createElement(View)))
    expect(seen.hiddenCount).toBe(0)
    await act(async () => useCalendarFilter.getState().toggle('praca'))
    expect(seen.shown).toEqual([{ calendarId: null }, { calendarId: 'dom' }])
    expect(seen.hiddenCount).toBe(1)
  })

  it('wyłączony kalendarz zabiera swoje bloki i liczy je w „ukryte”; włączony – oddaje', async () => {
    const seen = await probe()
    expect(seen().hiddenCount).toBe(0)
    expect(seen().shown).toHaveLength(4)
    await act(async () => useCalendarFilter.getState().toggle('dom'))
    expect(seen().hiddenCount).toBe(2)
    expect(seen().shown).toEqual([{ categoryId: 'analiza' }, { categoryId: 'regeneracja' }])
    await act(async () => useCalendarFilter.getState().toggle('dom'))
    expect(seen().hiddenCount).toBe(0)
  })
})
